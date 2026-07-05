import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// POST /api/auth/verify
// Body: { password: string }
// Verifica a senha do usuário atualmente logado.
// Retorna 200 { ok: true } ou 401 { error: "Senha incorreta" }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { password } = await req.json();
  if (!password) return NextResponse.json({ error: "Senha obrigatória" }, { status: 400 });

  const userId = (session.user as any).id;
  const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });

  return NextResponse.json({ ok: true });
}
