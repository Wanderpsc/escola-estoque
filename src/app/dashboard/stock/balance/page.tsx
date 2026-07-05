"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, SlidersHorizontal, X, Plus, Trash2, RefreshCw } from "lucide-react";
import { PageHeader, Badge, Table, Th, Td } from "@/components/ui";
import { formatCurrency, PROGRAM_TYPES } from "@/lib/utils";
import { usePolling } from "@/lib/usePolling";
import { toast } from "sonner";

interface Balance {
  id: string; name: string; unit: string; ncmCode: string; minStock: number;
  balance: number; totalIn: number; totalOut: number; totalAdjusted: number;
  avgPrice: number; totalValue: number;
  status: "OK" | "LOW" | "ZERO";
  program: { name: string; type: string };
}

interface Adjustment {
  id: string;
  quantity: number;
  unitPrice: number;
  description: string | null;
  date: string;
  user: { name: string };
}

function AdjustmentModal({
  product,
  onClose,
  onSaved,
}: {
  product: Balance;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    quantity: "",
    unitPrice: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/stock/adjustments?productId=${product.id}`);
    if (res.ok) setAdjustments(await res.json());
    setLoading(false);
  }, [product.id]);

  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  async function handleAdd() {
    if (!form.quantity || isNaN(Number(form.quantity))) {
      toast.error("Informe uma quantidade valida (pode ser negativa).");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/stock/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        quantity: Number(form.quantity),
        unitPrice: form.unitPrice ? Number(form.unitPrice) : 0,
        description: form.description || null,
        date: form.date,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Ajuste registrado com sucesso.");
      setForm({ quantity: "", unitPrice: "", description: "", date: new Date().toISOString().slice(0, 10) });
      loadAdjustments();
      onSaved();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Erro ao salvar ajuste.");
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/stock/adjustments/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Ajuste removido.");
      loadAdjustments();
      onSaved();
    } else {
      toast.error("Erro ao remover ajuste.");
    }
  }

  const totalAdj = adjustments.reduce((s, a) => s + a.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-800">Saldo Anterior &mdash; {product.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registre quantidades de repasses anteriores ao inicio do sistema.
              Use valor negativo para debitos ou devolucoes.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors ml-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500">Saldo do sistema</p>
              <p className="font-bold text-slate-800">{(product.totalIn - product.totalOut).toFixed(2)} {product.unit}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600">Total ajustes</p>
              <p className={`font-bold ${totalAdj >= 0 ? "text-blue-700" : "text-red-600"}`}>
                {totalAdj >= 0 ? "+" : ""}{totalAdj.toFixed(2)} {product.unit}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-green-600">Saldo total</p>
              <p className="font-bold text-green-700">{product.balance.toFixed(2)} {product.unit}</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Adicionar ajuste</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Quantidade *</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="Ex: 50 ou -10"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Valor unitario (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={form.unitPrice}
                  onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Data referencia</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Descricao / motivo</label>
                <input
                  type="text"
                  placeholder="Ex: Estoque anterior ao sistema"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {saving ? "Salvando..." : "Adicionar ajuste"}
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Ajustes registrados</p>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : adjustments.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-4">Nenhum ajuste registrado</p>
            ) : (
              <div className="space-y-2">
                {adjustments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${a.quantity >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {a.quantity >= 0 ? "+" : ""}{a.quantity.toFixed(2)} {product.unit}
                        </span>
                        {a.unitPrice > 0 && (
                          <span className="text-xs text-slate-500">&middot; {formatCurrency(a.unitPrice)}/{product.unit}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{new Date(a.date).toLocaleDateString("pt-BR")}</span>
                        {a.description && <span className="text-xs text-slate-500 truncate">&middot; {a.description}</span>}
                        <span className="text-xs text-slate-400">&middot; {a.user.name}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors ml-2 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StockBalancePage() {
  const [items, setItems] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OK" | "LOW" | "ZERO">("ALL");
  const [selectedProduct, setSelectedProduct] = useState<Balance | null>(null);

  const load = useCallback(async () => {
    const isFirst = !lastUpdated;
    if (isFirst) setLoading(true); else setRefreshing(true);
    const res = await fetch("/api/stock/balance");
    if (res.ok) { setItems(await res.json()); setLastUpdated(new Date()); }
    if (isFirst) setLoading(false); else setRefreshing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh inicial + a cada 30 segundos
  usePolling(load, 30_000);

  const filtered = items.filter((i) =>
    (filter === "ALL" || i.status === filter) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.ncmCode.includes(search))
  );

  const totalValue = filtered.reduce((s, i) => s + i.totalValue, 0);
  const counts = {
    OK: items.filter((i) => i.status === "OK").length,
    LOW: items.filter((i) => i.status === "LOW").length,
    ZERO: items.filter((i) => i.status === "ZERO").length,
  };

  const statusBadge = (s: string) =>
    s === "ZERO" ? <Badge color="red">Zerado</Badge> :
    s === "LOW" ? <Badge color="yellow">Baixo</Badge> :
    <Badge color="green">OK</Badge>;

  return (
    <div>
      <PageHeader title="Saldo de Estoque" description="Posicao atual de todos os produtos">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${refreshing ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
            {lastUpdated ? <span>Atualizado {lastUpdated.toLocaleTimeString("pt-BR")}</span> : <span>Carregando...</span>}
            <button onClick={load} disabled={refreshing} title="Atualizar agora" className="ml-1 p-1 rounded hover:bg-slate-100 disabled:opacity-40">
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Valor total em estoque</p>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto ou NCM..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {(["ALL", "OK", "LOW", "ZERO"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filter === f ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
              {f === "ALL" ? `Todos (${items.length})` : f === "OK" ? `OK (${counts.OK})` : f === "LOW" ? `Baixo (${counts.LOW})` : `Zerado (${counts.ZERO})`}
            </button>
          ))}
        </div>
      </div>

      {(counts.LOW + counts.ZERO > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <span className="text-red-500 font-bold text-lg">!</span>
          <div>
            <p className="text-sm font-semibold text-red-800">Atencao: produtos com estoque critico</p>
            <p className="text-xs text-red-600">{counts.ZERO} zerados &middot; {counts.LOW} abaixo do minimo</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-start gap-3">
        <SlidersHorizontal className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Ano letivo em andamento?</p>
          <p className="text-xs text-blue-600">
            Clique no botao <strong>Aj.</strong> de qualquer produto para registrar saldo de repasses
            anteriores ao inicio do uso do sistema. Valores negativos representam debitos ou devolucoes.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>NCM</Th>
                <Th>Programa</Th>
                <Th>Entradas</Th>
                <Th>Saidas</Th>
                <Th>Ant.</Th>
                <Th>Saldo</Th>
                <Th>Valor Medio</Th>
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
                  <Td>
                    <button
                      onClick={() => setSelectedProduct(p)}
                      title="Gerenciar saldo anterior"
                      className={`flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 border transition-colors
                        ${p.totalAdjusted !== 0
                          ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          : "border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50"}`}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>
                        {p.totalAdjusted !== 0
                          ? `${p.totalAdjusted > 0 ? "+" : ""}${p.totalAdjusted.toFixed(2)}`
                          : "Aj."}
                      </span>
                    </button>
                  </Td>
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

      {selectedProduct && (
        <AdjustmentModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
