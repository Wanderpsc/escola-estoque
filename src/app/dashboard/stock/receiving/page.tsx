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

  // Modal de registro de recebimento
  const [receiveEntry, setReceiveEntry] = useState<NfEntry | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Filtro
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

  function openReceive(entry: NfEntry) {
    setReceiveEntry(entry);
    setReceiveDate(new Date().toISOString().split("T")[0]);
    setReceiveNotes("");
    // Pre-preenche com a quantidade pendente de cada item
    const initial: Record<string, string> = {};
    entry.items.forEach((item) => {
      initial[item.productId] = item.pendingQty > 0 ? String(item.pendingQty) : "";
    });
    setReceiveQtys(initial);
  }

  async function handleSaveReceipt() {
    if (!receiveEntry) return;
    const items = receiveEntry.items
      .map((item) => ({ productId: item.productId, quantityReceived: Number(receiveQtys[item.productId] ?? 0) }))
      .filter((i) => i.quantityReceived > 0);

    if (items.length === 0) { toast.error("Informe pelo menos uma quantidade recebida"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/stock/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: receiveEntry.id, deliveryDate: receiveDate, notes: receiveNotes, items }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar recebimento"); return; }
      toast.success("Recebimento registrado com sucesso!");
      setReceiveEntry(null);
      load();
    } finally { setSaving(false); }
  }

  const filtered = entries.filter((e) => !filterStatus || e.receiptStatus === filterStatus);

  const summaryPending  = entries.filter((e) => e.receiptStatus === "PENDING").length;
  const summaryPartial  = entries.filter((e) => e.receiptStatus === "PARTIAL").length;
  const summaryComplete = entries.filter((e) => e.receiptStatus === "COMPLETE").length;
  const summaryNoTrack  = entries.filter((e) => e.receiptStatus === "NO_TRACKING").length;

  const histEntry = historyId ? entries.find((e) => e.id === historyId) : null;

  return (
    <div>
      <PageHeader
        title="Recebimento de Mercadorias"
        description="Acompanhe o recebimento dos produtos de cada Nota Fiscal. Registre entregas parciais e veja o que ainda está pendente."
      />

      {/* Resumo de status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Pendente",      count: summaryPending,  color: "bg-red-50 border-red-200 text-red-700",     filter: "PENDING" },
          { label: "Parcial",       count: summaryPartial,  color: "bg-amber-50 border-amber-200 text-amber-700", filter: "PARTIAL" },
          { label: "Completa",      count: summaryComplete, color: "bg-green-50 border-green-200 text-green-700", filter: "COMPLETE" },
          { label: "Sem rastreio",  count: summaryNoTrack,  color: "bg-slate-50 border-slate-200 text-slate-500", filter: "NO_TRACKING" },
        ].map((s) => (
          <button
            key={s.filter}
            onClick={() => setFilterStatus(filterStatus === s.filter ? "" : s.filter)}
            className={`text-left border-2 rounded-xl px-4 py-3 transition-all ${s.color} ${filterStatus === s.filter ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
          >
            <p className="text-2xl font-bold">{s.count}</p>
            <p className="text-xs font-semibold mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Legenda */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-5 text-xs text-blue-700 flex flex-wrap gap-x-6 gap-y-1">
        <span><strong>Na NF</strong> = quantidade comprada na nota fiscal</span>
        <span><strong>Recebido</strong> = mercadoria que chegou fisicamente à escola</span>
        <span><strong>A Receber</strong> = diferença ainda pendente de entrega pelo fornecedor</span>
        <span className="text-blue-500">Registrar recebimentos não duplica o estoque — apenas confirma a entrega física.</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma NF encontrada" description="Registre notas fiscais em Entradas (NF) para acompanhar os recebimentos." />
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Cabeçalho da NF */}
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className="flex items-center gap-2 min-w-0 text-left flex-1"
                  >
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
                      {/* Resumo financeiro */}
                      <div className="flex gap-4 mt-1 text-xs text-slate-500">
                        <span>NF: <strong className="text-slate-700">{formatCurrency(entry.totalOrderedValue)}</strong></span>
                        {entry.receiptStatus !== "NO_TRACKING" && (
                          <>
                            <span>Recebido: <strong className="text-green-700">{formatCurrency(entry.totalDeliveredValue)}</strong></span>
                            <span>Pendente: <strong className={entry.totalPendingValue > 0 ? "text-red-600" : "text-slate-400"}>{formatCurrency(entry.totalPendingValue)}</strong></span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.receiptHistory.length > 0 && (
                      <button
                        onClick={() => setHistoryId(entry.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Ver histórico de recebimentos"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    )}
                    {entry.receiptStatus !== "COMPLETE" && (
                      <Button onClick={() => openReceive(entry)}>
                        <PackageCheck className="w-4 h-4" />
                        {entry.receiptStatus === "NO_TRACKING" || entry.receiptStatus === "PENDING"
                          ? "Registrar Recebimento"
                          : "Recebimento Parcial"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Detalhes expandidos: tabela de itens */}
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
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Vl. Pendente</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.items.map((item) => (
                          <tr key={item.id} className="border-t border-slate-50 hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-700">{item.productName}</td>
                            <td className="px-4 py-2 text-right text-slate-600">{item.orderedQty.toFixed(2)} {item.unit}</td>
                            <td className="px-4 py-2 text-right font-semibold text-green-700">{item.deliveredQty.toFixed(2)} {item.unit}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${item.pendingQty > 0 ? "text-red-600" : "text-slate-400"}`}>
                              {item.pendingQty.toFixed(2)} {item.unit}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-500">{formatCurrency(item.unitPrice)}</td>
                            <td className="px-4 py-2 text-right text-slate-500">{formatCurrency(item.pendingQty * item.unitPrice)}</td>
                            <td className="px-4 py-2 text-center">
                              {item.pendingQty <= 0
                                ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                                : item.deliveredQty > 0
                                ? <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                                : <Clock className="w-4 h-4 text-red-400 mx-auto" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {entry.receiptStatus !== "NO_TRACKING" && (
                        <tfoot>
                          <tr className="bg-slate-50 border-t-2 border-slate-200">
                            <td className="px-4 py-2 font-semibold text-slate-700">Total</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-700">{formatCurrency(entry.totalOrderedValue)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-green-700">{formatCurrency(entry.totalDeliveredValue)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-red-600">{formatCurrency(entry.totalPendingValue)}</td>
                            <td colSpan={3} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Registrar Recebimento */}
      <Modal
        open={!!receiveEntry}
        onClose={() => setReceiveEntry(null)}
        title={`Registrar Recebimento — NF ${receiveEntry?.invoiceNumber ?? ""}`}
        size="lg"
      >
        {receiveEntry && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700">
              <strong>Fornecedor:</strong> {receiveEntry.supplierName} &nbsp;|&nbsp;
              <strong>Programa:</strong> {receiveEntry.programName} &nbsp;|&nbsp;
              <strong>NF:</strong> {receiveEntry.invoiceNumber}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Data do Recebimento *"
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
              />
              <Input
                label="Observações"
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Variações, trocas, observações..."
              />
            </div>

            {/* Itens para registrar recebimento */}
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Quantidades Recebidas Hoje
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-0 bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 uppercase">
                  <span>Produto</span>
                  <span className="text-right">Na NF</span>
                  <span className="text-right text-green-700">Já Recebido</span>
                  <span className="text-right text-blue-700">Receber Agora</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {receiveEntry.items.map((item) => (
                    <div key={item.productId} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-0 px-4 py-2.5 items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{item.productName}</p>
                        <p className="text-xs text-slate-400">{item.unit}</p>
                      </div>
                      <div className="text-right text-sm text-slate-600">{item.orderedQty.toFixed(2)}</div>
                      <div className={`text-right text-sm font-semibold ${item.deliveredQty > 0 ? "text-green-700" : "text-slate-400"}`}>
                        {item.deliveredQty.toFixed(2)}
                      </div>
                      <div className="flex justify-end">
                        <input
                          type="number"
                          min={0}
                          max={item.orderedQty}
                          step={0.01}
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
              <p className="text-xs text-slate-400 mt-1.5">
                Informe apenas o que chegou <strong>nesta entrega</strong>. Entregas anteriores já estão registradas.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setReceiveEntry(null)}>Cancelar</Button>
              <Button onClick={handleSaveReceipt} loading={saving}>
                <PackageCheck className="w-4 h-4" />Confirmar Recebimento
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
