"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, DollarSign, TrendingUp, TrendingDown, FileText, Trash2 } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, Textarea, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Program { id: string; name: string; type: string; budget: number }
interface Product { id: string; name: string; unit: string }
interface Movement {
  id: string; type: "CREDIT" | "DEBIT"; category: string; amount: number;
  description: string; reference?: string; date: string;
  programId: string;
  program: { name: string; type: string };
  product?: { name: string; unit: string } | null;
  quantity?: number | null;
}

export default function FinancialPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [entries, setEntries] = useState<Array<{ totalValue: number; programId: string; isPurchase: boolean; invoiceNumber: string }>>([])  
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"budget" | "movement" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ programId: "", budget: 0, type: "CREDIT", category: "NORMAL", amount: 0, description: "", reference: "", date: new Date().toISOString().split("T")[0], productId: "", quantity: 0, unitPrice: 0, selectedProductIds: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    const [prRes, mvRes, enRes, pdRes] = await Promise.all([
      fetch("/api/programs"),
      fetch("/api/financial/movements"),
      fetch("/api/stock/entries"),
      fetch("/api/products"),
    ]);
    if (prRes.ok) setPrograms(await prRes.json());
    if (mvRes.ok) setMovements(await mvRes.json());
    if (enRes.ok) setEntries(await enRes.json());
    if (pdRes.ok) setProducts(await pdRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveBudget() {
    setSaving(true);
    try {
      const res = await fetch(`/api/programs/${form.programId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: Number(form.budget) }) });
      if (!res.ok) { toast.error("Erro ao atualizar orçamento"); return; }
      toast.success("Orçamento atualizado!"); setModal(null); load();
    } finally { setSaving(false); }
  }

  async function saveMovement() {
    if (form.category === "EXTRA") {
      if (!form.amount || Number(form.amount) <= 0) { toast.error("Informe o valor gasto"); return; }
    }
    setSaving(true);
    try {
      let payload: any = { ...form };
      if (form.category === "EXTRA") {
        payload.type = "DEBIT";
        payload.amount = Number(form.amount);
        // Remover campos não usados (evita falha de validação Zod com null)
        delete payload.productId;
        delete payload.quantity;
        delete payload.unitPrice;
        delete payload.unit;
        delete payload.selectedProductIds;
        delete payload.budget;
        if (form.selectedProductIds.length > 0) {
          const names = products.filter(p => form.selectedProductIds.includes(p.id)).map(p => p.name).join(", ");
          payload.reference = `Ref. produtos: ${names}`;
        }
      } else {
        payload.amount = Number(form.amount);
        delete payload.productId;
        delete payload.quantity;
        delete payload.unitPrice;
        delete payload.unit;
        delete payload.selectedProductIds;
        delete payload.budget;
      }
      const res = await fetch("/api/financial/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro"); return; }
      toast.success(form.category === "EXTRA" ? "Saída extra registrada!" : "Movimentação registrada!");
      setModal(null);
      load();
    } finally { setSaving(false); }
  }

  const programStats = programs.map((p) => {
    // Regular NF entries only — informal purchases and delivery entries are tracked via BudgetMovements
    const nfSpent = entries
      .filter(e => e.programId === p.id && !e.isPurchase && !e.invoiceNumber.startsWith("DEL-"))
      .reduce((s, e) => s + e.totalValue, 0);
    const progMovements = movements.filter(m => m.programId === p.id);
    const creditAmount = progMovements.filter(m => m.type === "CREDIT").reduce((s, m) => s + m.amount, 0);
    const debitAmount  = progMovements.filter(m => m.type === "DEBIT").reduce((s, m) => s + m.amount, 0);
    const totalBudget = p.budget + creditAmount;
    const spent = nfSpent + debitAmount;
    const balance = totalBudget - spent;
    const pct = totalBudget > 0 ? (spent / totalBudget) * 100 : 0;
    return { ...p, totalBudget, spent, balance, pct };
  });

  const chartData = programStats.map((p) => ({
    name: p.name.length > 10 ? p.name.slice(0, 10) + "…" : p.name,
    Orçamento: p.totalBudget,
    Gasto: p.spent,
    Saldo: Math.max(p.balance, 0),
  }));

  async function handleDeleteMovement(id: string) {
    if (!confirm("Excluir esta movimentação?")) return;
    const res = await fetch(`/api/financial/movements/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Movimentação excluída!"); load(); }
    else toast.error("Erro ao excluir movimentação");
  }

  const mainMovements = movements.filter((m) => m.category !== "EXTRA");
  const extraMovements = movements.filter((m) => m.category === "EXTRA");

  // Consolidated totals across all programs
  const totalBudgetAll = programStats.reduce((s, p) => s + p.totalBudget, 0);
  const totalSpentAll  = programStats.reduce((s, p) => s + p.spent, 0);
  const totalBalanceAll = programStats.reduce((s, p) => s + p.balance, 0);

  // Filter for the movements history
  const [movFilterId, setMovFilterId] = useState("");
  const filteredMain = mainMovements.filter(m => !movFilterId || m.programId === movFilterId);
  const filteredExtra = extraMovements.filter(m => !movFilterId || m.programId === movFilterId);

  return (
    <div>
      <PageHeader title="Controle Financeiro" description="Orçamentos e movimentações por programa">
        <Button variant="secondary" onClick={() => { setForm({ ...form }); setModal("movement"); }}><Plus className="w-4 h-4" />Movimentação</Button>
        <Button onClick={() => setModal("budget")}><DollarSign className="w-4 h-4" />Definir Orçamento</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Cards de programas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {programStats.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <Badge color={p.type === "MERENDA" ? "green" : p.type === "MANUTENCAO" ? "blue" : "purple"}>
                    {PROGRAM_TYPES[p.type as keyof typeof PROGRAM_TYPES]?.label ?? p.type}
                  </Badge>
                  <span className={`text-xs font-semibold ${p.pct > 90 ? "text-red-600" : p.pct > 70 ? "text-yellow-600" : "text-green-600"}`}>
                    {p.pct.toFixed(1)}% usado
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800 mb-3">{p.name}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Orçamento</span><span className="font-semibold">{formatCurrency(p.totalBudget)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Gasto</span><span className="font-semibold text-red-600">{formatCurrency(p.spent)}</span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-1 mt-1"><span className="text-slate-600 font-medium">Saldo</span><span className={`font-bold ${p.balance >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(p.balance)}</span></div>
                </div>
                <div className="mt-3 w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${p.pct > 90 ? "bg-red-500" : p.pct > 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(p.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Consolidado Geral */}
          {programStats.length > 1 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-sm text-white mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Consolidado — Todos os Programas</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5">Orçamento Total</span>
                  <span className="font-bold text-lg">{formatCurrency(totalBudgetAll)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5">Total Gasto</span>
                  <span className="font-bold text-lg text-red-400">{formatCurrency(totalSpentAll)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs mb-0.5">Saldo Disponível</span>
                  <span className={`font-bold text-lg ${totalBalanceAll >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(totalBalanceAll)}</span>
                </div>
              </div>
              <div className="mt-3 w-full bg-slate-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${totalBudgetAll > 0 && totalSpentAll / totalBudgetAll > 0.9 ? "bg-red-400" : "bg-green-400"}`} style={{ width: `${totalBudgetAll > 0 ? Math.min((totalSpentAll / totalBudgetAll) * 100, 100) : 0}%` }} />
              </div>
            </div>
          )}
          {chartData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Visão Financeira por Programa</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="Orçamento" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gasto" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Saldo" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Histórico de movimentações */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-700 shrink-0">Histórico de Movimentações</h3>
              {programs.length > 1 && (
                <select value={movFilterId} onChange={(e) => setMovFilterId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto">
                  <option value="">Todos os programas</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            {filteredMain.length === 0 ? (
              <EmptyState title="Nenhuma movimentação" description="Registre créditos e débitos." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Programa</Th>
                    <Th>Tipo</Th>
                    <Th>Categoria</Th>
                    <Th>Descrição</Th>
                    <Th>Referência</Th>
                    <Th>Valor</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMain.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <Td>{formatDate(m.date)}</Td>
                      <Td>
                        {m.program && (
                          <Badge color={m.program.type === "MERENDA" ? "green" : m.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                            {m.program.name}
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        {m.type === "CREDIT"
                          ? <span className="flex items-center gap-1 text-green-600 font-medium"><TrendingUp className="w-4 h-4" />Crédito</span>
                          : <span className="flex items-center gap-1 text-red-600 font-medium"><TrendingDown className="w-4 h-4" />Débito</span>
                        }
                      </Td>
                      <Td>
                        {m.category === "SALDO_ANTERIOR" && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Saldo Anterior</span>}
                        {m.category === "DIVIDA" && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Divida Anterior</span>}
                        {(!m.category || m.category === "NORMAL") && <span className="text-slate-400 text-xs">Normal</span>}
                      </Td>
                      <Td>{m.description}</Td>
                      <Td className="text-slate-400 text-xs">{m.reference ?? "—"}</Td>
                      <Td className={`font-semibold ${m.type === "CREDIT" ? "text-green-700" : "text-red-600"}`}>
                        {m.type === "CREDIT" ? "+" : "-"}{formatCurrency(m.amount)}
                      </Td>
                      <Td>
                        <button onClick={() => handleDeleteMovement(m.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>

          {/* Memorando — Saídas Extras */}
          {filteredExtra.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm mt-4">
              <div className="px-5 py-4 border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-700" />
                  <h3 className="text-sm font-semibold text-amber-800">Memorando — Saídas Extras ({extraMovements.length})</h3>
                </div>
                <p className="text-xs text-amber-600 mt-0.5">Saídas fora da movimentação normal. Produto abatido do estoque e valor debitado do orçamento.</p>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Programa</Th>
                    <Th>Produto</Th>
                    <Th>Qtd.</Th>
                    <Th>Descrição</Th>
                    <Th>Referência</Th>
                    <Th>Valor</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExtra.map((m) => (
                    <tr key={m.id} className="hover:bg-amber-50/70">
                      <Td>{formatDate(m.date)}</Td>
                      <Td>
                        {m.program && (
                          <Badge color={m.program.type === "MERENDA" ? "green" : m.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                            {m.program.name}
                          </Badge>
                        )}
                      </Td>
                      <Td className="font-medium text-slate-700">{m.product?.name ?? "—"}</Td>
                      <Td className="text-slate-600">{m.quantity != null ? `${m.quantity} ${m.product?.unit ?? ""}` : "—"}</Td>
                      <Td>{m.description}</Td>
                      <Td className="text-slate-400 text-xs">{m.reference ?? "—"}</Td>
                      <Td className="font-semibold text-red-600">-{formatCurrency(m.amount)}</Td>
                      <Td>
                        <button onClick={() => handleDeleteMovement(m.id)} className="text-slate-400 hover:text-red-600 transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Modal orçamento */}
      <Modal open={modal === "budget"} onClose={() => setModal(null)} title="Definir Orçamento do Programa">
        <div className="space-y-4">
          <Select label="Programa *" value={form.programId} onChange={(e) => {
            const p = programs.find((p) => p.id === e.target.value);
            setForm({ ...form, programId: e.target.value, budget: p?.budget ?? 0 });
          }} options={[{ value: "", label: "— Selecione —" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
          <Input label="Valor do Orçamento (R$) *" type="number" min={0} step={0.01} value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
          <Button onClick={saveBudget} loading={saving}>Salvar</Button>
        </div>
      </Modal>

      {/* Modal movimentação */}
      <Modal open={modal === "movement"} onClose={() => setModal(null)} title="Nova Movimentação Financeira">
        <div className="space-y-4">
          <Select label="Programa *" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} options={[{ value: "", label: "— Selecione —" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />

          {/* Categoria da movimentação */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Categoria *</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "NORMAL",         label: "Normal",          desc: "Repasse ou gasto regular" },
                { value: "SALDO_ANTERIOR", label: "Saldo Anterior",   desc: "Saldo de ano/período anterior" },
                { value: "DIVIDA",         label: "Dívida Anterior",  desc: "Dívida ou passivo de período anterior" },
                { value: "EXTRA",          label: "Saída Extra",      desc: "Abate produto do estoque + financeiro" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, category: opt.value, type: opt.value === "EXTRA" ? "DEBIT" : form.type, productId: "", quantity: 0, unitPrice: 0, selectedProductIds: [] })}
                  className={`text-left px-3 py-2.5 rounded-xl border-2 transition-colors ${
                    form.category === opt.value
                      ? opt.value === "EXTRA"
                        ? "border-rose-400 bg-rose-50"
                        : opt.value === "DIVIDA"
                        ? "border-orange-400 bg-orange-50"
                        : opt.value === "SALDO_ANTERIOR"
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-400 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-700">{opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {form.category === "EXTRA" ? (
            <>
              <Input label="Valor total gasto (R$) *" type="number" min={0} step={0.01} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Produtos relacionados <span className="text-slate-400">(opcional — apenas referência; a baixa de estoque é feita separadamente)</span></label>
                {products.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum produto cadastrado.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5 bg-slate-50">
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-white rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={form.selectedProductIds.includes(p.id)}
                          onChange={(e) => {
                            setForm((f) => ({
                              ...f,
                              selectedProductIds: e.target.checked
                                ? [...f.selectedProductIds, p.id]
                                : f.selectedProductIds.filter((id) => id !== p.id),
                            }));
                          }}
                        />
                        <span className="text-sm text-slate-700">{p.name}</span>
                        <span className="text-xs text-slate-400">({p.unit})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select label="Tipo *" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[{ value: "CREDIT", label: "Crédito (entrada)" }, { value: "DEBIT", label: "Débito (saída)" }]} />
              <Input label="Valor (R$) *" type="number" min={0} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
          )}
          <Input label="Descrição *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Referência (empenho, processo)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            <Input label="Data *" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
          <Button onClick={saveMovement} loading={saving}>Registrar</Button>
        </div>
      </Modal>
    </div>
  );
}
