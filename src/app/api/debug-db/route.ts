import { NextResponse } from "next/server";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function GET() {
  // Simular exatamente o que authorize recebe do NextAuth v5 beta
  const testCredentials = { email: "admin@escolaestoque.com", password: "admin@2025" };
  const parsed = loginSchema.safeParse(testCredentials);
  return NextResponse.json({ parsed: parsed.success, data: parsed.success ? parsed.data : (parsed as any).error?.errors });
}
