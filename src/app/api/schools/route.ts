import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schoolSchema = z.object({
  name: z.string().min(2),
  cnpj: z.string().min(14),
  ie: z.string().optional(),
  address: z.string().min(3),
  number: z.string().min(1),
  complement: z.string().optional(),
  district: z.string().min(2),
  city: z.string().min(2),
  state: z.string().length(2),
  zipCode: z.string().min(8),
  phone: z.string().min(10),
  email: z.string().email(),
  director: z.string().min(3),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "SUPER_ADMIN") {
    const school = await db.school.findUnique({ where: { id: (session.user as any).schoolId } });
    return NextResponse.json(school ? [school] : []);
  }

  const schools = await db.school.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return NextResponse.json(schools);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Sanitize CNPJ
  const cnpj = parsed.data.cnpj.replace(/\D/g, "");
  const existing = await db.school.findUnique({ where: { cnpj } });
  if (existing) {
    return NextResponse.json({ error: "CNPJ já cadastrado" }, { status: 409 });
  }

  const school = await db.school.create({ data: { ...parsed.data, cnpj } });
  return NextResponse.json(school, { status: 201 });
}
