import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkLicense } from "@/lib/license";
import { z } from "zod";

const entryItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  lot: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
});

const entrySchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceSeries: z.string().optional(),
  invoiceKey: z.string().optional(),
  invoiceDate: z.string(),
  supplierId: z.string(),
  programId: z.string(),
  observations: z.string().optional(),
  items: z.array(entryItemSchema).default([]),
  extraItems: z.array(entryItemSchema).optional().default([]),
  isPurchase: z.boolean().optional().default(false),
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
  const purchases = url.searchParams.get("purchases");
  if (purchases === "true") where.isPurchase = true;
  else if (purchases === "false") where.isPurchase = false;

  const from = url.searchParams.get("from");
  const to   = url.searchParams.get("to");
  if (from || to) {
    where.invoiceDate = {};
    if (from) where.invoiceDate.gte = new Date(from);
    if (to)   where.invoiceDate.lte = new Date(to + "T23:59:59.999Z");
  }

  const entries = await db.stockEntry.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      program: { select: { name: true, type: true } },
      user: { select: { name: true } },
      items: { include: { product: { select: { name: true, unit: true } } } },
    },
    orderBy: { invoiceDate: "desc" },
    take: 100,
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = (session.user as any).id;
  const schoolId = (session.user as any).schoolId;

  // Verificar licença (exceto SUPER_ADMIN)
  if ((session.user as any).role !== "SUPER_ADMIN" && schoolId) {
    const licenseError = await checkLicense(schoolId);
    if (licenseError) return licenseError;
  }

  const body = await req.json();
  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.items.length === 0 && parsed.data.extraItems.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos 1 produto" }, { status: 400 });
  }

  const { items, extraItems, ...entryData } = parsed.data;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const extraValue = extraItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const allItems = [
    ...items.map((i) => ({ ...i, isExtra: false })),
    ...extraItems.map((i) => ({ ...i, isExtra: true })),
  ];

  const entry = await db.stockEntry.create({
    data: {
      ...entryData,
      invoiceDate: new Date(entryData.invoiceDate),
      totalValue,
      userId,
      items: {
        create: allItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.quantity * i.unitPrice,
          lot: i.lot,
          expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
          isExtra: i.isExtra,
        })),
      },
    },
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
      supplier: { select: { name: true } },
    },
  });

  // Compra informal: cria débito automático no orçamento
  if (entryData.isPurchase && totalValue > 0) {
    await db.budgetMovement.create({
      data: {
        programId: entryData.programId,
        type: "DEBIT",
        category: "EXTRA",
        amount: totalValue,
        description: `Compra Informal — ${entryData.observations ?? entry.invoiceNumber}`,
        reference: `PURCHASE-${entry.id}`,
        date: new Date(entryData.invoiceDate),
      },
    });
  }

  // Produtos extra NF: cria débito financeiro acoplado à NF
  if (extraValue > 0) {
    await db.budgetMovement.create({
      data: {
        programId: entryData.programId,
        type: "DEBIT",
        category: "EXTRA",
        amount: extraValue,
        description: `Produtos Extra NF ${entry.invoiceNumber} — ${extraItems.length} item(ns) fora da nota`,
        reference: `NF-EXTRA-${entry.id}`,
        date: new Date(entryData.invoiceDate),
      },
    });
  }

  return NextResponse.json(entry, { status: 201 });
}
