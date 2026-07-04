"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { PageHeader, Badge, Table, Th, Td } from "@/components/ui";
import { formatCurrency, PROGRAM_TYPES } from "@/lib/utils";

interface Balance {
  id: string; name: string; unit: string; ncmCode: string; minStock: number;
  balance: number; totalIn: number; totalOut: number; avgPrice: number; totalValue: number;
  status: "OK" | "LOW" | "ZERO";
  program: { name: string; type: string };
}

export default function StockBalancePage() {
  const [items, setItems] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OK" | "LOW" | "ZERO">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/stock/balance");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) =>
    (filter === "ALL" || i.status === filter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.ncmCode.includes(search))
  );

  const totalValue = filtered.reduce((s, i) => s + i.totalValue, 0);
  const counts = { OK: items.filter((i) => i.status === "OK").length, LOW: items.filter((i) => i.status === "LOW").length, ZERO: items.filter((i) => i.status === "ZERO").length };

  const statusBadge = (s: string) => s === "ZERO" ? <Badge color="red">Zerado ⚠</Badge> : s === "LOW" ? <Badge color="yellow">Baixo ⚠</Badge> : <Badge color="green">OK</Badge>;

  return (
    <div>
      <PageHeader title="Saldo de Estoque" description="Posição atual de todos os produtos">
        <div className="text-right">
          <p className="text-xs text-slate-500">Valor total em estoque</p>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(totalValue)}</p>
        </div>
      </PageHeader>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou NCM..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(["ALL", "OK", "LOW", "ZERO"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filter === f ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
              {f === "ALL" ? `Todos (${items.length})` : f === "OK" ? `OK (${counts.OK})` : f === "LOW" ? `Baixo (${counts.LOW})` : `Zerado (${counts.ZERO})`}
            </button>
          ))}
        </div>
      </div>

      {/* Alertas no topo */}
      {(counts.LOW + counts.ZERO > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-800">Atenção: produtos com estoque crítico</p>
            <p className="text-xs text-red-600">{counts.ZERO} zerados · {counts.LOW} abaixo do mínimo</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>NCM</Th>
                <Th>Programa</Th>
                <Th>Entradas</Th>
                <Th>Saídas</Th>
                <Th>Saldo</Th>
                <Th>Valor Médio</Th>
                <Th>Valor em Estoque</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.status === "ZERO" ? "bg-red-50" : p.status === "LOW" ? "bg-yellow-50" : ""}`}>
                  <Td><span className="font-medium">{p.name}</span></Td>
                  <Td className="font-mono text-xs text-slate-500">{p.ncmCode}</Td>
                  <Td>
                    <Badge color={p.program?.type === "MERENDA" ? "green" : p.program?.type === "MANUTENCAO" ? "blue" : "purple"}>
                      {PROGRAM_TYPES[p.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? p.program?.type}
                    </Badge>
                  </Td>
                  <Td className="text-green-700 font-medium">+{p.totalIn.toFixed(2)} {p.unit}</Td>
                  <Td className="text-red-600 font-medium">-{p.totalOut.toFixed(2)} {p.unit}</Td>
                  <Td className={`font-bold ${p.status === "ZERO" ? "text-red-600" : p.status === "LOW" ? "text-yellow-600" : "text-slate-800"}`}>
                    {p.balance.toFixed(2)} {p.unit}
                  </Td>
                  <Td className="text-slate-500">{formatCurrency(p.avgPrice)}/{p.unit}</Td>
                  <Td className="font-semibold">{formatCurrency(p.totalValue)}</Td>
                  <Td>{statusBadge(p.status)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {filtered.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">Nenhum produto encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}
