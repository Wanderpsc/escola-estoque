"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { BarChart3, FileDown, Package, DollarSign, ArrowDownLeft, ArrowUpRight, AlertTriangle, Settings, ImageIcon, Save, ShoppingBag, Printer } from "lucide-react";
import { PageHeader, Button, Select, Badge } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, EXIT_REASONS } from "@/lib/utils";

type ReportType = "balance" | "entries" | "exits" | "financial" | "extra_exits" | "purchases";

export default function ReportsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const schoolId = (session?.user as any)?.schoolId;

  const [type, setType] = useState<ReportType>("balance");
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Custom header/logo settings
  const [schoolData, setSchoolData] = useState<{ id: string; logoUrl: string | null; customHeader: string | null } | null>(null);
  const [headerForm, setHeaderForm] = useState({ logoUrl: "", customHeader: "" });
  const [savingHeader, setSavingHeader] = useState(false);
  const [showHeaderSettings, setShowHeaderSettings] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!schoolId) return;
    fetch(`/api/schools/${schoolId}`).then(async (r) => {
      if (r.ok) {
        const s = await r.json();
        setSchoolData(s);
        setHeaderForm({ logoUrl: s.logoUrl ?? "", customHeader: s.customHeader ?? "" });
      }
    });
  }, [schoolId]);

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { toast.error("Logo muito grande. Use uma imagem menor que 500KB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setHeaderForm((f) => ({ ...f, logoUrl: ev.target?.result as string }));
    reader.readAsDataURL(file);
  }

  async function saveHeaderSettings() {
    if (!schoolData) return;
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/schools/${schoolData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: headerForm.logoUrl || null, customHeader: headerForm.customHeader || null }),
      });
      if (res.ok) {
        const s = await res.json();
        setSchoolData(s);
        toast.success("Cabeçalho salvo!");
        setShowHeaderSettings(false);
      } else { toast.error("Erro ao salvar."); }
    } finally { setSavingHeader(false); }
  }

  async function generateReport() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (dateFrom) p.set("from", dateFrom);
      if (dateTo)   p.set("to",   dateTo);
      const q  = p.toString();
      const qs = q ? `&${q}` : "";
      const endpoints: Record<ReportType, string> = {
        balance:    "/api/stock/balance",
        entries:    q ? `/api/stock/entries?${q}` : "/api/stock/entries",
        exits:      q ? `/api/stock/exits?${q}`   : "/api/stock/exits",
        financial:  q ? `/api/financial/movements?${q}` : "/api/financial/movements",
        extra_exits: `/api/stock/exits?extra=true${qs}`,
        purchases:   `/api/stock/entries?purchases=true${qs}`,
      };
      const res = await fetch(endpoints[type]);
      if (res.ok) setData(await res.json());
      else toast.error("Erro ao gerar relatório");
    } finally { setLoading(false); }
  }

  async function exportPDF(printMode = false) {
    if (!data) return;
    setGenerating(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF("l", "mm", "a4");
      const now = new Date();
      const titles: Record<ReportType, string> = {
        balance: "Relatório de Saldo de Estoque",
        entries: "Relatório de Entradas (Notas Fiscais)",
        exits: "Relatório de Saídas",
        financial: "Relatório Financeiro",
        extra_exits: "Relatório de Saídas Extras (sem NF)",
        purchases: "Relatório de Compras Informais",
      };

      // Cabeçalho personalizado
      const headerText = schoolData?.customHeader?.split("\n") ?? ["EscolaEstoque"];
      const logoBase64 = schoolData?.logoUrl ?? null;

      doc.setFillColor(30, 64, 175);
      doc.rect(0, 0, 297, 32, "F");
      doc.setTextColor(255, 255, 255);

      let textX = 14;
      if (logoBase64) {
        try { doc.addImage(logoBase64, 14, 4, 24, 24); textX = 42; } catch {}
      }

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(headerText[0] ?? "EscolaEstoque", textX, 12);
      if (headerText[1]) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(headerText[1], textX, 19);
      }
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(titles[type], textX, headerText[1] ? 26 : 21);
      doc.setFontSize(8);
      doc.text(`Gerado em ${formatDate(now)} às ${now.toLocaleTimeString("pt-BR")}`, 220, 28);

      if (type === "balance") {
        autoTable(doc, {
          startY: 38,
          head: [["Produto", "NCM", "Programa", "Entradas", "Saídas", "Saldo", "Preço Médio", "Valor em Est.", "Status"]],
          body: data.map((r) => [
            r.name, r.ncmCode,
            PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
            `${r.totalIn.toFixed(2)} ${r.unit}`,
            `${r.totalOut.toFixed(2)} ${r.unit}`,
            `${r.balance.toFixed(2)} ${r.unit}`,
            formatCurrency(r.avgPrice),
            formatCurrency(r.totalValue),
            r.status === "ZERO" ? "ZERADO" : r.status === "LOW" ? "BAIXO" : "OK",
          ]),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [30, 64, 175] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          didParseCell: (data) => {
            if (data.column.index === 8) {
              const val = data.cell.raw as string;
              if (val === "ZERADO") data.cell.styles.textColor = [220, 38, 38];
              if (val === "BAIXO") data.cell.styles.textColor = [161, 98, 7];
            }
          },
        });
        const totalValue = data.reduce((s: number, r: any) => s + r.totalValue, 0);
        const y = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`Valor Total em Estoque: ${formatCurrency(totalValue)}`, 14, y);
      } else if (type === "entries") {
        autoTable(doc, {
          startY: 38,
          head: [["NF", "Série", "Data", "Fornecedor", "Programa", "Qtd Itens", "Valor Total", "Usuário"]],
          body: data.map((r) => [
            r.invoiceNumber, r.invoiceSeries ?? "", formatDate(r.invoiceDate),
            r.supplier.name,
            PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
            r.items.length,
            formatCurrency(r.totalValue), r.user.name,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 64, 175] },
        });
        const total = data.reduce((s: number, r: any) => s + r.totalValue, 0);
        const y = (doc as any).lastAutoTable.finalY + 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Total em Notas Fiscais: ${formatCurrency(total)}`, 14, y);
      } else if (type === "exits") {
        autoTable(doc, {
          startY: 38,
          head: [["Data", "Programa", "Motivo", "Qtd Itens", "Valor Total", "Usuário"]],
          body: data.map((r) => [
            formatDate(r.exitDate),
            PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
            EXIT_REASONS[r.reason as keyof typeof EXIT_REASONS] ?? r.reason,
            r.items.length,
            formatCurrency(r.items.reduce((s: number, i: any) => s + i.totalPrice, 0)),
            r.user.name,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 64, 175] },
        });
        const totalExits = data.reduce((s: number, r: any) => s + r.items.reduce((ss: number, i: any) => ss + i.totalPrice, 0), 0);
        const yExits = (doc as any).lastAutoTable.finalY + 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Total Saídas: ${formatCurrency(totalExits)}`, 14, yExits);
      } else if (type === "purchases") {
        autoTable(doc, {
          startY: 40,
          head: [["Data", "Programa", "Fornecedor", "Produto", "Qtd", "Vl. Unit.", "Total", "Obs."]],
          body: data.flatMap((r: any) =>
            r.items.map((i: any) => [
              formatDate(r.invoiceDate),
              PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
              r.supplier.name,
              `${i.product.name} (${i.product.unit})`,
              i.quantity.toFixed(2),
              formatCurrency(i.unitPrice),
              formatCurrency(i.totalPrice),
              r.observations ?? "",
            ])
          ),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [180, 83, 9] },
        });
        const totalP = data.reduce((s: number, r: any) => s + r.totalValue, 0);
        const yP = (doc as any).lastAutoTable.finalY + 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Total Compras Informais: ${formatCurrency(totalP)}`, 14, yP);
      } else if (type === "extra_exits") {
        autoTable(doc, {
          startY: 40,
          head: [["Data", "Programa", "Produto", "Qtd", "Vl. Unit.", "Total", "Observações", "Usuário"]],
          body: data.flatMap((r: any) =>
            r.items.map((i: any) => [
              formatDate(r.exitDate),
              PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
              `${i.product.name} (${i.product.unit})`,
              i.quantity.toFixed(2),
              formatCurrency(i.unitPrice),
              formatCurrency(i.totalPrice),
              r.observations ?? "",
              r.user.name,
            ])
          ),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [234, 88, 12] },
        });
        const totalX = data.reduce((s: number, r: any) => s + r.items.reduce((ss: number, i: any) => ss + i.totalPrice, 0), 0);
        const yX = (doc as any).lastAutoTable.finalY + 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Total Saídas Extras: ${formatCurrency(totalX)}`, 14, yX);
      } else {
        autoTable(doc, {
          startY: 38,
          head: [["Data", "Programa", "Tipo", "Descrição", "Referência", "Valor"]],
          body: data.map((r) => [
            formatDate(r.date), r.program?.name ?? "",
            r.type === "CREDIT" ? "CRÉDITO" : "DÉBITO",
            r.description, r.reference ?? "",
            formatCurrency(r.amount),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 64, 175] },
          didParseCell: (data) => {
            if (data.column.index === 2) {
              if (data.cell.raw === "CRÉDITO") data.cell.styles.textColor = [22, 163, 74];
              if (data.cell.raw === "DÉBITO") data.cell.styles.textColor = [220, 38, 38];
            }
          },
        });
        const totalCr = data.filter((r: any) => r.type === "CREDIT").reduce((s: number, r: any) => s + r.amount, 0);
        const totalDb = data.filter((r: any) => r.type === "DEBIT").reduce((s: number, r: any) => s + r.amount, 0);
        const netFin = totalCr - totalDb;
        const yFin = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);  doc.text(`Créditos: ${formatCurrency(totalCr)}`, 14, yFin);
        doc.setTextColor(220, 38, 38); doc.text(`Débitos: ${formatCurrency(totalDb)}`, 110, yFin);
        doc.setTextColor(netFin >= 0 ? 22 : 220, netFin >= 0 ? 163 : 38, netFin >= 0 ? 74 : 38);
        doc.text(`Saldo Líquido: ${formatCurrency(netFin)}`, 205, yFin);
        doc.setTextColor(0, 0, 0);
      }

      // Rodapé
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`EscolaEstoque – Relatório gerado em ${now.toLocaleString("pt-BR")} – Página ${i} de ${pageCount}`, 14, 205);
      }

      if (printMode) {
        doc.autoPrint();
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank");
        if (win) win.focus();
        toast.success("Abrindo para impressão...");
      } else {
        doc.save(`escola-estoque-${type}-${now.getTime()}.pdf`);
        toast.success("PDF gerado e baixado!");
      }
    } catch (err) {
      toast.error("Erro ao gerar PDF");
    } finally { setGenerating(false); }
  }

  const reportTypes = [
    { value: "balance", label: "Saldo de Estoque", icon: Package, desc: "Posição atual de todos os produtos com alertas" },
    { value: "entries", label: "Entradas (Notas Fiscais)", icon: ArrowUpRight, desc: "Histórico de entradas com dados da NF" },
    { value: "exits", label: "Saídas de Estoque", icon: ArrowDownLeft, desc: "Histórico de saídas e consumo" },
    { value: "financial", label: "Movimentações Financeiras", icon: DollarSign, desc: "Créditos e débitos por programa" },
    { value: "extra_exits", label: "Saídas Extras (sem NF)", icon: AlertTriangle, desc: "Saídas de produtos não registrados em nota fiscal" },
    { value: "purchases", label: "Compras Informais", icon: ShoppingBag, desc: "Compras realizadas sem nota fiscal formal" },
  ];

  return (
    <div>
      <PageHeader title="Relatórios" description="Gere e exporte relatórios em PDF para prestação de contas">
        {data && (
          <>
            <Button variant="secondary" onClick={() => exportPDF(true)} loading={generating}><Printer className="w-4 h-4" />Imprimir</Button>
            <Button onClick={() => exportPDF(false)} loading={generating}><FileDown className="w-4 h-4" />Exportar PDF</Button>
          </>
        )}
        {["SCHOOL_ADMIN", "MANAGER"].includes(role) && (
          <Button variant="secondary" onClick={() => setShowHeaderSettings((v) => !v)}>
            <Settings className="w-4 h-4" />{showHeaderSettings ? "Fechar Configurações" : "Cabeçalho do Relatório"}
          </Button>
        )}
      </PageHeader>

      {/* Painel de configuração de cabeçalho */}
      {showHeaderSettings && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />Cabeçalho Personalizado dos PDFs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Logotipo (PNG/JPG, máx. 500KB)</label>
              {headerForm.logoUrl && (
                <img src={headerForm.logoUrl} alt="Logo" className="h-16 mb-2 rounded border border-slate-200 bg-white p-1" />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  {headerForm.logoUrl ? "Trocar imagem" : "Selecionar imagem"}
                </button>
                {headerForm.logoUrl && (
                  <button type="button" onClick={() => setHeaderForm((f) => ({ ...f, logoUrl: "" }))} className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
                    Remover
                  </button>
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Texto do cabeçalho (1 linha por padrão, 2 linhas máx.)</label>
              <textarea
                rows={3}
                value={headerForm.customHeader}
                onChange={(e) => setHeaderForm((f) => ({ ...f, customHeader: e.target.value }))}
                placeholder={"PREFEITURA MUNICIPAL DE EXEMPLO\nSECRETARIA MUNICIPAL DE EDUCAÇÃO"}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">Cada linha de texto = 1 linha no cabeçalho do PDF.</p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={saveHeaderSettings} loading={savingHeader}><Save className="w-4 h-4" />Salvar Cabeçalho</Button>
          </div>
        </div>
      )}

      {/* Tipo de relatório */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {reportTypes.map((r) => (
          <button
            key={r.value}
            onClick={() => { setType(r.value as ReportType); setData(null); }}
            className={`text-left p-4 rounded-xl border-2 transition-all ${type === r.value ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${type === r.value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              <r.icon className="w-5 h-5" />
            </div>
            <p className="font-semibold text-sm text-slate-800">{r.label}</p>
            <p className="text-xs text-slate-400 mt-1">{r.desc}</p>
          </button>
        ))}
      </div>

      {/* Filtro de período */}
      <div className="flex items-center gap-4 mb-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">De</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setData(null); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">até</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setData(null); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "Este mês", fn: () => { const n = new Date(); setDateFrom(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-01`); setDateTo(n.toISOString().split("T")[0]); setData(null); } },
            { label: "Este ano",  fn: () => { setDateFrom(`${new Date().getFullYear()}-01-01`); setDateTo(new Date().toISOString().split("T")[0]); setData(null); } },
            { label: "Tudo",      fn: () => { setDateFrom(""); setDateTo(""); setData(null); } },
          ].map((s) => (
            <button key={s.label} onClick={s.fn} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-600">{s.label}</button>
          ))}
        </div>
        {(dateFrom || dateTo) && <span className="text-xs text-blue-600 ml-auto">{dateFrom || "⋯"} → {dateTo || "⋯"}</span>}
      </div>

      <div className="flex gap-3 mb-6">
        <Button onClick={generateReport} loading={loading}><BarChart3 className="w-4 h-4" />Gerar Relatório</Button>
        {data && <Button variant="secondary" onClick={() => exportPDF(true)} loading={generating}><Printer className="w-4 h-4" />Imprimir</Button>}
        {data && <Button variant="secondary" onClick={() => exportPDF(false)} loading={generating}><FileDown className="w-4 h-4" />Exportar PDF</Button>}
      </div>

      {/* Prévia do relatório */}
      {data && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">{reportTypes.find((r) => r.value === type)?.label}</h3>
              <p className="text-xs text-slate-400">{data.length} registro(s)</p>
            </div>
            <Badge color="green">Pronto para exportar</Badge>
          </div>

          <div className="overflow-x-auto">
            {type === "balance" && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Produto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">NCM</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Saldo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor em Est.</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 border-b">Status</th>
                  </tr></thead>
                  <tbody>{data.slice(0, 20).map((r: any) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.ncmCode}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{r.balance.toFixed(2)} {r.unit}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(r.totalValue)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge color={r.status === "ZERO" ? "red" : r.status === "LOW" ? "yellow" : "green"}>{r.status}</Badge>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="px-5 py-3 bg-blue-50 border-t-2 border-blue-100 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{data.length} produto(s)</span>
                  <span className="text-sm font-bold text-blue-700">Valor total em estoque: {formatCurrency(data.reduce((s: number, r: any) => s + r.totalValue, 0))}</span>
                </div>
              </>
            )}
            {type === "entries" && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">NF</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Fornecedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor</th>
                  </tr></thead>
                  <tbody>{data.slice(0, 20).map((r: any) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium">NF {r.invoiceNumber}</td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(r.invoiceDate)}</td>
                      <td className="px-4 py-2.5">{r.supplier.name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(r.totalValue)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="px-5 py-3 bg-green-50 border-t-2 border-green-100 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{data.length} nota(s) fiscal(is)</span>
                  <span className="text-sm font-bold text-green-700">Total entradas: {formatCurrency(data.reduce((s: number, r: any) => s + r.totalValue, 0))}</span>
                </div>
              </>
            )}
            {type === "exits" && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Motivo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Itens</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Usuário</th>
                  </tr></thead>
                  <tbody>{data.slice(0, 20).map((r: any) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(r.exitDate)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label}</td>
                      <td className="px-4 py-2.5">{EXIT_REASONS[r.reason as keyof typeof EXIT_REASONS] ?? r.reason}</td>
                      <td className="px-4 py-2.5 text-right">{r.items.length}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600">{formatCurrency(r.items.reduce((s: number, i: any) => s + i.totalPrice, 0))}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.user.name}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="px-5 py-3 bg-red-50 border-t-2 border-red-100 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{data.length} saída(s)</span>
                  <span className="text-sm font-bold text-red-700">Total saídas: {formatCurrency(data.reduce((s: number, r: any) => s + r.items.reduce((ss: number, i: any) => ss + i.totalPrice, 0), 0))}</span>
                </div>
              </>
            )}
            {type === "extra_exits" && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Produto</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Qtd</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Obs.</th>
                  </tr></thead>
                  <tbody>{data.slice(0, 20).flatMap((r: any) => r.items.map((i: any, idx: number) => (
                    <tr key={`${r.id}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(r.exitDate)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{i.product.name} <span className="text-slate-400">({i.product.unit})</span></td>
                      <td className="px-4 py-2.5 text-right">{i.quantity.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-orange-700">{formatCurrency(i.totalPrice)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 italic">{r.observations ?? "—"}</td>
                    </tr>
                  )))}</tbody>
                </table>
                <div className="px-5 py-3 bg-orange-50 border-t-2 border-orange-100 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{data.length} saída(s) extra(s)</span>
                  <span className="text-sm font-bold text-orange-700">Total saídas extras: {formatCurrency(data.reduce((s: number, r: any) => s + r.items.reduce((ss: number, i: any) => ss + i.totalPrice, 0), 0))}</span>
                </div>
              </>
            )}
            {type === "purchases" && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Fornecedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Produto</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Qtd</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor</th>
                  </tr></thead>
                  <tbody>{data.slice(0, 20).flatMap((r: any) => r.items.map((i: any, idx: number) => (
                    <tr key={`${r.id}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(r.invoiceDate)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label}</td>
                      <td className="px-4 py-2.5">{r.supplier.name}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{i.product.name} <span className="text-slate-400">({i.product.unit})</span></td>
                      <td className="px-4 py-2.5 text-right">{i.quantity.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-amber-700">{formatCurrency(i.totalPrice)}</td>
                    </tr>
                  )))}</tbody>
                </table>
                <div className="px-5 py-3 bg-amber-50 border-t-2 border-amber-100 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{data.length} compra(s)</span>
                  <span className="text-sm font-bold text-amber-700">Total compras informais: {formatCurrency(data.reduce((s: number, r: any) => s + r.totalValue, 0))}</span>
                </div>
              </>
            )}
            {type === "financial" && (() => {
              const cr = data.filter((r: any) => r.type === "CREDIT").reduce((s: number, r: any) => s + r.amount, 0);
              const db = data.filter((r: any) => r.type === "DEBIT").reduce((s: number, r: any) => s + r.amount, 0);
              const net = cr - db;
              return (
                <>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Descrição</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor</th>
                    </tr></thead>
                    <tbody>{data.slice(0, 20).map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2.5">{formatDate(r.date)}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{r.program?.name}</td>
                        <td className="px-4 py-2.5"><Badge color={r.type === "CREDIT" ? "green" : "red"}>{r.type === "CREDIT" ? "Crédito" : "Débito"}</Badge></td>
                        <td className="px-4 py-2.5 text-slate-600">{r.description}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${r.type === "CREDIT" ? "text-green-700" : "text-red-600"}`}>{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <div className="px-5 py-3 bg-slate-50 border-t-2 border-slate-200 flex flex-wrap gap-6 items-center justify-end">
                    <span className="text-sm font-semibold text-green-700">Créditos: {formatCurrency(cr)}</span>
                    <span className="text-sm font-semibold text-red-600">Débitos: {formatCurrency(db)}</span>
                    <span className={`text-sm font-bold ${net >= 0 ? "text-green-800" : "text-red-700"}`}>Saldo líquido: {formatCurrency(net)}</span>
                  </div>
                </>
              );
            })()}
          </div>
          {data.length > 20 && <p className="px-5 py-3 text-xs text-slate-400 border-t">Mostrando 20 de {data.length} registros. O PDF conterá todos.</p>}
        </div>
      )}
    </div>
  );
}
