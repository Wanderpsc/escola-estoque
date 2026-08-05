"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, EXIT_REASONS } from "@/lib/utils";
import PasswordConfirmModal from "@/components/PasswordConfirmModal";

interface ExitItem { id: string; quantity: number; unitPrice: number; totalPrice: number; product: { name: string; unit: string } }
interface Exit {
  id: string; exitDate: string; reason: string; observations?: string; isExtra?: boolean;
  program: { name: string; type: string }; user: { name: string };
  items: ExitItem[];
}

const EMPTY_FORM = {
  programId: "", productId: "", quantity: 1, unitPrice: 0,
  exitDate: new Date().toISOString().split("T")[0],
  reason: "CONSUMO", observations: "",
  isExtra: false,
  nfEntryId: "",
};

export default function StockExitsPage() {
  const [exits, setExits] = useState<Exit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editExit, setEditExit] = useState<Exit | null>(null);
  const [editMeta, setEditMeta] = useState({ exitDate: "", reason: "CONSUMO", observations: "" });
  const [editItems, setEditItems] = useState<Array<{ id: string; quantity: string; unitPrice: string }>>([]);
  const [pendingAction, setPendingAction] = useState<{ label: string; fn: () => void } | null>(null);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]); 
  const [entries, setEntries] = useState<Array<{ id: string; invoiceNumber: string; invoiceDate: string; totalValue: number; programId: string; supplier: { name: string } }>>([]); 
  const [balance, setBalance] = useState<Array<{ id: string; name: string; unit: string; balance: number; avgPrice: number; programId?: string; program: { type: string } }>>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, prRes, bRes, enRes] = await Promise.all([
      fetch("/api/stock/exits"), fetch("/api/programs"), fetch("/api/stock/balance"), fetch("/api/stock/entries"),
    ]);
    if (eRes.ok) setExits(await eRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (bRes.ok) setBalance(await bRes.json());
    if (enRes.ok) setEntries(await enRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedProgramType = programs.find((p) => p.id === form.programId)?.type;
  const filteredBalance = balance.filter((p) => {
    if (!form.programId) return true;
    return selectedProgramType && p.program?.type === selectedProgramType;
  }).filter((p) => form.isExtra || p.balance > 0); // extra: mostra todos os produtos mesmo sem saldo

  const selectedProduct = balance.find((p) => p.id === form.productId);
  const totalValue = Number(form.quantity) * Number(form.unitPrice);

  function handleProductChange(productId: string) {
    const prod = balance.find((p) => p.id === productId);
    setForm((f) => ({ ...f, productId, unitPrice: prod?.avgPrice ?? 0 }));
  }

  async function handleSave() {
    if (!form.programId || !form.productId || !form.exitDate) {
      toast.error("Preencha todos os campos obrigatórios (*)"); return;
    }
    if (Number(form.quantity) <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }
    if (!form.isExtra && selectedProduct && Number(form.quantity) > selectedProduct.balance) {
      toast.error(`Saldo insuficiente. Disponível: ${selectedProduct.balance.toFixed(2)} ${selectedProduct.unit}`); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/exits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: form.programId,
          exitDate: form.exitDate,
          reason: form.reason,
          observations: form.isExtra && form.nfEntryId
            ? `[NF Ref.: ${entries.find(e => e.id === form.nfEntryId)?.invoiceNumber ?? form.nfEntryId}] ${form.observations}`.trim()
            : form.observations,
          isExtra: form.isExtra,
          items: [{ productId: form.productId, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice) }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? data.message ?? "Erro ao registrar saida"); return; }
      toast.success(form.isExtra ? "Saída Extra registrada! Débito financeiro criado automaticamente." : "Saida registrada!");
      setModal(false);
      setForm(EMPTY_FORM);
      load();
    } finally { setSaving(false); }
  }

  const flatItems = exits.flatMap((e) =>
    e.items.map((item) => ({
      exitDate: e.exitDate,
      reason: e.reason,
      user: e.user.name,
      program: e.program,
      product: item.product.name,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      observations: e.observations,
    }))
  );

  const reasonLabels: Record<string, string> = {
    CONSUMO: "Consumo", VENCIMENTO: "Vencimento", DOACAO: "Doacao", PERDA: "Perda", OUTRO: "Outro",
  };

  function toggleExpand(id: string) {
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function requestEdit(exit: Exit) {
    setPendingAction({
      label: `editar a saida de ${new Date(exit.exitDate).toLocaleDateString("pt-BR")}`,
      fn: () => {
        setEditExit(exit);
        setEditMeta({ exitDate: exit.exitDate.split("T")[0], reason: exit.reason, observations: exit.observations ?? "" });
        setEditItems(exit.items.map((i) => ({ id: i.id, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })));
      },
    });
  }

  function requestDelete(exit: Exit) {
    setPendingAction({
      label: `excluir a saida de ${new Date(exit.exitDate).toLocaleDateString("pt-BR")}`,
      fn: async () => {
        const res = await fetch(`/api/stock/exits/${exit.id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Saida excluida! Saldo de estoque atualizado."); load(); }
        else { const d = await res.json(); toast.error(d.error ?? "Erro ao excluir"); }
      },
    });
  }

  async function handleEditSave() {
    if (!editExit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stock/exits/${editExit.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitDate: editMeta.exitDate, reason: editMeta.reason, observations: editMeta.observations, items: editItems.map((i) => ({ id: i.id, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })) }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Erro ao editar"); return; }
      toast.success("Saida atualizada!"); setEditExit(null); load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Saidas de Estoque" description="Registre saidas e consumo de produtos por programa">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Saida</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : flatItems.length === 0 ? (
        <EmptyState title="Nenhuma saida registrada" description="Registre a primeira saida de mercadoria." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Saida</Button>} />
      ) : (
        <div className="space-y-2">
          {exits.map((exit) => {
            const expanded = expandedIds.has(exit.id);
            return (
              <div key={exit.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => toggleExpand(exit.id)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={exit.program.type === "MERENDA" ? "green" : exit.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                          {PROGRAM_TYPES[exit.program.type as keyof typeof PROGRAM_TYPES]?.label ?? exit.program.type}
                        </Badge>
                        <Badge color="slate">{reasonLabels[exit.reason] ?? exit.reason}</Badge>
                        {exit.isExtra && <Badge color="orange">Extra</Badge>}
                        <span className="text-xs text-slate-400">{formatDate(exit.exitDate)}</span>
                        <span className="text-xs text-slate-400">por {exit.user.name}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{exit.items.length} produto(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="font-bold text-red-600">
                      {formatCurrency(exit.items.reduce((s, i) => s + i.totalPrice, 0))}
                    </span>
                    <button onClick={() => requestEdit(exit)} className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Editar (requer senha)"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => requestDelete(exit)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir (requer senha)"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 px-4 pb-3">
                    {exit.observations && <p className="text-xs text-slate-400 italic mt-2 mb-1">Obs: {exit.observations}</p>}
                    <Table>
                      <thead><tr><Th>Produto</Th><Th>Qtd</Th><Th>Vl. Unit.</Th><Th>Total</Th></tr></thead>
                      <tbody>
                        {exit.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <Td>{item.product.name} <span className="text-slate-400">({item.product.unit})</span></Td>
                            <Td>{item.quantity.toFixed(2)} {item.product.unit}</Td>
                            <Td>{formatCurrency(item.unitPrice)}</Td>
                            <Td className="font-semibold text-red-600">{formatCurrency(item.totalPrice)}</Td>
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

      <Modal open={modal} onClose={() => { setModal(false); setForm(EMPTY_FORM); }} title="Registrar Saida de Produto" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Programa *" value={form.programId}
              onChange={(e) => setForm({ ...form, programId: e.target.value, productId: "", unitPrice: 0 })}
              options={[{ value: "", label: "— Selecione o programa —" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select label="Produto *" value={form.productId}
              onChange={(e) => handleProductChange(e.target.value)}
              options={[
                { value: "", label: form.programId ? "— Selecione o produto —" : "Selecione o programa primeiro" },
                ...filteredBalance.map((p) => ({ value: p.id, label: `${p.name} (saldo: ${p.balance.toFixed(2)} ${p.unit})` })),
              ]} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Input label="Quantidade *" type="number" min={0.01} step={0.01} value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              {selectedProduct && (
                <p className="text-xs text-slate-400 mt-1">Saldo disponivel: <strong>{selectedProduct.balance.toFixed(2)} {selectedProduct.unit}</strong></p>
              )}
            </div>
            <Input label="Valor Unitario (R$)" type="number" min={0} step={0.01} value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor Total (auto)</label>
              <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 font-bold text-sm">{formatCurrency(totalValue)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data da Saida *" type="date" value={form.exitDate}
              onChange={(e) => setForm({ ...form, exitDate: e.target.value })} />
            <Select label="Motivo *" value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              options={Object.entries(EXIT_REASONS).map(([v, l]) => ({ value: v, label: l }))} />
          </div>
          <Input label="Observacoes" value={form.observations}
            onChange={(e) => setForm({ ...form, observations: e.target.value })}
            placeholder="Destino, turma atendida, responsavel, etc." />
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${form.isExtra ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300 text-orange-500"
              checked={form.isExtra}
              onChange={(e) => setForm({ ...form, isExtra: e.target.checked, nfEntryId: "" })}
            />
            <div>
              <p className="text-sm font-semibold text-slate-700">Saída Extra <span className="font-normal text-orange-600">(produto sem NF)</span></p>
              <p className="text-xs text-slate-400 leading-tight">Marca a saída como extra e cria automaticamente um débito no orçamento do programa.</p>
            </div>
          </label>
          {form.isExtra && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                NF de Referência <span className="text-slate-400">(opcional — nota fiscal cujo recurso foi utilizado)</span>
              </label>
              <select
                value={form.nfEntryId}
                onChange={(e) => setForm({ ...form, nfEntryId: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">— Nenhuma (apenas debita o orçamento) —</option>
                {entries
                  .filter(e => !form.programId || e.programId === form.programId)
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      NF {e.invoiceNumber} — {e.supplier.name} — {new Date(e.invoiceDate).toLocaleDateString("pt-BR")}
                    </option>
                  ))
                }
              </select>
              {form.nfEntryId && (
                <p className="text-xs text-orange-600 mt-1">
                  O valor extra será debitado do orçamento do programa vinculado a essa NF.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => { setModal(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Registrar Saida</Button>
        </div>
      </Modal>

      {/* Modal editar saida */}
      <Modal open={!!editExit} onClose={() => setEditExit(null)} title="Editar Saida de Estoque" size="lg">
        {editExit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Data da Saida *" type="date" value={editMeta.exitDate} onChange={(e) => setEditMeta({ ...editMeta, exitDate: e.target.value })} />
              <Select label="Motivo *" value={editMeta.reason} onChange={(e) => setEditMeta({ ...editMeta, reason: e.target.value })} options={Object.entries(EXIT_REASONS).map(([v, l]) => ({ value: v, label: l }))} />
            </div>
            <Input label="Observacoes" value={editMeta.observations} onChange={(e) => setEditMeta({ ...editMeta, observations: e.target.value })} />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Itens</p>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 text-xs text-slate-400 font-semibold uppercase px-1 mb-1">
                <span>Produto</span><span>Qtd *</span><span>Vl. Unit. *</span><span>Total</span>
              </div>
              <div className="space-y-2">
                {editItems.map((row, i) => {
                  const orig = editExit.items[i];
                  const total = Number(row.quantity || 0) * Number(row.unitPrice || 0);
                  return (
                    <div key={row.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-slate-700">{orig.product.name} <span className="text-slate-400">({orig.product.unit})</span></span>
                      <input type="number" step="0.001" min="0.001" value={row.quantity} onChange={(e) => setEditItems((prev) => prev.map((r, idx) => idx === i ? { ...r, quantity: e.target.value } : r))} className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="number" step="0.01" min="0" value={row.unitPrice} onChange={(e) => setEditItems((prev) => prev.map((r, idx) => idx === i ? { ...r, unitPrice: e.target.value } : r))} className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setEditExit(null)}>Cancelar</Button>
              <Button onClick={handleEditSave} loading={saving}>Salvar Alteracoes</Button>
            </div>
          </div>
        )}
      </Modal>

      {pendingAction && (
        <PasswordConfirmModal
          actionLabel={pendingAction.label}
          onConfirmed={async () => { if (pendingAction) { await pendingAction.fn(); } setPendingAction(null); }}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
