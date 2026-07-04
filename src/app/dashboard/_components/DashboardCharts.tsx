"use client";

import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const PROGRAM_COLORS: Record<string, string> = {
  MERENDA: "#22c55e",
  MANUTENCAO: "#3b82f6",
  PDDE: "#a855f7",
};

interface Props {
  programFinancials: Array<{ name: string; type: string; budget: number; spent: number }>;
  entries: Array<{ totalValue: number; createdAt: Date; program: { type: string } }>;
  exits: Array<{ items: Array<{ totalPrice: number }>; createdAt: Date }>;
}

export default function DashboardCharts({ programFinancials, entries, exits }: Props) {
  const barData = programFinancials.map((p) => ({
    name: p.name.length > 12 ? p.name.substring(0, 12) + "…" : p.name,
    Orçamento: p.budget,
    Gasto: p.spent,
    Saldo: Math.max(p.budget - p.spent, 0),
  }));

  const pieData = programFinancials
    .filter((p) => p.spent > 0)
    .map((p) => ({
      name: p.name,
      value: p.spent,
      color: PROGRAM_COLORS[p.type] ?? "#94a3b8",
    }));

  return (
    <div className="space-y-4">
      {/* Barra: Orçamento vs Gasto */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Orçamento × Gasto por Programa</h3>
        {barData.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Nenhum programa cadastrado ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend />
              <Bar dataKey="Orçamento" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gasto" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pizza: distribuição de gastos */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Distribuição de Gastos</h3>
        {pieData.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sem movimentações financeiras.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
