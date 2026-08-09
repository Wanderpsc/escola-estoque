import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/reports/accountability?programId=...&from=...&to=...
// Retorna dados completos de prestação de contas por programa/parcela:
// Programa → Parcelas → NFs → Entregas → Consumo → Saldo
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  const url = new URL(req.url);
  const programIdFilter = url.searchParams.get("programId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Busca programas de nível superior (sem parent) com suas parcelas (children)
  const programWhere: any = { active: true, parentId: null };
  if (role !== "SUPER_ADMIN") programWhere.schoolId = schoolId ?? "";
  if (programIdFilter) programWhere.id = programIdFilter;

  const topPrograms = await db.program.findMany({
    where: programWhere,
    include: {
      children: {
        where: { active: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  // Coleta todos os IDs relevantes (pais + filhos)
  const allProgramIds = topPrograms.flatMap((p) => [p.id, ...p.children.map((c) => c.id)]);

  // NFs (entradas de estoque, excluindo compras informais)
  const entryWhere: any = { programId: { in: allProgramIds }, isPurchase: false };
  if (from || to) {
    entryWhere.invoiceDate = {};
    if (from) entryWhere.invoiceDate.gte = new Date(from);
    if (to) entryWhere.invoiceDate.lte = new Date(to + "T23:59:59.999Z");
  }

  const entries = await db.stockEntry.findMany({
    where: entryWhere,
    include: {
      supplier: { select: { name: true, cnpj: true } },
      items: { include: { product: { select: { name: true, unit: true } } } },
      deliveryOrders: {
        where: { status: { in: ["CONFIRMED", "PARTIAL", "PENDING"] } },
        include: { items: true },
        orderBy: { deliveryDate: "asc" },
      },
    },
    orderBy: { invoiceDate: "asc" },
  });

  // Saídas (consumo de estoque)
  const exitWhere: any = { programId: { in: allProgramIds } };
  if (from || to) {
    exitWhere.exitDate = {};
    if (from) exitWhere.exitDate.gte = new Date(from);
    if (to) exitWhere.exitDate.lte = new Date(to + "T23:59:59.999Z");
  }

  const exits = await db.stockExit.findMany({
    where: exitWhere,
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
      user: { select: { name: true } },
    },
    orderBy: { exitDate: "asc" },
  });

  // Movimentações financeiras (para capturar créditos adicionais)
  const movWhere: any = { programId: { in: allProgramIds } };
  const movements = await db.budgetMovement.findMany({ where: movWhere });

  // Monta o resultado por programa
  const result = topPrograms.map((prog) => {
    const allIds = [prog.id, ...prog.children.map((c) => c.id)];

    // Helper: calcula estatísticas para um conjunto de IDs de programa
    function calcStats(ids: string[]) {
      const pEntries = entries.filter((e) => ids.includes(e.programId));
      const pExits = exits.filter((e) => ids.includes(e.programId));
      const pMovs = movements.filter((m) => ids.includes(m.programId));

      const nfTotal = pEntries.reduce((s, e) => s + e.totalValue, 0);
      const consumptionTotal = pExits.reduce(
        (s, e) => s + e.items.reduce((si, i) => si + i.totalPrice, 0),
        0
      );
      const creditExtra = pMovs
        .filter((m) => m.type === "CREDIT")
        .reduce((s, m) => s + m.amount, 0);
      const debitExtra = pMovs
        .filter((m) => m.type === "DEBIT" && !m.reference?.startsWith("EXIT-"))
        .reduce((s, m) => s + m.amount, 0);

      return { entries: pEntries, exits: pExits, nfTotal, consumptionTotal, creditExtra, debitExtra };
    }

    // Dados das parcelas (children)
    const parcelasData = prog.children.map((child) => {
      const st = calcStats([child.id]);
      const totalBudget = child.budget + st.creditExtra;
      const spent = st.consumptionTotal + st.debitExtra;
      const nfBalance = totalBudget - st.nfTotal; // diferença orçamento vs NFs

      return {
        id: child.id,
        name: child.name,
        budget: child.budget,
        totalBudget,
        nfTotal: st.nfTotal,
        nfBalance,
        consumptionTotal: spent,
        balance: totalBudget - spent,
        creditExtra: st.creditExtra,
        debitExtra: st.debitExtra,
        nfs: st.entries.map((e) => ({
          id: e.id,
          invoiceNumber: e.invoiceNumber,
          invoiceDate: e.invoiceDate,
          supplier: e.supplier.name,
          supplierCnpj: e.supplier.cnpj,
          totalValue: e.totalValue,
          status: e.status,
          itemCount: e.items.length,
          items: e.items.map((i) => ({
            product: i.product.name,
            unit: i.product.unit,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
            isExtra: i.isExtra,
          })),
          deliveries: e.deliveryOrders.map((d) => ({
            id: d.id,
            deliveryDate: d.deliveryDate,
            status: d.status,
            confirmedAt: d.confirmedAt,
            itemCount: d.items.length,
            deliveredValue: d.items.reduce(
              (s, i) => s + (i.quantityDelivered ?? i.quantityOrdered) * i.unitPrice,
              0
            ),
          })),
        })),
        consumptions: st.exits.map((e) => ({
          id: e.id,
          exitDate: e.exitDate,
          reason: e.reason,
          user: e.user.name,
          items: e.items.map((i) => ({
            product: i.product.name,
            unit: i.product.unit,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
          total: e.items.reduce((s, i) => s + i.totalPrice, 0),
        })),
      };
    });

    // Dados diretos do programa pai (sem children)
    const directSt = calcStats([prog.id]);
    const childrenBudget = prog.children.reduce((s, c) => s + c.budget, 0);
    const totalBudget = prog.budget + childrenBudget + directSt.creditExtra + parcelasData.reduce((s, p) => s + p.creditExtra, 0);
    const totalNF = directSt.nfTotal + parcelasData.reduce((s, p) => s + p.nfTotal, 0);
    const totalConsumption = directSt.consumptionTotal + parcelasData.reduce((s, p) => s + p.consumptionTotal, 0);
    const totalDebitExtra = directSt.debitExtra + parcelasData.reduce((s, p) => s + p.debitExtra, 0);
    const balance = totalBudget - totalConsumption - totalDebitExtra;

    return {
      id: prog.id,
      name: prog.name,
      type: prog.type,
      budget: prog.budget,
      totalBudget,
      totalNF,
      totalConsumption,
      totalDebitExtra,
      balance,
      nfBalance: totalBudget - totalNF,
      directNFTotal: directSt.nfTotal,
      directConsumptionTotal: directSt.consumptionTotal,
      parcelas: parcelasData,
      // NFs e consumos diretos no programa pai (sem parcela)
      directNFs: directSt.entries.map((e) => ({
        id: e.id,
        invoiceNumber: e.invoiceNumber,
        invoiceDate: e.invoiceDate,
        supplier: e.supplier.name,
        totalValue: e.totalValue,
        status: e.status,
      })),
      directConsumptions: directSt.exits.map((e) => ({
        id: e.id,
        exitDate: e.exitDate,
        reason: e.reason,
        user: e.user.name,
        total: e.items.reduce((s, i) => s + i.totalPrice, 0),
      })),
    };
  });

  return NextResponse.json(result);
}
