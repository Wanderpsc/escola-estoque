import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const user = await db.user.findUnique({ where: { email: "admin@escolaestoque.com" } });
    if (!user) return NextResponse.json({ error: "user not found" });

    const passwordMatch = await bcrypt.compare("admin@2025", user.password);
    return NextResponse.json({
      ok: true,
      userFound: true,
      active: user.active,
      passwordMatch,
      passwordHash: user.password.substring(0, 10) + "...",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
