import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/stock/receiving?programId=...
// Retorna todas as NFs com status de recebimento por item:
//   ordered = quantidade na NF | received = confirmado por entregas | pending = a receber
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;
  const url = new URL(req.url);
  const programId = url.searchParams.get("programId");

  const where: any = { isPurchase: false };
  if (role !== "SUPER_ADMIN") where.program = { schoolId: schoolId ?? "" };
  if (programId) where.programId = programId;

  const entries = await db.stockEntry.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      program:  { select: { id: true, name: true, type: true } },
      user:     { select: { name: true } },
      items: {
        where: { isExtra: false },
        include: { product: { select: { id: true, name: true, unit: true } } },
        orderBy: { createdAt: "asc" },
      },
      deliveryOrders: {
        where: { stockEntryId: { not: null } },
        include: {
          items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
        orderBy: { deliveryDate: "asc" },
      },
    },
    orderBy: { invoiceDate: "desc" },
    take: 200,
  });

  const result = entries.map((entry) => {
    const confirmedDeliveries = entry.deliveryOrders.filter((d) =>
      ["CONFIRMED", "PARTIAL"].includes(d.status)
    );
    // NFs com entrega pendente no fluxo do fornecedor (Entregas): avisa a escola para não duplicar
    const hasPendingSupplierDelivery = entry.deliveryOrders.some((d) => d.status === "PENDING");

    const itemsWithDelivery = entry.items.map((item) => {
      const deliveredQty = confirmedDeliveries
        .flatMap((d) => d.items)
        .filter((di) => di.productId === item.productId)
        .reduce((s, di) => s + (di.quantityDelivered ?? 0), 0);

      return {
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        unit: item.product.unit,
        orderedQty: item.quantity,
        unitPrice: item.unitPrice,
        deliveredQty,
        pendingQty: Math.max(item.quantity - deliveredQty, 0),
      };
    });

    const totalOrderedQty = itemsWithDelivery.reduce((s, i) => s + i.orderedQty, 0);
    const totalDeliveredQty = itemsWithDelivery.reduce((s, i) => s + i.deliveredQty, 0);
    const totalPendingQty = itemsWithDelivery.reduce((s, i) => s + i.pendingQty, 0);
    const hasTracking = confirmedDeliveries.length > 0 || entry.deliveryOrders.length > 0;

    const receiptStatus = !hasTracking
      ? "NO_TRACKING"
      : totalPendingQty <= 0
      ? "COMPLETE"
      : totalDeliveredQty > 0
      ? "PARTIAL"
      : "PENDING";

    // Histórico de recebimentos (delivery orders confirmadas vinculadas a esta NF)
    const receiptHistory = entry.deliveryOrders.map((d) => ({
      id: d.id,
      deliveryDate: d.deliveryDate,
      status: d.status,
      confirmedAt: d.confirmedAt,
      items: d.items.map((di) => ({
        productId: di.productId,
        productName: di.product.name,
        unit: di.product.unit,
        quantityOrdered: di.quantityOrdered,
        quantityDelivered: di.quantityDelivered ?? 0,
      })),
    }));

    return {
      id: entry.id,
      invoiceNumber: entry.invoiceNumber,
      invoiceDate: entry.invoiceDate,
      totalValue: entry.totalValue,
      status: entry.status,
      supplierId: entry.supplier.id,
      supplierName: entry.supplier.name,
      programId: entry.programId,
      programName: entry.program.name,
      programType: entry.program.type,
      registeredBy: entry.user.name,
      items: itemsWithDelivery,
      receiptStatus,
      totalOrderedQty,
      totalDeliveredQty,
      totalPendingQty,
      totalOrderedValue: entry.totalValue,
      totalDeliveredValue: itemsWithDelivery.reduce(
        (s, i) => s + i.deliveredQty * i.unitPrice,
        0
      ),
      totalPendingValue: itemsWithDelivery.reduce(
        (s, i) => s + i.pendingQty * i.unitPrice,
        0
      ),
      hasPendingSupplierDelivery,
      receiptHistory,
    };
  });

  return NextResponse.json(result);
}

// POST /api/stock/receiving
// Registra um recebimento parcial ou total de uma NF
// body: { entryId, deliveryDate, notes, items: [{productId, quantityReceived}] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "NUTRITIONIST"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { entryId, deliveryDate, notes, items } = body;

  if (!entryId || !deliveryDate || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "entryId, deliveryDate e items são obrigatórios" }, { status: 400 });
  }

  const entry = await db.stockEntry.findUnique({
    where: { id: entryId },
    include: {
      items: { where: { isExtra: false } },
      supplier: { select: { id: true, schoolId: true } },
    },
  });

  if (!entry) return NextResponse.json({ error: "NF não encontrada" }, { status: 404 });

  const resolvedSchoolId = schoolId ?? entry.supplier.schoolId;

  // Busca quanto já foi confirmado por produto para esta NF (via qualquer fluxo)
  const existingConfirmed = await db.deliveryOrder.findMany({
    where: { stockEntryId: entryId, status: { in: ["CONFIRMED", "PARTIAL"] } },
    include: { items: true },
  });
  const alreadyByProduct: Record<string, number> = {};
  for (const d of existingConfirmed) {
    for (const di of d.items) {
      alreadyByProduct[di.productId] = (alreadyByProduct[di.productId] ?? 0) + (di.quantityDelivered ?? 0);
    }
  }

  // Monta itens para a DeliveryOrder — clampeia ao máximo ainda pendente por produto
  const orderItems = items
    .filter((i: any) => i.quantityReceived > 0)
    .map((i: any) => {
      const entryItem = entry.items.find((ei) => ei.productId === i.productId);
      const unitPrice = entryItem?.unitPrice ?? 0;
      const qtyOrdered = entryItem?.quantity ?? Number(i.quantityReceived);
      const alreadyDelivered = alreadyByProduct[i.productId] ?? 0;
      const maxReceivable = Math.max(qtyOrdered - alreadyDelivered, 0);
      const effectiveQty = Math.min(Number(i.quantityReceived), maxReceivable);
      if (effectiveQty <= 0) return null;
      return {
        productId: i.productId,
        quantityOrdered: qtyOrdered,
        quantityDelivered: effectiveQty,
        unitPrice,
        totalPrice: effectiveQty * unitPrice,
      };
    })
    .filter(Boolean) as any[];

  if (orderItems.length === 0) {
    return NextResponse.json({ error: "Nenhuma quantidade válida informada (verifique se não há duplicidade com entregas já confirmadas)" }, { status: 400 });
  }

  // allDelivered = todos os itens atingiram o total da NF após esta operação
  const allDelivered = orderItems.every((oi) => {
    const entryItem = entry.items.find((ei) => ei.productId === oi.productId);
    const qtyOrdered = entryItem?.quantity ?? oi.quantityDelivered;
    const alreadyDelivered = alreadyByProduct[oi.productId] ?? 0;
    return alreadyDelivered + oi.quantityDelivered >= qtyOrdered;
  });

  const deliveryOrder = await db.deliveryOrder.create({
    data: {
      supplierId: entry.supplierId,
      schoolId: resolvedSchoolId,
      programId: entry.programId,
      stockEntryId: entry.id,
      createdById: userId,
      confirmedById: userId,
      confirmedAt: new Date(),
      status: allDelivered ? "CONFIRMED" : "PARTIAL",
      deliveryDate: new Date(deliveryDate),
      notes: notes ?? null,
      items: { create: orderItems },
    },
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
    },
  });

  return NextResponse.json(deliveryOrder, { status: 201 });
}
