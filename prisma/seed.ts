import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...");

  // Seed NCM codes
  const ncmCodes = [
    { code: "1006.20.11", description: "Arroz beneficiado agulhinha", category: "ALIMENTO" },
    { code: "1006.20.19", description: "Arroz beneficiado outros", category: "ALIMENTO" },
    { code: "1101.00.10", description: "Farinha de trigo tipo 1", category: "ALIMENTO" },
    { code: "1701.14.00", description: "Açúcar cristal", category: "ALIMENTO" },
    { code: "1514.19.10", description: "Óleo de soja refinado", category: "ALIMENTO" },
    { code: "0401.10.10", description: "Leite pasteurizado integral", category: "ALIMENTO" },
    { code: "0105.12.00", description: "Feijão carioca", category: "ALIMENTO" },
    { code: "1507.90.11", description: "Óleo de soja bruto", category: "ALIMENTO" },
    { code: "2009.89.90", description: "Suco de fruta industrializado", category: "ALIMENTO" },
    { code: "1905.90.90", description: "Biscoito/bolacha", category: "ALIMENTO" },
    { code: "3401.19.00", description: "Sabão em pedra", category: "LIMPEZA" },
    { code: "3402.20.00", description: "Detergente líquido", category: "LIMPEZA" },
    { code: "3806.30.00", description: "Hipoclorito de sódio (água sanitária)", category: "LIMPEZA" },
    { code: "4818.10.00", description: "Papel higiênico", category: "LIMPEZA" },
    { code: "3407.00.00", description: "Material de limpeza geral", category: "LIMPEZA" },
    { code: "3924.10.00", description: "Prato descartável", category: "ALIMENTO" },
    { code: "8414.59.90", description: "Ventilador elétrico", category: "MANUTENCAO" },
    { code: "3302.10.39", description: "Lâmpada fluorescente", category: "MANUTENCAO" },
    { code: "8536.50.90", description: "Material elétrico diverso", category: "MANUTENCAO" },
    { code: "4820.10.10", description: "Cadernos escolares", category: "ESCRITORIO" },
    { code: "9608.10.00", description: "Canetas esferográficas", category: "ESCRITORIO" },
  ];

  for (const ncm of ncmCodes) {
    await prisma.ncmCode.upsert({ where: { code: ncm.code }, update: {}, create: ncm });
  }
  console.log("✅ Códigos NCM inseridos");

  // Super Admin (vendedor do sistema)
  const superAdminPassword = await bcrypt.hash("admin@2025", 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@escolaestoque.com" },
    update: {},
    create: {
      name: "Administrador do Sistema",
      email: "admin@escolaestoque.com",
      password: superAdminPassword,
      role: "SUPER_ADMIN",
    },
  });
  console.log("✅ Super Admin criado:", superAdmin.email);

  // Escola demo
  const school = await prisma.school.upsert({
    where: { cnpj: "12345678000190" },
    update: {},
    create: {
      name: "Escola Municipal João da Silva",
      cnpj: "12345678000190",
      address: "Rua das Flores",
      number: "123",
      district: "Centro",
      city: "Cidade Exemplo",
      state: "SP",
      zipCode: "01310100",
      phone: "(11) 3000-0000",
      email: "contato@escolajoao.edu.br",
      director: "Maria da Silva Santos",
    },
  });
  console.log("✅ Escola demo criada:", school.name);

  // Diretor da escola
  const directorPassword = await bcrypt.hash("diretor@2025", 12);
  await prisma.user.upsert({
    where: { email: "diretor@escolajoao.edu.br" },
    update: {},
    create: {
      name: "Maria da Silva Santos",
      email: "diretor@escolajoao.edu.br",
      password: directorPassword,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
    },
  });

  // Gestor
  const gestorPassword = await bcrypt.hash("gestor@2025", 12);
  await prisma.user.upsert({
    where: { email: "gestor@escolajoao.edu.br" },
    update: {},
    create: {
      name: "Carlos Alberto Souza",
      email: "gestor@escolajoao.edu.br",
      password: gestorPassword,
      role: "MANAGER",
      schoolId: school.id,
    },
  });

  // Nutricionista
  const nutriPassword = await bcrypt.hash("nutri@2025", 12);
  await prisma.user.upsert({
    where: { email: "nutri@escolajoao.edu.br" },
    update: {},
    create: {
      name: "Ana Paula Nutricionista",
      email: "nutri@escolajoao.edu.br",
      password: nutriPassword,
      role: "NUTRITIONIST",
      schoolId: school.id,
    },
  });
  console.log("✅ Usuários demo criados");

  // Programas
  const merenda = await prisma.program.upsert({
    where: { id: "prog-merenda-demo" },
    update: {},
    create: {
      id: "prog-merenda-demo",
      name: "Merenda Escolar 2025",
      type: "MERENDA",
      description: "Programa de alimentação escolar - PNAE",
      budget: 50000,
      schoolId: school.id,
    },
  });

  const manutencao = await prisma.program.upsert({
    where: { id: "prog-manut-demo" },
    update: {},
    create: {
      id: "prog-manut-demo",
      name: "Manutenção Escolar 2025",
      type: "MANUTENCAO",
      description: "Materiais de manutenção e limpeza",
      budget: 20000,
      schoolId: school.id,
    },
  });

  const pdde = await prisma.program.upsert({
    where: { id: "prog-pdde-demo" },
    update: {},
    create: {
      id: "prog-pdde-demo",
      name: "PDDE 2025",
      type: "PDDE",
      description: "Programa Dinheiro Direto na Escola",
      budget: 15000,
      schoolId: school.id,
    },
  });
  console.log("✅ Programas criados");

  // Fornecedor demo
  const supplier = await prisma.supplier.upsert({
    where: { id: "sup-demo-001" },
    update: {},
    create: {
      id: "sup-demo-001",
      name: "Distribuidora Alimentos Ltda",
      cnpj: "98765432000111",
      address: "Av. Comercial",
      number: "500",
      district: "Bairro Industrial",
      city: "Cidade Exemplo",
      state: "SP",
      zipCode: "01310200",
      phone: "(11) 4000-0000",
      email: "contato@distribalimentos.com.br",
      contact: "Pedro Comercial",
      schoolId: school.id,
    },
  });

  // Produtos demo
  const arroz = await prisma.product.upsert({
    where: { id: "prod-arroz-demo" },
    update: {},
    create: {
      id: "prod-arroz-demo",
      name: "Arroz Beneficiado Tipo 1",
      ncmCode: "1006.20.11",
      unit: "KG",
      minStock: 50,
      programId: merenda.id,
      schoolId: school.id,
    },
  });

  const feijao = await prisma.product.upsert({
    where: { id: "prod-feijao-demo" },
    update: {},
    create: {
      id: "prod-feijao-demo",
      name: "Feijão Carioca",
      ncmCode: "0105.12.00",
      unit: "KG",
      minStock: 30,
      programId: merenda.id,
      schoolId: school.id,
    },
  });

  const detergente = await prisma.product.upsert({
    where: { id: "prod-determ-demo" },
    update: {},
    create: {
      id: "prod-determ-demo",
      name: "Detergente Líquido 500ml",
      ncmCode: "3402.20.00",
      unit: "UN",
      minStock: 10,
      programId: manutencao.id,
      schoolId: school.id,
    },
  });
  console.log("✅ Produtos demo criados");

  // Entrada demo
  const entry = await prisma.stockEntry.create({
    data: {
      invoiceNumber: "000001",
      invoiceSeries: "001",
      invoiceDate: new Date("2025-01-15"),
      totalValue: 1250.00,
      supplierId: supplier.id,
      programId: merenda.id,
      userId: superAdmin.id,
      observations: "Primeira entrega do ano",
      items: {
        create: [
          { productId: arroz.id, quantity: 100, unitPrice: 7.50, totalPrice: 750.00 },
          { productId: feijao.id, quantity: 50, unitPrice: 10.00, totalPrice: 500.00 },
        ],
      },
    },
  });
  console.log("✅ Entrada demo criada");

  console.log("\n🎉 Seed concluído com sucesso!\n");
  console.log("═══════════════════════════════════════");
  console.log("📋 CREDENCIAIS DE ACESSO:");
  console.log("─────────────────────────────────────");
  console.log("🔑 Super Admin (Vendedor):");
  console.log("   E-mail: admin@escolaestoque.com");
  console.log("   Senha:  admin@2025");
  console.log("─────────────────────────────────────");
  console.log("🏫 Diretor da Escola:");
  console.log("   E-mail: diretor@escolajoao.edu.br");
  console.log("   Senha:  diretor@2025");
  console.log("─────────────────────────────────────");
  console.log("👨‍💼 Gestor:");
  console.log("   E-mail: gestor@escolajoao.edu.br");
  console.log("   Senha:  gestor@2025");
  console.log("─────────────────────────────────────");
  console.log("🥗 Nutricionista:");
  console.log("   E-mail: nutri@escolajoao.edu.br");
  console.log("   Senha:  nutri@2025");
  console.log("═══════════════════════════════════════\n");
}

main()
  .catch((e) => { console.error("❌ Erro no seed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
