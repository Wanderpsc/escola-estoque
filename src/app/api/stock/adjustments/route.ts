import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/stock/adjustments?productId=xxx
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");

  if (!productId) return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });

  const where: any = { productId };
  if (role !== "SUPER_ADMIN") where.schoolId = schoolId ?? "";

  const adjustments = await db.stockAdjustment.findMany({
    where,
    include: { user: { select: { name: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(adjustments);
}

// POST /api/stock/adjustments
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { productId, quantity, unitPrice = 0, description, date } = body;

  if (!productId || quantity === undefined || quantity === null) {
    return NextResponse.json({ error: "productId e quantity são obrigatórios" }, { status: 400 });
  }

  // Verifica que o produto pertence à escola
  const product = await db.product.findFirst({
    where: {
      id: productId,
      ...(role !== "SUPER_ADMIN" ? { schoolId: schoolId ?? "" } : {}),
    },
  });
  if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

  const adjustment = await db.stockAdjustment.create({
    data: {
      productId,
      schoolId: product.schoolId,
      userId,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      description: description ?? null,
      date: date ? new Date(date) : new Date(),
    },
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json(adjustment, { status: 201 });
}
