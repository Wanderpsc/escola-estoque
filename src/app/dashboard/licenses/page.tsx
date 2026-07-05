"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, KeyRound, RefreshCw, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Select, Input, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatDate } from "@/lib/utils";

interface License {
  id: string;
  plan: string;
  startDate: string;
  expiresAt: string;
  active: boolean;
  notes?: string;
  school: { id: string; name: string; cnpj: string; city: string; state: string; email: string; director: string };
}

interface School { id: string; name: string }

const PLANS = [
  { value: "BASICO", label: "Básico" },
  { value: "PROFISSIONAL", label: "Profissional" },
  { value: "PREMIUM", label: "Premium" },
];

const DURATIONS = [
  { value: "1", label: "1 mês" },
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
  { value: "24", label: "24 meses" },
];

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function licenseStatus(l: License) {
  if (!l.active) return { label: "Suspensa", color: "red" as const };
  const days = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Expirada", color: "red" as const };
  if (days <= 30) return { label: `Expira em ${days}d`, color: "orange" as const };
  return { label: "Ativa", color: "green" as const };
}

const defaultForm = { schoolId: "", plan: "BASICO", duration: "12", notes: "" };

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<License | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [lRes, sRes] = await Promise.all([fetch("/api/licenses"), fetch("/api/schools")]);
    if (lRes.ok) setLicenses(await lRes.json());
    if (sRes.ok) setSchools(await sRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const licensedSchoolIds = new Set(licenses.map((l) => l.school.id));
  const unlicensedSchools = schools.filter((s) => !licensedSchoolIds.has(s.id));

  function openAdd() { setForm(defaultForm); setSelected(null); setModal("add"); }
  function openEdit(l: License) {
    setForm({ schoolId: l.school.id, plan: l.plan, duration: "12", notes: l.notes ?? "" });
    setSelected(l); setModal("edit");
  }
  function openDelete(l: License) { setSelected(l); setModal("delete"); }
  function closeModal() { setModal(null); setSelected(null); }

  async function handleSave() {
    setSaving(true);
    try {
      const expiresAt = new Date(addMonths(Number(form.duration)));
      expiresAt.setHours(23, 59, 59, 0);

      const body: any = { plan: form.plan, expiresAt: expiresAt.toISOString(), active: true, notes: form.notes };
      if (!selected) body.schoolId = form.schoolId;

      const url = selected ? `/api/licenses/${selected.id}` : "/api/licenses";
      const method = selected ? "PATCH" : "POST";
      if (!selected) body.schoolId = form.schoolId;

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar licença"); return; }
      toast.success(selected ? "Licença renovada!" : "Licença criada!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  async function toggleActive(l: License) {
    await fetch(`/api/licenses/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !l.active }),
    });
    toast.success(l.active ? "Licença suspensa!" : "Licença reativada!");
    load();
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/licenses/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao excluir licença"); return; }
      toast.success("Licença excluída!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  const active = licenses.filter((l) => l.active && new Date(l.expiresAt) > new Date()).length;
  const expiring = licenses.filter((l) => {
    const days = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86400000);
    return l.active && days >= 0 && days <= 30;
  }).length;
  const expired = licenses.filter((l) => l.active && new Date(l.expiresAt) <= new Date()).length;

  return (
    <div>
      <PageHeader title="Licenças" description="Gerencie as licenças de acesso das escolas ao sistema">
        <Button onClick={openAdd} disabled={unlicensedSchools.length === 0}>
          <Plus className="w-4 h-4" />Nova Licença
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: licenses.length, color: "bg-blue-50 text-blue-700", icon: KeyRound },
          { label: "Ativas", value: active, color: "bg-green-50 text-green-700", icon: CheckCircle },
          { label: "A vencer (30d)", value: expiring, color: "bg-orange-50 text-orange-700", icon: Clock },
          { label: "Expiradas", value: expired, color: "bg-red-50 text-red-700", icon: XCircle },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl p-4 flex items-center gap-3 ${s.color.split(" ")[0]}`}>
            <s.icon className={`w-6 h-6 ${s.color.split(" ")[1]}`} />
            <div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium opacity-70">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : licenses.length === 0 ? (
        <EmptyState title="Nenhuma licença" description="Crie a primeira licença para uma escola." action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Nova Licença</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Escola</Th>
                <Th>Diretor</Th>
                <Th>Plano</Th>
                <Th>Início</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => {
                const status = licenseStatus(l);
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <Td>
                      <div>
                        <p className="font-medium text-slate-800">{l.school.name}</p>
                        <p className="text-xs text-slate-400">{l.school.city}/{l.school.state}</p>
                      </div>
                    </Td>
                    <Td className="text-slate-500 text-sm">{l.school.director}</Td>
                    <Td>
                      <Badge color={l.plan === "PREMIUM" ? "purple" : l.plan === "PROFISSIONAL" ? "blue" : "slate"}>
                        {l.plan}
                      </Badge>
                    </Td>
                    <Td className="text-slate-500 text-sm">{formatDate(l.startDate)}</Td>
                    <Td className="text-slate-500 text-sm font-medium">{formatDate(l.expiresAt)}</Td>
                    <Td>
                      <button onClick={() => toggleActive(l)}>
                        <Badge color={status.color}>{status.label}</Badge>
                      </button>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(l)} className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Renovar licença">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button onClick={() => openDelete(l)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Modal Nova/Renovar Licença */}
      <Modal open={!!modal && modal !== "delete"} onClose={closeModal} title={selected ? "Renovar Licença" : "Nova Licença"} size="sm">
        <div className="space-y-4">
          {!selected && (
            <Select
              label="Escola *"
              value={form.schoolId}
              onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              options={[{ value: "", label: "— Selecione a escola —" }, ...unlicensedSchools.map((s) => ({ value: s.id, label: s.name }))]}
            />
          )}
          {selected && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-700">{selected.school.name}</p>
              <p className="text-slate-500">Vence em: {formatDate(selected.expiresAt)}</p>
            </div>
          )}
          <Select label="Plano *" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} options={PLANS} />
          <Select label="Duração a partir de hoje *" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} options={DURATIONS} />
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            Novo vencimento: <strong>{formatDate(addMonths(Number(form.duration)))}</strong>
          </div>
          <Input label="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex: Contrato nº 123..." />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>{selected ? "Renovar" : "Criar Licença"}</Button>
        </div>
      </Modal>

      {/* Modal Confirmar exclusão */}
      <Modal open={modal === "delete"} onClose={closeModal} title="Excluir Licença" size="sm">
        <p className="text-slate-600 mb-6">
          Excluir a licença de <strong>{selected?.school.name}</strong>? A escola perderá o acesso ao sistema.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={saving}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
