import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import DashboardCards from "./_components/DashboardCards";
import DashboardCharts from "./_components/DashboardCharts";
import StockAlerts from "./_components/StockAlerts";

export default async function DashboardPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role;
  const schoolId = (session?.user as any)?.schoolId;

  // Filtrar por escola (exceto SUPER_ADMIN que vê tudo)
  const schoolFilter = userRole === "SUPER_ADMIN" ? {} : { schoolId: schoolId ?? "" };

  const [programs, entries, exits, products, suppliers, schools] = await Promise.all([
    db.program.findMany({ where: schoolFilter, include: { _count: { select: { products: true } } } }),
    db.stockEntry.findMany({
      where: userRole === "SUPER_ADMIN" ? {} : { program: { schoolId: schoolId ?? "" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { supplier: true, program: true, items: true },
    }),
    db.stockExit.findMany({
      where: userRole === "SUPER_ADMIN" ? {} : { program: { schoolId: schoolId ?? "" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { program: true, items: true },
    }),
    db.product.findMany({ where: schoolFilter, include: { entryItems: true, exitItems: true } }),
    db.supplier.count({ where: schoolFilter }),
    userRole === "SUPER_ADMIN" ? db.school.count() : Promise.resolve(1),
  ]);

  // Calcular saldos por produto
  const alerts = products.filter((p) => {
    const totalIn = p.entryItems.reduce((s, i) => s + i.quantity, 0);
    const totalOut = p.exitItems.reduce((s, i) => s + i.quantity, 0);
    const balance = totalIn - totalOut;
    return balance <= p.minStock;
  });

  // Total financeiro por programa
  const programFinancials = programs.map((prog) => {
    const entriesValue = entries
      .filter((e) => e.programId === prog.id)
      .reduce((s, e) => s + e.totalValue, 0);
    return { name: prog.name, type: prog.type, budget: prog.budget, spent: entriesValue };
  });

  const totalBudget = programs.reduce((s, p) => s + p.budget, 0);
  const totalSpent = entries.reduce((s, e) => s + e.totalValue, 0);
  const totalProducts = products.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Bem-vindo, {session?.user?.name}. Aqui está o resumo do sistema.
        </p>
      </div>

      <DashboardCards
        totalBudget={totalBudget}
        totalSpent={totalSpent}
        totalProducts={totalProducts}
        totalSuppliers={suppliers}
        totalSchools={schools as number}
        alertCount={alerts.length}
        isSuperAdmin={userRole === "SUPER_ADMIN"}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardCharts programFinancials={programFinancials} entries={entries} exits={exits} />
        </div>
        <div>
          <StockAlerts products={products as any} />
        </div>
      </div>
    </div>
  );
}
