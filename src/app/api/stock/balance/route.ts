import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;
  const url = new URL(req.url);
  const programId = url.searchParams.get("programId");

  const where: any = role === "SUPER_ADMIN" ? {} : { schoolId: schoolId ?? "" };
  // Quando filtrado por programa, inclui também produtos de catálogo (programId null)
  if (programId) where.OR = [{ programId }, { programId: null }];

  const products = await db.product.findMany({
    where: { ...where, active: true },
    include: {
      program: { select: { name: true, type: true } },
      entryItems: { select: { quantity: true, unitPrice: true, entryId: true } },
      exitItems: { select: { quantity: true, unitPrice: true } },
      adjustments: { select: { quantity: true, unitPrice: true } },
    },
    orderBy: { name: "asc" },
  });

  // Busca DeliveryOrderItems confirmados vinculados a NFs (stockEntryId definido),
  // para calcular quanto foi efetivamente entregue por produto.
  const confirmedDeliveryItems = await db.deliveryOrderItem.findMany({
    where: {
      order: {
        stockEntryId: { not: null },
        status: { in: ["CONFIRMED", "PARTIAL"] },
        ...(role !== "SUPER_ADMIN" ? { schoolId: schoolId ?? "" } : {}),
      },
    },
    select: { productId: true, quantityDelivered: true },
  });

  // Agrupa quantidade entregue confirmada por produto
  const deliveredByProduct: Record<string, number> = {};
  const trackedProductIds = new Set<string>();
  for (const di of confirmedDeliveryItems) {
    deliveredByProduct[di.productId] = (deliveredByProduct[di.productId] ?? 0) + (di.quantityDelivered ?? 0);
    trackedProductIds.add(di.productId);
  }

  // IDs de NFs que possuem alguma DeliveryOrder (rastreamento ativo)
  const trackedEntryIds = new Set<string>(
    (await db.deliveryOrder.findMany({
      where: {
        stockEntryId: { not: null },
        ...(role !== "SUPER_ADMIN" ? { schoolId: schoolId ?? "" } : {}),
      },
      select: { stockEntryId: true },
    })).map((d) => d.stockEntryId as string)
  );

  const balance = products.map((p) => {
    const totalIn = p.entryItems.reduce((s, i) => s + i.quantity, 0);
    const totalOut = p.exitItems.reduce((s, i) => s + i.quantity, 0);
    const totalAdjusted = p.adjustments.reduce((s, a) => s + a.quantity, 0);
    const avgPrice = totalIn > 0
      ? p.entryItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0) / totalIn
      : totalAdjusted > 0
        ? p.adjustments.filter((a) => a.quantity > 0).reduce((s, a) => s + a.quantity * a.unitPrice, 0) /
          Math.max(p.adjustments.filter((a) => a.quantity > 0).reduce((s, a) => s + a.quantity, 0), 1)
        : 0;
    const balanceQty = totalIn - totalOut + totalAdjusted;

    // Rastreamento de recebimento: soma do que foi confirmado via DeliveryOrder vinculada a NF
    const totalDelivered = deliveredByProduct[p.id] ?? 0;
    // Pendente = total nas NFs - total efetivamente recebido (somente produtos com rastreamento ativo)
    const hasDeliveryTracking = trackedProductIds.has(p.id) ||
      p.entryItems.some((ei) => trackedEntryIds.has(ei.entryId));
    const pendingReceipt = hasDeliveryTracking
      ? Math.max(totalIn - totalDelivered, 0)
      : 0;

    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      ncmCode: p.ncmCode,
      minStock: p.minStock,
      programId: p.programId,
      program: p.program,
      totalIn,
      totalOut,
      totalAdjusted,
      totalDelivered: hasDeliveryTracking ? totalDelivered : null,
      pendingReceipt: hasDeliveryTracking ? pendingReceipt : null,
      hasDeliveryTracking,
      balance: balanceQty,
      avgPrice,
      totalValue: balanceQty * avgPrice,
      status: balanceQty <= 0 ? "ZERO" : balanceQty <= p.minStock ? "LOW" : "OK",
    };
  });

  return NextResponse.json(balance);
}
