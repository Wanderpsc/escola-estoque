const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const dbUrl = "file:" + path.resolve(__dirname, "..", "dev.db").replace(/\\/g, "/");
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Iniciando seed...");

  // Super Admin
  const pw = await bcrypt.hash("admin@2025", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@escolaestoque.com" },
    update: {},
    create: { name: "Administrador do Sistema", email: "admin@escolaestoque.com", password: pw, role: "SUPER_ADMIN" },
  });

  // Escola demo
  const school = await prisma.school.upsert({
    where: { cnpj: "12345678000190" },
    update: {},
    create: { name: "Escola Municipal João da Silva", cnpj: "12345678000190", address: "Rua das Flores", number: "123", district: "Centro", city: "Cidade Exemplo", state: "SP", zipCode: "01310100", phone: "(11) 3000-0000", email: "contato@escola.edu.br", director: "Maria da Silva Santos" },
  });

  // Diretor
  const pw2 = await bcrypt.hash("diretor@2025", 12);
  await prisma.user.upsert({
    where: { email: "diretor@escola.edu.br" },
    update: {},
    create: { name: "Maria da Silva Santos", email: "diretor@escola.edu.br", password: pw2, role: "SCHOOL_ADMIN", schoolId: school.id },
  });

  // Gestor
  const pw3 = await bcrypt.hash("gestor@2025", 12);
  await prisma.user.upsert({
    where: { email: "gestor@escola.edu.br" },
    update: {},
    create: { name: "Carlos Alberto Souza", email: "gestor@escola.edu.br", password: pw3, role: "MANAGER", schoolId: school.id },
  });

  // Nutricionista
  const pw4 = await bcrypt.hash("nutri@2025", 12);
  await prisma.user.upsert({
    where: { email: "nutri@escola.edu.br" },
    update: {},
    create: { name: "Ana Paula Nutricionista", email: "nutri@escola.edu.br", password: pw4, role: "NUTRITIONIST", schoolId: school.id },
  });

  // Programas
  const merenda = await prisma.program.upsert({
    where: { id: "prog-merenda-demo" },
    update: {},
    create: { id: "prog-merenda-demo", name: "Merenda Escolar 2025", type: "MERENDA", budget: 50000, schoolId: school.id },
  });
  const manut = await prisma.program.upsert({
    where: { id: "prog-manut-demo" },
    update: {},
    create: { id: "prog-manut-demo", name: "Manutenção 2025", type: "MANUTENCAO", budget: 20000, schoolId: school.id },
  });
  await prisma.program.upsert({
    where: { id: "prog-pdde-demo" },
    update: {},
    create: { id: "prog-pdde-demo", name: "PDDE 2025", type: "PDDE", budget: 15000, schoolId: school.id },
  });

  // Fornecedor
  const sup = await prisma.supplier.upsert({
    where: { id: "sup-demo-001" },
    update: {},
    create: { id: "sup-demo-001", name: "Distribuidora Alimentos Ltda", cnpj: "98765432000111", address: "Av. Comercial", number: "500", district: "Bairro Industrial", city: "Cidade Exemplo", state: "SP", zipCode: "01310200", phone: "(11) 4000-0000", schoolId: school.id },
  });

  // Produtos
  const arroz = await prisma.product.upsert({
    where: { id: "prod-arroz-demo" },
    update: {},
    create: { id: "prod-arroz-demo", name: "Arroz Beneficiado Tipo 1", ncmCode: "1006.20.11", unit: "KG", minStock: 50, programId: merenda.id, schoolId: school.id },
  });
  const feijao = await prisma.product.upsert({
    where: { id: "prod-feijao-demo" },
    update: {},
    create: { id: "prod-feijao-demo", name: "Feijão Carioca", ncmCode: "0105.12.00", unit: "KG", minStock: 30, programId: merenda.id, schoolId: school.id },
  });
  await prisma.product.upsert({
    where: { id: "prod-det-demo" },
    update: {},
    create: { id: "prod-det-demo", name: "Detergente Líquido 500ml", ncmCode: "3402.20.00", unit: "UN", minStock: 10, programId: manut.id, schoolId: school.id },
  });

  // Entrada demo
  await prisma.stockEntry.create({
    data: {
      invoiceNumber: "000001",
      invoiceSeries: "001",
      invoiceDate: new Date("2025-01-15"),
      totalValue: 1250,
      supplierId: sup.id,
      programId: merenda.id,
      userId: admin.id,
      observations: "Primeira entrega do ano",
      items: {
        create: [
          { productId: arroz.id, quantity: 100, unitPrice: 7.5, totalPrice: 750 },
          { productId: feijao.id, quantity: 50, unitPrice: 10, totalPrice: 500 },
        ],
      },
    },
  });

  console.log("SEED CONCLUIDO COM SUCESSO!");
  console.log("Super Admin:  admin@escolaestoque.com / admin@2025");
  console.log("Diretor:      diretor@escola.edu.br   / diretor@2025");
  console.log("Gestor:       gestor@escola.edu.br    / gestor@2025");
  console.log("Nutricionista: nutri@escola.edu.br     / nutri@2025");
}

main()
  .catch((e) => { console.error("Erro:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
