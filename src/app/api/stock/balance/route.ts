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
  if (programId) where.programId = programId;

  const products = await db.product.findMany({
    where: { ...where, active: true },
    include: {
      program: { select: { name: true, type: true } },
      entryItems: { select: { quantity: true, unitPrice: true } },
      exitItems: { select: { quantity: true, unitPrice: true } },
    },
    orderBy: { name: "asc" },
  });

  const balance = products.map((p) => {
    const totalIn = p.entryItems.reduce((s, i) => s + i.quantity, 0);
    const totalOut = p.exitItems.reduce((s, i) => s + i.quantity, 0);
    const avgPrice = totalIn > 0
      ? p.entryItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0) / totalIn
      : 0;
    const balanceQty = totalIn - totalOut;
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      ncmCode: p.ncmCode,
      minStock: p.minStock,
      program: p.program,
      totalIn,
      totalOut,
      balance: balanceQty,
      avgPrice,
      totalValue: balanceQty * avgPrice,
      status: balanceQty <= 0 ? "ZERO" : balanceQty <= p.minStock ? "LOW" : "OK",
    };
  });

  return NextResponse.json(balance);
}
