import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Simula exatamente o que acontece no authorize
export async function GET() {
  const steps: Record<string, unknown> = {};

  try {
    const credentials = { email: "admin@escolaestoque.com", password: "admin@2025" };
    steps.credentials = credentials;

    const parsed = loginSchema.safeParse(credentials);
    steps.zodParsed = parsed.success;
    if (!parsed.success) {
      steps.zodErrors = (parsed as any).error?.issues;
      return NextResponse.json({ step: "zod_failed", steps });
    }

    const { email, password } = parsed.data;

    const user = await db.user.findUnique({ where: { email }, include: { school: true } });
    steps.userFound = !!user;
    steps.userActive = user?.active;
    if (!user || !user.active) return NextResponse.json({ step: "user_not_found_or_inactive", steps });

    const passwordMatch = await bcrypt.compare(password, user.password);
    steps.passwordMatch = passwordMatch;
    if (!passwordMatch) return NextResponse.json({ step: "password_mismatch", steps });

    return NextResponse.json({ step: "authorize_would_succeed", steps });
  } catch (err: any) {
    steps.error = err?.message ?? String(err);
    return NextResponse.json({ step: "exception", steps }, { status: 500 });
  }
}
