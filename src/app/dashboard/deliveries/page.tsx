"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { Plus, CheckCircle, XCircle, Clock, Truck, ChevronDown, ChevronUp, AlertTriangle, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { PageHeader, Badge, Table, Th, Td, Button, Modal } from "@/components/ui";
import { formatCurrency, PROGRAM_TYPES } from "@/lib/utils";
import { usePolling } from "@/lib/usePolling";
import { toast } from "sonner";
import PasswordConfirmModal from "@/components/PasswordConfirmModal";

// --- Tipos ------------------------------------------------------------------
interface Product { id: string; name: string; unit: string; ncmCode: string }
interface Supplier { id: string; name: string }
interface Program  { id: string; name: string; type: string }

interface OrderItem {
  id: string;
  product: Product;
  quantityOrdered: number;
  quantityDelivered: number | null;
  unitPrice: number;
  totalPrice: number;
  isExtra: boolean;
  extraNote: string | null;
}

interface DeliveryOrder {
  id: string;
  status: "PENDING" | "CONFIRMED" | "PARTIAL" | "CANCELLED";
  deliveryDate: string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  supplier: { id: string; name: string };
  school: { id: string; name: string };
  program: { id: string; name: string; type: string } | null;
  stockEntry: { id: string; invoiceNumber: string; invoiceSeries: string | null; invoiceDate: string; totalValue: number; programId: string; program: { name: string; type: string } } | null;
  createdBy: { id: string; name: string };
  confirmedBy: { id: string; name: string } | null;
  items: OrderItem[];
}

// --- Helpers ----------------------------------------------------------------
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando Confirmacao",
  CONFIRMED: "Confirmada",
  PARTIAL: "Parcial",
  CANCELLED: "Cancelada",
};
const STATUS_COLOR: Record<string, any> = {
  PENDING: "yellow",
  CONFIRMED: "green",
  PARTIAL: "blue",
  CANCELLED: "red",
};

function StatusIcon({ s }: { s: string }) {
  if (s === "CONFIRMED") return <CheckCircle className="w-4 h-4 text-green-600" />;
  if (s === "PARTIAL")   return <AlertTriangle className="w-4 h-4 text-blue-500" />;
  if (s === "CANCELLED") return <XCircle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
}

