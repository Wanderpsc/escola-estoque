import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/financial/repair-extra
// Cria BudgetMovements faltantes para saídas extra (EXIT-EXTRA-*) — idempotente
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const where: any = { isExtra: true };
  if (role !== "SUPER_ADMIN") {
    where.program = { schoolId: schoolId ?? "" };
  }

  const extraExits = await db.stockExit.findMany({
    where,
    include: {
      items: { include: { product: { select: { name: true, unit: true } } } },
    },
  });

  let created = 0;
  for (const exit of extraExits) {
    const totalValue = exit.items.reduce((s, i) => s + i.totalPrice, 0);
    if (totalValue <= 0) continue;

    // Verificar se já existe BudgetMovement para esta saída
    const existing = await db.budgetMovement.findFirst({
      where: { reference: `EXIT-EXTRA-${exit.id}` },
    });
    if (existing) continue;

    // Criar um BudgetMovement por item
    for (const item of exit.items) {
      if (item.totalPrice <= 0) continue;
      await db.budgetMovement.create({
        data: {
          programId: exit.programId,
          type: "DEBIT",
          category: "EXTRA",
          amount: item.totalPrice,
          description: `Saída Extra — ${item.product.name}`,
          reference: `EXIT-EXTRA-${exit.id}`,
          date: exit.exitDate,
          productId: item.productId,
          quantity: item.quantity,
          unit: item.product.unit,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, total: extraExits.length });
}
