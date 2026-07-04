"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BarChart3, FileDown, Package, DollarSign, ArrowDownLeft, ArrowUpRight, AlertTriangle } from "lucide-react";
import { PageHeader, Button, Select, Badge } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, EXIT_REASONS } from "@/lib/utils";

type ReportType = "balance" | "entries" | "exits" | "financial";

export default function ReportsPage() {
  const [type, setType] = useState<ReportType>("balance");
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function generateReport() {
    setLoading(true);
    try {
      const endpoints: Record<ReportType, string> = {
        balance: "/api/stock/balance",
        entries: "/api/stock/entries",
        exits: "/api/stock/exits",
        financial: "/api/financial/movements",
      };
      const res = await fetch(endpoints[type]);
      if (res.ok) setData(await res.json());
      else toast.error("Erro ao gerar relatório");
    } finally { setLoading(false); }
  }

  async function exportPDF() {
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
      };

      // Cabeçalho
      doc.setFillColor(30, 64, 175);
      doc.rect(0, 0, 297, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("EscolaEstoque", 14, 13);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(titles[type], 14, 22);
      doc.setFontSize(9);
      doc.text(`Gerado em ${formatDate(now)} às ${now.toLocaleTimeString("pt-BR")}`, 220, 22);

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
      }

      // Rodapé
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`EscolaEstoque – Relatório gerado em ${now.toLocaleString("pt-BR")} – Página ${i} de ${pageCount}`, 14, 205);
      }

      doc.save(`escola-estoque-${type}-${now.getTime()}.pdf`);
      toast.success("PDF gerado e baixado!");
    } catch (err) {
      toast.error("Erro ao gerar PDF");
    } finally { setGenerating(false); }
  }

  const reportTypes = [
    { value: "balance", label: "Saldo de Estoque", icon: Package, desc: "Posição atual de todos os produtos com alertas" },
    { value: "entries", label: "Entradas (Notas Fiscais)", icon: ArrowUpRight, desc: "Histórico de entradas com dados da NF" },
    { value: "exits", label: "Saídas de Estoque", icon: ArrowDownLeft, desc: "Histórico de saídas e consumo" },
    { value: "financial", label: "Movimentações Financeiras", icon: DollarSign, desc: "Créditos e débitos por programa" },
  ];

  return (
    <div>
      <PageHeader title="Relatórios" description="Gere e exporte relatórios em PDF para prestação de contas">
        {data && (
          <Button onClick={exportPDF} loading={generating}><FileDown className="w-4 h-4" />Exportar PDF</Button>
        )}
      </PageHeader>

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

      <div className="flex gap-3 mb-6">
        <Button onClick={generateReport} loading={loading}><BarChart3 className="w-4 h-4" />Gerar Relatório</Button>
        {data && <Button variant="secondary" onClick={exportPDF} loading={generating}><FileDown className="w-4 h-4" />Exportar PDF</Button>}
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
            )}
            {type === "entries" && (
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
            )}
            {type === "financial" && (
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
            )}
          </div>
          {data.length > 20 && <p className="px-5 py-3 text-xs text-slate-400 border-t">Mostrando 20 de {data.length} registros. O PDF conterá todos.</p>}
        </div>
      )}
    </div>
  );
}
