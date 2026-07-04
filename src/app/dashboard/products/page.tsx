"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Package, Search } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { UNITS, PROGRAM_TYPES } from "@/lib/utils";

interface Product {
  id: string; name: string; ncmCode: string; unit: string; minStock: number;
  balance: number; active: boolean;
  program: { name: string; type: string };
}

interface Program { id: string; name: string; type: string }

const NCM_QUICK: Array<{ code: string; description: string; category: string }> = [
  { code: "1006.20.11", description: "Arroz beneficiado agulhinha", category: "ALIMENTO" },
  { code: "1101.00.10", description: "Farinha de trigo tipo 1", category: "ALIMENTO" },
  { code: "1701.14.00", description: "Açúcar cristal", category: "ALIMENTO" },
  { code: "1514.19.10", description: "Óleo de soja refinado", category: "ALIMENTO" },
  { code: "0401.10.10", description: "Leite pasteurizado integral", category: "ALIMENTO" },
  { code: "2009.89.90", description: "Suco de fruta industrializado", category: "ALIMENTO" },
  { code: "2001.10.00", description: "Pepino em conserva", category: "ALIMENTO" },
  { code: "3401.19.00", description: "Sabão em pedra", category: "LIMPEZA" },
  { code: "3402.20.00", description: "Detergente líquido", category: "LIMPEZA" },
  { code: "3806.30.00", description: "Hipoclorito de sódio", category: "LIMPEZA" },
  { code: "3407.00.00", description: "Material de limpeza", category: "LIMPEZA" },
  { code: "8414.59.90", description: "Ventilador elétrico", category: "MANUTENCAO" },
  { code: "4818.10.00", description: "Papel higiênico", category: "LIMPEZA" },
  { code: "3924.10.00", description: "Prato descartável", category: "ALIMENTO" },
];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const [form, setForm] = useState({ name: "", ncmCode: "", unit: "KG", minStock: 0, programId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, prRes] = await Promise.all([fetch("/api/products"), fetch("/api/programs")]);
    if (pRes.ok) setProducts(await pRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, minStock: Number(form.minStock) }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar produto"); return; }
      toast.success("Produto cadastrado!");
      setModal(false); load();
    } finally { setSaving(false); }
  }

  const filtered = products.filter((p) =>
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.ncmCode.includes(search)) &&
    (!filterProgram || p.program?.type === filterProgram)
  );

  const statusColor = (b: number, min: number) => b <= 0 ? "red" : b <= min ? "yellow" : "green";
  const statusLabel = (b: number, min: number) => b <= 0 ? "Zerado" : b <= min ? "Baixo" : "OK";

  return (
    <div>
      <PageHeader title="Produtos (NCM)" description="Gerencie os produtos com código NCM da Receita Federal">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Novo Produto</Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou NCM..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:outline-none">
          <option value="">Todos os programas</option>
          {Object.entries(PROGRAM_TYPES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum produto" description="Adicione o primeiro produto NCM." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Novo Produto</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>NCM</Th>
                <Th>Programa</Th>
                <Th>Unidade</Th>
                <Th>Saldo</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td><span className="font-medium">{p.name}</span></Td>
                  <Td className="text-slate-500 font-mono text-xs">{p.ncmCode}</Td>
                  <Td>
                    <Badge color={p.program?.type === "MERENDA" ? "green" : p.program?.type === "MANUTENCAO" ? "blue" : "purple"}>
                      {PROGRAM_TYPES[p.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? p.program?.type}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">{p.unit}</Td>
                  <Td className="font-semibold">{(p.balance ?? 0).toFixed(2)} {p.unit}</Td>
                  <Td><Badge color={statusColor(p.balance, p.minStock)}>{statusLabel(p.balance, p.minStock)}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Novo Produto" size="lg">
        <div className="space-y-4">
          <Input label="Nome do Produto *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Arroz beneficiado tipo 1" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Código NCM (Receita Federal) *</label>
            <input
              value={form.ncmCode}
              onChange={(e) => setForm({ ...form, ncmCode: e.target.value })}
              list="ncm-list"
              placeholder="Digite ou selecione (ex: 1006.20.11)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="ncm-list">
              {NCM_QUICK.map((n) => <option key={n.code} value={n.code}>{n.description}</option>)}
            </datalist>
            <p className="text-xs text-slate-400 mt-1">Conforme Tabela NCM - Nomenclatura Comum do Mercosul / Receita Federal</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Unidade de medida *" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={UNITS} />
            <Input label="Estoque mínimo (alerta)" type="number" min={0} step={0.01} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
          </div>

          <Select
            label="Programa *"
            value={form.programId}
            onChange={(e) => setForm({ ...form, programId: e.target.value })}
            options={[{ value: "", label: "— Selecione —" }, ...programs.map((p) => ({ value: p.id, label: `${p.name} (${PROGRAM_TYPES[p.type as keyof typeof PROGRAM_TYPES]?.label ?? p.type})` }))]}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.name || !form.ncmCode || !form.programId}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
