import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const movementSchema = z.object({
  programId: z.string(),
  type: z.enum(["CREDIT", "DEBIT"]),
  amount: z.number().positive(),
  description: z.string().min(2),
  reference: z.string().optional(),
  date: z.string(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;

  const where: any = role === "SUPER_ADMIN" ? {} : { program: { schoolId: schoolId ?? "" } };

  const movements = await db.budgetMovement.findMany({
    where,
    include: { program: { select: { name: true, type: true } } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(movements);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "ACCOUNTANT"].includes(role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = movementSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const movement = await db.budgetMovement.create({
    data: { ...parsed.data, date: new Date(parsed.data.date) },
    include: { program: { select: { name: true, type: true } } },
  });
  return NextResponse.json(movement, { status: 201 });
}
