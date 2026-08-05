"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, ShoppingBag, ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES } from "@/lib/utils";
import PasswordConfirmModal from "@/components/PasswordConfirmModal";

interface EntryItem { id: string; quantity: number; unitPrice: number; totalPrice: number; product: { name: string; unit: string } }
interface Purchase {
  id: string; invoiceNumber: string; invoiceDate: string; totalValue: number; observations?: string; isPurchase: boolean;
  program: { name: string; type: string }; supplier: { name: string }; user: { name: string };
  items: EntryItem[];
}

const EMPTY_ITEM = { productId: "", quantity: "1", unitPrice: "", lot: "" };
const EMPTY_HEADER = { programId: "", supplierId: "", invoiceDate: new Date().toISOString().split("T")[0], observations: "" };

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<{ label: string; fn: () => void } | null>(null);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit: string; programId: string }>>([]);
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, prRes, sRes, pdRes] = await Promise.all([
      fetch("/api/stock/entries?purchases=true"),
      fetch("/api/programs"),
      fetch("/api/suppliers"),
      fetch("/api/products"),
    ]);
    if (pRes.ok) setPurchases(await pRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (sRes.ok) setSuppliers(await sRes.json());
    if (pdRes.ok) setProducts(await pdRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedProgramType = programs.find((p) => p.id === header.programId)?.type;
  const filteredProducts = products.filter((p) =>
    !header.programId || !selectedProgramType || p.programId === header.programId ||
    programs.find((pr) => pr.id === header.programId)
  );

  function addItem() { setItems((prev) => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function setItemField(i: number, field: string, val: string) {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  const totalPurchase = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);

  async function handleSave() {
    if (!header.programId || !header.supplierId || !header.invoiceDate) {
      toast.error("Preencha programa, fornecedor e data"); return;
    }
    const validItems = items.filter((r) => r.productId && r.quantity && r.unitPrice);
    if (validItems.length === 0) { toast.error("Adicione ao menos 1 produto com quantidade e valor"); return; }
    setSaving(true);
    try {
      const invoiceNumber = `COMPRA-${Date.now().toString().slice(-8)}`;
      const res = await fetch("/api/stock/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: header.programId,
          supplierId: header.supplierId,
          invoiceNumber,
          invoiceDate: header.invoiceDate,
          observations: header.observations,
          isPurchase: true,
          items: validItems.map((r) => ({
            productId: r.productId,
            quantity: Number(r.quantity),
            unitPrice: Number(r.unitPrice),
            lot: r.lot || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar compra"); return; }
      toast.success(`Compra registrada! Estoque atualizado e débito lançado no orçamento.`);
      setModal(false);
      setHeader(EMPTY_HEADER);
      setItems([{ ...EMPTY_ITEM }]);
      load();
    } finally { setSaving(false); }
  }

  function requestDelete(p: Purchase) {
    setPendingAction({
      label: `excluir a compra de ${p.supplier.name} (estoque e débito revertidos)`,
      fn: async () => {
        const res = await fetch(`/api/stock/entries/${p.id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Compra excluída. Estoque e débito revertidos."); load(); }
        else { const d = await res.json(); toast.error(d.error ?? "Erro ao excluir"); }
      },
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div>
      <PageHeader title="Compras Informais" description="Registre compras de produtos sem nota fiscal formal — estoque e financeiro atualizados automaticamente">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Compra</Button>
      </PageHeader>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
        <strong>Compras Informais</strong> são aquisições realizadas fora do processo de Nota Fiscal.
        Ao registrar, o produto entra no estoque e o valor é debitado automaticamente do orçamento do programa.
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : purchases.length === 0 ? (
        <EmptyState title="Nenhuma compra registrada" description="Registre a primeira compra informal." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Compra</Button>} />
      ) : (
        <div className="space-y-2">
          {purchases.map((p) => {
            const expanded = expandedIds.has(p.id);
            return (
              <div key={p.id} className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => toggleExpand(p.id)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge color="orange">Compra Informal</Badge>
                        <Badge color={p.program.type === "MERENDA" ? "green" : p.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                          {PROGRAM_TYPES[p.program.type as keyof typeof PROGRAM_TYPES]?.label ?? p.program.type}
                        </Badge>
                        <span className="text-xs text-slate-600 font-medium">{p.supplier.name}</span>
                        <span className="text-xs text-slate-400">{formatDate(p.invoiceDate)}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{p.items.length} produto(s) · por {p.user.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="font-bold text-amber-700">{formatCurrency(p.totalValue)}</span>
                    <button onClick={() => requestDelete(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir (requer senha)"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-amber-100 px-4 pb-3">
                    {p.observations && <p className="text-xs text-slate-400 italic mt-2 mb-1">Obs: {p.observations}</p>}
                    <Table>
                      <thead><tr><Th>Produto</Th><Th>Qtd</Th><Th>Vl. Unit.</Th><Th>Total</Th></tr></thead>
                      <tbody>
                        {p.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <Td>{item.product.name} <span className="text-slate-400">({item.product.unit})</span></Td>
                            <Td>{item.quantity.toFixed(2)} {item.product.unit}</Td>
                            <Td>{formatCurrency(item.unitPrice)}</Td>
                            <Td className="font-semibold text-amber-700">{formatCurrency(item.totalPrice)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); }} title="Registrar Compra Informal" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Programa *" value={header.programId} onChange={(e) => setHeader({ ...header, programId: e.target.value })}
              options={[{ value: "", label: "Selecione o programa" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select label="Fornecedor *" value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}
              options={[{ value: "", label: "Selecione o fornecedor" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data da Compra *" type="date" value={header.invoiceDate} onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })} />
            <Input label="Observações" value={header.observations} onChange={(e) => setHeader({ ...header, observations: e.target.value })} placeholder="Motivo, destino, etc." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Produtos ({items.filter((r) => r.productId).length}/{items.length})</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><Plus className="w-3 h-3" /> Adicionar produto</button>
            </div>
            <div className="grid grid-cols-[2fr_1.4fr_2.2fr_1fr_auto] gap-2 text-xs font-semibold text-slate-400 uppercase px-1 mb-1">
              <span>Produto *</span><span>Qtd *</span><span>Vl. Unit. (R$) *</span><span>Total</span><span></span>
            </div>
            <div className="space-y-2">
              {items.map((row, i) => {
                const rowTotal = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
                return (
                  <div key={i} className="grid grid-cols-[2fr_1.4fr_2.2fr_1fr_auto] gap-2 items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <select value={row.productId} onChange={(e) => setItemField(i, "productId", e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                      <option value="">Selecionar...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                    </select>
                    <input type="number" step="0.001" min="0" value={row.quantity} onChange={(e) => setItemField(i, "quantity", e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 w-full min-w-[90px]" />
                    <input type="number" step="0.01" min="0" placeholder="0,00" value={row.unitPrice} onChange={(e) => setItemField(i, "unitPrice", e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 w-full min-w-[110px]" />
                    <div className="text-sm font-semibold text-amber-700 text-right">{formatCurrency(rowTotal)}</div>
                    <button onClick={() => removeItem(i)} disabled={items.length === 1} className="text-slate-300 hover:text-red-500 disabled:opacity-20 p-1"><X className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs text-amber-700">Total da compra (será debitado do orçamento)</p>
              <p className="text-xs text-amber-500">{items.filter((r) => r.productId).length} produto(s) válidos</p>
            </div>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalPurchase)}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
          <Button variant="secondary" onClick={() => { setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); }}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}><ShoppingBag className="w-4 h-4" />Registrar Compra</Button>
        </div>
      </Modal>

      {pendingAction && (
        <PasswordConfirmModal
          actionLabel={pendingAction.label}
          onConfirmed={async () => { await pendingAction.fn(); setPendingAction(null); }}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
