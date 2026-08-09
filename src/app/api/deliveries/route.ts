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

// GET /api/deliveries  — lista entregas
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;
  const userId = (session.user as any).id;

  let where: any = {};

  if (role === "SUPPLIER") {
    // Fornecedor vê apenas entregas vinculadas ao seu supplierId
    const supplierId = (session.user as any).supplierId;
    if (!supplierId) return NextResponse.json([], { status: 200 });
    where.supplierId = supplierId;
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
  const { supplierId, schoolId: bodySchoolId, programId, stockEntryId, deliveryDate, notes, items } = body;

  // Resolve schoolId: pode vir do body ou ser inferido pelo supplier
  let schoolId = bodySchoolId;
  if (!schoolId && supplierId) {
    const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { schoolId: true } });
    schoolId = supplier?.schoolId;
  }

  if (!supplierId || !schoolId || !deliveryDate || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "supplierId, schoolId, deliveryDate e items são obrigatórios" },
      { status: 400 }
    );
  }

  // Se SUPPLIER, valida que o supplierId pertence ao usuário e que a NF é sua
  if (role === "SUPPLIER") {
    const user = await db.user.findUnique({ where: { id: userId }, select: { supplierId: true } });
    if (!user?.supplierId || user.supplierId !== supplierId) {
      return NextResponse.json({ error: "Fornecedor inválido para este usuário" }, { status: 403 });
    }
    if (stockEntryId) {
      const entry = await db.stockEntry.findUnique({ where: { id: stockEntryId }, select: { supplierId: true, status: true } });
      if (!entry || entry.supplierId !== supplierId) {
        return NextResponse.json({ error: "NF não pertence a este fornecedor" }, { status: 403 });
      }
      if (entry.status === "FINALIZED") {
        return NextResponse.json({ error: "Esta NF já foi finalizada pelo administrador. Não é possível registrar novas entregas." }, { status: 409 });
      }
    }
  }

  const order = await db.deliveryOrder.create({
    data: {
      supplierId,
      schoolId,
      programId: programId || null,
      stockEntryId: stockEntryId || null,
      createdById: userId,
      deliveryDate: new Date(deliveryDate),
      notes: notes || null,
      items: {
        create: items.map((i: any) => ({
          productId: i.productId,
          quantityOrdered: Number(i.quantityOrdered),
          unitPrice: Number(i.unitPrice),
          totalPrice: Number(i.quantityOrdered) * Number(i.unitPrice),
          isExtra: !!i.isExtra,
          extraNote: i.extraNote || null,
        })),
      },
    },
    include: deliveryInclude,
  });

  return NextResponse.json(order, { status: 201 });
}
