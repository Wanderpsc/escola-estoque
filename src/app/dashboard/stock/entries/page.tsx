"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Barcode, ScanLine, X } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES } from "@/lib/utils";
import BarcodeScanner from "@/components/BarcodeScanner";

interface Entry {
  id: string; invoiceNumber: string; invoiceDate: string; totalValue: number;
  supplier: { name: string }; program: { name: string; type: string }; user: { name: string };
  items: Array<{ product: { name: string; unit: string }; quantity: number; unitPrice: number; totalPrice: number; lot?: string }>;
}

interface ItemRow {
  productId: string;
  quantity: string;
  unitPrice: string;
  lot: string;
}

const EMPTY_HEADER = {
  programId: "", supplierId: "",
  invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0],
  observations: "",
};
const EMPTY_ITEM: ItemRow = { productId: "", quantity: "1", unitPrice: "0", lot: "" };

export default function StockEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; unit: string; programId: string; barcode?: string }>>([]);
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [scanningRowIndex, setScanningRowIndex] = useState<number | null>(null);

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

  const filteredProducts = products.filter((p) => !header.programId || p.programId === header.programId);

  function addItem() { setItems((prev) => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function setItemField(i: number, field: keyof ItemRow, val: string) {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  const totalNF = items.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unitPrice || 0), 0);

  // Busca produto por codigo de barras e preenche a linha
  async function handleBarcodeDetected(barcode: string, rowIndex: number) {
    setScanningRowIndex(null);
    // Busca local primeiro
    const local = products.find((p) => p.barcode === barcode);
    if (local) {
      setItemField(rowIndex, "productId", local.id);
      toast.success(`Produto identificado: ${local.name}`);
      return;
    }
    // Busca na API
    const res = await fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`);
    if (res.ok) {
      const prod = await res.json();
      // Adiciona ao cache local
      setProducts((prev) => prev.some((p) => p.id === prod.id) ? prev : [...prev, prod]);
      setItemField(rowIndex, "productId", prod.id);
      toast.success(`Produto identificado: ${prod.name}`);
    } else {
      toast.error(`Codigo ${barcode} nao encontrado. Cadastre o produto com este codigo de barras primeiro.`);
    }
  }

  async function handleSave() {
    if (!header.programId || !header.supplierId || !header.invoiceNumber || !header.invoiceDate) {
      toast.error("Preencha todos os campos obrigatorios (*)"); return;
    }
    const validItems = items.filter((r) => r.productId && Number(r.quantity) > 0);
    if (validItems.length === 0) { toast.error("Adicione ao menos 1 produto"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/stock/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: header.programId,
          supplierId: header.supplierId,
          invoiceNumber: header.invoiceNumber,
          invoiceDate: header.invoiceDate,
          observations: header.observations,
          items: validItems.map((r) => ({
            productId: r.productId,
            quantity: Number(r.quantity),
            unitPrice: Number(r.unitPrice),
            lot: r.lot || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? data.message ?? "Erro ao registrar entrada"); return; }
      toast.success(`Nota Fiscal ${header.invoiceNumber} registrada com ${validItems.length} produto(s)!`);
      setModal(false);
      setHeader(EMPTY_HEADER);
      setItems([{ ...EMPTY_ITEM }]);
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
        <Button onClick={() => setModal(true)}><Plus className="w-4 h-4" />Nova Entrada (NF)</Button>
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
                <Th>Produto</Th><Th>Programa</Th>
                <Th className="text-right">Qtd</Th><Th>Un.</Th>
                <Th>Vl. Unit.</Th><Th>Vl. Total</Th>
                <Th>Data</Th><Th>NF</Th><Th>Fornecedor</Th>
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

      <Modal open={modal} onClose={() => { setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); }} title="Registrar Nota Fiscal Completa" size="xl">
        <div className="space-y-5">
          {/* Cabecalho da NF */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dados da Nota Fiscal</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Programa *" value={header.programId}
                onChange={(e) => setHeader({ ...header, programId: e.target.value })}
                options={[{ value: "", label: "Selecione o programa" }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
              <Select label="Fornecedor *" value={header.supplierId}
                onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}
                options={[{ value: "", label: "Selecione o fornecedor" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Numero da NF *" value={header.invoiceNumber}
                onChange={(e) => setHeader({ ...header, invoiceNumber: e.target.value })} placeholder="Ex: 000123" />
              <Input label="Data de Entrada *" type="date" value={header.invoiceDate}
                onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })} />
              <Input label="Observacoes" value={header.observations}
                onChange={(e) => setHeader({ ...header, observations: e.target.value })} />
            </div>
          </div>

          {/* Itens da NF */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Produtos da Nota Fiscal ({items.filter((r) => r.productId).length}/{items.length})
              </p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                <Plus className="w-3 h-3" /> Adicionar produto
              </button>
            </div>

            {/* Cabecalho das colunas */}
            <div className="grid grid-cols-[2.5fr_1fr_1fr_1fr_auto_auto] gap-2 text-xs font-semibold text-slate-400 uppercase px-1 mb-1">
              <span>Produto *</span><span>Qtd *</span><span>Vl. Unit. (R$) *</span><span>Total</span><span>Lote</span><span></span>
            </div>

            <div className="space-y-2">
              {items.map((row, i) => {
                const prod = products.find((p) => p.id === row.productId);
                const rowTotal = Number(row.quantity || 0) * Number(row.unitPrice || 0);
                return (
                  <div key={i} className="grid grid-cols-[2.5fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
                    {/* Produto com botao de scan */}
                    <div className="flex gap-1">
                      <select
                        value={row.productId}
                        onChange={(e) => setItemField(i, "productId", e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Selecionar...</option>
                        {filteredProducts.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setScanningRowIndex(i)}
                        title="Escanear codigo de barras"
                        className="px-2 py-1.5 border border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <Barcode className="w-4 h-4" />
                      </button>
                    </div>

                    <input type="number" step="0.001" min="0" value={row.quantity}
                      onChange={(e) => setItemField(i, "quantity", e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full" />

                    <input type="number" step="0.01" min="0" value={row.unitPrice}
                      onChange={(e) => setItemField(i, "unitPrice", e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full" />

                    <div className="text-sm font-semibold text-green-700 text-right">{formatCurrency(rowTotal)}</div>

                    <input type="text" value={row.lot} placeholder="Lote"
                      onChange={(e) => setItemField(i, "lot", e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-full" />

                    <button onClick={() => removeItem(i)} disabled={items.length === 1}
                      className="text-slate-300 hover:text-red-500 disabled:opacity-20 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total geral */}
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs text-green-600">Valor total da Nota Fiscal</p>
              <p className="text-xs text-green-500">{items.filter((r) => r.productId).length} produto(s) validos</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalNF)}</p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => { setModal(false); setHeader(EMPTY_HEADER); setItems([{ ...EMPTY_ITEM }]); }}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>Registrar NF Completa</Button>
          </div>
        </div>
      </Modal>

      {/* Scanner para linha especifica */}
      {scanningRowIndex !== null && (
        <BarcodeScanner
          title={`Escanear produto — linha ${scanningRowIndex + 1}`}
          onDetected={(code) => handleBarcodeDetected(code, scanningRowIndex)}
          onClose={() => setScanningRowIndex(null)}
        />
      )}
    </div>
  );
}
