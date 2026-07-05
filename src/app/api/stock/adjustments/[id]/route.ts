import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// DELETE /api/stock/adjustments/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const adjustment = await db.stockAdjustment.findUnique({ where: { id } });
  if (!adjustment) return NextResponse.json({ error: "Ajuste não encontrado" }, { status: 404 });

  if (role !== "SUPER_ADMIN" && adjustment.schoolId !== schoolId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await db.stockAdjustment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
