import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const entryItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
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
  items: z.array(entryItemSchema).min(1),
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
  const body = await req.json();
  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { items, ...entryData } = parsed.data;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const entry = await db.stockEntry.create({
    data: {
      ...entryData,
      invoiceDate: new Date(entryData.invoiceDate),
      totalValue,
      userId,
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.quantity * i.unitPrice,
          lot: i.lot,
          expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
        })),
      },
    },
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
      supplier: { select: { name: true } },
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
