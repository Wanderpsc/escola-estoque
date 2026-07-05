import { db } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Verifica se a escola tem licença ativa.
 * Retorna null se OK, ou um NextResponse de erro se a licença estiver inválida.
 */
export async function checkLicense(schoolId: string): Promise<NextResponse | null> {
  const license = await db.license.findUnique({ where: { schoolId } });

  if (!license) {
    return NextResponse.json(
      { error: "Sem licença", message: "Esta escola não possui uma licença ativa. Contate o administrador do sistema." },
      { status: 403 }
    );
  }

  if (!license.active) {
    return NextResponse.json(
      { error: "Licença suspensa", message: "A licença desta escola está suspensa. Contate o administrador." },
      { status: 403 }
    );
  }

  if (license.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Licença expirada", message: `A licença desta escola expirou em ${license.expiresAt.toLocaleDateString("pt-BR")}. Renove com o administrador.` },
      { status: 403 }
    );
  }

  return null;
}
