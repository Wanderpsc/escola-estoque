import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const deliveryInclude = {
  supplier: { select: { id: true, name: true } },
  school: { select: { id: true, name: true } },
  program: { select: { id: true, name: true, type: true } },
  stockEntry: { select: { id: true, invoiceNumber: true, invoiceSeries: true, invoiceDate: true, totalValue: true, programId: true, program: { select: { name: true, type: true } } } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, unit: true, ncmCode: true } },
    },
  },
} as const;

// GET /api/deliveries/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const order = await db.deliveryOrder.findUnique({ where: { id }, include: deliveryInclude });
  if (!order) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  return NextResponse.json(order);
}

// PATCH /api/deliveries/[id]
// body: { action: "CONFIRM", items: [{id, quantityDelivered}] }  → confirma
// body: { action: "CANCEL" }                                     → cancela
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Apenas o diretor/gestor pode confirmar entregas" }, { status: 403 });
  }

  const { id } = await params;
  const order = await db.deliveryOrder.findUnique({ where: { id }, include: { items: true, stockEntry: { select: { programId: true, invoiceNumber: true } } } });
  if (!order) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  if (role !== "SUPER_ADMIN" && order.schoolId !== schoolId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "Entrega já processada" }, { status: 400 });
  }

  const body = await req.json();
  const { action } = body;

  // ── CANCELAR ──────────────────────────────────────────────
  if (action === "CANCEL") {
    const updated = await db.deliveryOrder.update({
      where: { id },
      data: { status: "CANCELLED", confirmedById: userId, confirmedAt: new Date() },
      include: deliveryInclude,
    });
    return NextResponse.json(updated);
  }

  // ── CONFIRMAR ─────────────────────────────────────────────
  if (action === "CONFIRM") {
    const confirmedItems: { id: string; quantityDelivered: number }[] = body.items ?? [];

    // Determina status geral (CONFIRMED ou PARTIAL)
    let allDelivered = true;
    for (const ci of confirmedItems) {
      const original = order.items.find((i) => i.id === ci.id);
      if (!original) continue;
      if (ci.quantityDelivered < original.quantityOrdered) allDelivered = false;
    }

    const finalStatus = allDelivered ? "CONFIRMED" : "PARTIAL";

    // Atualiza cada item com quantityDelivered
    await Promise.all(
      confirmedItems.map((ci) =>
        db.deliveryOrderItem.update({
          where: { id: ci.id },
          data: { quantityDelivered: ci.quantityDelivered },
        })
      )
    );

    // Atualiza o status da ordem
    const updated = await db.deliveryOrder.update({
      where: { id },
      data: { status: finalStatus, confirmedById: userId, confirmedAt: new Date() },
      include: deliveryInclude,
    });

    // ── Auto-cria StockEntry se houver ao menos 1 item entregue ──
    const deliveredItems = confirmedItems.filter((ci) => ci.quantityDelivered > 0);
    if (deliveredItems.length > 0) {
      // Prefere programId da NF de referência; depois da ordem; depois do produto
      let programId = order.stockEntry?.programId ?? order.programId;
      if (!programId) {
        const firstItem = order.items[0];
        const product = await db.product.findUnique({
          where: { id: firstItem.productId },
          select: { programId: true },
        });
        programId = product?.programId ?? null;
      }

      if (programId) {
        const normalItems = deliveredItems.filter((ci) => {
          const orig = order.items.find((i) => i.id === ci.id);
          return !orig?.isExtra;
        });
        const extraItems = deliveredItems.filter((ci) => {
          const orig = order.items.find((i) => i.id === ci.id);
          return !!orig?.isExtra;
        });

        const totalNormal = normalItems.reduce((sum, ci) => {
          const orig = order.items.find((i) => i.id === ci.id);
          return sum + ci.quantityDelivered * (orig?.unitPrice ?? 0);
        }, 0);
        const totalExtra = extraItems.reduce((sum, ci) => {
          const orig = order.items.find((i) => i.id === ci.id);
          return sum + ci.quantityDelivered * (orig?.unitPrice ?? 0);
        }, 0);
        const totalValue = totalNormal + totalExtra;

        // Número da NF de referência, se houver
        const nfRef = order.stockEntry?.invoiceNumber
          ? ` (NF Ref.: ${order.stockEntry.invoiceNumber})`
          : "";

        await db.stockEntry.create({
          data: {
            invoiceNumber: `DEL-${id.slice(-8).toUpperCase()}`,
            invoiceDate: order.deliveryDate,
            totalValue,
            supplierId: order.supplierId,
            programId,
            userId,
            observations: `Entrega confirmada${nfRef} — ${order.notes ?? ""}`.trim(),
            items: {
              create: deliveredItems.map((ci) => {
                const orig = order.items.find((i) => i.id === ci.id)!;
                return {
                  productId: orig.productId,
                  quantity: ci.quantityDelivered,
                  unitPrice: orig.unitPrice,
                  totalPrice: ci.quantityDelivered * orig.unitPrice,
                  isExtra: !!orig.isExtra,
                };
              }),
            },
          },
        });

        await db.budgetMovement.create({
          data: {
            programId,
            type: "DEBIT",
            amount: totalValue,
            description: `Entrega confirmada${nfRef} — Fornecedor: ${updated.supplier.name}${totalExtra > 0 ? ` (inclui R$ ${totalExtra.toFixed(2)} extras com ressalva)` : ""}`,
            reference: `DEL-${id.slice(-8).toUpperCase()}`,
            date: order.deliveryDate,
          },
        });
      }
    }

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "action inválida" }, { status: 400 });
}

// PUT /api/deliveries/[id] — edita entrega PENDING (data, notas, itens)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const order = await db.deliveryOrder.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  if (role !== "SUPER_ADMIN" && order.schoolId !== schoolId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "Apenas entregas pendentes podem ser editadas" }, { status: 400 });
  }

  const body = await req.json();
  const { programId, deliveryDate, notes, items } = body;

  if (!deliveryDate || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "deliveryDate e items são obrigatórios" }, { status: 400 });
  }

  // Remove itens antigos e recria
  await db.deliveryOrderItem.deleteMany({ where: { orderId: id } });

  const updated = await db.deliveryOrder.update({
    where: { id },
    data: {
      programId: programId || null,
      deliveryDate: new Date(deliveryDate),
      notes: notes || null,
      items: {
        create: items.map((i: any) => ({
          productId: i.productId,
          quantityOrdered: Number(i.quantityOrdered),
          unitPrice: Number(i.unitPrice),
          totalPrice: Number(i.quantityOrdered) * Number(i.unitPrice),
        })),
      },
    },
    include: deliveryInclude,
  });

  return NextResponse.json(updated);
}

// DELETE /api/deliveries/[id] — exclui entrega de qualquer status; reverte estoque/financeiro se CONFIRMED/PARTIAL
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const order = await db.deliveryOrder.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  if (role !== "SUPER_ADMIN" && order.schoolId !== schoolId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Para entregas confirmadas/parciais: reverter StockEntry e BudgetMovement criados na confirmação
  if (["CONFIRMED", "PARTIAL"].includes(order.status)) {
    const ref = `DEL-${id.slice(-8).toUpperCase()}`;
    await db.stockEntry.deleteMany({ where: { invoiceNumber: ref } });
    await db.budgetMovement.deleteMany({ where: { reference: ref } });
  }

  await db.deliveryOrder.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
