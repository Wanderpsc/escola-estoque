import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
}

export function formatCNPJ(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, "");
  return clean.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

export function formatCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, "");
  return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) {
    return clean.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }
  return clean.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
}

export const PROGRAM_TYPES = {
  MERENDA: { label: "Merenda Escolar", color: "green", icon: "🥗" },
  MANUTENCAO: { label: "Manutenção", color: "blue", icon: "🔧" },
  PDDE: { label: "PDDE", color: "purple", icon: "📚" },
} as const;

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin (Vendedor)",
  SCHOOL_ADMIN: "Administrador Master",
  MANAGER: "Gestor",
  ACCOUNTANT: "Contador",
  NUTRITIONIST: "Nutricionista",
  USER: "Usuário",
  SUPPLIER: "Fornecedor",
} as const;

export const EXIT_REASONS = {
  CONSUMO: "Consumo",
  VENCIMENTO: "Vencimento/Perda",
  DOACAO: "Doação",
  PERDA: "Perda/Dano",
  OUTRO: "Outro",
} as const;

export const UNITS = [
  { value: "KG", label: "Quilograma (KG)" },
  { value: "UN", label: "Unidade (UN)" },
  { value: "LT", label: "Litro (LT)" },
  { value: "CX", label: "Caixa (CX)" },
  { value: "PCT", label: "Pacote (PCT)" },
  { value: "DZ", label: "Dúzia (DZ)" },
  { value: "M", label: "Metro (M)" },
  { value: "M2", label: "Metro Quadrado (M²)" },
  { value: "SC", label: "Saco (SC)" },
  { value: "FR", label: "Frasco (FR)" },
  { value: "GR", label: "Grama (GR)" },
  { value: "ML", label: "Mililitro (ML)" },
  { value: "RESMA", label: "Resma (RESMA)" },
  { value: "SRV", label: "Serviço (SRV)" },
];
