import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "ACCOUNTANT"].includes(role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const schoolId = (session.user as any).schoolId;

  // Non-super admins can only delete movements belonging to their school's programs
  if (role !== "SUPER_ADMIN") {
    const movement = await db.budgetMovement.findUnique({
      where: { id },
      include: { program: { select: { schoolId: true } } },
    });
    if (!movement || movement.program.schoolId !== schoolId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
  }

  await db.budgetMovement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
