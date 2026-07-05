"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES } from "@/lib/utils";

interface Entry {
  id: string; invoiceNumber: string; invoiceDate: string; totalValue: number;
  supplier: { name: string }; program: { name: string; type: string }; user: { name: string };
  items: Array<{ product: { name: string; unit: string }; quantity: number; unitPrice: number; totalPrice: number; lot?: string }>;
}

const EMPTY_FORM = {
  programId: "", productId: "", quantity: 1, unitPrice: 0,
  invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0],
  supplierId: "", lot: "", observations: "",
};

export default function StockEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit: string; programId: string }>>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    const [eRes, sRes, prRes, pdRes] = await Promise.all([
      fetch("/api/stock/entries"), fetch("/api/suppliers"),
      fetch("/api/programs"), fetch("/api/products"),
    ]);
    if (eRes.ok) setEntries(await eRes.json());
    if (sRes.ok) setSuppliers(await sRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    if (pdRes.ok) setProducts(await pdRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredProducts = products.filter((p) => !form.programId || p.programId === form.programId);
  const selectedProduct = products.find((p) => p.id === form.productId);
  const totalValue = Number(form.quantity) * Number(form.unitPrice);

  function handleProductChange(productId: string) {
    setForm((f) => ({ ...f, productId }));
  }

  async function handleSave() {
    if (!form.programId || !form.productId || !form.supplierId || !form.invoiceNumber || !form.invoiceDate) {
      toast.error("Preencha todos os campos obrigatórios (*)"); return;
    }
    if (Number(form.quantity) <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: form.programId,
          supplierId: form.supplierId,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          observations: form.observations,
          items: [{ productId: form.productId, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), lot: form.lot || undefined }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? data.message ?? "Erro ao registrar entrada"); return; }
      toast.success("Entrada registrada!");
      setModal(false);
      setForm(EMPTY_FORM);
      load();
    } finally { setSaving(false); }
  }

  const flatItems = entries.flatMap((e) =>
    e.items.map((item) => ({
      invoiceNumber: e.invoiceNumber,
      invoiceDate: e.invoiceDate,
      supplier: e.supplier.name,
      program: e.program,
      user: e.user.name,
      product: item.product.name,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }))
  );

  return (
    <div>
      <PageHeader title="Entradas de Estoque" description="Registre entradas de produtos por nota fiscal">
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada</Button>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : flatItems.length === 0 ? (
        <EmptyState title="Nenhuma entrada registrada" description="Registre a primeira entrada de mercadoria." action={<Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada</Button>} />
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
                <Th>NF</Th>
                <Th>Fornecedor</Th>
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
                  <Td className="font-semibold text-green-700">{formatCurrency(item.totalPrice)}</Td>
                  <Td className="text-slate-500 text-sm">{formatDate(item.invoiceDate)}</Td>
                  <Td className="font-mono text-xs text-slate-600">{item.invoiceNumber}</Td>
                  <Td className="text-slate-500 text-sm">{item.supplier}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setForm(EMPTY_FORM); }} title="Registrar Entrada de Produto" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Programa *" value={form.programId}
              onChange={(e) => setForm({ ...form, programId: e.target.value, productId: "" })}
              options={[{ value: "", label: "— Selecione o programa —" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select label="Produto *" value={form.productId}
              onChange={(e) => handleProductChange(e.target.value)}
              options={[{ value: "", label: form.programId ? "— Selecione o produto —" : "← Selecione o programa" }, ...filteredProducts.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})` }))]} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Quantidade *" type="number" min={0.01} step={0.01} value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            <Input label="Valor Unitário (R$) *" type="number" min={0} step={0.01} value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor Total (auto)</label>
              <div className="px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-green-800 font-bold text-sm">{formatCurrency(totalValue)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nota Fiscal (número) *" value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="Ex: 000123" />
            <Input label="Data de Entrada *" type="date" value={form.invoiceDate}
              onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
          </div>
          <Select label="Fornecedor *" value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            options={[{ value: "", label: "— Selecione o fornecedor —" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Lote (opcional)" value={form.lot}
              onChange={(e) => setForm({ ...form, lot: e.target.value })} placeholder="Ex: LOT-2025-01" />
            <Input label="Observações" value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => { setModal(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Registrar Entrada</Button>
        </div>
      </Modal>
    </div>
  );
}