// --- Modal: Nova Entrega (Fornecedor) ----------------------------------------
function NewDeliveryModal({
  supplierId,
  schoolId: propSchoolId,
  onClose,
  onSaved,
}: {
  supplierId: string;
  schoolId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  interface NfEntry { id: string; invoiceNumber: string; invoiceSeries: string | null; invoiceDate: string; totalValue: number; programId: string; program: { name: string; type: string }; items: { product: { id: string; name: string; unit: string }; quantity: number; unitPrice: number }[] }
  const [nfs, setNfs] = useState<NfEntry[]>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  // Cabeçalho da entrega
  const [nfRef, setNfRef] = useState("");           // número da NF informado pelo fornecedor
  const [nfEntryId, setNfEntryId] = useState("");   // NF existente no sistema (opcional)
  const [programId, setProgramId] = useState("");
  const [invoiceSeries, setInvoiceSeries] = useState(""); // parcela
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [schoolId, setSchoolId] = useState(propSchoolId);

  // Itens da entrega
  const [items, setItems] = useState<Array<{ productId: string; unit: string; qty: string; unitPrice: string; isExtra: boolean; extraNote: string }>>([
    { productId: "", unit: "", qty: "", unitPrice: "", isExtra: false, extraNote: "" },
  ]);

  useEffect(() => {
    Promise.all([
      fetch("/api/stock/entries").then(r => r.ok ? r.json() : []),
      fetch("/api/programs").then(r => r.ok ? r.json() : []),
      fetch("/api/products").then(r => r.ok ? r.json() : []),
    ]).then(([entries, progs, prods]) => {
      setNfs(entries.filter((e: NfEntry) => !e.invoiceNumber.startsWith("DEL-")));
      setPrograms(progs);
      setAllProducts(prods);
      // Pré-seleciona o primeiro programa disponível
      if (progs.length === 1) setProgramId(progs[0].id);
    });
  }, []);

  // Quando o usuário seleciona uma NF existente, pré-preenche campos
  function handleNfEntrySelect(id: string) {
    setNfEntryId(id);
    const nf = nfs.find(n => n.id === id);
    if (!nf) return;
    setNfRef(nf.invoiceNumber);
    setProgramId(nf.programId);
    setInvoiceSeries(nf.invoiceSeries ?? "");
    // Pré-carrega itens da NF
    if (nf.items.length > 0) {
      setItems(nf.items.map(i => ({
        productId: i.product.id, unit: i.product.unit,
        qty: String(i.quantity), unitPrice: String(i.unitPrice),
        isExtra: false, extraNote: "",
      })));
    }
  }

  function setItem(idx: number, field: string, val: string) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      if (field === "productId") {
        const p = allProducts.find(p => p.id === val);
        return { ...it, productId: val, unit: p?.unit ?? "" };
      }
      return { ...it, [field]: val };
    }));
  }

  function addItem() { setItems(prev => [...prev, { productId: "", unit: "", qty: "", unitPrice: "", isExtra: false, extraNote: "" }]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const total = items.reduce((s, i) => s + (Number(i.qty)||0) * (Number(i.unitPrice)||0), 0);

  async function handleSave() {
    if (!programId) { toast.error("Selecione o programa"); return; }
    if (!deliveryDate) { toast.error("Informe a data/hora da entrega"); return; }
    const validItems = items.filter(i => i.productId && Number(i.qty) > 0);
    if (validItems.length === 0) { toast.error("Adicione ao menos 1 produto com quantidade maior que zero"); return; }
    const missingNote = validItems.find(i => i.isExtra && !i.extraNote.trim());
    if (missingNote) { toast.error("Itens fora da NF exigem justificativa obrigatória"); return; }

    // Resolve schoolId: pode vir da sessão ou do supplier
    let resolvedSchoolId = schoolId;
    if (!resolvedSchoolId) {
      const nf = nfs.find(n => n.id === nfEntryId);
      if (nf) resolvedSchoolId = ""; // fallback — API vai resolver via supplierId
    }

    setSaving(true);
    const res = await fetch("/api/deliveries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        schoolId: resolvedSchoolId || undefined,
        programId,
        stockEntryId: nfEntryId || null,
        deliveryDate,
        notes: [
          nfRef ? `NF: ${nfRef}` : "",
          invoiceSeries ? `Parcela/Série: ${invoiceSeries}` : "",
          notes,
        ].filter(Boolean).join(" — ") || null,
        items: validItems.map(i => ({
          productId: i.productId,
          quantityOrdered: Number(i.qty),
          unitPrice: Number(i.unitPrice),
          isExtra: i.isExtra,
          extraNote: i.extraNote || null,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Entrega registrada! Aguardando confirmação do administrador.");
      onSaved(); onClose();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Erro ao registrar entrega.");
    }
  }

  return (
    <Modal open title="Registrar Entrega de Mercadorias" onClose={onClose} size="xl">
      <div className="space-y-5">

        {/* ── Seção 1: Identificação ─────────────────── */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">1. Identificação da Entrega</p>
          <div className="grid grid-cols-2 gap-3">

            {/* NF selecionável — se existir no sistema auto-preenche; se não, mostra campo manual */}
            <div className="col-span-2">
              {nfs.length > 0 ? (
                <select value={nfEntryId || (nfRef ? "__manual__" : "")}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "__manual__") { setNfEntryId(""); setNfRef(""); setInvoiceSeries(""); setProgramId(""); }
                    else { handleNfEntrySelect(val); }
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Selecione a Nota Fiscal —</option>
                  {nfs.map(n => {
                    const parc = n.invoiceSeries ? ` · Parcela ${n.invoiceSeries}` : "";
                    return <option key={n.id} value={n.id}>NF {n.invoiceNumber}{parc} — {n.program.name} — {formatCurrency(n.totalValue)}</option>;
                  })}
                  <option value="__manual__">✏ Digitar número manualmente (NF não está no sistema)</option>
                </select>
              ) : (
                <input value={nfRef} onChange={e => setNfRef(e.target.value)} placeholder="Ex: 000123"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
              {/* Campo manual visível quando "digitar manualmente" está selecionado */}
              {nfs.length > 0 && !nfEntryId && (
                <input value={nfRef} onChange={e => setNfRef(e.target.value)} placeholder="Digite o número da NF"
                  className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            {/* Parcela / Série — select com opções das NFs disponíveis */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Parcela / Série</label>
              {nfEntryId ? (
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700">
                  {invoiceSeries || <span className="text-slate-400">—</span>}
                </div>
              ) : (() => {
                const seriesOptions = [...new Set(nfs.map(n => n.invoiceSeries).filter(Boolean))] as string[];
                return seriesOptions.length > 0 ? (
                  <select value={invoiceSeries} onChange={e => setInvoiceSeries(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Selecione a parcela —</option>
                    {seriesOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="__other__">Outra...</option>
                  </select>
                ) : (
                  <input value={invoiceSeries} onChange={e => setInvoiceSeries(e.target.value)} placeholder="Ex: 6ª Parcela, Série 001"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                );
              })()}
              {!nfEntryId && invoiceSeries === "__other__" && (
                <input autoFocus value="" onChange={e => setInvoiceSeries(e.target.value)} placeholder="Digite a parcela/série"
                  className="mt-1 w-full border border-blue-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            {/* Programa — auto-preenche da NF ou manual */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Programa *</label>
              {nfEntryId ? (
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium">
                  {programs.find(p => p.id === programId)?.name || <span className="text-slate-400">—</span>}
                </div>
              ) : (
                <select value={programId} onChange={e => setProgramId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Selecione o programa —</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* Data e Hora */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Data e Hora da Entrega *</label>
              <input type="datetime-local" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-slate-400 mt-0.5">Preenchida automaticamente — edite se necessário</p>
            </div>

            {/* Observações */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Observações</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Ex: entrega parcial, produto danificado, etc."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Resumo visual */}
          {(nfRef || invoiceSeries || programId) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {nfRef && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-mono font-semibold">NF {nfRef}</span>}
              {invoiceSeries && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{invoiceSeries}</span>}
              {programId && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">{programs.find(p => p.id === programId)?.name}</span>}
              {nfEntryId && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">NF vinculada ao sistema ✓</span>}
            </div>
          )}
        </div>

        {/* ── Seção 2: Mercadorias ───────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">2. Mercadorias Entregues</p>
            <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              <Plus className="w-3 h-3" /> Adicionar produto
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Item / Produto *</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500">Unidade</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Quantidade *</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Valor Unit. (R$) *</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Total</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-amber-600" title="Marque se este item NÃO consta na NF referenciada">Fora NF?</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${item.isExtra ? "bg-amber-50/40" : "bg-white"}`}>
                    <td className="px-2 py-2">
                      <select value={item.productId} onChange={e => setItem(i, "productId", e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">— Selecionar produto —</option>
                        {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {item.isExtra && (
                        <input placeholder="Justificativa obrigatória para item fora da NF"
                          value={item.extraNote} onChange={e => setItem(i, "extraNote", e.target.value)}
                          className="mt-1 w-full border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-xs font-mono text-slate-500">{item.unit || "—"}</td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.001" min="0" placeholder="0"
                        value={item.qty} onChange={e => setItem(i, "qty", e.target.value)}
                        className="w-24 border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto block" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.01" min="0" placeholder="0,00"
                        value={item.unitPrice} onChange={e => setItem(i, "unitPrice", e.target.value)}
                        className="w-28 border border-slate-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto block" />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {formatCurrency((Number(item.qty)||0) * (Number(item.unitPrice)||0))}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={!!item.isExtra}
                        onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, isExtra: e.target.checked, extraNote: e.target.checked ? it.extraNote : "" } : it))}
                        className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" title="Produto fora da Nota Fiscal" />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeItem(i)} disabled={items.length === 1} className="text-slate-300 hover:text-red-500 disabled:opacity-0">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Total da entrega:</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-800">{formatCurrency(total)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {items.some(i => i.isExtra) && (
            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Itens marcados como "Fora NF" serão registrados com ressalva e analisados pelo administrador.
            </p>
          )}
        </div>

        {/* ── Rodapé: Total e Botões ─────────────────── */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-400">A entrega ficará pendente até o administrador da escola confirmar o recebimento.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {saving ? "Registrando..." : "Registrar Entrega"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- Modal: Confirmar Entrega (Diretor) -------------------------------------
function ConfirmModal({
  order,
  onClose,
  onSaved,
}: {
  order: DeliveryOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    order.items.forEach((i) => { init[i.id] = String(i.quantityOrdered); });
    return init;
  });
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    const confirmedItems = order.items.map((i) => ({
      id: i.id,
      quantityDelivered: Number(quantities[i.id] ?? 0),
    }));
    const res = await fetch(`/api/deliveries/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM", items: confirmedItems }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Entrega confirmada! Estoque e financeiro atualizados.");
      onSaved();
      onClose();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Erro ao confirmar.");
    }
  }

  async function handleCancel() {
    setSaving(true);
    const res = await fetch(`/api/deliveries/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CANCEL" }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Entrega cancelada.");
      onSaved();
      onClose();
    } else {
      toast.error("Erro ao cancelar.");
    }
  }

  const totalConfirmed = order.items.reduce((s, i) => {
    return s + (Number(quantities[i.id] ?? 0)) * i.unitPrice;
  }, 0);

  const pendingItems = order.items.filter((i) => {
    const confirmed = Number(quantities[i.id] ?? 0);
    return confirmed < i.quantityOrdered;
  });

  return (
    <Modal open title={`Confirmar Entrega — ${order.supplier.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
          Informe a quantidade <strong>realmente recebida</strong> de cada produto.
          Ao confirmar, o estoque sera atualizado e o valor sera debitado do orcamento do programa.
        </div>

        {order.stockEntry && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700">
            NF de referência: <strong>NF {order.stockEntry.invoiceNumber}{order.stockEntry.invoiceSeries ? ` · Parcela ${order.stockEntry.invoiceSeries}` : ""}</strong> · {order.stockEntry.program.name} · Valor contratado: <strong>{formatCurrency(order.stockEntry.totalValue)}</strong>
          </div>
        )}

        <div className="text-xs text-slate-500 space-y-1">
          <p>Fornecedor: <strong>{order.supplier.name}</strong></p>
          <p>Data/hora: <strong>{new Date(order.deliveryDate).toLocaleString("pt-BR")}</strong></p>
          {order.program && <p>Programa: <strong>{order.program.name}</strong></p>}
          {order.notes && <p>Obs: <em>{order.notes}</em></p>}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-500 uppercase px-1">
            <span>Produto</span>
            <span>Pedido</span>
            <span>Confirmado</span>
            <span>Valor</span>
          </div>
          {order.items.map((item) => {
            const confirmed = Number(quantities[item.id] ?? 0);
            const isPending = confirmed < item.quantityOrdered;
            return (
              <div key={item.id} className={`grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center px-2 py-2 rounded-lg ${item.isExtra ? "bg-amber-50 border border-amber-200" : isPending ? "bg-orange-50" : "bg-green-50"}`}>
                <span className="text-sm font-medium text-slate-800 truncate">
                  {item.product.name}
                  <span className="ml-1 text-xs text-slate-400">({item.product.unit})</span>
                  {item.isExtra && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-200 text-amber-800">Fora NF</span>}
                  {item.extraNote && <span className="block text-xs text-amber-600 italic">{item.extraNote}</span>}
                </span>
                <span className="text-sm text-slate-600">{item.quantityOrdered} {item.product.unit}</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max={item.quantityOrdered}
                  value={quantities[item.id] ?? ""}
                  onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                  className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                />
                <span className="text-sm font-medium">{formatCurrency(confirmed * item.unitPrice)}</span>
              </div>
            );
          })}
        </div>

        {pendingItems.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-orange-800 mb-1">Itens nao entregues completamente:</p>
            {pendingItems.map((i) => {
              const notDelivered = i.quantityOrdered - Number(quantities[i.id] ?? 0);
              return (
                <p key={i.id} className="text-xs text-orange-700">
                  • {i.product.name}: faltam <strong>{notDelivered.toFixed(2)} {i.product.unit}</strong>
                </p>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Total a debitar do orcamento</p>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(totalConfirmed)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 disabled:opacity-50">
              Fechar
            </button>
            <button onClick={handleConfirm} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saving ? "Confirmando..." : "Confirmar Recebimento"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- Modal: Editar Entrega --------------------------------------------------
function EditDeliveryModal({
  order,
  onClose,
  onSaved,
}: {
  order: DeliveryOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    programId: order.program?.id ?? "",
    deliveryDate: new Date(order.deliveryDate).toISOString().slice(0, 16),
    notes: order.notes ?? "",
  });
  const [items, setItems] = useState(
    order.items.map((i) => ({
      productId: i.product.id,
      quantityOrdered: String(i.quantityOrdered),
      unitPrice: String(i.unitPrice),
    }))
  );

  useEffect(() => {
    fetch("/api/products").then((r) => { if (r.ok) r.json().then(setProducts); });
    fetch("/api/programs").then((r) => { if (r.ok) r.json().then(setPrograms); });
  }, []);

  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantityOrdered: "", unitPrice: "" }]);
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function setItem(i: number, field: string, val: string) {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  async function handleSave() {
    const validItems = items.filter((i) => i.productId && i.quantityOrdered && i.unitPrice);
    if (validItems.length === 0) { toast.error("Adicione ao menos 1 produto"); return; }
    if (!form.deliveryDate) { toast.error("Informe data/hora da entrega"); return; }
    setSaving(true);
    const res = await fetch(`/api/deliveries/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId: form.programId || null,
        deliveryDate: form.deliveryDate,
        notes: form.notes || null,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantityOrdered: Number(i.quantityOrdered),
          unitPrice: Number(i.unitPrice),
        })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Entrega atualizada com sucesso!");
      onSaved();
      onClose();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Erro ao editar entrega.");
    }
  }

  const total = items.reduce(
    (s, i) => s + (Number(i.quantityOrdered) || 0) * (Number(i.unitPrice) || 0),
    0
  );

  return (
    <Modal open title={`Editar Entrega — ${order.supplier.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Programa (opcional)</label>
            <select
              value={form.programId}
              onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Nenhum —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data e Hora da Entrega *</label>
            <input
              type="datetime-local"
              value={form.deliveryDate}
              onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">Observacoes</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Ex: Entrega parcial — faltam 10kg de arroz"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Mercadorias</p>
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
              <Plus className="w-3 h-3" /> Adicionar produto
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                <div>
                  {i === 0 && <label className="text-xs text-slate-400 block mb-1">Produto *</label>}
                  <select
                    value={item.productId}
                    onChange={(e) => setItem(i, "productId", e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecionar...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <label className="text-xs text-slate-400 block mb-1">Quantidade *</label>}
                  <input
                    type="number" step="0.001" min="0" placeholder="0"
                    value={item.quantityOrdered}
                    onChange={(e) => setItem(i, "quantityOrdered", e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  {i === 0 && <label className="text-xs text-slate-400 block mb-1">Valor unit. (R$) *</label>}
                  <input
                    type="number" step="0.01" min="0" placeholder="0,00"
                    value={item.unitPrice}
                    onChange={(e) => setItem(i, "unitPrice", e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  className="pb-0.5 text-slate-400 hover:text-red-500 disabled:opacity-30"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Valor total da entrega</p>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(total)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar Alteracoes"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --- Card de Entrega ---------------------------------------------------------
function OrderCard({ order, canConfirm, onRefresh }: { order: DeliveryOrder; canConfirm: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ label: string; fn: () => void } | null>(null);

  const canEdit = canConfirm && order.status === "PENDING";
  const canDelete = canConfirm;

  function requestCancel() {
    setPendingAction({
      label: `cancelar a entrega de ${order.supplier.name}`,
      fn: async () => {
        const res = await fetch(`/api/deliveries/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CANCEL" }) });
        if (res.ok) { toast.success("Entrega cancelada."); onRefresh(); }
        else { toast.error("Erro ao cancelar."); }
      },
    });
  }

  function requestDelete() {
    const isConfirmed = ["CONFIRMED", "PARTIAL"].includes(order.status);
    const label = isConfirmed
      ? `excluir e REVERTER a entrega confirmada de ${order.supplier.name} (estoque e financeiro serão desfeitos)`
      : `excluir permanentemente a entrega de ${order.supplier.name}`;
    setPendingAction({
      label,
      fn: async () => {
        const res = await fetch(`/api/deliveries/${order.id}`, { method: "DELETE" });
        if (res.ok) { toast.success(isConfirmed ? "Entrega excluída e estoque revertido." : "Entrega excluída."); onRefresh(); }
        else {
          const err = await res.json();
          toast.error(err.error ?? "Erro ao excluir.");
        }
      },
    });
  }

  const totalOrdered = order.items.reduce((s, i) => s + i.totalPrice, 0);
  const totalDelivered = order.items.reduce((s, i) => {
    return s + (i.quantityDelivered ?? 0) * i.unitPrice;
  }, 0);

  const notDeliveredItems = order.items.filter(
    (i) => i.quantityDelivered !== null && i.quantityDelivered < i.quantityOrdered
  );

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header do card */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 text-sm">{order.supplier.name}</span>
                <Badge color={STATUS_COLOR[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                {order.items.some(i => i.isExtra) && <Badge color="orange">Com Ressalva</Badge>}
              </div>
              <p className="text-xs text-slate-500">
                {new Date(order.deliveryDate).toLocaleString("pt-BR")}
                {order.program && ` · ${order.program.name}`}
                {order.stockEntry && <span className="text-blue-600"> · NF {order.stockEntry.invoiceNumber}{order.stockEntry.invoiceSeries ? ` · Parcela ${order.stockEntry.invoiceSeries}` : ""}</span>}
                {" · "}{order.items.length} produto(s)
                {" · "}<span className="font-medium text-slate-700">{formatCurrency(totalOrdered)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon s={order.status} />
            {canConfirm && order.status === "PENDING" && (
              <>
                <button onClick={() => setShowConfirm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" />Confirmar
                </button>
                <button onClick={requestCancel} className="flex items-center gap-1 px-2 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium rounded-lg" title="Cancelar entrega (requer senha)">
                  <XCircle className="w-3.5 h-3.5" />Cancelar
                </button>
              </>
            )}
            {canEdit && (
              <button onClick={() => setShowEdit(true)} className="flex items-center gap-1 px-2 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-medium rounded-lg" title="Editar entrega">
                <Pencil className="w-3.5 h-3.5" />Editar
              </button>
            )}
            {canDelete && (
              <button onClick={requestDelete} className="flex items-center gap-1 px-2 py-1.5 border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs font-medium rounded-lg" title="Excluir entrega">
                <Trash2 className="w-3.5 h-3.5" />Excluir
              </button>
            )}
            <button onClick={() => setExpanded((e) => !e)} className="text-slate-400 hover:text-slate-700 p-1">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandido: itens */}
        {expanded && (
          <div className="border-t border-slate-100 px-4 py-3">
            {order.notes && (
              <p className="text-xs text-slate-500 italic mb-3">Obs: {order.notes}</p>
            )}
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>NCM</Th>
                  <Th>Pedido</Th>
                  <Th>Entregue</Th>
                  <Th>Pendente</Th>
                  <Th>Valor Unit.</Th>
                  <Th>Total</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const pending =
                    item.quantityDelivered !== null
                      ? item.quantityOrdered - item.quantityDelivered
                      : null;
                  return (
                    <tr key={item.id} className={`${pending !== null && pending > 0 ? "bg-orange-50" : item.isExtra ? "bg-amber-50/60" : ""}`}>
                      <Td>
                        {item.product.name}
                        {item.isExtra && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700" title={item.extraNote ?? ""}>Fora NF</span>}
                        {item.extraNote && <span className="block text-xs text-amber-600 italic mt-0.5">Ressalva: {item.extraNote}</span>}
                      </Td>
                      <Td className="font-mono text-xs text-slate-400">{item.product.ncmCode}</Td>
                      <Td>{item.quantityOrdered} {item.product.unit}</Td>
                      <Td className={item.quantityDelivered !== null ? "text-green-700 font-medium" : "text-slate-400"}>
                        {item.quantityDelivered !== null ? `${item.quantityDelivered} ${item.product.unit}` : "—"}
                      </Td>
                      <Td className={pending !== null && pending > 0 ? "text-orange-600 font-medium" : "text-slate-400"}>
                        {pending !== null ? (pending > 0 ? `${pending.toFixed(2)} ${item.product.unit}` : "0") : "—"}
                      </Td>
                      <Td>{formatCurrency(item.unitPrice)}</Td>
                      <Td className="font-medium">{formatCurrency(item.totalPrice)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            {/* Resumo financeiro */}
            <div className="flex justify-end gap-6 mt-3 text-sm">
              <div className="text-right">
                <p className="text-xs text-slate-400">Valor pedido</p>
                <p className="font-semibold text-slate-700">{formatCurrency(totalOrdered)}</p>
              </div>
              {order.status !== "PENDING" && (
                <>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Valor entregue</p>
                    <p className="font-semibold text-green-700">{formatCurrency(totalDelivered)}</p>
                  </div>
                  {totalOrdered - totalDelivered > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Nao entregue</p>
                      <p className="font-semibold text-orange-600">{formatCurrency(totalOrdered - totalDelivered)}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Itens nao entregues */}
            {notDeliveredItems.length > 0 && (
              <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-orange-800 mb-1">Mercadorias nao entregues:</p>
                {notDeliveredItems.map((i) => (
                  <p key={i.id} className="text-xs text-orange-700">
                    • {i.product.name}: {(i.quantityOrdered - (i.quantityDelivered ?? 0)).toFixed(2)} {i.product.unit}
                    ({formatCurrency((i.quantityOrdered - (i.quantityDelivered ?? 0)) * i.unitPrice)})
                  </p>
                ))}
              </div>
            )}

            {order.confirmedBy && (
              <p className="text-xs text-slate-400 mt-3">
                Confirmado por <strong>{order.confirmedBy.name}</strong> em{" "}
                {new Date(order.confirmedAt!).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal order={order} onClose={() => setShowConfirm(false)} onSaved={onRefresh} />
      )}

      {showEdit && (
        <EditDeliveryModal order={order} onClose={() => setShowEdit(false)} onSaved={onRefresh} />
      )}

      {pendingAction && (
        <PasswordConfirmModal
          actionLabel={pendingAction.label}
          onConfirmed={async () => { if (pendingAction) { await pendingAction.fn(); } setPendingAction(null); }}
          onClose={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

// --- Página Principal --------------------------------------------------------
export default function DeliveriesPage() {
  const { data: session } = useSession();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const prevCountRef = useRef(0);

  const role = (session?.user as any)?.role ?? "";
  const isSupplier = role === "SUPPLIER";
  const canConfirm = ["SCHOOL_ADMIN", "MANAGER", "SUPER_ADMIN"].includes(role);
  const supplierId = (session?.user as any)?.supplierId ?? "";
  const schoolId = (session?.user as any)?.schoolId ?? "";

  const fetchOrders = useCallback(async () => {
    const isFirst = !lastUpdated;
    if (isFirst) setLoading(true); else setRefreshing(true);
    const url = statusFilter !== "ALL" ? `/api/deliveries?status=${statusFilter}` : "/api/deliveries";
    const res = await fetch(url);
    if (res.ok) {
      const data: DeliveryOrder[] = await res.json();
      const newPending = data.filter((o) => o.status === "PENDING").length;
      // Notifica se chegou nova entrega pendente
      if (!isFirst && newPending > prevCountRef.current) {
        toast.info(`Nova entrega registrada pelo fornecedor!`, { duration: 5000 });
      }
      prevCountRef.current = newPending;
      setOrders(data);
      setLastUpdated(new Date());
    }
    if (isFirst) setLoading(false); else setRefreshing(false);
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh inicial + a cada 15 segundos
  usePolling(fetchOrders, 15_000);

  const load = fetchOrders; // alias para uso nos handlers

  const pending  = orders.filter((o) => o.status === "PENDING").length;
  const partial  = orders.filter((o) => o.status === "PARTIAL").length;

  const filtered =
    statusFilter === "ALL" ? orders : orders.filter((o) => o.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Entregas de Mercadorias"
        description={isSupplier ? "Registre as mercadorias que serao entregues" : "Gerencie e confirme as entregas dos fornecedores"}
      >
        <div className="flex items-center gap-3">
          {/* Indicador ao vivo */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${refreshing ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
            {lastUpdated
              ? <span>Atualizado {lastUpdated.toLocaleTimeString("pt-BR")}</span>
              : <span>Carregando...</span>}
            <button
              onClick={load}
              disabled={refreshing}
              title="Atualizar agora"
              className="ml-1 p-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {isSupplier && supplierId && (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Registrar Entrega
            </button>
          )}
        </div>
      </PageHeader>

      {/* Alertas para escola */}
      {!isSupplier && (pending + partial > 0) && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">
              {pending} entrega(s) aguardando confirmacao · {partial} parcial(is)
            </p>
            <p className="text-xs text-yellow-700">
              Confirme as entregas para atualizar o estoque e debitar o orcamento dos programas.
            </p>
          </div>
        </div>
      )}

      {/* Filtro de status */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-4 w-fit">
        {(["ALL", "PENDING", "CONFIRMED", "PARTIAL", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statusFilter === s ? "bg-white shadow text-slate-800" : "text-slate-500"}`}
          >
            {s === "ALL" ? `Todas (${orders.length})` : `${STATUS_LABEL[s]} (${orders.filter((o) => o.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma entrega encontrada</p>
          {isSupplier && (
            <p className="text-xs mt-1">Clique em "Registrar Entrega" para comecar</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} canConfirm={canConfirm} onRefresh={load} />
          ))}
        </div>
      )}

      {showNew && (
        <NewDeliveryModal
          supplierId={supplierId}
          schoolId={schoolId}
          onClose={() => setShowNew(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
