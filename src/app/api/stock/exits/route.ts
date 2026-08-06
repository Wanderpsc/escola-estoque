import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkLicense } from "@/lib/license";
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
  isExtra: z.boolean().optional().default(false),
  forceRegister: z.boolean().optional().default(false),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;
  const url = new URL(req.url);
  const programId = url.searchParams.get("programId");

  const where: any = role === "SUPER_ADMIN" ? {} : { program: { schoolId: schoolId ?? "" } };
  const extra = url.searchParams.get("extra");
  if (programId) where.programId = programId;
  if (extra === "true") where.isExtra = true;

  const from = url.searchParams.get("from");
  const to   = url.searchParams.get("to");
  if (from || to) {
    where.exitDate = {};
    if (from) where.exitDate.gte = new Date(from);
    if (to)   where.exitDate.lte = new Date(to + "T23:59:59.999Z");
  }

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
  const schoolId = (session.user as any).schoolId;

  if ((session.user as any).role !== "SUPER_ADMIN" && schoolId) {
    const licenseError = await checkLicense(schoolId);
    if (licenseError) return licenseError;
  }

  const body = await req.json();
  const parsed = exitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, forceRegister, ...exitData } = parsed.data;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  // Verificar saldo (pulado para saídas extra ou forceRegister=true com ressalva)
  if (!exitData.isExtra && !forceRegister) {
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

  // Saída Extra: cria débito automático no orçamento do programa
  if (exitData.isExtra && totalValue > 0) {
    await db.budgetMovement.create({
      data: {
        programId: exitData.programId,
        type: "DEBIT",
        category: "EXTRA",
        amount: totalValue,
        description: `Saída Extra — ${exitData.observations ?? items.map((_, i) => `item ${i + 1}`).join(", ")}`,
        reference: `EXIT-EXTRA-${exit.id}`,
        date: new Date(exitData.exitDate),
      },
    });
  }

  return NextResponse.json(exit, { status: 201 });
}
