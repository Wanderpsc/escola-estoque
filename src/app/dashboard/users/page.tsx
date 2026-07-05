"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserCircle } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/utils";

const ROLES = Object.entries(ROLE_LABELS)
  .filter(([v]) => v !== "SUPER_ADMIN")
  .map(([value, label]) => ({ value, label }));

interface User {
  id: string; name: string; email: string; role: string;
  cpf?: string; phone?: string; active: boolean; createdAt: string;
  school?: { name: string };
}

const defaultForm = { name: "", email: "", password: "", cpf: "", phone: "", role: "USER", schoolId: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [uRes, sRes] = await Promise.all([fetch("/api/users"), fetch("/api/schools")]);
    if (uRes.ok) setUsers(await uRes.json());
    if (sRes.ok) setSchools(await sRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(defaultForm); setSelected(null); setModal("add"); }
  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: "", cpf: u.cpf ?? "", phone: u.phone ?? "", role: u.role, schoolId: "" });
    setSelected(u); setModal("edit");
  }
  function openDelete(u: User) { setSelected(u); setModal("delete"); }
  function closeModal() { setModal(null); setSelected(null); }

  async function handleSave() {
    setSaving(true);
    try {
      const url = selected ? `/api/users/${selected.id}` : "/api/users";
      const method = selected ? "PATCH" : "POST";
      const body = { ...form };
      if (selected && !body.password) delete (body as any).password;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar usuário"); return; }
      toast.success(selected ? "Usuário atualizado!" : "Usuário criado!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Erro ao excluir usuário"); return; }
      toast.success("Usuário excluído!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  async function toggleActive(u: User) {
    await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !u.active }) });
    load();
  }

  const roleColorMap: Record<string, any> = {
    SUPER_ADMIN: "red", SCHOOL_ADMIN: "purple", MANAGER: "blue",
    ACCOUNTANT: "orange", NUTRITIONIST: "green", USER: "slate",
  };

  return (
    <div>
      <PageHeader title="Usuários" description="Gerencie os acessos ao sistema">
        <Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Usuário</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : users.length === 0 ? (
        <EmptyState title="Nenhum usuário" description="Adicione o primeiro usuário." action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Usuário</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Perfil</Th>
                <Th>Escola</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-semibold">{u.name.charAt(0)}</div>
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </Td>
                  <Td className="text-slate-500">{u.email}</Td>
                  <Td><Badge color={roleColorMap[u.role] ?? "slate"}>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</Badge></Td>
                  <Td className="text-slate-500">{u.school?.name ?? "—"}</Td>
                  <Td>
                    <button onClick={() => toggleActive(u)}>
                      <Badge color={u.active ? "green" : "red"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDelete(u)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal open={!!modal && modal !== "delete"} onClose={closeModal} title={selected ? "Editar Usuário" : "Novo Usuário"} size="md">
        <div className="space-y-4">
          <Input label="Nome completo *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="E-mail *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!selected} />
          <Input label={selected ? "Nova senha (deixe vazio para manter)" : "Senha *"} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
            <Input label="Telefone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <Select label="Perfil de acesso *" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={ROLES} />
          {schools.length > 0 && (
            <Select label="Escola" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              options={[{ value: "", label: "— Selecione —" }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Salvar</Button>
        </div>
      </Modal>

      <Modal open={modal === "delete"} onClose={closeModal} title="Excluir Usuário" size="sm">
        <p className="text-slate-600 mb-6">
          Tem certeza que deseja excluir o usuário <strong>{selected?.name}</strong>?<br />
          <span className="text-slate-400 text-sm">O usuário será desativado e não poderá mais acessar o sistema.</span>
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={saving}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
