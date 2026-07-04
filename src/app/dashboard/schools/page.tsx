"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Building2, MapPin, Phone, Mail } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCNPJ } from "@/lib/utils";

interface School {
  id: string; name: string; cnpj: string; city: string; state: string;
  phone: string; email: string; director: string; active: boolean;
  address: string; number: string; district: string; zipCode: string;
  ie?: string; complement?: string;
}

const defaultForm = {
  name: "", cnpj: "", ie: "", address: "", number: "", complement: "", district: "",
  city: "", state: "", zipCode: "", phone: "", email: "", director: ""
};

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/schools");
    if (res.ok) setSchools(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(defaultForm); setSelected(null); setModal("add"); }
  function openEdit(s: School) { setForm({ ...s, ie: s.ie ?? "", complement: s.complement ?? "" }); setSelected(s); setModal("edit"); }
  function closeModal() { setModal(null); setSelected(null); }

  async function handleSave() {
    setSaving(true);
    try {
      const url = selected ? `/api/schools/${selected.id}` : "/api/schools";
      const method = selected ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar escola"); return; }
      toast.success(selected ? "Escola atualizada!" : "Escola cadastrada!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Escolas" description="Gerencie as escolas atendidas pelo sistema">
        <Button onClick={openAdd}><Plus className="w-4 h-4" />Nova Escola</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : schools.length === 0 ? (
        <EmptyState title="Nenhuma escola cadastrada" description="Adicione a primeira escola para começar." action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Nova Escola</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {schools.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={s.active ? "green" : "red"}>{s.active ? "Ativa" : "Inativa"}</Badge>
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 mb-1">{s.name}</h3>
              <p className="text-xs text-slate-500 mb-3">CNPJ: {formatCNPJ(s.cnpj)}</p>
              <div className="space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{s.city}/{s.state}</div>
                <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{s.phone}</div>
                <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{s.email}</div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Diretor: <span className="font-medium text-slate-700">{s.director}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={closeModal} title={selected ? "Editar Escola" : "Nova Escola"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Input label="Nome da Escola *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Escola Estadual..." /></div>
          <Input label="CNPJ *" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          <Input label="Inscrição Estadual" value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value })} placeholder="Opcional" />
          <div className="sm:col-span-2"><Input label="Endereço *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua/Av." /></div>
          <Input label="Número *" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          <Input label="Complemento" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
          <Input label="Bairro *" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          <Input label="CEP *" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} placeholder="00000-000" />
          <Input label="Cidade *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label="Estado (UF) *" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} placeholder="SP" />
          <Input label="Telefone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 0000-0000" />
          <Input label="E-mail *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="sm:col-span-2"><Input label="Nome do Diretor *" value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
