"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, EXIT_REASONS } from "@/lib/utils";

interface Exit {
  id: string; exitDate: string; reason: string; observations?: string;
  program: { name: string; type: string }; user: { name: string };
  items: Array<{ product: { name: string; unit: string }; quantity: number; unitPrice: number; totalPrice: number }>;
}

const EMPTY_FORM = {
  programId: "", productId: "", quantity: 1, unitPrice: 0,
  exitDate: new Date().toISOString().split("T")[0],
  reason: "CONSUMO", observations: "",
};

export default function StockExitsPage() {
  const [exits, setExits] = useState<Exit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [balance, setBalance] = useState<Array<{ id: string; name: string; unit: string; balance: number; avgPrice: number; programId?: string; program: { type: string } }>>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, prRes, bRes] = await Promise.all([
      fetch("/api/stock/exits"), fetch("/api/programs"), fetch("/api/stock/balance"),
    ]);
    if (eRes.ok) setExits(await eRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (bRes.ok) setBalance(await bRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedProgramType = programs.find((p) => p.id === form.programId)?.type;
  const filteredBalance = balance.filter((p) => {
    if (!form.programId) return true;
    return selectedProgramType && p.program?.type === selectedProgramType;
  }).filter((p) => p.balance > 0);

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
    if (selectedProduct && Number(form.quantity) > selectedProduct.balance) {
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
          observations: form.observations,
          items: [{ productId: form.productId, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice) }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? data.message ?? "Erro ao registrar saida"); return; }
      toast.success("Saida registrada!");
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Programa</Th>
                <Th className="text-right">Qtd</Th>
                <Th>Un.</Th>
                <Th>Vl. Unit.</Th>
                <Th>Vl. Total</Th>
                <Th>Data</Th>
                <Th>Motivo</Th>
                <Th>Responsavel</Th>
              </tr>
            </thead>
            <tbody>
              {flatItems.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td className="font-medium">{item.product}</Td>
                  <Td>
                    <Badge color={item.program.type === "MERENDA" ? "green" : item.program.type === "MANUTENCAO" ? "blue" : "purple"}>
                      {PROGRAM_TYPES[item.program.type as keyof typeof PROGRAM_TYPES]?.label ?? item.program.type}
                    </Badge>
                  </Td>
                  <Td className="font-semibold text-right">{item.quantity.toFixed(2)}</Td>
                  <Td className="text-slate-500">{item.unit}</Td>
                  <Td className="text-slate-600">{formatCurrency(item.unitPrice)}</Td>
                  <Td className="font-semibold text-red-600">{formatCurrency(item.totalPrice)}</Td>
                  <Td className="text-slate-500 text-sm">{formatDate(item.exitDate)}</Td>
                  <Td><Badge color="slate">{reasonLabels[item.reason] ?? item.reason}</Badge></Td>
                  <Td className="text-slate-500 text-sm">{item.user}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
                { value: "", label: form.programId ? "— Selecione o produto —" : "← Selecione o programa" },
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
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => { setModal(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Registrar Saida</Button>
        </div>
      </Modal>
    </div>
  );
}
