"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, FileText, Trash2 } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, Textarea, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, UNITS } from "@/lib/utils";

interface EntryItem { productId: string; productName: string; unit: string; quantity: number; unitPrice: number }
interface Entry {
  id: string; invoiceNumber: string; invoiceSeries?: string; invoiceKey?: string;
  invoiceDate: string; totalValue: number; observations?: string;
  supplier: { name: string }; program: { name: string; type: string }; user: { name: string };
  items: Array<{ product: { name: string; unit: string }; quantity: number; unitPrice: number; totalPrice: number; lot?: string }>;
}

export default function StockEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit: string; programId: string }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  const [form, setForm] = useState({
    invoiceNumber: "", invoiceSeries: "", invoiceKey: "", invoiceDate: "",
    supplierId: "", programId: "", observations: ""
  });
  const [items, setItems] = useState<EntryItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, sRes, prRes, pdRes] = await Promise.all([
      fetch("/api/stock/entries"), fetch("/api/suppliers"),
      fetch("/api/programs"), fetch("/api/products")
    ]);
    if (eRes.ok) setEntries(await eRes.json());
    if (sRes.ok) setSuppliers(await sRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (pdRes.ok) setProducts(await pdRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredProducts = products.filter((p) => !form.programId || p.programId === form.programId);

  function addItem() {
    setItems([...items, { productId: "", productName: "", unit: "", quantity: 1, unitPrice: 0 }]);
  }

  function updateItem(idx: number, field: keyof EntryItem, value: string | number) {
    const next = [...items];
    (next[idx] as any)[field] = value;
    if (field === "productId") {
      const prod = products.find((p) => p.id === value);
      if (prod) { next[idx].productName = prod.name; next[idx].unit = prod.unit; }
    }
    setItems(next);
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  async function handleSave() {
    if (items.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    if (!form.invoiceNumber || !form.supplierId || !form.programId || !form.invoiceDate) {
      toast.error("Preencha todos os campos obrigatórios"); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))
        })
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar entrada"); return; }
      toast.success("Entrada registrada com sucesso!");
      setModal(false); setItems([]); setForm({ invoiceNumber: "", invoiceSeries: "", invoiceKey: "", invoiceDate: "", supplierId: "", programId: "", observations: "" });
      load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Entradas de Estoque" description="Registre entradas de mercadoria por Nota Fiscal">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada (NF)</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : entries.length === 0 ? (
        <EmptyState title="Nenhuma entrada registrada" description="Registre a primeira entrada de mercadoria." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Nota Fiscal</Th>
                <Th>Data</Th>
                <Th>Fornecedor</Th>
                <Th>Programa</Th>
                <Th>Itens</Th>
                <Th>Valor Total</Th>
                <Th>Usuário</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <>
                  <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">NF {e.invoiceNumber}{e.invoiceSeries ? `-${e.invoiceSeries}` : ""}</p>
                          {e.invoiceKey && <p className="text-xs text-slate-400 font-mono truncate max-w-32">{e.invoiceKey}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td>{formatDate(e.invoiceDate)}</Td>
                    <Td className="font-medium">{e.supplier.name}</Td>
                    <Td>
                      <Badge color={e.program.type === "MERENDA" ? "green" : e.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                        {PROGRAM_TYPES[e.program.type as keyof typeof PROGRAM_TYPES]?.label ?? e.program.type}
                      </Badge>
                    </Td>
                    <Td>{e.items.length} item(s)</Td>
                    <Td className="font-semibold text-green-700">{formatCurrency(e.totalValue)}</Td>
                    <Td className="text-slate-400 text-xs">{e.user.name}</Td>
                  </tr>
                  {expandedId === e.id && (
                    <tr key={`${e.id}-exp`}>
                      <td colSpan={7} className="bg-slate-50 px-6 py-3">
                        <p className="text-xs font-semibold text-slate-500 mb-2">ITENS DA NOTA:</p>
                        <div className="space-y-1">
                          {e.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100">
                              <span className="font-medium">{item.product.name}</span>
                              <span>{item.quantity} {item.product.unit} × {formatCurrency(item.unitPrice)} = <strong>{formatCurrency(item.totalPrice)}</strong></span>
                            </div>
                          ))}
                        </div>
                        {e.observations && <p className="mt-2 text-xs text-slate-400">Obs: {e.observations}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Modal de Nova Entrada */}
      <Modal open={modal} onClose={() => setModal(false)} title="Registrar Entrada de Mercadoria (NF)" size="xl">
        <div className="space-y-5">
          {/* Dados da NF */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Dados da Nota Fiscal</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Número da NF *" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="000001" />
              <Input label="Série" value={form.invoiceSeries} onChange={(e) => setForm({ ...form, invoiceSeries: e.target.value })} placeholder="001" />
              <Input label="Data da NF *" type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div className="mt-3">
              <Input label="Chave de Acesso NF-e (44 dígitos)" value={form.invoiceKey} onChange={(e) => setForm({ ...form, invoiceKey: e.target.value.replace(/\D/g, "").slice(0, 44) })} placeholder="00000000000000000000000000000000000000000000" hint="Código de barras da NF eletrônica (opcional)" />
            </div>
          </div>

          {/* Fornecedor e Programa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Fornecedor *" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              options={[{ value: "", label: "— Selecione —" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            <Select label="Programa *" value={form.programId} onChange={(e) => { setForm({ ...form, programId: e.target.value }); setItems([]); }}
              options={[{ value: "", label: "— Selecione —" }, ...programs.map((p) => ({ value: p.id, label: `${p.name} (${PROGRAM_TYPES[p.type as keyof typeof PROGRAM_TYPES]?.label ?? p.type})` }))]} />
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Itens da Nota</p>
              <Button size="sm" variant="secondary" onClick={addItem} disabled={!form.programId}><Plus className="w-3.5 h-3.5" />Adicionar Item</Button>
            </div>

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-400 text-sm">
                {form.programId ? "Clique em 'Adicionar Item' para inserir produtos" : "Selecione o programa primeiro"}
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-end gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Produto *</label>
                      <select value={item.productId} onChange={(e) => updateItem(i, "productId", e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">— Selecione —</option>
                        {filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Qtd *</label>
                      <input type="number" min={0.01} step={0.01} value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Preço Unit. *</label>
                      <input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="w-28 text-right">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Total</label>
                      <p className="text-sm font-semibold text-slate-700 py-1.5">{formatCurrency(item.quantity * item.unitPrice)}</p>
                    </div>
                    <button onClick={() => removeItem(i)} className="p-1.5 text-red-400 hover:bg-red-50 rounded mb-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <p className="text-sm font-bold text-slate-800">Total da NF: <span className="text-green-700">{formatCurrency(totalValue)}</span></p>
                </div>
              </div>
            )}
          </div>

          <Textarea label="Observações" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Observações sobre a entrega, condições, etc." />
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Registrar Entrada</Button>
        </div>
      </Modal>
    </div>
  );
}
