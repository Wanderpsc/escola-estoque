import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkLicense } from "@/lib/license";
import { z } from "zod";

const supplierSchema = z.object({
  name: z.string().min(2),
  cnpj: z.string().min(14),
  ie: z.string().optional(),
  address: z.string().min(3),
  number: z.string().min(1),
  complement: z.string().optional(),
  district: z.string().min(2),
  city: z.string().min(2),
  state: z.string().length(2),
  zipCode: z.string().min(8),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  contact: z.string().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  const role = (session.user as any).role;
  const where = role === "SUPER_ADMIN" ? {} : { schoolId: schoolId ?? "" };

  const suppliers = await db.supplier.findMany({
    where: { ...where, active: true },
    orderBy: { name: "asc" },
    include: { school: { select: { name: true } } },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schoolId = (session.user as any).schoolId;
  if (!schoolId) return NextResponse.json({ error: "Escola não definida" }, { status: 400 });

  const licenseError = await checkLicense(schoolId);
  if (licenseError) return licenseError;

  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const cnpj = parsed.data.cnpj.replace(/\D/g, "");
  const supplier = await db.supplier.create({
    data: { ...parsed.data, cnpj, schoolId },
  });
  return NextResponse.json(supplier, { status: 201 });
}
