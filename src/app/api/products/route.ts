import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  ncmCode: z.string().min(4),
  unit: z.string().min(1),
  minStock: z.number().min(0).default(0),
  programId: z.string(),
});

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
    orderBy: { name: "asc" },
    include: {
      program: { select: { name: true, type: true } },
      entryItems: { select: { quantity: true } },
      exitItems: { select: { quantity: true } },
    },
  });

  const enriched = products.map((p) => {
    const totalIn = p.entryItems.reduce((s, i) => s + i.quantity, 0);
    const totalOut = p.exitItems.reduce((s, i) => s + i.quantity, 0);
    return { ...p, balance: totalIn - totalOut };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  if (!schoolId) return NextResponse.json({ error: "Escola não definida" }, { status: 400 });

  const body = await req.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const product = await db.product.create({
    data: { ...parsed.data, schoolId },
    include: { program: { select: { name: true, type: true } } },
  });
  return NextResponse.json(product, { status: 201 });
}
