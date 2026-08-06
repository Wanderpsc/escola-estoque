"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, X, Barcode, ArrowDownToLine, PackagePlus } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES } from "@/lib/utils";
import BarcodeScanner from "@/components/BarcodeScanner";
import PasswordConfirmModal from "@/components/PasswordConfirmModal";

interface EntryItem { id: string; productId: string; quantity: number; unitPrice: number; totalPrice: number; lot?: string; isExtra: boolean; product: { name: string; unit: string } }
interface Entry {
  id: string; programId: string; invoiceNumber: string; invoiceDate: string; totalValue: number; observations?: string;
  supplier: { id: string; name: string }; program: { id: string; name: string; type: string };
  user: { name: string }; items: EntryItem[];
}
interface BaixaItemState { productId: string; productName: string; productUnit: string; unitPrice: number; programId: string }

interface ItemRow { productId: string; quantity: string; unitPrice: string; lot: string }
const EMPTY_HEADER = { programId: "", supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], observations: "" };
const EMPTY_ITEM: ItemRow = { productId: "", quantity: "1", unitPrice: "0", lot: "" };

export default function StockEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit: string; programId: string; barcode?: string }>>([]);
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [extraItems, setExtraItems] = useState<ItemRow[]>([]);
  const [showExtraSection, setShowExtraSection] = useState(false);
  const [scanningRowIndex, setScanningRowIndex] = useState<number | null>(null);
  const [scanningExtra, setScanningExtra] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Edit state
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [editItems, setEditItems] = useState<Array<{ id: string; quantity: string; unitPrice: string }>>([]);
  const [editMeta, setEditMeta] = useState({ invoiceNumber: "", invoiceDate: "", observations: "" });

  // Password confirm state
  const [pendingAction, setPendingAction] = useState<{ label: string; fn: () => void } | null>(null);

  // Baixa manual state
  const [baixaItem, setBaixaItem] = useState<BaixaItemState | null>(null);
  const [baixaForm, setBaixaForm] = useState({ quantity: "1", reason: "CONSUMO", exitDate: new Date().toISOString().split("T")[0], observations: "", debitBudget: false });

  // List filter
  const [filterProgramId, setFilterProgramId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, sRes, prRes, pdRes] = await Promise.all([
      fetch(filterProgramId ? `/api/stock/entries?programId=${filterProgramId}` : "/api/stock/entries"),
      fetch("/api/suppliers"), fetch("/api/programs"), fetch("/api/products"),
    ]);
    if (eRes.ok) setEntries(await eRes.json());
    if (sRes.ok) setSuppliers(await sRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (pdRes.ok) setProducts(await pdRes.json());
    setLoading(false);
  }, [filterProgramId]);

  useEffect(() => { load(); }, [load]);

  const filteredProducts = products.filter((p) => !header.programId || p.programId === header.programId);
  const totalNF = items.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unitPrice || 0), 0);
  const totalExtra = extraItems.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unitPrice || 0), 0);

  function addItem() { setItems((prev) => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function setItemField(i: number, field: keyof ItemRow, val: string) {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function addExtraItem() { setExtraItems((prev) => [...prev, { ...EMPTY_ITEM }]); }
  function removeExtraItem(i: number) { setExtraItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function setExtraItemField(i: number, field: keyof ItemRow, val: string) {
    setExtraItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openEdit(entry: Entry) {
    setEditEntry(entry);
    setEditMeta({ invoiceNumber: entry.invoiceNumber, invoiceDate: entry.invoiceDate.split("T")[0], observations: entry.observations ?? "" });
    setEditItems(entry.items.map((i) => ({ id: i.id, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })));
  }

  async function handleBarcodeDetected(barcode: string, rowIndex: number, isExtraRow: boolean) {
    setScanningRowIndex(null); setScanningExtra(false);
    const local = products.find((p) => p.barcode === barcode);
    if (local) {
      if (isExtraRow) setExtraItemField(rowIndex, "productId", local.id);
      else setItemField(rowIndex, "productId", local.id);
      toast.success(`Produto: ${local.name}`); return;
    }
    const res = await fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`);
    if (res.ok) {
      const prod = await res.json();
      setProducts((prev) => prev.some((p) => p.id === prod.id) ? prev : [...prev, prod]);
      if (isExtraRow) setExtraItemField(rowIndex, "productId", prod.id);
      else setItemField(rowIndex, "productId", prod.id);
      toast.success(`Produto: ${prod.name}`);
    } else {
      toast.error(`Codigo ${barcode} nao encontrado. Cadastre o produto com este codigo primeiro.`);
    }
  }

  async function handleSave() {
    if (!header.programId || !header.supplierId || !header.invoiceDate) { toast.error("Preencha todos os campos obrigatorios (*)"); return; }
    const validItems = items.filter((r) => r.productId && Number(r.quantity) > 0);
    const validExtraItems = extraItems.filter((r) => r.productId && Number(r.quantity) > 0);
    if (validItems.length === 0 && validExtraItems.length === 0) { toast.error("Adicione ao menos 1 produto"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/entries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: header.programId, supplierId: header.supplierId,
          invoiceNumber: header.invoiceNumber || `SEM-NF-${Date.now().toString().slice(-8)}`,
          invoiceDate: header.invoiceDate, observations: header.observations,
          items: validItems.map((r) => ({ productId: r.productId, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice), lot: r.lot || undefined })),
          extraItems: validExtraItems.map((r) => ({ productId: r.productId, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice), lot: r.lot || undefined })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar entrada"); return; }
      const extraMsg = validExtraItems.length > 0 ? ` + ${validExtraItems.length} produto(s) extra NF` : "";
      const nfCount = validItems.length > 0 ? `${validItems.length} produto(s)` : "somente extras";
      toast.success(`NF ${header.invoiceNumber} registrada com ${nfCount}${extraMsg}!`);
      setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); setExtraItems([]); setShowExtraSection(false); load();
    } finally { setSaving(false); }
  }

  async function handleEditSave() {
    if (!editEntry) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/entries/${editEntry.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber: editMeta.invoiceNumber, invoiceDate: editMeta.invoiceDate, observations: editMeta.observations, items: editItems.map((i) => ({ id: i.id, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })) }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Erro ao editar"); return; }
      toast.success("Entrada atualizada!"); setEditEntry(null); load();
    } finally { setSaving(false); }
  }

  function requestDelete(entry: Entry) {
    setPendingAction({
      label: `excluir a NF ${entry.invoiceNumber}`,
      fn: async () => {
        const res = await fetch(`/api/stock/entries/${entry.id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Entrada excluida! Saldo de estoque atualizado."); load(); }
        else { const d = await res.json(); toast.error(d.error ?? "Erro ao excluir"); }
      },
    });
  }

  function requestEdit(entry: Entry) {
    setPendingAction({
      label: `editar a NF ${entry.invoiceNumber}`,
      fn: () => { openEdit(entry); },
    });
  }

  async function handleBaixaManual() {
    if (!baixaItem) return;
    setSaving(true);
    try {
      const res = await fetch("/api/stock/exits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exitDate: baixaForm.exitDate,
          reason: baixaForm.reason,
          programId: baixaItem.programId,
          observations: baixaForm.observations || `Baixa manual — ${baixaItem.productName}`,
          isExtra: baixaForm.debitBudget,
          items: [{ productId: baixaItem.productId, quantity: Number(baixaForm.quantity), unitPrice: baixaItem.unitPrice }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar baixa"); return; }
      toast.success(`Baixa de ${baixaForm.quantity} ${baixaItem.productUnit} registrada!`);
      setBaixaItem(null);
      load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Entradas de Estoque" description="Registre e gerencie entradas de produtos por nota fiscal">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada (NF)</Button>
      </PageHeader>

      {programs.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Programa:</span>
          <select value={filterProgramId} onChange={(e) => setFilterProgramId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">Todos</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {filterProgramId && <button onClick={() => setFilterProgramId("")} className="text-xs text-slate-400 hover:text-red-500">× Limpar</button>}
          <span className="text-xs text-slate-400 ml-auto">{entries.length} NF(s)</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : entries.length === 0 ? (
        <EmptyState title="Nenhuma entrada registrada" description="Registre a primeira entrada de mercadoria." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada</Button>} />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const expanded = expandedIds.has(entry.id);
            return (
              <div key={entry.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => toggleExpand(entry.id)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">NF {entry.invoiceNumber}</span>
                        <Badge color={entry.program.type === "MERENDA" ? "green" : entry.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                          {PROGRAM_TYPES[entry.program.type as keyof typeof PROGRAM_TYPES]?.label ?? entry.program.type}
                        </Badge>
                        <span className="text-sm text-slate-600">{entry.supplier.name}</span>
                        <span className="text-xs text-slate-400">{formatDate(entry.invoiceDate)}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{entry.items.length} produto(s) &middot; por {entry.user.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="font-bold text-green-700">{formatCurrency(entry.totalValue)}</span>
                    <button onClick={() => requestEdit(entry)} className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Editar (requer senha)">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => requestDelete(entry)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir (requer senha)">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 px-4 pb-3">
                    {entry.observations && <p className="text-xs text-slate-400 italic mt-2 mb-1">Obs: {entry.observations}</p>}
                    <Table>
                      <thead><tr><Th>Produto</Th><Th>Qtd</Th><Th>Vl. Unit.</Th><Th>Total</Th><Th></Th></tr></thead>
                      <tbody>
                        {entry.items.map((item) => (
                          <tr key={item.id} className={item.isExtra ? "hover:bg-amber-50 bg-amber-50/30" : "hover:bg-slate-50"}>
                            <Td>
                              {item.product.name} <span className="text-slate-400">({item.product.unit})</span>
                              {item.isExtra && <span className="ml-2 text-xs font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Extra NF</span>}
                            </Td>
                            <Td>{item.quantity.toFixed(2)} {item.product.unit}</Td>
                            <Td>{formatCurrency(item.unitPrice)}</Td>
                            <Td className={`font-semibold ${item.isExtra ? "text-amber-700" : "text-green-700"}`}>{formatCurrency(item.totalPrice)}</Td>
                            <Td>
                              <button
                                onClick={() => {
                                  setBaixaItem({ productId: item.productId, productName: item.product.name, productUnit: item.product.unit, unitPrice: item.unitPrice, programId: entry.programId });
                                  setBaixaForm({ quantity: "1", reason: "CONSUMO", exitDate: new Date().toISOString().split("T")[0], observations: "", debitBudget: false });
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                                title="Baixa manual"
                              >
                                <ArrowDownToLine className="w-4 h-4" />
                              </button>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    {entry.items.some((i) => i.isExtra) && (
                      <div className="mt-2 flex items-center justify-between text-xs px-1">
                        <span className="text-amber-600 font-medium">Débito Extra NF (financeiro separado)</span>
                        <span className="font-bold text-amber-700">{formatCurrency(entry.items.filter((i) => i.isExtra).reduce((s, i) => s + i.totalPrice, 0))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nova entrada */}
      <Modal open={modal} onClose={() => { setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); setExtraItems([]); setShowExtraSection(false); }} title="Registrar Nota Fiscal Completa" size="xl">
        <div className="space-y-5">
          <div className="bg-slate-50 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dados da Nota Fiscal</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Programa *" value={header.programId} onChange={(e) => setHeader({ ...header, programId: e.target.value })} options={[{ value: "", label: "Selecione o programa" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
              <Select label="Fornecedor *" value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })} options={[{ value: "", label: "Selecione o fornecedor" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Numero da NF (opcional)" value={header.invoiceNumber} onChange={(e) => setHeader({ ...header, invoiceNumber: e.target.value })} placeholder="Deixe vazio para gerar automaticamente" />
              <Input label="Data de Entrada *" type="date" value={header.invoiceDate} onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })} />
              <Input label="Observacoes" value={header.observations} onChange={(e) => setHeader({ ...header, observations: e.target.value })} />
            </div>
          </div>

          {/* Produtos da NF */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Produtos da NF ({items.filter((r) => r.productId).length}/{items.length})</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><Plus className="w-3 h-3" /> Adicionar produto</button>
            </div>
            <div className="grid grid-cols-[2.5fr_1.5fr_2fr_1.2fr_1fr_auto] gap-2 text-xs font-semibold text-slate-400 uppercase px-1 mb-1">
              <span>Produto *</span><span>Qtd *</span><span>Vl. Unit. (R$) *</span><span>Total</span><span>Lote</span><span></span>
            </div>
            <div className="space-y-2">
              {items.map((row, i) => {
                const rowTotal = Number(row.quantity || 0) * Number(row.unitPrice || 0);
                return (
                  <div key={i} className="grid grid-cols-[2.5fr_1.5fr_2fr_1.2fr_1fr_auto] gap-2 items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex gap-1">
                      <select value={row.productId} onChange={(e) => setItemField(i, "productId", e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Selecionar...</option>
                        {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                      <button type="button" onClick={() => { setScanningRowIndex(i); setScanningExtra(false); }} title="Escanear codigo" className="px-2 py-1.5 border border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600"><Barcode className="w-4 h-4" /></button>
                    </div>
                    <input type="number" step="0.001" min="0" value={row.quantity} onChange={(e) => setItemField(i, "quantity", e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full min-w-[80px]" />
                    <input type="number" step="0.01" min="0" value={row.unitPrice} onChange={(e) => setItemField(i, "unitPrice", e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full min-w-[100px]" />
                    <div className="text-sm font-semibold text-green-700 text-right">{formatCurrency(rowTotal)}</div>
                    <input type="text" value={row.lot} placeholder="Lote" onChange={(e) => setItemField(i, "lot", e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-full" />
                    <button onClick={() => removeItem(i)} disabled={items.length === 1} className="text-slate-300 hover:text-red-500 disabled:opacity-20 p-1"><X className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seção Extra NF */}
          {!showExtraSection ? (
            <button
              type="button"
              onClick={() => { setShowExtraSection(true); if (extraItems.length === 0) addExtraItem(); }}
              className="flex items-center gap-2 text-xs text-amber-600 hover:text-amber-800 font-medium border border-dashed border-amber-300 rounded-lg px-3 py-2 w-full justify-center hover:bg-amber-50 transition-colors"
            >
              <PackagePlus className="w-4 h-4" />
              Adicionar produtos extra nota fiscal (entram no estoque com débito financeiro separado)
            </button>
          ) : (
            <div className="border border-amber-200 rounded-xl bg-amber-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PackagePlus className="w-4 h-4 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Produtos Extra NF ({extraItems.filter((r) => r.productId).length})</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={addExtraItem} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"><Plus className="w-3 h-3" /> Adicionar</button>
                  <button onClick={() => { setShowExtraSection(false); setExtraItems([]); }} className="text-xs text-slate-400 hover:text-red-500">× Remover seção</button>
                </div>
              </div>
              <p className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                Produtos entregues <strong>fora da nota fiscal</strong>. Entram no estoque normalmente mas geram um <strong>débito financeiro separado</strong> acoplado a esta NF, afetando a prestação de contas do programa.
              </p>
              <div className="grid grid-cols-[2.5fr_1.5fr_2fr_1.2fr_1fr_auto] gap-2 text-xs font-semibold text-amber-500 uppercase px-1 mb-1">
                <span>Produto *</span><span>Qtd *</span><span>Vl. Unit. (R$) *</span><span>Total</span><span>Lote</span><span></span>
              </div>
              <div className="space-y-2">
                {extraItems.map((row, i) => {
                  const rowTotal = Number(row.quantity || 0) * Number(row.unitPrice || 0);
                  return (
                    <div key={i} className="grid grid-cols-[2.5fr_1.5fr_2fr_1.2fr_1fr_auto] gap-2 items-center bg-white border border-amber-200 rounded-lg px-3 py-2">
                      <div className="flex gap-1">
                        <select value={row.productId} onChange={(e) => setExtraItemField(i, "productId", e.target.value)} className="flex-1 border border-amber-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                          <option value="">Selecionar...</option>
                          {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                        </select>
                        <button type="button" onClick={() => { setScanningRowIndex(i); setScanningExtra(true); }} title="Escanear codigo" className="px-2 py-1.5 border border-amber-200 rounded-lg text-amber-500 hover:border-amber-400 hover:text-amber-700"><Barcode className="w-4 h-4" /></button>
                      </div>
                      <input type="number" step="0.001" min="0" value={row.quantity} onChange={(e) => setExtraItemField(i, "quantity", e.target.value)} className="border border-amber-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 w-full min-w-[80px]" />
                      <input type="number" step="0.01" min="0" value={row.unitPrice} onChange={(e) => setExtraItemField(i, "unitPrice", e.target.value)} className="border border-amber-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 w-full min-w-[100px]" />
                      <div className="text-sm font-semibold text-amber-700 text-right">{formatCurrency(rowTotal)}</div>
                      <input type="text" value={row.lot} placeholder="Lote" onChange={(e) => setExtraItemField(i, "lot", e.target.value)} className="border border-amber-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 w-full" />
                      <button onClick={() => removeExtraItem(i)} disabled={extraItems.length === 1} className="text-slate-300 hover:text-red-500 disabled:opacity-20 p-1"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Totais */}
          {showExtraSection && totalExtra > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div><p className="text-xs text-green-600">Valor da Nota Fiscal (oficial)</p><p className="text-xs text-green-500">{items.filter((r) => r.productId).length} produto(s) validos</p></div>
                <p className="text-xl font-bold text-green-700">{formatCurrency(totalNF)}</p>
              </div>
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div><p className="text-xs text-amber-600">Débito Extra NF (acoplado ao financeiro)</p><p className="text-xs text-amber-500">{extraItems.filter((r) => r.productId).length} produto(s) extra</p></div>
                <p className="text-xl font-bold text-amber-700">+ {formatCurrency(totalExtra)}</p>
              </div>
              <div className="flex items-center justify-between bg-slate-100 border border-slate-300 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-slate-600">Total Financeiro (NF + Extra)</p>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(totalNF + totalExtra)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <div><p className="text-xs text-green-600">Valor total da Nota Fiscal</p><p className="text-xs text-green-500">{items.filter((r) => r.productId).length} produto(s) validos</p></div>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(totalNF)}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => { setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); setExtraItems([]); setShowExtraSection(false); }}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>Registrar NF Completa</Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar entrada */}
      <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title={`Editar NF ${editEntry?.invoiceNumber}`} size="lg">
        {editEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Numero da NF *" value={editMeta.invoiceNumber} onChange={(e) => setEditMeta({ ...editMeta, invoiceNumber: e.target.value })} />
              <Input label="Data de Entrada *" type="date" value={editMeta.invoiceDate} onChange={(e) => setEditMeta({ ...editMeta, invoiceDate: e.target.value })} />
            </div>
            <Input label="Observacoes" value={editMeta.observations} onChange={(e) => setEditMeta({ ...editMeta, observations: e.target.value })} />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Itens</p>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 text-xs text-slate-400 font-semibold uppercase px-1 mb-1">
                <span>Produto</span><span>Qtd *</span><span>Vl. Unit. *</span><span>Total</span>
              </div>
              <div className="space-y-2">
                {editItems.map((row, i) => {
                  const orig = editEntry.items[i];
                  const total = Number(row.quantity || 0) * Number(row.unitPrice || 0);
                  return (
                    <div key={row.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-slate-700">{orig.product.name} <span className="text-slate-400">({orig.product.unit})</span></span>
                      <input type="number" step="0.001" min="0.001" value={row.quantity} onChange={(e) => setEditItems((prev) => prev.map((r, idx) => idx === i ? { ...r, quantity: e.target.value } : r))} className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="number" step="0.01" min="0" value={row.unitPrice} onChange={(e) => setEditItems((prev) => prev.map((r, idx) => idx === i ? { ...r, unitPrice: e.target.value } : r))} className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <span className="text-sm font-semibold text-green-700">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setEditEntry(null)}>Cancelar</Button>
              <Button onClick={handleEditSave} loading={saving}>Salvar Alteracoes</Button>
            </div>
          </div>
        )}
      </Modal>

      {scanningRowIndex !== null && (
        <BarcodeScanner title={`Escanear produto \u2014 linha ${scanningRowIndex + 1}${scanningExtra ? " (Extra NF)" : ""}`} onDetected={(code) => handleBarcodeDetected(code, scanningRowIndex, scanningExtra)} onClose={() => { setScanningRowIndex(null); setScanningExtra(false); }} />
      )}

      {pendingAction && (
        <PasswordConfirmModal
          actionLabel={pendingAction.label}
          onConfirmed={async () => { if (pendingAction) { await pendingAction.fn(); } setPendingAction(null); }}
          onClose={() => setPendingAction(null)}
        />
      )}

      {/* Modal baixa manual */}
      <Modal open={!!baixaItem} onClose={() => setBaixaItem(null)} title={`Baixa Manual — ${baixaItem?.productName ?? ""}`}>
        {baixaItem && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              Registra uma saída de estoque para <strong>{baixaItem.productName}</strong>. Informe a quantidade e o motivo da baixa.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantidade *" type="number" step="0.001" min="0.001" value={baixaForm.quantity} onChange={(e) => setBaixaForm((f) => ({ ...f, quantity: e.target.value }))} />
              <div className="flex flex-col justify-end pb-2 text-sm text-slate-500 gap-1">
                <span>Unidade: <strong className="text-slate-700">{baixaItem.productUnit}</strong></span>
                <span>Vl. Unit.: <strong className="text-slate-700">{formatCurrency(baixaItem.unitPrice)}</strong></span>
              </div>
            </div>
            <Select
              label="Motivo *"
              value={baixaForm.reason}
              onChange={(e) => setBaixaForm((f) => ({ ...f, reason: e.target.value }))}
              options={[
                { value: "CONSUMO", label: "Consumo" },
                { value: "VENCIMENTO", label: "Vencimento" },
                { value: "DOACAO", label: "Doação" },
                { value: "PERDA", label: "Perda" },
                { value: "OUTRO", label: "Outro" },
              ]}
            />
            <Input label="Data da Baixa *" type="date" value={baixaForm.exitDate} onChange={(e) => setBaixaForm((f) => ({ ...f, exitDate: e.target.value }))} />
            <Input label="Observações" value={baixaForm.observations} onChange={(e) => setBaixaForm((f) => ({ ...f, observations: e.target.value }))} placeholder={`Baixa manual — ${baixaItem.productName}`} />
            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={baixaForm.debitBudget}
                onChange={(e) => setBaixaForm((f) => ({ ...f, debitBudget: e.target.checked }))}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-slate-700">Também debitar do orçamento do programa</span>
            </label>
            {baixaForm.debitBudget && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                Valor a debitar: <strong>{formatCurrency(Number(baixaForm.quantity) * baixaItem.unitPrice)}</strong>
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setBaixaItem(null)}>Cancelar</Button>
              <Button onClick={handleBaixaManual} loading={saving}>Confirmar Baixa</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
