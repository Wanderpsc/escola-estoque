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
  programId: "",
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
  const [entries, setEntries] = useState<Array<{ id: string; invoiceNumber: string; invoiceSeries?: string; invoiceDate: string; totalValue: number; programId: string; supplier: { name: string }; program: { name: string; type: string }; items: { productId: string; quantity: number; unitPrice: number }[] }>>([]); 
  const [balance, setBalance] = useState<Array<{ id: string; name: string; unit: string; balance: number; avgPrice: number; programId?: string; program: { type: string } }>>([]); 
  const [form, setForm] = useState(EMPTY_FORM);
  const [exitRows, setExitRows] = useState<Record<string, { qty: string; price: string }>>({});
  const [programSearch, setProgramSearch] = useState("");

  // List-level filter (separate from the form's programId)
  const [listFilterProgramId, setListFilterProgramId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, prRes, bRes, enRes] = await Promise.all([
      fetch(listFilterProgramId ? `/api/stock/exits?programId=${listFilterProgramId}` : "/api/stock/exits"),
      fetch("/api/programs"), fetch("/api/stock/balance"), fetch("/api/stock/entries"),
    ]);
    if (eRes.ok) setExits(await eRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (bRes.ok) setBalance(await bRes.json());
    if (enRes.ok) setEntries(await enRes.json());
    setLoading(false);
  }, [listFilterProgramId]);

  useEffect(() => { load(); }, [load]);

  // Populate exit rows when program changes — uses NF items of the parcel when available
  useEffect(() => {
    if (!form.programId) { setExitRows({}); return; }
    const parcelaEntryItems = entries
      .filter((e) => e.programId === form.programId)
      .flatMap((e) => e.items ?? []);
    if (parcelaEntryItems.length > 0) {
      const priceMap = new Map<string, { total: number; qty: number }>();
      parcelaEntryItems.forEach((i) => {
        const ex = priceMap.get(i.productId);
        if (ex) { ex.total += i.unitPrice * i.quantity; ex.qty += i.quantity; }
        else priceMap.set(i.productId, { total: i.unitPrice * i.quantity, qty: i.quantity });
      });
      const rows: Record<string, { qty: string; price: string }> = {};
      priceMap.forEach(({ total, qty }, productId) => {
        rows[productId] = { qty: "", price: (total / qty).toFixed(2) };
      });
      setExitRows(rows);
    } else {
      const prog = programs.find((p) => p.id === form.programId);
      if (!prog) { setExitRows({}); return; }
      const rows: Record<string, { qty: string; price: string }> = {};
      balance
        .filter((p) => !p.programId || p.program?.type === prog.type)
        .forEach((p) => { rows[p.id] = { qty: "", price: (p.avgPrice ?? 0).toFixed(2) }; });
      setExitRows(rows);
    }
  }, [form.programId, balance, programs, entries]);

  const selectedProgramType = programs.find((p) => p.id === form.programId)?.type;

  // Aggregate NF items of selected parcel for filtering and reference column
  const parcelaItems = entries
    .filter((e) => e.programId === form.programId)
    .flatMap((e) => e.items ?? []);
  const parcelaProductIds = new Set(parcelaItems.map((i) => i.productId));
  const parcelaItemsMap = new Map<string, { totalQty: number }>();
  parcelaItems.forEach((i) => {
    const ex = parcelaItemsMap.get(i.productId);
    if (ex) ex.totalQty += i.quantity;
    else parcelaItemsMap.set(i.productId, { totalQty: i.quantity });
  });

  const filteredBalance = balance.filter((p) => {
    if (!form.programId) return true;
    // When parcel has NF items, show only those products
    if (parcelaProductIds.size > 0) return parcelaProductIds.has(p.id);
    return selectedProgramType && (p.program?.type === selectedProgramType || !p.programId);
  });

  // Build searchable index: programId → NF numbers and supplier names
  const programSearchTerms = new Map<string, Set<string>>();
  entries.forEach((e) => {
    if (!programSearchTerms.has(e.programId)) programSearchTerms.set(e.programId, new Set());
    const terms = programSearchTerms.get(e.programId)!;
    terms.add(e.invoiceNumber.toLowerCase());
    terms.add(e.supplier.name.toLowerCase());
  });
  const filteredPrograms = programs.filter((p) => {
    if (!programSearch) return true;
    const s = programSearch.toLowerCase();
    if (p.name.toLowerCase().includes(s)) return true;
    return [...(programSearchTerms.get(p.id) ?? [])].some((t) => t.includes(s));
  });

  async function handleSave() {
    if (!form.programId || !form.exitDate) {
      toast.error("Preencha todos os campos obrigatórios (*)"); return;
    }
    const validRows = Object.entries(exitRows).filter(([, r]) => Number(r.qty) > 0);
    if (validRows.length === 0) { toast.error("Informe a quantidade de ao menos um produto"); return; }

    const items = validRows.map(([productId, r]) => ({
      productId, quantity: Number(r.qty), unitPrice: Number(r.price),
    }));

    const deficitItems = items.filter(({ productId, quantity }) => {
      const prod = balance.find((p) => p.id === productId);
      return !form.isExtra && prod && quantity > prod.balance;
    });

    let obs = form.observations;
    if (deficitItems.length > 0) {
      const desc = deficitItems.map(({ productId, quantity }) => {
        const prod = balance.find((p) => p.id === productId);
        return `${prod?.name}: déficit ${(quantity - (prod?.balance ?? 0)).toFixed(2)} ${prod?.unit ?? ""}`;
      }).join("; ");
      obs = `[RESSALVA: saldo insuficiente — ${desc}]${obs ? " " + obs : ""}`;
    }
    if (form.isExtra && form.nfEntryId) {
      const nf = entries.find((e) => e.id === form.nfEntryId);
      const parcela = nf?.invoiceSeries ? ` · Parcela ${nf.invoiceSeries}` : "";
      const ref = nf ? `NF ${nf.invoiceNumber} — ${nf.program.name}${parcela}` : form.nfEntryId;
      obs = `[NF Ref.: ${ref}] ${obs}`.trim();
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
          observations: obs || undefined,
          isExtra: form.isExtra,
          forceRegister: deficitItems.length > 0,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? data.message ?? "Erro ao registrar saida"); return; }
      toast.success(
        form.isExtra ? "Saída Extra registrada! Débito financeiro criado automaticamente."
        : deficitItems.length > 0 ? `${items.length} produto(s) registrados com ressalva de saldo insuficiente.`
        : `${items.length} produto(s) registrados com sucesso!`
      );
      setModal(false);
      setForm(EMPTY_FORM);
      setExitRows({});
      setProgramSearch("");
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

      {programs.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Programa:</span>
          <select value={listFilterProgramId} onChange={(e) => setListFilterProgramId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">Todos</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {listFilterProgramId && <button onClick={() => setListFilterProgramId("")} className="text-xs text-slate-400 hover:text-red-500">× Limpar</button>}
          <span className="text-xs text-slate-400 ml-auto">{exits.length} saída(s)</span>
        </div>
      )}

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
                      <p className="text-xs text-slate-400 mt-0.5">
                        {exit.items.length === 1
                          ? exit.items[0].product.name
                          : `${exit.items[0].product.name} +${exit.items.length - 1} outro(s)`}
                      </p>
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

      <Modal open={modal} onClose={() => { setModal(false); setForm(EMPTY_FORM); setExitRows({}); setProgramSearch(""); }} title="Registrar Saídas de Estoque" size="xl">
        <div className="space-y-4">
          {/* Busca + Seleção de programa */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Buscar Programa / Parcela *</label>
            <input
              type="text"
              value={programSearch}
              onChange={(e) => setProgramSearch(e.target.value)}
              placeholder="Digite nome da parcela, nº da NF ou nome do fornecedor..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <select
              value={form.programId}
              onChange={(e) => setForm({ ...form, programId: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Selecione o programa / parcela —</option>
              {filteredPrograms.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {programSearch && filteredPrograms.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Nenhum programa encontrado para &quot;{programSearch}&quot;</p>
            )}
          </div>

          {form.programId && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Input label="Data da Saída *" type="date" value={form.exitDate}
                  onChange={(e) => setForm({ ...form, exitDate: e.target.value })} />
                <Select label="Motivo *" value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  options={Object.entries(EXIT_REASONS).map(([v, l]) => ({ value: v, label: l }))} />
                <Input label="Observações" value={form.observations}
                  onChange={(e) => setForm({ ...form, observations: e.target.value })}
                  placeholder="Destino, turma, responsável..." />
              </div>

              {/* Tabela de produtos */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Produtos em Estoque — {programs.find((p) => p.id === form.programId)?.name}
                  <span className="text-slate-400 font-normal ml-2">Preencha a quantidade dos produtos a baixar</span>
                </p>
                {filteredBalance.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4 border border-slate-200 rounded-xl">Nenhum produto em estoque para este programa.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[2fr_0.7fr_0.7fr_0.9fr_0.8fr_0.7fr] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                      <span>Produto</span>
                      <span className="text-right text-green-700">Na NF</span>
                      <span className="text-right">Saldo</span>
                      <span className="text-right text-red-600">Qtd Saída</span>
                      <span className="text-right">Vl. Unit.</span>
                      <span className="text-right">Total</span>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {filteredBalance.map((p) => {
                        const row = exitRows[p.id] ?? { qty: "", price: (p.avgPrice ?? 0).toFixed(2) };
                        const qty = Number(row.qty) || 0;
                        const price = Number(row.price) || 0;
                        const rowTotal = qty * price;
                        const isDeficit = qty > 0 && qty > p.balance;
                        return (
                          <div key={p.id} className={`grid grid-cols-[2fr_0.7fr_0.7fr_0.9fr_0.8fr_0.7fr] gap-0 px-3 py-2 items-center ${isDeficit ? "bg-red-50" : ""}`}>
                            <div>
                              <p className="text-sm font-medium text-slate-700">{p.name}</p>
                              <p className="text-xs text-slate-400">{p.unit}</p>
                            </div>
                            <div className="text-right text-xs font-semibold text-green-700">
                              {parcelaItemsMap.get(p.id)?.totalQty.toFixed(2) ?? "—"}
                            </div>
                            <div className={`text-right text-sm font-semibold ${p.balance <= 0 ? "text-red-500" : "text-slate-600"}`}>
                              {p.balance.toFixed(2)}
                            </div>
                            <div className="flex justify-end">
                              <input
                                type="number" min={0} step="0.001"
                                value={row.qty}
                                onChange={(e) => setExitRows((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { price: (p.avgPrice ?? 0).toFixed(2) }), qty: e.target.value } }))}
                                placeholder="0"
                                className={`w-24 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${isDeficit ? "border-red-400 focus:ring-red-400 bg-red-50" : "border-slate-300 focus:ring-blue-500"}`}
                              />
                            </div>
                            <div className="flex justify-end">
                              <input
                                type="number" min={0} step="0.01"
                                value={row.price}
                                onChange={(e) => setExitRows((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { qty: "" }), price: e.target.value } }))}
                                className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className={`text-right text-sm font-semibold ${rowTotal > 0 ? "text-red-600" : "text-slate-300"}`}>
                              {rowTotal > 0 ? formatCurrency(rowTotal) : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {Object.entries(exitRows).some(([pid, r]) => {
                  const prod = balance.find((p) => p.id === pid);
                  return Number(r.qty) > 0 && prod && Number(r.qty) > prod.balance;
                }) && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    ⚠️ Um ou mais produtos terão <strong>saldo insuficiente</strong>. A saída será registrada com ressalva nas observações.
                  </div>
                )}
              </div>

              {/* isExtra toggle */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${form.isExtra ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-orange-500"
                  checked={form.isExtra}
                  onChange={(e) => setForm({ ...form, isExtra: e.target.checked, nfEntryId: "" })} />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Saída Extra <span className="font-normal text-orange-600">(produtos sem NF)</span></p>
                  <p className="text-xs text-slate-400 leading-tight">Cria débito financeiro separado no orçamento do programa.</p>
                </div>
              </label>
              {form.isExtra && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">NF de Referência <span className="text-slate-400">(opcional)</span></label>
                  <select value={form.nfEntryId}
                    onChange={(e) => setForm({ ...form, nfEntryId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <option value="">— Nenhuma (apenas debita o orçamento) —</option>
                    {entries
                      .filter((e) => !form.programId || e.programId === form.programId)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          NF {e.invoiceNumber} — {e.supplier.name} — {new Date(e.invoiceDate).toLocaleDateString("pt-BR")}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Total resumo */}
              {Object.values(exitRows).some((r) => Number(r.qty) > 0) && (
                <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs text-red-600">Total das saídas</p>
                    <p className="text-xs text-red-400">{Object.values(exitRows).filter((r) => Number(r.qty) > 0).length} produto(s) com quantidade informada</p>
                  </div>
                  <p className="text-xl font-bold text-red-700">
                    {formatCurrency(Object.entries(exitRows).reduce((s, [, r]) => s + Number(r.qty) * Number(r.price), 0))}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => { setModal(false); setForm(EMPTY_FORM); setExitRows({}); setProgramSearch(""); }}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.programId}>Registrar Saídas</Button>
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
