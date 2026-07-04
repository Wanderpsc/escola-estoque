import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const exitItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

const exitSchema = z.object({
  exitDate: z.string(),
  reason: z.enum(["CONSUMO", "VENCIMENTO", "DOACAO", "PERDA", "OUTRO"]),
  programId: z.string(),
  observations: z.string().optional(),
  items: z.array(exitItemSchema).min(1),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;
  const url = new URL(req.url);
  const programId = url.searchParams.get("programId");

  const where: any = role === "SUPER_ADMIN" ? {} : { program: { schoolId: schoolId ?? "" } };
  if (programId) where.programId = programId;

  const exits = await db.stockExit.findMany({
    where,
    include: {
      program: { select: { name: true, type: true } },
      user: { select: { name: true } },
      items: { include: { product: { select: { name: true, unit: true } } } },
    },
    orderBy: { exitDate: "desc" },
    take: 100,
  });
  return NextResponse.json(exits);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();
  const parsed = exitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, ...exitData } = parsed.data;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  // Verificar saldo antes de registrar saída
  for (const item of items) {
    const product = await db.product.findUnique({
      where: { id: item.productId },
      include: {
        entryItems: { select: { quantity: true } },
        exitItems: { select: { quantity: true } },
      },
    });
    if (!product) continue;
    const balance =
      product.entryItems.reduce((s, i) => s + i.quantity, 0) -
      product.exitItems.reduce((s, i) => s + i.quantity, 0);
    if (item.quantity > balance) {
      return NextResponse.json(
        { error: `Saldo insuficiente para o produto "${product.name}". Saldo atual: ${balance} ${product.unit}` },
        { status: 422 }
      );
    }
  }

  const exit = await db.stockExit.create({
    data: {
      ...exitData,
      exitDate: new Date(exitData.exitDate),
      userId,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.quantity * i.unitPrice,
        })),
      },
    },
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
      program: { select: { name: true } },
    },
  });
  return NextResponse.json(exit, { status: 201 });
}
