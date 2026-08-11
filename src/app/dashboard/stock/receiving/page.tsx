"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, CheckCircle2, Clock, AlertCircle,
  PackageCheck, Plus, X, History,
} from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES } from "@/lib/utils";

// ── Tipos ────────────────────────────────────────────────────────────────────
interface NfItem {
  id: string; productId: string; productName: string; unit: string;
  orderedQty: number; deliveredQty: number; pendingQty: number; unitPrice: number;
}
interface ReceiptRecord {
  id: string; deliveryDate: string; status: string; confirmedAt: string | null;
  items: { productId: string; productName: string; unit: string; quantityOrdered: number; quantityDelivered: number }[];
}
interface NfEntry {
  id: string; invoiceNumber: string; invoiceDate: string; totalValue: number;
  supplierName: string; programName: string; programType: string;
  registeredBy: string; status: string;
  items: NfItem[];
  receiptStatus: "NO_TRACKING" | "PENDING" | "PARTIAL" | "COMPLETE";
  hasPendingSupplierDelivery: boolean;
  totalOrderedQty: number; totalDeliveredQty: number; totalPendingQty: number;
  totalOrderedValue: number; totalDeliveredValue: number; totalPendingValue: number;
  receiptHistory: ReceiptRecord[];
}

// ── Badge de status ───────────────────────────────────────────────────────────
function ReceiptBadge({ status }: { status: NfEntry["receiptStatus"] }) {
  if (status === "COMPLETE")    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" />Recebida</span>;
  if (status === "PARTIAL")     return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3" />Parcial</span>;
  if (status === "PENDING")     return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"><Clock className="w-3 h-3" />Pendente</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">Sem Rastreio</span>;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReceivingPage() {
  const [entries, setEntries] = useState<NfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [historyId, setHistoryId] = useState<string | null>(null);

  // Recebimento inline
  const [activeNF, setActiveNF] = useState<NfEntry | null>(null);
  const [nfSearch, setNfSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Filtro de histórico
  const [filterStatus, setFilterStatus] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/stock/receiving");
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectNF(entry: NfEntry) {
    setActiveNF(entry);
    setNfSearch(`NF ${entry.invoiceNumber || "(sem nº)"} — ${entry.supplierName}`);
    setShowResults(false);
    setReceiveDate(new Date().toISOString().split("T")[0]);
    setReceiveNotes("");
    const initial: Record<string, string> = {};
    entry.items.forEach((item) => {
      initial[item.productId] = item.pendingQty > 0 ? String(item.pendingQty) : "";
    });
    setReceiveQtys(initial);
  }

  async function handleSaveReceipt() {
    if (!activeNF) return;
    const items = activeNF.items
      .map((item) => ({ productId: item.productId, quantityReceived: Number(receiveQtys[item.productId] ?? 0) }))
      .filter((i) => i.quantityReceived > 0);
    if (items.length === 0) { toast.error("Informe pelo menos uma quantidade recebida"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: activeNF.id, deliveryDate: receiveDate, notes: receiveNotes, items }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar recebimento"); return; }
      toast.success("Recebimento registrado com sucesso!");
      setActiveNF(null);
      setNfSearch("");
      load();
    } finally { setSaving(false); }
  }

  const nfResults = nfSearch.length >= 2
    ? entries.filter((e) => {
        const s = nfSearch.toLowerCase();
        return e.invoiceNumber.toLowerCase().includes(s) ||
               e.supplierName.toLowerCase().includes(s) ||
               e.programName.toLowerCase().includes(s);
      }).slice(0, 10)
    : [];

  const trackedNFs = entries.filter((e) => e.receiptStatus !== "NO_TRACKING");
  const filteredTracked = trackedNFs.filter((e) => !filterStatus || e.receiptStatus === filterStatus);
  const histEntry = historyId ? entries.find((e) => e.id === historyId) : null;

  return (
    <div>
      <PageHeader
        title="Recebimento de Mercadorias"
        description="Selecione uma NF para registrar o recebimento dos produtos entregues."
      />

      {/* ── Painel Principal: Selecionar NF e Registrar ────────────── */}
      <div className="bg-white border-2 border-blue-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-blue-50 bg-blue-50">
          <p className="text-sm font-semibold text-blue-800">Registrar Recebimento de Mercadorias</p>
          <p className="text-xs text-blue-600 mt-0.5">Busque pela NF, fornecedor ou parcela para dar baixa nos itens recebidos</p>
        </div>
        <div className="p-5">
          <div className="relative">
            <input
              type="text"
              value={nfSearch}
              onChange={(e) => { setNfSearch(e.target.value); setShowResults(true); if (activeNF) setActiveNF(null); }}
              onFocus={() => setShowResults(true)}
              placeholder="Buscar NF por número, fornecedor ou parcela..."
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
            />
            {nfSearch && (
              <button onClick={() => { setNfSearch(""); setActiveNF(null); setShowResults(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            )}
            {showResults && !activeNF && nfSearch.length >= 2 && (
              <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 overflow-hidden">
                {nfResults.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {nfResults.map((e) => (
                      <button key={e.id} onClick={() => selectNF(e)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <ReceiptBadge status={e.receiptStatus} />
                            <span className="font-semibold text-slate-800">NF {e.invoiceNumber || "(sem número)"}</span>
                            <span className="text-slate-500 text-sm">{e.supplierName}</span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{e.programName}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-slate-700">{formatCurrency(e.totalValue)}</p>
                            <p className="text-xs text-slate-400">{formatDate(e.invoiceDate)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-400">Nenhuma NF encontrada para &quot;{nfSearch}&quot;</div>
                )}
              </div>
            )}
          </div>

          {!activeNF && !nfSearch && !loading && (
            <p className="text-center text-xs text-slate-400 mt-4">
              {entries.length} nota(s) fiscal(is) disponível(is) — comece digitando para buscar
            </p>
          )}
          {loading && !activeNF && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {activeNF && (
            <div className="mt-4 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 flex flex-wrap gap-x-5 gap-y-1 items-center">
                <span><strong>Fornecedor:</strong> {activeNF.supplierName}</span>
                <span><strong>Programa:</strong> {activeNF.programName}</span>
                <span><strong>NF:</strong> {activeNF.invoiceNumber || "—"}</span>
                <span><strong>Data:</strong> {formatDate(activeNF.invoiceDate)}</span>
                <span><strong>Valor:</strong> {formatCurrency(activeNF.totalValue)}</span>
                <span className="ml-auto"><ReceiptBadge status={activeNF.receiptStatus} /></span>
              </div>

              {activeNF.hasPendingSupplierDelivery && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span><strong>Atenção:</strong> esta NF tem entrega pendente registrada pelo fornecedor na aba <em>Entregas</em>. Confirme lá ou aqui — não faça os dois para os mesmos produtos.</span>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase border-b">
                  <span>Produto</span>
                  <span className="text-right">Na NF</span>
                  <span className="text-right text-green-700">Já Recebido</span>
                  <span className="text-right text-blue-700">Receber Agora</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {activeNF.items.map((item) => (
                    <div key={item.productId} className="grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-2.5 items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{item.productName}</p>
                        <p className="text-xs text-slate-400">{item.unit}</p>
                      </div>
                      <div className="text-right text-sm text-slate-600">{item.orderedQty.toFixed(2)}</div>
                      <div className={`text-right text-sm font-semibold ${item.deliveredQty > 0 ? "text-green-700" : "text-slate-400"}`}>
                        {item.deliveredQty.toFixed(2)}
                      </div>
                      <div className="flex justify-end">
                        <input type="number" min={0} step={0.01}
                          value={receiveQtys[item.productId] ?? ""}
                          onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                          placeholder="0"
                          className="w-24 border border-blue-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Informe apenas o que chegou <strong>nesta entrega</strong>. Registros anteriores já estão em &quot;Já Recebido&quot;.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Data do Recebimento *" type="date" value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)} />
                <Input label="Observações" value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Variações, trocas, divergências..." />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <Button variant="secondary" onClick={() => { setActiveNF(null); setNfSearch(""); }}>Cancelar</Button>
                <Button onClick={handleSaveReceipt} loading={saving}>
                  <PackageCheck className="w-4 h-4" />Confirmar Recebimento
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Histórico: NFs com rastreio ─────────────────────────────── */}
      {trackedNFs.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Histórico de Recebimentos ({trackedNFs.length} NF{trackedNFs.length !== 1 ? "s" : ""} com rastreio)
            </p>
            <div className="flex gap-1 ml-auto">
              {[{ label: "Todos", v: "" }, { label: "Pendente", v: "PENDING" }, { label: "Parcial", v: "PARTIAL" }, { label: "Completa", v: "COMPLETE" }].map((f) => (
                <button key={f.v} onClick={() => setFilterStatus(filterStatus === f.v ? "" : f.v)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${filterStatus === f.v ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {filteredTracked.map((entry) => {
              const isExpanded = expandedIds.has(entry.id);
              return (
                <div key={entry.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <button onClick={() => toggleExpand(entry.id)} className="flex items-center gap-2 min-w-0 text-left flex-1">
                      {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ReceiptBadge status={entry.receiptStatus} />
                          <Badge color={entry.programType === "MERENDA" ? "green" : entry.programType === "MANUTENCAO" ? "blue" : "purple"}>
                            {PROGRAM_TYPES[entry.programType as keyof typeof PROGRAM_TYPES]?.label ?? entry.programType}
                          </Badge>
                          <span className="font-semibold text-slate-800">NF {entry.invoiceNumber}</span>
                          <span className="text-sm text-slate-500">{entry.supplierName}</span>
                          <span className="text-xs text-slate-400">{formatDate(entry.invoiceDate)}</span>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-slate-500">
                          <span>NF: <strong className="text-slate-700">{formatCurrency(entry.totalOrderedValue)}</strong></span>
                          <span>Recebido: <strong className="text-green-700">{formatCurrency(entry.totalDeliveredValue)}</strong></span>
                          <span>Pendente: <strong className={entry.totalPendingValue > 0 ? "text-red-600" : "text-slate-400"}>{formatCurrency(entry.totalPendingValue)}</strong></span>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.receiptHistory.length > 0 && (
                        <button onClick={() => setHistoryId(entry.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Ver histórico">
                          <History className="w-4 h-4" />
                        </button>
                      )}
                      {entry.receiptStatus !== "COMPLETE" && (
                        <Button onClick={() => selectNF(entry)}>
                          <PackageCheck className="w-4 h-4" />Registrar Mais
                        </Button>
                      )}
                    </div>
                  </div>
                  {entry.hasPendingSupplierDelivery && entry.receiptStatus !== "COMPLETE" && (
                    <div className="mx-4 mb-2 mt-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      <span><strong>Atenção:</strong> esta NF tem entrega pendente registrada pelo fornecedor na aba <em>Entregas</em>.</span>
                    </div>
                  )}
                  {isExpanded && (
                    <div className="border-t border-slate-100 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Produto</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Na NF</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-green-700">Recebido</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-red-600">A Receber</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Vl. Unit.</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.items.map((item) => (
                            <tr key={item.id} className="border-t border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-slate-700">{item.productName}</td>
                              <td className="px-4 py-2 text-right text-slate-600">{item.orderedQty.toFixed(2)} {item.unit}</td>
                              <td className="px-4 py-2 text-right font-semibold text-green-700">{item.deliveredQty.toFixed(2)} {item.unit}</td>
                              <td className={`px-4 py-2 text-right font-semibold ${item.pendingQty > 0 ? "text-red-600" : "text-slate-400"}`}>{item.pendingQty.toFixed(2)} {item.unit}</td>
                              <td className="px-4 py-2 text-right text-slate-500">{formatCurrency(item.unitPrice)}</td>
                              <td className="px-4 py-2 text-center">
                                {item.pendingQty <= 0 ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                                  : item.deliveredQty > 0 ? <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                                  : <Clock className="w-4 h-4 text-red-400 mx-auto" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 border-t-2 border-slate-200">
                            <td className="px-4 py-2 font-semibold text-slate-700">Total</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-700">{formatCurrency(entry.totalOrderedValue)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-green-700">{formatCurrency(entry.totalDeliveredValue)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-red-600">{formatCurrency(entry.totalPendingValue)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Histórico de recebimentos */}
      <Modal
        open={!!historyId}
        onClose={() => setHistoryId(null)}
        title={`Histórico de Recebimentos — NF ${histEntry?.invoiceNumber ?? ""}`}
        size="lg"
      >
        {histEntry && (
          <div className="space-y-4">
            {histEntry.receiptHistory.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhum recebimento registrado.</p>
            ) : (
              <div className="space-y-4">
                {histEntry.receiptHistory.map((rec, idx) => (
                  <div key={rec.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-200">
                      <span className="text-xs font-semibold text-slate-700">
                        Entrega #{idx + 1} — {formatDate(rec.deliveryDate)}
                      </span>
                      <ReceiptBadge status={rec.status === "CONFIRMED" ? "COMPLETE" : rec.status === "PARTIAL" ? "PARTIAL" : "PENDING"} />
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/60">
                          <th className="px-4 py-2 text-left text-slate-500">Produto</th>
                          <th className="px-4 py-2 text-right text-slate-500">Pedido</th>
                          <th className="px-4 py-2 text-right text-green-700">Recebido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rec.items.map((item) => (
                          <tr key={item.productId} className="border-t border-slate-100">
                            <td className="px-4 py-2 text-slate-700">{item.productName}</td>
                            <td className="px-4 py-2 text-right text-slate-500">{item.quantityOrdered.toFixed(2)} {item.unit}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${item.quantityDelivered > 0 ? "text-green-700" : "text-slate-400"}`}>
                              {item.quantityDelivered.toFixed(2)} {item.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setHistoryId(null)}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
