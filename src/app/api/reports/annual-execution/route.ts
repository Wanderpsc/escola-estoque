import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/reports/annual-execution?year=2026&programId=...
// Retorna recursos acumulados/executados de NFs finalizadas por programa e geral
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  const url = new URL(req.url);
  const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : new Date().getFullYear();
  const programId = url.searchParams.get("programId");

  const from = new Date(`${year}-01-01T00:00:00.000Z`);
  const to   = new Date(`${year}-12-31T23:59:59.999Z`);

  const where: any = {
    status: "FINALIZED",
    finalizedAt: { gte: from, lte: to },
    isPurchase: false,
  };
  if (role !== "SUPER_ADMIN") where.program = { schoolId: schoolId ?? "" };
  if (programId) where.programId = programId;

  const entries = await db.stockEntry.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      program:  { select: { id: true, name: true, type: true } },
      items:    { include: { product: { select: { name: true, unit: true } } } },
      deliveryOrders: {
        where: { status: { in: ["CONFIRMED", "PARTIAL"] } },
        include: { items: true },
      },
    },
    orderBy: { finalizedAt: "asc" },
  });

  // Agrupa por programa
  const byProgram: Record<string, {
    programId: string; programName: string; programType: string;
    contracted: number; executed: number; entries: typeof entries;
  }> = {};

  for (const entry of entries) {
    const pid = entry.programId;
    if (!byProgram[pid]) {
      byProgram[pid] = {
        programId: pid,
        programName: entry.program.name,
        programType: entry.program.type,
        contracted: 0,
        executed: 0,
        entries: [],
      };
    }
    byProgram[pid].contracted += entry.totalValue;

    // Executado = soma das entregas confirmadas; se não houver entrega, usa valor da NF (entrada direta)
    const hasDeliveries = entry.deliveryOrders.length > 0;
    if (hasDeliveries) {
      for (const del of entry.deliveryOrders) {
        for (const item of del.items) {
          byProgram[pid].executed += (item.quantityDelivered ?? item.quantityOrdered) * item.unitPrice;
        }
      }
    } else {
      // Entrada direta (sem delivery workflow): NF = executado
      byProgram[pid].executed += entry.totalValue;
    }

    byProgram[pid].entries.push(entry);
  }

  const programs = Object.values(byProgram).sort((a, b) => a.programName.localeCompare(b.programName));

  const totalContracted = programs.reduce((s, p) => s + p.contracted, 0);
  const totalExecuted   = programs.reduce((s, p) => s + p.executed, 0);

  return NextResponse.json({
    year,
    programs: programs.map(p => ({
      programId:    p.programId,
      programName:  p.programName,
      programType:  p.programType,
      contracted:   p.contracted,
      executed:     p.executed,
      balance:      p.contracted - p.executed,
      executionPct: p.contracted > 0 ? (p.executed / p.contracted) * 100 : 0,
      nfCount:      p.entries.length,
      entries: p.entries.map(e => ({
        id: e.id,
        invoiceNumber: e.invoiceNumber,
        invoiceDate:   e.invoiceDate,
        finalizedAt:   e.finalizedAt,
        supplier:      e.supplier.name,
        contracted:    e.totalValue,
        executed:      e.deliveryOrders.length > 0
          ? e.deliveryOrders.reduce((s, d) => s + d.items.reduce((ss, i) => ss + (i.quantityDelivered ?? i.quantityOrdered) * i.unitPrice, 0), 0)
          : e.totalValue,
      })),
    })),
    totals: { contracted: totalContracted, executed: totalExecuted, balance: totalContracted - totalExecuted,
      executionPct: totalContracted > 0 ? (totalExecuted / totalContracted) * 100 : 0,
      nfCount: entries.length,
    },
  });
}
