"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, ChevronRight, FolderPlus,
  Utensils, Wrench, BookOpen, Package, LayoutGrid,
} from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Program {
  id: string;
  name: string;
  type: string;
  description?: string;
  budget: number;
  active: boolean;
  parentId: string | null;
  children: Program[];
  _count: { products: number; stockEntries: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const BUILTIN_TYPES = ["MERENDA", "MANUTENCAO", "PDDE"];

const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  MERENDA:   { label: "Merenda Escolar", icon: Utensils,    color: "text-green-600",  bg: "bg-green-50 border-green-200" },
  MANUTENCAO:{ label: "Manutencao",      icon: Wrench,      color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  PDDE:      { label: "PDDE",            icon: BookOpen,    color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: Package, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" };
}

const TYPE_OPTIONS = [
  { value: "MERENDA",    label: "Merenda Escolar" },
  { value: "MANUTENCAO", label: "Manutencao" },
  { value: "PDDE",       label: "PDDE" },
  { value: "CUSTOM",     label: "Personalizado..." },
];

const defaultForm = { name: "", type: "MERENDA", customType: "", description: "", budget: "0", parentId: "" };

// ─── Card de programa ─────────────────────────────────────────────────────────
function ProgramCard({
  program,
  onEdit,
  onDelete,
  onAddChild,
}: {
  program: Program;
  onEdit: (p: Program) => void;
  onDelete: (p: Program) => void;
  onAddChild: (parent: Program) => void;
}) {
  const meta = typeMeta(program.type);
  const Icon = meta.icon;

  return (
    <div className={`rounded-xl border-2 p-4 shadow-sm ${meta.bg}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm leading-tight">{program.name}</p>
            <p className="text-xs text-slate-400">{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAddChild(program)}
            title="Adicionar subdivis\u00e3o / parcela"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-blue-600 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button onClick={() => onEdit(program)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(program)} className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {program.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{program.description}</p>
      )}

      {/* Orçamento */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-slate-500">Orcamento</span>
        <span className="font-semibold text-slate-700">{formatCurrency(program.budget)}</span>
      </div>

      <div className="flex gap-3 text-xs text-slate-500">
        <span>{program._count.products} produto(s)</span>
        <span>{program._count.stockEntries} entrada(s)</span>
      </div>

      {/* Subdivisoes */}
      {program.children.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Subdivisoes / Parcelas</p>
          {program.children.map((child) => (
            <div key={child.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <div>
                  <p className="text-xs font-medium text-slate-700">{child.name}</p>
                  {child.budget > 0 && <p className="text-xs text-slate-400">{formatCurrency(child.budget)}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onEdit(child)} className="p-1 text-slate-300 hover:text-slate-600">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => onDelete(child)} className="p-1 text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function AllProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Program | null>(null);
  const [parentForNew, setParentForNew] = useState<Program | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/programs");
    if (res.ok) setPrograms(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // top-level: sem parentId
  const topLevel = programs.filter((p) => !p.parentId);

  // agrupar por tipo
  const byType = topLevel.reduce((acc, p) => {
    const key = BUILTIN_TYPES.includes(p.type) ? p.type : "CUSTOM";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {} as Record<string, Program[]>);

  function openAdd() {
    setParentForNew(null);
    setForm(defaultForm);
    setSelected(null);
    setModal("add");
  }

  function openAddChild(parent: Program) {
    setParentForNew(parent);
    setForm({ ...defaultForm, type: parent.type, parentId: parent.id });
    setSelected(null);
    setModal("add");
  }

  function openEdit(p: Program) {
    const isCustom = !BUILTIN_TYPES.includes(p.type);
    setForm({
      name: p.name,
      type: isCustom ? "CUSTOM" : p.type,
      customType: isCustom ? p.type : "",
      description: p.description ?? "",
      budget: String(p.budget),
      parentId: p.parentId ?? "",
    });
    setSelected(p);
    setParentForNew(null);
    setModal("edit");
  }

  function openDelete(p: Program) { setSelected(p); setModal("delete"); }
  function closeModal() { setModal(null); setSelected(null); setParentForNew(null); }

  async function handleSave() {
    const finalType = form.type === "CUSTOM" ? form.customType.trim().toUpperCase() : form.type;
    if (!finalType) { toast.error("Informe o tipo do programa"); return; }
    if (!form.name.trim()) { toast.error("Informe o nome"); return; }

    setSaving(true);
    try {
      const url = selected ? `/api/programs/${selected.id}` : "/api/programs";
      const method = selected ? "PATCH" : "POST";
      const body = {
        name: form.name.trim(),
        type: finalType,
        description: form.description || undefined,
        budget: Number(form.budget) || 0,
        parentId: form.parentId || null,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar programa"); return; }
      toast.success(selected ? "Programa atualizado!" : "Programa criado!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/programs/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao excluir programa"); return; }
      toast.success("Programa excluido!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  const GROUP_ORDER = ["MERENDA", "MANUTENCAO", "PDDE", "CUSTOM"];
  const visibleGroups = GROUP_ORDER.filter((g) => byType[g]?.length > 0);

  return (
    <div>
      <PageHeader title="Todos os Programas" description="Gerencie programas, subdivisoes e parcelas">
        <Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Programa</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : topLevel.length === 0 ? (
        <EmptyState
          title="Nenhum programa"
          description="Crie programas como Merenda, Manutencao, PDDE ou personalizados."
          action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Programa</Button>}
        />
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((groupKey) => {
            const meta = groupKey === "CUSTOM"
              ? { label: "Programas Personalizados", icon: LayoutGrid, bg: "bg-slate-50" }
              : { ...typeMeta(groupKey), bg: typeMeta(groupKey).bg };
            const GroupIcon = (meta as any).icon;

            return (
              <div key={groupKey}>
                <div className="flex items-center gap-2 mb-3">
                  <GroupIcon className={`w-4 h-4 ${(meta as any).color ?? "text-slate-500"}`} />
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{meta.label}</h2>
                  <span className="text-xs text-slate-400">({byType[groupKey].length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {byType[groupKey].map((p) => (
                    <ProgramCard
                      key={p.id}
                      program={p}
                      onEdit={openEdit}
                      onDelete={openDelete}
                      onAddChild={openAddChild}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal add/edit */}
      <Modal
        open={!!modal && modal !== "delete"}
        onClose={closeModal}
        title={
          parentForNew
            ? `Subdivisao de: ${parentForNew.name}`
            : selected ? "Editar Programa" : "Novo Programa"
        }
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nome *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={parentForNew ? "Ex: 1a Parcela, 2a Parcela..." : "Ex: Merenda 2025, PDDE Acessibilidade..."}
          />

          {!parentForNew && (
            <>
              <Select
                label="Tipo *"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, customType: "" })}
                options={TYPE_OPTIONS}
              />
              {form.type === "CUSTOM" && (
                <Input
                  label="Nome do tipo personalizado *"
                  value={form.customType}
                  onChange={(e) => setForm({ ...form, customType: e.target.value })}
                  placeholder="Ex: FUNDEB, PNAE_2025, RECURSOS_PROPRIOS..."
                />
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Orcamento (R$)"
              type="number"
              min={0}
              step={0.01}
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
            <div />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Descricao / Observacao</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes sobre este programa ou parcela..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      </Modal>

      {/* Modal delete */}
      <Modal open={modal === "delete"} onClose={closeModal} title="Excluir Programa" size="sm">
        <p className="text-slate-600 mb-2">
          Excluir <strong>{selected?.name}</strong>?
        </p>
        {(selected?.children?.length ?? 0) > 0 && (
          <p className="text-xs text-orange-600 bg-orange-50 rounded-lg p-2 mb-4">
            Atencao: este programa possui {selected?.children?.length} subdivisao(oes). Elas serao desativadas tambem.
          </p>
        )}
        <p className="text-xs text-slate-400 mb-6">O programa sera desativado e nao aparecera mais nas listas.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={saving}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
