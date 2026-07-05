"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Utensils, Wrench, BookOpen, Package, FileText, Pencil, Trash2 } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from "@/components/ui";
import { formatCurrency, PROGRAM_TYPES } from "@/lib/utils";
import Link from "next/link";

interface Program { id: string; name: string; type: string; description?: string; budget: number; active: boolean; _count: { products: number; stockEntries: number } }

const TYPE_ICONS = { MERENDA: Utensils, MANUTENCAO: Wrench, PDDE: BookOpen };
const TYPE_COLORS = { MERENDA: "bg-green-50 border-green-200", MANUTENCAO: "bg-blue-50 border-blue-200", PDDE: "bg-purple-50 border-purple-200" };
const ICON_COLORS = { MERENDA: "bg-green-100 text-green-600", MANUTENCAO: "bg-blue-100 text-blue-600", PDDE: "bg-purple-100 text-purple-600" };

export default function ProgramsPage({ type }: { type?: string }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Program | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", type: type ?? "MERENDA", description: "", budget: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const url = type ? `/api/programs?type=${type}` : "/api/programs";
    const res = await fetch(url);
    if (res.ok) setPrograms(await res.json());
    setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm({ name: "", type: type ?? "MERENDA", description: "", budget: 0 }); setSelected(null); setModal("add"); }
  function openEdit(p: Program) { setForm({ name: p.name, type: p.type, description: p.description ?? "", budget: p.budget }); setSelected(p); setModal("edit"); }
  function openDelete(p: Program) { setSelected(p); setModal("delete"); }
  function closeModal() { setModal(null); setSelected(null); }

  async function handleSave() {
    setSaving(true);
    try {
      const url = selected ? `/api/programs/${selected.id}` : "/api/programs";
      const method = selected ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, budget: Number(form.budget) }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar programa"); return; }
      toast.success(selected ? "Programa atualizado!" : "Programa criado!"); closeModal(); load();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/programs/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao excluir programa"); return; }
      toast.success("Programa excluído!"); closeModal(); load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader
        title={type ? PROGRAM_TYPES[type as keyof typeof PROGRAM_TYPES]?.label ?? "Programas" : "Programas Escolares"}
        description="Gerencie os programas e seus orçamentos"
      >
        <Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Programa</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : programs.length === 0 ? (
        <EmptyState title="Nenhum programa" description="Crie o primeiro programa para começar." action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Programa</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {programs.map((p) => {
            const Icon = TYPE_ICONS[p.type as keyof typeof TYPE_ICONS] ?? Package;
            return (
              <div key={p.id} className={`rounded-xl border-2 p-5 shadow-sm hover:shadow-md transition-shadow ${TYPE_COLORS[p.type as keyof typeof TYPE_COLORS] ?? "bg-white border-slate-200"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ICON_COLORS[p.type as keyof typeof ICON_COLORS] ?? "bg-slate-100 text-slate-600"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge color={p.type === "MERENDA" ? "green" : p.type === "MANUTENCAO" ? "blue" : "purple"}>
                      {PROGRAM_TYPES[p.type as keyof typeof PROGRAM_TYPES]?.label ?? p.type}
                    </Badge>
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/80" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => openDelete(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white/80" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-800 mb-1">{p.name}</h3>
                {p.description && <p className="text-xs text-slate-500 mb-3">{p.description}</p>}
                <div className="space-y-1 text-sm mt-3">
                  <div className="flex justify-between"><span className="text-slate-500">Orçamento</span><span className="font-semibold">{formatCurrency(p.budget)}</span></div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/60 flex gap-4 text-xs text-slate-500">
                  <Link href="/dashboard/products" className="flex items-center gap-1 hover:text-blue-600">
                    <Package className="w-3.5 h-3.5" />{p._count.products} produtos
                  </Link>
                  <Link href="/dashboard/stock/entries" className="flex items-center gap-1 hover:text-blue-600">
                    <FileText className="w-3.5 h-3.5" />{p._count.stockEntries} entradas
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!modal && modal !== "delete"} onClose={closeModal} title={selected ? "Editar Programa" : "Novo Programa"}>
        <div className="space-y-4">
          <Input label="Nome do Programa *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Merenda 2025" />
          <Select label="Tipo *" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={Object.entries(PROGRAM_TYPES).map(([v, { label }]) => ({ value: v, label }))} />
          <Textarea label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Orçamento (R$)" type="number" min={0} step={0.01} value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>{selected ? "Salvar" : "Criar Programa"}</Button>
        </div>
      </Modal>

      <Modal open={modal === "delete"} onClose={closeModal} title="Excluir Programa" size="sm">
        <p className="text-slate-600 mb-6">Excluir o programa <strong>{selected?.name}</strong>? Os produtos e movimentações vinculados serão preservados.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={saving}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
