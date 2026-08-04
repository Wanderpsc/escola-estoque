import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import DashboardCards from "./_components/DashboardCards";
import DashboardCharts from "./_components/DashboardCharts";
import StockAlerts from "./_components/StockAlerts";
import AdminDashboard from "./_components/AdminDashboard";

export default async function DashboardPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role;
  const schoolId = (session?.user as any)?.schoolId;

  // SUPER_ADMIN vê painel de gestão do sistema
  if (userRole === "SUPER_ADMIN") {
    return <AdminDashboard adminName={session?.user?.name ?? "Administrador"} />;
  }

  // Demais perfis veem painel de estoque da escola
  const schoolFilter = { schoolId: schoolId ?? "" };

  const [programs, entries, exits, products, suppliers] = await Promise.all([
    db.program.findMany({ where: { ...schoolFilter, active: true }, include: { _count: { select: { products: true } } } }),
    db.stockEntry.findMany({
      where: { program: schoolFilter },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { supplier: true, program: true, items: true },
    }),
    db.stockExit.findMany({
      where: { program: schoolFilter },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { program: true, items: true },
    }),
    db.product.findMany({ where: { ...schoolFilter, active: true }, include: { entryItems: true, exitItems: true } }),
    db.supplier.count({ where: { ...schoolFilter, active: true } }),
  ]);

  const alerts = products.filter((p) => {
    const balance = p.entryItems.reduce((s, i) => s + i.quantity, 0) - p.exitItems.reduce((s, i) => s + i.quantity, 0);
    return balance <= p.minStock;
  });

  const programFinancials = programs.map((prog) => {
    const spent = entries.filter((e) => e.programId === prog.id).reduce((s, e) => s + e.totalValue, 0);
    return { name: prog.name, type: prog.type, budget: prog.budget, spent };
  });

  const totalBudget = programs.reduce((s, p) => s + p.budget, 0);
  const totalSpent = entries.reduce((s, e) => s + e.totalValue, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Bem-vindo, {session?.user?.name}. Aqui está o resumo do estoque.
        </p>
      </div>

      <DashboardCards
        totalBudget={totalBudget}
        totalSpent={totalSpent}
        totalProducts={products.length}
        totalSuppliers={suppliers}
        totalSchools={1}
        alertCount={alerts.length}
        isSuperAdmin={false}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardCharts programFinancials={programFinancials} entries={entries} exits={exits} />
        </div>
        <div>
          <StockAlerts products={products as any} programs={programFinancials} />
        </div>
      </div>
    </div>
  );
}
