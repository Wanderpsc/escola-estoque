"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Package, Search, Pencil, Trash2, Barcode } from "lucide-react";
import { PageHeader, Button, Badge, Modal, Input, Select, EmptyState, Table, Th, Td } from "@/components/ui";
import { UNITS, PROGRAM_TYPES } from "@/lib/utils";
import BarcodeScanner from "@/components/BarcodeScanner";

interface Product {
  id: string; name: string; ncmCode: string; unit: string; minStock: number;
  balance: number; active: boolean;
  program: { name: string; type: string };
}

interface Program { id: string; name: string; type: string }

const NCM_QUICK: Array<{ code: string; description: string; category: string }> = [
  // ALIMENTOS - Cereais e farináceos
  { code: "1006.20.11", description: "Arroz beneficiado agulhinha", category: "ALIMENTO" },
  { code: "1006.20.19", description: "Arroz beneficiado (outros tipos)", category: "ALIMENTO" },
  { code: "1006.40.00", description: "Arroz quebrado", category: "ALIMENTO" },
  { code: "1101.00.10", description: "Farinha de trigo tipo 1", category: "ALIMENTO" },
  { code: "1101.00.20", description: "Farinha de trigo tipo 2", category: "ALIMENTO" },
  { code: "1102.20.00", description: "Farinha de milho", category: "ALIMENTO" },
  { code: "1103.13.00", description: "Cuscuz (grumos/sêmola de milho)", category: "ALIMENTO" },
  { code: "1904.10.00", description: "Flocos de milho (corn flakes)", category: "ALIMENTO" },
  { code: "1905.31.00", description: "Biscoito doce", category: "ALIMENTO" },
  { code: "1905.32.00", description: "Wafer", category: "ALIMENTO" },
  { code: "1905.90.10", description: "Pão de forma", category: "ALIMENTO" },
  { code: "1905.90.20", description: "Biscoito salgado (cream cracker)", category: "ALIMENTO" },
  { code: "1905.90.90", description: "Biscoito/bolacha (outros)", category: "ALIMENTO" },
  // ALIMENTOS - Leguminosas
  { code: "0713.33.19", description: "Feijão carioca", category: "ALIMENTO" },
  { code: "0713.33.29", description: "Feijão preto", category: "ALIMENTO" },
  { code: "0713.10.10", description: "Ervilha seca", category: "ALIMENTO" },
  { code: "0713.20.00", description: "Grão de bico", category: "ALIMENTO" },
  { code: "0713.40.00", description: "Lentilha", category: "ALIMENTO" },
  { code: "1201.90.00", description: "Soja em grãos", category: "ALIMENTO" },
  // ALIMENTOS - Açúcares e adoçantes
  { code: "1701.14.00", description: "Açúcar cristal", category: "ALIMENTO" },
  { code: "1701.12.00", description: "Açúcar refinado", category: "ALIMENTO" },
  { code: "1703.10.00", description: "Melaço de cana-de-açúcar", category: "ALIMENTO" },
  // ALIMENTOS - Óleos e gorduras
  { code: "1514.19.10", description: "Óleo de soja refinado", category: "ALIMENTO" },
  { code: "1508.10.00", description: "Óleo de amendoim", category: "ALIMENTO" },
  { code: "1509.10.00", description: "Azeite de oliva virgem", category: "ALIMENTO" },
  { code: "1517.10.00", description: "Margarina", category: "ALIMENTO" },
  { code: "0405.10.00", description: "Manteiga", category: "ALIMENTO" },
  // ALIMENTOS - Laticínios
  { code: "0401.10.10", description: "Leite pasteurizado integral", category: "ALIMENTO" },
  { code: "0401.20.10", description: "Leite semi-desnatado", category: "ALIMENTO" },
  { code: "0402.10.10", description: "Leite em pó integral", category: "ALIMENTO" },
  { code: "0402.21.20", description: "Leite em pó desnatado", category: "ALIMENTO" },
  { code: "0403.10.00", description: "Iogurte", category: "ALIMENTO" },
  { code: "0406.10.00", description: "Queijo mozzarella", category: "ALIMENTO" },
  { code: "0406.90.20", description: "Requeijão cremoso", category: "ALIMENTO" },
  // ALIMENTOS - Carnes e proteínas
  { code: "0201.30.00", description: "Carne bovina (desossada, fresca)", category: "ALIMENTO" },
  { code: "0202.30.00", description: "Carne bovina (desossada, congelada)", category: "ALIMENTO" },
  { code: "0207.14.00", description: "Frango (partes, congelado)", category: "ALIMENTO" },
  { code: "0207.12.00", description: "Frango inteiro, congelado", category: "ALIMENTO" },
  { code: "0203.29.00", description: "Carne suína (outras, congelada)", category: "ALIMENTO" },
  { code: "1602.32.00", description: "Salsicha/linguiça (de frango)", category: "ALIMENTO" },
  { code: "1602.41.00", description: "Presunto cozido", category: "ALIMENTO" },
  { code: "0302.49.00", description: "Peixe fresco (outros)", category: "ALIMENTO" },
  { code: "1604.14.00", description: "Sardinha em conserva", category: "ALIMENTO" },
  { code: "0408.91.00", description: "Ovo de galinha em casca", category: "ALIMENTO" },
  // ALIMENTOS - Hortaliças e frutas
  { code: "0702.00.90", description: "Tomate fresco", category: "ALIMENTO" },
  { code: "0703.10.00", description: "Cebola fresca", category: "ALIMENTO" },
  { code: "0703.20.00", description: "Alho fresco", category: "ALIMENTO" },
  { code: "0706.10.00", description: "Cenoura fresca", category: "ALIMENTO" },
  { code: "0714.90.90", description: "Macaxeira/mandioca fresca", category: "ALIMENTO" },
  { code: "0805.10.00", description: "Laranja fresca", category: "ALIMENTO" },
  { code: "0803.90.00", description: "Banana fresca", category: "ALIMENTO" },
  // ALIMENTOS - Massas e macarrão
  { code: "1902.19.00", description: "Macarrão/espaguete seco", category: "ALIMENTO" },
  { code: "1902.11.00", description: "Macarrão com ovos, cru", category: "ALIMENTO" },
  { code: "1902.30.00", description: "Macarrão cozido (lasanha)", category: "ALIMENTO" },
  // ALIMENTOS - Enlatados, conservas, temperos
  { code: "2002.10.00", description: "Tomate pelado/polpa em conserva", category: "ALIMENTO" },
  { code: "2001.10.00", description: "Pepino em conserva", category: "ALIMENTO" },
  { code: "0901.21.00", description: "Café torrado e moído", category: "ALIMENTO" },
  { code: "0902.30.00", description: "Chá preto", category: "ALIMENTO" },
  { code: "2009.89.90", description: "Suco de fruta industrializado", category: "ALIMENTO" },
  { code: "2202.10.00", description: "Água mineral", category: "ALIMENTO" },
  { code: "0904.21.00", description: "Pimenta-do-reino em grãos", category: "ALIMENTO" },
  { code: "0910.99.90", description: "Tempero/condimento misto", category: "ALIMENTO" },
  { code: "2103.10.00", description: "Molho de soja", category: "ALIMENTO" },
  { code: "2103.20.00", description: "Ketchup / molho de tomate", category: "ALIMENTO" },
  { code: "0903.00.00", description: "Erva-mate", category: "ALIMENTO" },
  { code: "1211.90.90", description: "Ervas aromáticas secas", category: "ALIMENTO" },
  // ALIMENTOS - Descartáveis alimentares
  { code: "3924.10.00", description: "Prato/copo descartável (plástico)", category: "ALIMENTO" },
  { code: "3923.29.90", description: "Sacola/embalagem plástica descartável", category: "ALIMENTO" },
  // LIMPEZA
  { code: "3401.19.00", description: "Sabão em pedra", category: "LIMPEZA" },
  { code: "3401.11.90", description: "Sabão em barra", category: "LIMPEZA" },
  { code: "3402.20.00", description: "Detergente líquido", category: "LIMPEZA" },
  { code: "3402.90.39", description: "Sabão em pó / amaciante", category: "LIMPEZA" },
  { code: "3806.30.00", description: "Hipoclorito de sódio (água sanitária)", category: "LIMPEZA" },
  { code: "3808.94.29", description: "Desinfetante domissanitário", category: "LIMPEZA" },
  { code: "3808.91.90", description: "Inseticida / repelente", category: "LIMPEZA" },
  { code: "3407.00.00", description: "Material de limpeza geral", category: "LIMPEZA" },
  { code: "4818.10.00", description: "Papel higiênico folha simples", category: "LIMPEZA" },
  { code: "4818.20.00", description: "Papel higiênico folha dupla", category: "LIMPEZA" },
  { code: "4818.30.00", description: "Lenços de papel / toalha papel", category: "LIMPEZA" },
  { code: "9619.00.19", description: "Absorvente higiênico", category: "LIMPEZA" },
  { code: "3926.90.90", description: "Esponja de limpeza / pano", category: "LIMPEZA" },
  { code: "3923.21.00", description: "Saco de lixo (polietileno)", category: "LIMPEZA" },
  { code: "3924.90.00", description: "Balde / vassoura / rodo (plástico)", category: "LIMPEZA" },
  { code: "9603.29.00", description: "Vassoura, espanador, esfregão", category: "LIMPEZA" },
  // MANUTENÇÃO / EQUIPAMENTOS
  { code: "8414.59.90", description: "Ventilador elétrico", category: "MANUTENCAO" },
  { code: "8302.10.00", description: "Dobradiça, corrediça (metal)", category: "MANUTENCAO" },
  { code: "3302.10.39", description: "Lâmpada fluorescente", category: "MANUTENCAO" },
  { code: "8536.50.90", description: "Material elétrico diverso (interruptor/tomada)", category: "MANUTENCAO" },
  { code: "8544.49.00", description: "Fio/cabo elétrico", category: "MANUTENCAO" },
  { code: "3916.10.00", description: "Cano/tubo PVC", category: "MANUTENCAO" },
  { code: "3922.10.00", description: "Banheira / vaso sanitário (plástico)", category: "MANUTENCAO" },
  { code: "8481.80.99", description: "Torneira / registro hidráulico", category: "MANUTENCAO" },
  { code: "3208.10.00", description: "Tinta à base de polímero acrílico", category: "MANUTENCAO" },
  { code: "3214.10.00", description: "Massa corrida / argamassa", category: "MANUTENCAO" },
  { code: "2523.29.00", description: "Cimento Portland", category: "MANUTENCAO" },
  { code: "6810.11.00", description: "Ladrilho / piso cerâmico", category: "MANUTENCAO" },
  { code: "4418.10.00", description: "Janela / porta de madeira", category: "MANUTENCAO" },
  { code: "8301.40.00", description: "Fechadura / cadeado", category: "MANUTENCAO" },
  // ESCRITÓRIO / PAPELARIA
  { code: "4820.10.10", description: "Caderno escolar", category: "ESCRITORIO" },
  { code: "4820.10.90", description: "Bloco de notas / agenda", category: "ESCRITORIO" },
  { code: "4802.56.99", description: "Papel sulfite A4 (resma)", category: "ESCRITORIO" },
  { code: "9608.10.00", description: "Caneta esferográfica", category: "ESCRITORIO" },
  { code: "9609.10.00", description: "Lápis de escrever / lápis de cor", category: "ESCRITORIO" },
  { code: "9609.90.00", description: "Giz / pincel atômico / marcador", category: "ESCRITORIO" },
  { code: "3926.10.00", description: "Pasta de arquivo (plástico)", category: "ESCRITORIO" },
  { code: "3919.10.00", description: "Fita adesiva / durex", category: "ESCRITORIO" },
  { code: "8443.32.52", description: "Cartucho de tinta para impressora", category: "ESCRITORIO" },
  { code: "3926.30.00", description: "Clipe / grampo / elástico", category: "ESCRITORIO" },
];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const [form, setForm] = useState({ name: "", ncmCode: "", unit: "KG", minStock: 0, programId: "", barcode: "", invoiceNumber: "" });
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pRes, prRes] = await Promise.all([fetch("/api/products"), fetch("/api/programs")]);
    if (pRes.ok) setProducts(await pRes.json());
    if (prRes.ok) setPrograms(await prRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm({ name: "", ncmCode: "", unit: "KG", minStock: 0, programId: "", barcode: "", invoiceNumber: "" }); setDuplicateBlocked(false); setSelected(null); setModal("add"); }
  function openEdit(p: Product) {
    setForm({ name: p.name, ncmCode: p.ncmCode, unit: p.unit, minStock: p.minStock, programId: "", barcode: (p as any).barcode ?? "", invoiceNumber: "" });
    setDuplicateBlocked(false); setSelected(p); setModal("edit");
  }
  function openDelete(p: Product) { setSelected(p); setModal("delete"); }
  function closeModal() { setModal(null); setSelected(null); setDuplicateBlocked(false); }

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const url = selected ? `/api/products/${selected.id}` : "/api/products";
      const method = selected ? "PATCH" : "POST";
      const body = selected
        ? { name: form.name, ncmCode: form.ncmCode, unit: form.unit, minStock: Number(form.minStock), barcode: form.barcode || null }
        : { ...form, minStock: Number(form.minStock), barcode: form.barcode || null, invoiceNumber: form.invoiceNumber || undefined };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.status === 409) { toast.error(data.error); setDuplicateBlocked(true); return; }
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar produto"); return; }
      toast.success(selected ? "Produto atualizado!" : "Produto cadastrado!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao excluir produto"); return; }
      toast.success("Produto excluído!");
      closeModal(); load();
    } finally { setSaving(false); }
  }

  const filtered = products.filter((p) =>
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.ncmCode.includes(search)) &&
    (!filterProgram || (filterProgram === "CATALOGO" ? !p.program : p.program?.type === filterProgram))
  );

  const statusColor = (b: number, min: number) => b <= 0 ? "red" : b <= min ? "yellow" : "green";
  const statusLabel = (b: number, min: number) => b <= 0 ? "Zerado" : b <= min ? "Baixo" : "OK";

  return (
    <div>
      <PageHeader title="Produtos (NCM)" description="Gerencie os produtos com código NCM da Receita Federal">
        <Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Produto</Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou NCM..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:outline-none">
          <option value="">Todos os programas</option>
          <option value="CATALOGO">Catálogo (sem programa)</option>
          {Object.entries(PROGRAM_TYPES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum produto" description="Adicione o primeiro produto NCM." action={<Button onClick={openAdd}><Plus className="w-4 h-4" />Novo Produto</Button>} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>NCM</Th>
                <Th>Cód. Barras</Th>
                <Th>Programa</Th>
                <Th>Unidade</Th>
                <Th>Saldo</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td><span className="font-medium">{p.name}</span></Td>
                  <Td className="text-slate-500 font-mono text-xs">{p.ncmCode}</Td>
                  <Td className="font-mono text-xs text-slate-400">
                    {(p as any).barcode
                      ? <span className="flex items-center gap-1"><Barcode className="w-3 h-3" />{(p as any).barcode}</span>
                      : <span className="text-slate-200">—</span>}
                  </Td>
                  <Td>
                    {p.program
                      ? <Badge color={p.program.type === "MERENDA" ? "green" : p.program.type === "MANUTENCAO" ? "blue" : "purple"}>{PROGRAM_TYPES[p.program.type as keyof typeof PROGRAM_TYPES]?.label ?? p.program.type}</Badge>
                      : <Badge color="yellow">Catálogo</Badge>}
                  </Td>
                  <Td className="text-slate-500">{p.unit}</Td>
                  <Td className="font-semibold">{(p.balance ?? 0).toFixed(2)} {p.unit}</Td>
                  <Td><Badge color={statusColor(p.balance, p.minStock)}>{statusLabel(p.balance, p.minStock)}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="Editar"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => openDelete(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal open={!!modal && modal !== "delete"} onClose={closeModal} title={selected ? "Editar Produto" : "Novo Produto"} size="lg">
        <div className="space-y-4">
          <Input label="Nome do Produto *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Arroz beneficiado tipo 1" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Código NCM (Receita Federal) *</label>
            <input
              value={form.ncmCode}
              onChange={(e) => setForm({ ...form, ncmCode: e.target.value })}
              list="ncm-list"
              placeholder="Digite o código ou descrição para buscar..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="ncm-list">
              {NCM_QUICK.map((n) => <option key={n.code} value={n.code}>{n.description} [{n.category}]</option>)}
            </datalist>
            <p className="text-xs text-slate-400 mt-1">Tabela NCM — Nomenclatura Comum do Mercosul / Receita Federal. Pode digitar manualmente.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Unidade de medida *" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={UNITS} />
            <Input label="Estoque mínimo (alerta)" type="number" min={0} step={0.01} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
          </div>

          {!selected && (
            <div>
              <Select
                label="Programa"
                value={form.programId}
                onChange={(e) => setForm({ ...form, programId: e.target.value })}
                options={[
                  { value: "", label: "Catálogo — disponível em todos os programas" },
                  ...programs.map((p) => ({ value: p.id, label: `${p.name} (${PROGRAM_TYPES[p.type as keyof typeof PROGRAM_TYPES]?.label ?? p.type})` })),
                ]}
              />
              <p className="text-xs text-slate-400 mt-1">Deixar em &ldquo;Catálogo&rdquo; para que o produto fique disponível em qualquer programa sem precisar recadastrá-lo.</p>
            </div>
          )}

          {/* Código de barras */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Código de Barras (EAN / Code-128)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Ex: 7891234567890"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-blue-400 transition-colors"
                title="Escanear código de barras"
              >
                <Barcode className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Opcional. Permite buscar o produto por leitura óptica nas entradas de estoque.</p>
          </div>

          {/* Campo NF: sempre visível no cadastro (não edição); destaca quando há duplicata bloqueada */}
          {!selected && (
            <div className={`rounded-xl border-2 p-3 transition-colors ${duplicateBlocked ? "border-red-400 bg-red-50" : "border-slate-200"}`}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nº da Nota Fiscal <span className="text-slate-400 font-normal">(obrigatório se o produto já existir neste programa)</span>
              </label>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => { setForm({ ...form, invoiceNumber: e.target.value }); if (e.target.value) setDuplicateBlocked(false); }}
                placeholder="Ex: 000123"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {duplicateBlocked && (
                <p className="text-xs text-red-600 mt-1 font-medium">
                  Produto duplicado detectado. Informe o número da NF para liberar o cadastro.
                </p>
              )}
              {!duplicateBlocked && (
                <p className="text-xs text-slate-400 mt-1">
                  Preencha somente se o mesmo produto já existir e precisar ser recadastrado com uma NF diferente.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.name || !form.ncmCode}>Salvar</Button>
        </div>
      </Modal>

      <Modal open={modal === "delete"} onClose={closeModal} title="Excluir Produto" size="sm">
        <p className="text-slate-600 mb-6">Excluir o produto <strong>{selected?.name}</strong>? O histórico de estoque será preservado.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={saving}>Excluir</Button>
        </div>
      </Modal>

      {showScanner && (
        <BarcodeScanner
          title="Escanear código do produto"
          onDetected={(code) => { setForm((f) => ({ ...f, barcode: code })); setShowScanner(false); }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
