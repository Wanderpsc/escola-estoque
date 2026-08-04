"use client";

import { AlertTriangle, CheckCircle, DollarSign } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  unit: string;
  minStock: number;
  program: { name: string; type: string };
  entryItems: Array<{ quantity: number }>;
  exitItems: Array<{ quantity: number }>;
}

interface ProgramAlert {
  name: string;
  type: string;
  budget: number;
  spent: number;
}

interface Props {
  products: Array<Product & { program?: any }>;
  programs?: ProgramAlert[];
}

const PROGRAM_COLOR: Record<string, string> = {
  MERENDA: "text-green-600 bg-green-50",
  MANUTENCAO: "text-blue-600 bg-blue-50",
  PDDE: "text-purple-600 bg-purple-50",
};

export default function StockAlerts({ products, programs = [] }: Props) {
  const items = products.map((p) => {
    const totalIn = p.entryItems.reduce((s, i) => s + i.quantity, 0);
    const totalOut = p.exitItems.reduce((s, i) => s + i.quantity, 0);
    const balance = totalIn - totalOut;
    return { ...p, balance, isLow: balance <= p.minStock, isZero: balance <= 0 };
  }).sort((a, b) => a.balance - b.balance).slice(0, 10);

  const stockAlerts = items.filter((i) => i.isLow);

  // Programas com saldo negativo ou < 10% do orçamento restante
  const budgetAlerts = programs.filter((p) => {
    if (p.budget <= 0) return false;
    const remaining = p.budget - p.spent;
    return remaining < 0 || (remaining / p.budget) < 0.10;
  });

  const totalAlerts = stockAlerts.length + budgetAlerts.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-full">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <AlertTriangle className={cn("w-4 h-4", totalAlerts > 0 ? "text-red-500" : "text-green-500")} />
        <h3 className="text-sm font-semibold text-slate-700">Alertas</h3>
        {totalAlerts > 0 && (
          <span className="ml-auto bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
            {totalAlerts}
          </span>
        )}
      </div>
      <div className="overflow-y-auto max-h-96">
        {totalAlerts === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
            <p className="text-sm">Estoque e orçamentos OK!</p>
          </div>
        ) : (
          <>
            {/* Alertas de estoque */}
            {stockAlerts.length > 0 && (
              <>
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Estoque Insuficiente</p>
                </div>
                <ul className="divide-y divide-slate-50">
                  {stockAlerts.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", p.isZero ? "bg-red-500" : "bg-yellow-400")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          Saldo: <span className={cn("font-semibold", p.isZero ? "text-red-500" : "text-yellow-600")}>
                            {p.balance.toFixed(2)} {p.unit}
                          </span>
                          {" · "}Mín: {p.minStock} {p.unit}
                        </p>
                      </div>
                      {p.program && (
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", PROGRAM_COLOR[p.program.type] ?? "text-slate-600 bg-slate-100")}>
                          {p.program.type === "MERENDA" ? "Merenda" : p.program.type === "MANUTENCAO" ? "Manutenção" : "PDDE"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Alertas de orçamento */}
            {budgetAlerts.length > 0 && (
              <>
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Orçamento Crítico</p>
                </div>
                <ul className="divide-y divide-slate-50">
                  {budgetAlerts.map((p, i) => {
                    const remaining = p.budget - p.spent;
                    const isNegative = remaining < 0;
                    return (
                      <li key={i} className="flex items-center gap-3 px-5 py-3">
                        <DollarSign className={cn("w-4 h-4 shrink-0", isNegative ? "text-red-500" : "text-orange-400")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            Saldo: <span className={cn("font-semibold", isNegative ? "text-red-500" : "text-orange-600")}>
                              {formatCurrency(remaining)}
                            </span>
                            {" · "}{isNegative ? "NEGATIVO" : `${((remaining / p.budget) * 100).toFixed(0)}% restante`}
                          </p>
                        </div>
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", PROGRAM_COLOR[p.type] ?? "text-slate-600 bg-slate-100")}>
                          {p.type === "MERENDA" ? "Merenda" : p.type === "MANUTENCAO" ? "Manutenção" : "PDDE"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
