import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const licenseSchema = z.object({
  schoolId: z.string(),
  plan: z.enum(["BASICO", "PROFISSIONAL", "PREMIUM"]).default("BASICO"),
  expiresAt: z.string().datetime(),
  active: z.boolean().default(true),
  notes: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const licenses = await db.license.findMany({
    include: { school: { select: { id: true, name: true, cnpj: true, city: true, state: true, email: true, director: true } } },
    orderBy: { expiresAt: "asc" },
  });
  return NextResponse.json(licenses);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = licenseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await db.license.findUnique({ where: { schoolId: parsed.data.schoolId } });
  if (existing) {
    // renovar: atualizar em vez de criar
    const license = await db.license.update({
      where: { schoolId: parsed.data.schoolId },
      data: { ...parsed.data, expiresAt: new Date(parsed.data.expiresAt) },
      include: { school: { select: { name: true } } },
    });
    return NextResponse.json(license);
  }

  const license = await db.license.create({
    data: { ...parsed.data, expiresAt: new Date(parsed.data.expiresAt) },
    include: { school: { select: { name: true } } },
  });
  return NextResponse.json(license, { status: 201 });
}
