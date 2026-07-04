import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const ALLOWED_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "ACCOUNTANT", "NUTRITIONIST", "USER"];

const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "ACCOUNTANT", "NUTRITIONIST", "USER"]),
  schoolId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = (session.user as any).role;
  const schoolId = (session.user as any).schoolId;

  let where: any = {};
  if (role === "SUPER_ADMIN") {
    // vê todos
  } else if (role === "SCHOOL_ADMIN") {
    where.schoolId = schoolId;
  } else {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const users = await db.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, cpf: true, phone: true, active: true, createdAt: true, school: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const sessionRole = (session?.user as any)?.role;
  if (!session || !["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(sessionRole)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // SCHOOL_ADMIN não pode criar SUPER_ADMIN
  if (sessionRole === "SCHOOL_ADMIN" && parsed.data.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão para criar Super Admin" }, { status: 403 });
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  const schoolId = sessionRole === "SCHOOL_ADMIN"
    ? (session.user as any).schoolId
    : parsed.data.schoolId;

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      cpf: parsed.data.cpf,
      phone: parsed.data.phone,
      role: parsed.data.role,
      schoolId,
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
