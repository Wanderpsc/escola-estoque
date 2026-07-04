"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, ArrowDownLeft, Trash2 } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Select, Textarea, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, EXIT_REASONS } from "@/lib/utils";

interface ExitItem { productId: string; productName: string; unit: string; quantity: number; unitPrice: number; balance: number }
interface Exit {
  id: string; exitDate: string; reason: string; observations?: string;
  program: { name: string; type: string }; user: { name: string };
  items: Array<{ product: { name: string; unit: string }; quantity: number; unitPrice: number; totalPrice: number }>;
}

export default function StockExitsPage() {
  const [exits, setExits] = useState<Exit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [balance, setBalance] = useState<Array<{ id: string; name: string; unit: string; balance: number; avgPrice: number; programId?: string; program: { type: string } }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({ exitDate: new Date().toISOString().split("T")[0], reason: "CONSUMO", programId: "", observations: "" });
  const [items, setItems] = useState<ExitItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, prRes, bRes] = await Promise.all([fetch("/api/stock/exits"), fetch("/api/programs"), fetch("/api/stock/balance")]);
    if (eRes.ok) setExits(await eRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (bRes.ok) setBalance(await bRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredBalance = balance.filter((p) => {
    if (!form.programId) return true;
    const prog = programs.find((pr) => pr.id === form.programId);
    return prog && p.program?.type === prog?.type;
  });

  function addItem() {
    setItems([...items, { productId: "", productName: "", unit: "", quantity: 1, unitPrice: 0, balance: 0 }]);
  }

  function updateItem(idx: number, field: keyof ExitItem, value: string | number) {
    const next = [...items];
    (next[idx] as any)[field] = value;
    if (field === "productId") {
      const prod = balance.find((p) => p.id === value);
      if (prod) {
        next[idx].productName = prod.name;
        next[idx].unit = prod.unit;
        next[idx].unitPrice = prod.avgPrice;
        next[idx].balance = prod.balance;
      }
    }
    setItems(next);
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  async function handleSave() {
    if (items.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    if (!form.programId || !form.exitDate) { toast.error("Preencha todos os campos obrigatórios"); return; }
    for (const item of items) {
      if (!item.productId) { toast.error("Selecione o produto para todos os itens"); return; }
      if (item.quantity > item.balance) { toast.error(`Quantidade maior que saldo para "${item.productName}"`); return; }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/exits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))
        })
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao registrar saída"); return; }
      toast.success("Saída registrada!");
      setModal(false); setItems([]); setForm({ exitDate: new Date().toISOString().split("T")[0], reason: "CONSUMO", programId: "", observations: "" });
      load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Saídas de Estoque" description="Registre saídas/consumo de mercadorias">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Registrar Saída</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : exits.length === 0 ? (
        <EmptyState title="Nenhuma saída registrada" description="Registre a primeira saída de mercadoria." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Registrar Saída</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Programa</Th>
                <Th>Motivo</Th>
                <Th>Itens</Th>
                <Th>Valor Total</Th>
                <Th>Usuário</Th>
              </tr>
            </thead>
            <tbody>
              {exits.map((e) => (
                <>
                  <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    <Td><span className="font-medium">{formatDate(e.exitDate)}</span></Td>
                    <Td>
                      <Badge color={e.program.type === "MERENDA" ? "green" : e.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                        {PROGRAM_TYPES[e.program.type as keyof typeof PROGRAM_TYPES]?.label ?? e.program.type}
                      </Badge>
                    </Td>
                    <Td><Badge color="slate">{EXIT_REASONS[e.reason as keyof typeof EXIT_REASONS] ?? e.reason}</Badge></Td>
                    <Td>{e.items.length} item(s)</Td>
                    <Td className="font-semibold text-red-600">{formatCurrency(e.items.reduce((s, i) => s + i.totalPrice, 0))}</Td>
                    <Td className="text-slate-400 text-xs">{e.user.name}</Td>
                  </tr>
                  {expandedId === e.id && (
                    <tr key={`${e.id}-exp`}>
                      <td colSpan={6} className="bg-slate-50 px-6 py-3">
                        <div className="space-y-1">
                          {e.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100">
                              <span className="font-medium">{item.product.name}</span>
                              <span>{item.quantity} {item.product.unit} = <strong>{formatCurrency(item.totalPrice)}</strong></span>
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

      <Modal open={modal} onClose={() => setModal(false)} title="Registrar Saída de Estoque" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data *</label>
              <input type="date" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <Select label="Motivo *" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              options={Object.entries(EXIT_REASONS).map(([v, l]) => ({ value: v, label: l }))} />
            <Select label="Programa *" value={form.programId} onChange={(e) => { setForm({ ...form, programId: e.target.value }); setItems([]); }}
              options={[{ value: "", label: "— Selecione —" }, ...programs.map((p) => ({ value: p.id, label: `${p.name} (${PROGRAM_TYPES[p.type as keyof typeof PROGRAM_TYPES]?.label ?? p.type})` }))]} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Itens</p>
              <Button size="sm" variant="secondary" onClick={addItem} disabled={!form.programId}><Plus className="w-3.5 h-3.5" />Adicionar Item</Button>
            </div>

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-400 text-sm">
                {form.programId ? "Clique em 'Adicionar Item'" : "Selecione o programa primeiro"}
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
                        {filteredBalance.filter((p) => p.balance > 0).map((p) => (
                          <option key={p.id} value={p.id}>{p.name} (Saldo: {p.balance.toFixed(2)} {p.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Qtd *</label>
                      <input type="number" min={0.01} step={0.01} max={item.balance} value={item.quantity}
                        onChange={(e) => updateItem(i, "quantity", e.target.value)}
                        className={`w-full px-2 py-1.5 border rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${Number(item.quantity) > item.balance ? "border-red-400 text-red-700" : "border-slate-300 text-slate-800"}`} />
                      {item.balance > 0 && <p className="text-xs text-slate-400">Máx: {item.balance.toFixed(2)}</p>}
                    </div>
                    <div className="w-28 text-right">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Total</label>
                      <p className="text-sm font-semibold text-red-600 py-1.5">{formatCurrency(item.quantity * item.unitPrice)}</p>
                    </div>
                    <button onClick={() => removeItem(i)} className="p-1.5 text-red-400 hover:bg-red-50 rounded mb-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <p className="text-sm font-bold text-slate-800">Total da Saída: <span className="text-red-600">{formatCurrency(totalValue)}</span></p>
                </div>
              </div>
            )}
          </div>

          <Textarea label="Observações" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Registrar Saída</Button>
        </div>
      </Modal>
    </div>
  );
}
