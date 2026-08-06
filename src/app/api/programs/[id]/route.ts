import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const program = await db.program.update({ where: { id }, data: { ...body } });
  return NextResponse.json(program);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  // Non-super admins can only delete programs belonging to their school
  if (role !== "SUPER_ADMIN") {
    const schoolId = (session.user as any).schoolId;
    const program = await db.program.findUnique({ where: { id }, select: { schoolId: true } });
    if (!program || program.schoolId !== schoolId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
  }
  await db.program.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
