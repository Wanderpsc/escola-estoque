import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH /api/stock/entries/[id] — edita metadados e itens de uma entrada
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const entry = await db.stockEntry.findUnique({ where: { id }, include: { items: true } });
  if (!entry) return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 });

  // Verificar que pertence à escola (exceto SUPER_ADMIN)
  if (role !== "SUPER_ADMIN") {
    const prog = await db.program.findUnique({ where: { id: entry.programId }, select: { schoolId: true } });
    if (prog?.schoolId !== schoolId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { invoiceNumber, invoiceDate, supplierId, observations, items, newItems, deleteItemIds, action } = body;

  // ── Ação: Finalizar NF ────────────────────────────────────────────────────
  if (action === "FINALIZE") {
    if (entry.status === "FINALIZED") {
      return NextResponse.json({ error: "NF já finalizada" }, { status: 400 });
    }
    const finalized = await db.stockEntry.update({
      where: { id },
      data: { status: "FINALIZED", finalizedAt: new Date() },
      include: {
        supplier: { select: { name: true } },
        program: { select: { name: true, type: true } },
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, unit: true } } } },
      },
    });
    return NextResponse.json(finalized);
  }

  if (action === "REOPEN") {
    const reopened = await db.stockEntry.update({
      where: { id },
      data: { status: "OPEN", finalizedAt: null },
      include: {
        supplier: { select: { name: true } },
        program: { select: { name: true, type: true } },
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, unit: true } } } },
      },
    });
    return NextResponse.json(reopened);
  }

  // Exclui itens marcados para remoção
  if (Array.isArray(deleteItemIds) && deleteItemIds.length > 0) {
    await db.entryItem.deleteMany({ where: { id: { in: deleteItemIds }, entryId: id } });
  }

  // Atualiza itens existentes se fornecidos
  if (Array.isArray(items)) {
    await Promise.all(
      items.map((item: { id: string; productId?: string; quantity: number; unitPrice: number }) =>
        db.entryItem.update({
          where: { id: item.id },
          data: {
            ...(item.productId !== undefined && { productId: item.productId }),
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.quantity) * Number(item.unitPrice),
          },
        })
      )
    );
  }

  // Adiciona novos itens à NF existente
  if (Array.isArray(newItems) && newItems.length > 0) {
    await db.entryItem.createMany({
      data: newItems.map((item: { productId: string; quantity: number; unitPrice: number; lot?: string }) => ({
        entryId: id,
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.quantity) * Number(item.unitPrice),
        lot: item.lot ?? null,
        isExtra: false,
      })),
    });
  }

  // Recalcula totalValue
  const updatedItems = await db.entryItem.findMany({ where: { entryId: id } });
  const totalValue = updatedItems.reduce((s, i) => s + i.totalPrice, 0);

  const updated = await db.stockEntry.update({
    where: { id },
    data: {
      ...(invoiceNumber !== undefined && { invoiceNumber }),
      ...(invoiceDate !== undefined && { invoiceDate: new Date(invoiceDate) }),
      ...(supplierId !== undefined && { supplierId }),
      ...(observations !== undefined && { observations }),
      totalValue,
    },
    include: {
      supplier: { select: { name: true } },
      program: { select: { name: true, type: true } },
      user: { select: { name: true } },
      items: { include: { product: { select: { name: true, unit: true } } } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/stock/entries/[id] — exclui uma entrada (e seus itens por cascade)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const entry = await db.stockEntry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 });

  if (role !== "SUPER_ADMIN") {
    const prog = await db.program.findUnique({ where: { id: entry.programId }, select: { schoolId: true } });
    if (prog?.schoolId !== schoolId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Cascade: EntryItems são deletados automaticamente (onDelete: Cascade no schema)
  await db.stockEntry.delete({ where: { id } });

  // Limpar débitos financeiros vinculados a esta entrada
  if (entry.isPurchase) {
    await db.budgetMovement.deleteMany({ where: { reference: `PURCHASE-${id}` } });
  }
  // Extra NF items também geram BudgetMovement — limpar junto
  await db.budgetMovement.deleteMany({ where: { reference: `NF-EXTRA-${id}` } });

  return NextResponse.json({ ok: true });
}
