import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH /api/stock/exits/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const exit = await db.stockExit.findUnique({ where: { id }, include: { items: true } });
  if (!exit) return NextResponse.json({ error: "Saída não encontrada" }, { status: 404 });

  if (role !== "SUPER_ADMIN") {
    const prog = await db.program.findUnique({ where: { id: exit.programId }, select: { schoolId: true } });
    if (prog?.schoolId !== schoolId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { exitDate, reason, observations, items } = body;

  if (Array.isArray(items)) {
    await Promise.all(
      items.map((item: { id: string; quantity: number; unitPrice: number }) =>
        db.exitItem.update({
          where: { id: item.id },
          data: {
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.quantity) * Number(item.unitPrice),
          },
        })
      )
    );
  }

  const updated = await db.stockExit.update({
    where: { id },
    data: {
      ...(exitDate !== undefined && { exitDate: new Date(exitDate) }),
      ...(reason !== undefined && { reason }),
      ...(observations !== undefined && { observations }),
    },
    include: {
      program: { select: { name: true, type: true } },
      user: { select: { name: true } },
      items: { include: { product: { select: { name: true, unit: true } } } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/stock/exits/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const exit = await db.stockExit.findUnique({ where: { id } });
  if (!exit) return NextResponse.json({ error: "Saída não encontrada" }, { status: 404 });

  if (role !== "SUPER_ADMIN") {
    const prog = await db.program.findUnique({ where: { id: exit.programId }, select: { schoolId: true } });
    if (prog?.schoolId !== schoolId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await db.stockExit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
