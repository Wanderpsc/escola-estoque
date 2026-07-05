import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const deliveryInclude = {
  supplier: { select: { id: true, name: true } },
  school: { select: { id: true, name: true } },
  program: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, unit: true, ncmCode: true } },
    },
  },
} as const;

// GET /api/deliveries  — lista entregas
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;
  const userId = (session.user as any).id;

  let where: any = {};

  if (role === "SUPPLIER") {
    // Fornecedor vê apenas suas próprias ordens
    where.createdById = userId;
  } else if (role !== "SUPER_ADMIN") {
    // Equipe da escola vê todas as ordens da escola
    where.schoolId = schoolId ?? "";
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status) where.status = status;

  const orders = await db.deliveryOrder.findMany({
    where,
    include: deliveryInclude,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}

// POST /api/deliveries  — fornecedor cria ordem de entrega
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;

  if (!["SUPPLIER", "SCHOOL_ADMIN", "MANAGER", "SUPER_ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { supplierId, schoolId, programId, deliveryDate, notes, items } = body;

  if (!supplierId || !schoolId || !deliveryDate || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "supplierId, schoolId, deliveryDate e items são obrigatórios" },
      { status: 400 }
    );
  }

  // Se SUPPLIER, valida que o supplierId pertence ao usuário
  if (role === "SUPPLIER") {
    const user = await db.user.findUnique({ where: { id: userId }, select: { supplierId: true, schoolId: true } });
    if (!user?.supplierId || user.supplierId !== supplierId) {
      return NextResponse.json({ error: "Fornecedor inválido para este usuário" }, { status: 403 });
    }
  }

  const order = await db.deliveryOrder.create({
    data: {
      supplierId,
      schoolId,
      programId: programId || null,
      createdById: userId,
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

  return NextResponse.json(order, { status: 201 });
}
