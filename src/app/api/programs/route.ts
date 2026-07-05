import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const programSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),   // livre: MERENDA | MANUTENCAO | PDDE | qualquer valor personalizado
  description: z.string().optional(),
  budget: z.number().min(0).default(0),
  parentId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const where: any = role === "SUPER_ADMIN" ? {} : { schoolId: schoolId ?? "" };
  if (type) where.type = type;

  const programs = await db.program.findMany({
    where: { ...where, active: true },
    include: {
      _count: { select: { products: true, stockEntries: true } },
      children: {
        where: { active: true },
        include: { _count: { select: { products: true, stockEntries: true } } },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(programs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const schoolId = (session.user as any).schoolId;
  if (!schoolId && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Escola não definida" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = programSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const targetSchoolId = body.schoolId ?? schoolId;
  const program = await db.program.create({
    data: { ...parsed.data, schoolId: targetSchoolId, parentId: parsed.data.parentId ?? null },
  });
  return NextResponse.json(program, { status: 201 });
}
