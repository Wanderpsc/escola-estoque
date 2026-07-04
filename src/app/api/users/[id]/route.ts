import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(3).optional(),
  phone: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "ACCOUNTANT", "NUTRITIONIST", "USER"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sessionRole = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(sessionRole)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { password, ...rest } = parsed.data;
  const data: any = { ...rest };
  if (password) data.password = await bcrypt.hash(password, 12);

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return NextResponse.json(user);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  await db.user.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
