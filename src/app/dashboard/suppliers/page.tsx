"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Truck, Phone, Mail, MapPin } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, EmptyState } from "@/components/ui";
import { formatCNPJ } from "@/lib/utils";

interface Supplier {
  id: string; name: string; cnpj: string; city: string; state: string;
  phone: string; email?: string; contact?: string; active: boolean;
  address: string; number: string; district: string; zipCode: string;
}

const defaultForm = {
  name: "", cnpj: "", ie: "", address: "", number: "", complement: "", district: "",
  city: "", state: "", zipCode: "", phone: "", email: "", contact: "",
  bankName: "", bankAgency: "", bankAccount: ""
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"geral" | "banco">("geral");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suppliers");
    if (res.ok) setSuppliers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(defaultForm); setSelected(null); setModal(true); setTab("geral"); }
  function openEdit(s: Supplier) { setForm({ ...defaultForm, ...s }); setSelected(s); setModal(true); setTab("geral"); }

  async function handleSave() {
    setSaving(true);
    try {
      const url = selected ? `/api/suppliers/${selected.id}` : "/api/suppliers";
      const method = selected ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar fornecedor"); return; }
      toast.success(selected ? "Fornecedor atualizado!" : "Fornecedor cadastrado!");
      setModal(false); load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Fornecedores" description="Gerencie os fornecedores de mercadorias">
        <Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Fornecedor</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : suppliers.length === 0 ? (
        <EmptyState title="Nenhum fornecedor" description="Adicione o primeiro fornecedor." action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Fornecedor</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Truck className="w-5 h-5 text-orange-600" />
                </div>
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-slate-800 mb-1">{s.name}</h3>
              <p className="text-xs text-slate-500 mb-3">CNPJ: {formatCNPJ(s.cnpj)}</p>
              <div className="space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{s.city}/{s.state}</div>
                <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{s.phone}</div>
                {s.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{s.email}</div>}
                {s.contact && <p className="text-xs">Contato: <span className="font-medium text-slate-700">{s.contact}</span></p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={selected ? "Editar Fornecedor" : "Novo Fornecedor"} size="lg">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit">
          {(["geral", "banco"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t === "geral" ? "Dados Gerais" : "Dados Bancários"}
            </button>
          ))}
        </div>

        {tab === "geral" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Input label="Razão Social / Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <Input label="CNPJ *" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
            <Input label="Inscrição Estadual" value={form.ie} onChange={(e) => setForm({ ...form, ie: e.target.value })} />
            <div className="sm:col-span-2"><Input label="Endereço *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <Input label="Número *" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
            <Input label="Complemento" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
            <Input label="Bairro *" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
            <Input label="CEP *" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
            <Input label="Cidade *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input label="UF *" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
            <Input label="Telefone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="sm:col-span-2"><Input label="Contato / Responsável" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          </div>
        )}

        {tab === "banco" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Input label="Banco" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
            <Input label="Agência" value={form.bankAgency} onChange={(e) => setForm({ ...form, bankAgency: e.target.value })} />
            <Input label="Conta" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
