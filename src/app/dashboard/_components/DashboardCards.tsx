"use client";

import { formatCurrency } from "@/lib/utils";
import { DollarSign, Package, Truck, School, AlertTriangle, TrendingUp } from "lucide-react";

interface Props {
  totalBudget: number;
  totalSpent: number;
  totalProducts: number;
  totalSuppliers: number;
  totalSchools: number;
  alertCount: number;
  isSuperAdmin: boolean;
}

export default function DashboardCards({
  totalBudget, totalSpent, totalProducts, totalSuppliers, totalSchools, alertCount, isSuperAdmin,
}: Props) {
  const balance = totalBudget - totalSpent;
  const spentPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const cards = [
    {
      title: "Orçamento Total",
      value: formatCurrency(totalBudget),
      sub: `${formatCurrency(totalSpent)} utilizado`,
      icon: DollarSign,
      color: "blue",
      pct: spentPct,
    },
    {
      title: "Saldo Disponível",
      value: formatCurrency(balance),
      sub: `${spentPct.toFixed(1)}% do orçamento usado`,
      icon: TrendingUp,
      color: balance >= 0 ? "green" : "red",
    },
    {
      title: "Produtos Cadastrados",
      value: totalProducts.toString(),
      sub: "itens no sistema",
      icon: Package,
      color: "purple",
    },
    {
      title: "Fornecedores",
      value: totalSuppliers.toString(),
      sub: "ativos",
      icon: Truck,
      color: "orange",
    },
    ...(isSuperAdmin
      ? [{ title: "Escolas Atendidas", value: totalSchools.toString(), sub: "clientes ativos", icon: School, color: "indigo" }]
      : []),
    {
      title: "Alertas de Estoque",
      value: alertCount.toString(),
      sub: alertCount > 0 ? "itens abaixo do mínimo" : "estoque normalizado",
      icon: AlertTriangle,
      color: alertCount > 0 ? "red" : "green",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div key={card.title} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">{card.title}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{card.value}</p>
              <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
            </div>
            <div className={`p-2.5 rounded-xl ${colorMap[card.color]}`}>
              <card.icon className="w-6 h-6" />
            </div>
          </div>
          {card.pct !== undefined && (
            <div className="mt-3">
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${card.pct > 90 ? "bg-red-500" : card.pct > 70 ? "bg-yellow-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(card.pct, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
