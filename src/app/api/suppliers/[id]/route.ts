import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  cnpj: z.string().optional(),
  ie: z.string().optional(),
  address: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  contact: z.string().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Verificar que pertence à escola
  if (role !== "SUPER_ADMIN") {
    const supplier = await db.supplier.findUnique({ where: { id }, select: { schoolId: true } });
    if (!supplier || supplier.schoolId !== schoolId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  const updated = await db.supplier.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  if (role !== "SUPER_ADMIN") {
    const supplier = await db.supplier.findUnique({ where: { id }, select: { schoolId: true } });
    if (!supplier || supplier.schoolId !== schoolId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  // Desativa em vez de deletar fisicamente (preserva histórico de NFs)
  await db.supplier.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
