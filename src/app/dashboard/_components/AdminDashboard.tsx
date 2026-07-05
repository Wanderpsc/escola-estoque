import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Building2, KeyRound, Clock, XCircle, CheckCircle, Users } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboard({ adminName }: { adminName: string }) {
  const [schools, licenses, users] = await Promise.all([
    db.school.findMany({ include: { license: true }, orderBy: { name: "asc" } }),
    db.license.findMany({ include: { school: { select: { name: true } } }, orderBy: { expiresAt: "asc" } }),
    db.user.count({ where: { role: { not: "SUPER_ADMIN" } } }),
  ]);

  const now = new Date();
  const active = licenses.filter((l) => l.active && l.expiresAt > now).length;
  const expiring30 = licenses.filter((l) => {
    const days = Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000);
    return l.active && days >= 0 && days <= 30;
  }).length;
  const expired = licenses.filter((l) => l.active && l.expiresAt <= now).length;

  const cards = [
    { label: "Escolas Cadastradas", value: schools.length, icon: Building2, color: "blue" },
    { label: "Licenças Ativas", value: active, icon: CheckCircle, color: "green" },
    { label: "A Vencer (30d)", value: expiring30, icon: Clock, color: "orange" },
    { label: "Expiradas", value: expired, icon: XCircle, color: "red" },
    { label: "Sem Licença", value: schools.length - licenses.length, icon: KeyRound, color: "slate" },
    { label: "Usuários Totais", value: users, icon: Users, color: "purple" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-green-50 text-green-700 border-green-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    red: "bg-red-50 text-red-700 border-red-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Painel do Sistema</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Bem-vindo, {adminName}. Gerencie as escolas e licenças do EscolaEstoque.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 flex flex-col gap-2 ${colorMap[c.color]}`}>
            <c.icon className="w-5 h-5 opacity-70" />
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs font-medium leading-tight opacity-70">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Licenças próximas do vencimento */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Licenças Próximas do Vencimento
            </h3>
            <Link href="/dashboard/licenses" className="text-xs text-blue-600 hover:underline">Ver todas →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {licenses
              .filter((l) => {
                const days = Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000);
                return l.active && days >= 0 && days <= 60;
              })
              .slice(0, 6)
              .map((l) => {
                const days = Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000);
                return (
                  <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{l.school.name}</p>
                      <p className="text-xs text-slate-400">Vence: {formatDate(l.expiresAt)}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${days <= 15 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                      {days}d
                    </span>
                  </div>
                );
              })}
            {licenses.filter((l) => {
              const days = Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86400000);
              return l.active && days >= 0 && days <= 60;
            }).length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">Nenhuma licença vencendo nos próximos 60 dias</p>
            )}
          </div>
        </div>

        {/* Escolas sem licença */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              Escolas e Status de Licença
            </h3>
            <Link href="/dashboard/schools" className="text-xs text-blue-600 hover:underline">Gerenciar →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {schools.slice(0, 7).map((s) => {
              const lic = s.license;
              let statusLabel = "Sem licença";
              let statusClass = "bg-slate-100 text-slate-500";
              if (lic) {
                const days = Math.ceil((new Date(lic.expiresAt).getTime() - now.getTime()) / 86400000);
                if (!lic.active) { statusLabel = "Suspensa"; statusClass = "bg-red-100 text-red-600"; }
                else if (days < 0) { statusLabel = "Expirada"; statusClass = "bg-red-100 text-red-600"; }
                else if (days <= 30) { statusLabel = `${days}d`; statusClass = "bg-orange-100 text-orange-600"; }
                else { statusLabel = "Ativa"; statusClass = "bg-green-100 text-green-600"; }
              }
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.city}/{s.state}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusClass}`}>{statusLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
