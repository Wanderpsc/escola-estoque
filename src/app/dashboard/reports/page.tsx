"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { BarChart3, FileDown, Package, DollarSign, ArrowDownLeft, ArrowUpRight, Settings, ImageIcon, Save, Printer, ShoppingCart, CalendarCheck, ClipboardList } from "lucide-react";
import { PageHeader, Button, Select, Badge } from "@/components/ui";
import { formatCurrency, formatDate, PROGRAM_TYPES, EXIT_REASONS } from "@/lib/utils";

type ReportType = "balance" | "entries" | "exits" | "financial" | "needs_purchase" | "annual_execution" | "accountability" | "internal_stock";

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
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [reportProgramId, setReportProgramId] = useState("");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  // annual_execution retorna objeto {year, programs, totals}, não array
  const [annualData, setAnnualData] = useState<any | null>(null);
  // accountability retorna array de programas com parcelas
  const [accountabilityData, setAccountabilityData] = useState<any[] | null>(null);

  useEffect(() => {
    fetch("/api/programs").then((r) => r.ok ? r.json() : []).then(setPrograms);
  }, []);

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
      if (reportProgramId) p.set("programId", reportProgramId);
      const q  = p.toString();
      const qs = q ? `&${q}` : "";
      const endpoints: Record<ReportType, string> = {
        balance:          q ? `/api/stock/balance?${q}` : "/api/stock/balance",
        entries:          q ? `/api/stock/entries?${q}` : "/api/stock/entries",
        exits:            q ? `/api/stock/exits?${q}`   : "/api/stock/exits",
        financial:        q ? `/api/financial/movements?${q}` : "/api/financial/movements",
        needs_purchase:   q ? `/api/stock/balance?${q}` : "/api/stock/balance",
        annual_execution: `/api/reports/annual-execution?year=${reportYear}${reportProgramId ? `&programId=${reportProgramId}` : ""}`,
        accountability:   `/api/reports/accountability?${p.toString()}`,
        internal_stock:   q ? `/api/stock/balance?${q}` : "/api/stock/balance",
      };
      const res = await fetch(endpoints[type]);
      if (!res.ok) { toast.error("Erro ao gerar relatório"); return; }
      const json = await res.json();
      if (type === "annual_execution") {
        setAnnualData(json); setData([]);
      } else if (type === "accountability") {
        setAccountabilityData(json); setData([]);
      } else if (type === "needs_purchase") {
        const deficit = json
          .filter((r: any) => r.balance < r.minStock || r.balance <= 0)
          .map((r: any) => ({ ...r, needed: Math.max(r.minStock - r.balance, 0) }))
          .sort((a: any, b: any) => {
            const urgA = a.balance <= 0 ? 0 : 1;
            const urgB = b.balance <= 0 ? 0 : 1;
            return urgA !== urgB ? urgA - urgB : a.needed - b.needed;
          });
        setData(deficit);
      } else {
        setData(json);
      }
    } finally { setLoading(false); }
  }

  async function exportPDF(printMode = false) {
    if (!data && !annualData && !accountabilityData) return;
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
        needs_purchase: "Lista de Compras — Produtos Abaixo do Estoque Mínimo",
        annual_execution: `Execução Anual de Recursos — ${reportYear}`,
        accountability: "Prestação de Contas por Programa / Parcela",
        internal_stock: "Relatório de Estoque Interno",
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
      } else if (type === "needs_purchase") {
        const totalEstimated = data.reduce((s: number, r: any) => s + r.needed * (r.avgPrice ?? 0), 0);
        const zerados = data.filter((r: any) => r.balance <= 0).length;
        autoTable(doc, {
          startY: 38,
          head: [["Produto", "NCM", "Programa", "Unidade", "Saldo Atual", "Est. Mínimo", "Qtd. a Comprar", "Preço Médio", "Valor Estimado", "Prioridade"]],
          body: data.map((r: any) => [
            r.name,
            r.ncmCode,
            PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
            r.unit,
            r.balance.toFixed(2),
            r.minStock.toFixed(2),
            r.needed.toFixed(2),
            formatCurrency(r.avgPrice ?? 0),
            formatCurrency(r.needed * (r.avgPrice ?? 0)),
            r.balance <= 0 ? "URGENTE" : "BAIXO",
          ]),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [124, 58, 237] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          didParseCell: (data) => {
            if (data.column.index === 9) {
              if (data.cell.raw === "URGENTE") data.cell.styles.textColor = [220, 38, 38];
              if (data.cell.raw === "BAIXO")   data.cell.styles.textColor = [161, 98, 7];
            }
          },
        });
        const y2 = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        doc.text(`${zerados} produto(s) ZERADO(S)`, 14, y2);
        doc.setTextColor(124, 58, 237);
        doc.text(`Valor estimado para reposição: ${formatCurrency(totalEstimated)}`, 80, y2);
        doc.setTextColor(0, 0, 0);
      } else if (type === "internal_stock") {
        autoTable(doc, {
          startY: 38,
          head: [["Produto", "NCM", "Unidade", "Programa", "Na NF", "A Receber", "Consumido", "Saldo Atual", "Vl. Méd.", "Valor em Est.", "Status"]],
          body: (data ?? []).map((r: any) => [
            r.name, r.ncmCode, r.unit,
            PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.type ?? "",
            r.totalIn.toFixed(2),
            r.pendingReceipt != null ? r.pendingReceipt.toFixed(2) : "—",
            r.totalOut.toFixed(2),
            r.balance.toFixed(2),
            formatCurrency(r.avgPrice),
            formatCurrency(r.totalValue),
            r.status === "ZERO" ? "ZERADO" : r.status === "LOW" ? "BAIXO" : "OK",
          ]),
          styles: { fontSize: 6.5 },
          headStyles: { fillColor: [79, 70, 229] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          didParseCell: (data: any) => {
            if (data.column.index === 10 && data.section === "body") {
              if (data.cell.raw === "ZERADO") data.cell.styles.textColor = [220, 38, 38];
              if (data.cell.raw === "BAIXO")  data.cell.styles.textColor = [161, 98, 7];
            }
          },
        });
        const totalVal = (data ?? []).reduce((s: number, r: any) => s + r.totalValue, 0);
        const yIS = (doc as any).lastAutoTable.finalY + 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Valor total em estoque: ${formatCurrency(totalVal)}`, 14, yIS);
      } else if (type !== "accountability" && type !== "annual_execution") {
        // EXIT-EXTRA-* são informacionais (já contabilizados em exitSpent no saldo financeiro)
        const mainData = (data ?? []).filter((r: any) => !r.reference?.startsWith("EXIT-"));
        const exitExtraData = (data ?? []).filter((r: any) => r.reference?.startsWith("EXIT-"));

        autoTable(doc, {
          startY: 38,
          head: [["Data", "Programa", "Tipo", "Descrição", "Referência", "Valor"]],
          body: mainData.map((r: any) => [
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
        const totalCr = mainData.filter((r: any) => r.type === "CREDIT").reduce((s: number, r: any) => s + r.amount, 0);
        const totalDb = mainData.filter((r: any) => r.type === "DEBIT").reduce((s: number, r: any) => s + r.amount, 0);
        const netFin = totalCr - totalDb;
        const yFin = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(22, 163, 74);  doc.text(`Créditos: ${formatCurrency(totalCr)}`, 14, yFin);
        doc.setTextColor(220, 38, 38); doc.text(`Débitos: ${formatCurrency(totalDb)}`, 110, yFin);
        doc.setTextColor(netFin >= 0 ? 22 : 220, netFin >= 0 ? 163 : 38, netFin >= 0 ? 74 : 38);
        doc.text(`Saldo Líquido: ${formatCurrency(netFin)}`, 205, yFin);
        doc.setTextColor(0, 0, 0);

        // Seção informativa: saídas extras (contabilizadas via consumo de estoque, não duplicar)
        if (exitExtraData.length > 0) {
          const yExtra = (doc as any).lastAutoTable.finalY + 20;
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(234, 88, 12);
          doc.text(`Memorando — Saídas Extras (${exitExtraData.length} reg.) — já abatidas via consumo de estoque`, 14, yExtra);
          doc.setTextColor(0, 0, 0);
          autoTable(doc, {
            startY: yExtra + 4,
            head: [["Data", "Programa", "Produto / Descrição", "Referência", "Valor"]],
            body: exitExtraData.map((r: any) => [
              formatDate(r.date), r.program?.name ?? "",
              r.description, r.reference ?? "",
              formatCurrency(r.amount),
            ]),
            styles: { fontSize: 7 },
            headStyles: { fillColor: [234, 88, 12] },
          });
          const totalExtra = exitExtraData.reduce((s: number, r: any) => s + r.amount, 0);
          const yET = (doc as any).lastAutoTable.finalY + 6;
          doc.setFontSize(8);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(107, 114, 128);
          doc.text(`Total saídas extras (informativo): ${formatCurrency(totalExtra)}`, 14, yET);
          doc.setTextColor(0, 0, 0);
        }
      }

      // ── PDF: Execução Anual ─────────────────────────────────────────────
      if (type === "annual_execution" && annualData) {
        // Consolidado por programa
        autoTable(doc, {
          startY: 38,
          head: [["Programa", "NFs Finalizadas", "Contratado (R$)", "Executado (R$)", "Saldo (R$)", "% Execução"]],
          body: annualData.programs.map((p: any) => [
            p.programName,
            p.nfCount,
            formatCurrency(p.contracted),
            formatCurrency(p.executed),
            formatCurrency(p.balance),
            `${p.executionPct.toFixed(1)}%`,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [5, 150, 105] },
          didParseCell: (data: any) => {
            if (data.column.index === 5 && data.section === "body") {
              const pct = parseFloat(data.cell.raw as string);
              if (pct >= 100) data.cell.styles.textColor = [22, 163, 74];
              else if (pct >= 70) data.cell.styles.textColor = [161, 98, 7];
              else data.cell.styles.textColor = [220, 38, 38];
            }
          },
          foot: [[
            "TOTAL GERAL",
            annualData.totals.nfCount,
            formatCurrency(annualData.totals.contracted),
            formatCurrency(annualData.totals.executed),
            formatCurrency(annualData.totals.balance),
            `${annualData.totals.executionPct.toFixed(1)}%`,
          ]],
          footStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold" },
        });

        // Detalhe por NF de cada programa
        let yDetail = (doc as any).lastAutoTable.finalY + 10;
        for (const prog of annualData.programs) {
          if (yDetail > 185) { doc.addPage(); yDetail = 20; }
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(5, 150, 105);
          doc.text(`${prog.programName} — Detalhamento das NFs`, 14, yDetail);
          doc.setTextColor(0, 0, 0);
          yDetail += 4;
          autoTable(doc, {
            startY: yDetail,
            head: [["NF", "Fornecedor", "Data NF", "Finalizada em", "Contratado", "Executado", "Saldo"]],
            body: prog.entries.map((e: any) => [
              e.invoiceNumber,
              e.supplier,
              new Date(e.invoiceDate).toLocaleDateString("pt-BR"),
              e.finalizedAt ? new Date(e.finalizedAt).toLocaleDateString("pt-BR") : "—",
              formatCurrency(e.contracted),
              formatCurrency(e.executed),
              formatCurrency(e.contracted - e.executed),
            ]),
            styles: { fontSize: 7 },
            headStyles: { fillColor: [209, 250, 229], textColor: [5, 150, 105] },
          });
          yDetail = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      // ── PDF: Prestação de Contas ─────────────────────────────────────────
      if (type === "accountability" && accountabilityData) {
        let yAcc = 38;
        for (const prog of accountabilityData) {
          if (yAcc > 180) { doc.addPage(); yAcc = 20; }
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 64, 175);
          doc.text(`Programa: ${prog.name}`, 14, yAcc);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          doc.text(`Orçamento total: ${formatCurrency(prog.totalBudget)}  |  NFs: ${formatCurrency(prog.totalNF)}  |  Consumo: ${formatCurrency(prog.totalConsumption)}  |  Saldo: ${formatCurrency(prog.balance)}`, 14, yAcc + 6);
          doc.setTextColor(0, 0, 0);
          yAcc += 14;

          const allParcelas = [
            ...(prog.directNFs.length > 0 ? [{ id: prog.id, name: `(Direto — sem parcela)`, budget: prog.budget, totalBudget: prog.budget, nfTotal: prog.directNFTotal ?? 0, consumptionTotal: prog.directConsumptionTotal ?? 0, balance: prog.budget - (prog.directConsumptionTotal ?? 0), nfs: prog.directNFs, consumptions: prog.directConsumptions }] : []),
            ...prog.parcelas,
          ];

          for (const parc of allParcelas) {
            if (yAcc > 180) { doc.addPage(); yAcc = 20; }
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            doc.text(`  Parcela: ${parc.name}`, 14, yAcc);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(`  Orç: ${formatCurrency(parc.totalBudget)}  |  NFs: ${formatCurrency(parc.nfTotal)}  |  Consumo: ${formatCurrency(parc.consumptionTotal)}  |  Saldo: ${formatCurrency(parc.balance)}`, 14, yAcc + 5);
            doc.setTextColor(0, 0, 0);
            yAcc += 12;

            if (parc.nfs && parc.nfs.length > 0) {
              if (yAcc > 175) { doc.addPage(); yAcc = 20; }
              autoTable(doc, {
                startY: yAcc,
                head: [["Nota Fiscal", "Fornecedor", "Data", "Valor", "Status"]],
                body: parc.nfs.map((nf: any) => [
                  nf.invoiceNumber,
                  nf.supplier,
                  new Date(nf.invoiceDate).toLocaleDateString("pt-BR"),
                  formatCurrency(nf.totalValue),
                  nf.status === "FINALIZED" ? "Finalizada" : "Aberta",
                ]),
                styles: { fontSize: 7 },
                headStyles: { fillColor: [219, 234, 254], textColor: [30, 64, 175] },
                margin: { left: 18 },
              });
              yAcc = (doc as any).lastAutoTable.finalY + 4;
            }

            if (parc.consumptions && parc.consumptions.length > 0) {
              if (yAcc > 175) { doc.addPage(); yAcc = 20; }
              autoTable(doc, {
                startY: yAcc,
                head: [["Data Saída", "Motivo", "Responsável", "Valor Consumido"]],
                body: parc.consumptions.map((c: any) => [
                  new Date(c.exitDate).toLocaleDateString("pt-BR"),
                  c.reason,
                  c.user ?? "—",
                  formatCurrency(c.total),
                ]),
                styles: { fontSize: 7 },
                headStyles: { fillColor: [254, 243, 199], textColor: [146, 64, 14] },
                margin: { left: 18 },
              });
              yAcc = (doc as any).lastAutoTable.finalY + 6;
            }
          }

          // Linha separadora entre programas
          doc.setDrawColor(226, 232, 240);
          doc.line(14, yAcc, 283, yAcc);
          yAcc += 6;
        }
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
    { value: "needs_purchase", label: "Lista de Compras", icon: ShoppingCart, desc: "Produtos abaixo do estoque mínimo que precisam ser comprados" },
    { value: "annual_execution", label: "Execução Anual", icon: CalendarCheck, desc: "Recursos acumulados/executados por programa no ano (NFs finalizadas)" },
    { value: "accountability", label: "Prestação de Contas", icon: ClipboardList, desc: "Relatório completo: programa → parcelas → NFs → entregas → consumo → saldo" },
    { value: "internal_stock", label: "Estoque Interno", icon: Package, desc: "Posição detalhada: NF → recebido → a receber → consumido → saldo atual" },
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
            onClick={() => { setType(r.value as ReportType); setData(null); setAnnualData(null); setAccountabilityData(null); }}
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
        {programs.length > 0 && (
          <select value={reportProgramId} onChange={(e) => { setReportProgramId(e.target.value); setData(null); setAnnualData(null); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto">
            <option value="">Todos os programas</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {type === "annual_execution" && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500">Ano:</span>
            <select value={reportYear} onChange={e => { setReportYear(Number(e.target.value)); setAnnualData(null); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {(dateFrom || dateTo) && <span className="text-xs text-blue-600">{dateFrom || "⋯"} → {dateTo || "⋯"}</span>}
      </div>

      <div className="flex gap-3 mb-6">
        <Button onClick={generateReport} loading={loading}><BarChart3 className="w-4 h-4" />Gerar Relatório</Button>
        {(data && data.length > 0 || annualData || accountabilityData) && <Button variant="secondary" onClick={() => exportPDF(true)} loading={generating}><Printer className="w-4 h-4" />Imprimir</Button>}
        {(data && data.length > 0 || annualData || accountabilityData) && <Button variant="secondary" onClick={() => exportPDF(false)} loading={generating}><FileDown className="w-4 h-4" />Exportar PDF</Button>}
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
            {type === "internal_stock" && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Produto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 border-b">Un.</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Na NF</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-orange-600 border-b">A Receber</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-red-600 border-b">Consumido</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-blue-700 border-b">Saldo Atual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor em Est.</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 border-b">Status</th>
                  </tr></thead>
                  <tbody>{data.slice(0, 30).map((r: any) => (
                    <tr key={r.id} className={`border-b hover:bg-slate-50 ${r.status === "ZERO" ? "bg-red-50/40" : r.status === "LOW" ? "bg-amber-50/30" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{r.name}<div className="text-xs font-mono text-slate-400">{r.ncmCode}</div></td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.name}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-500">{r.unit}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{r.totalIn.toFixed(2)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${r.pendingReceipt > 0 ? "text-orange-600" : "text-slate-300"}`}>
                        {r.pendingReceipt != null ? r.pendingReceipt.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600">{r.totalOut.toFixed(2)}</td>
                      <td className={`px-4 py-2.5 text-right font-bold ${r.status === "ZERO" ? "text-red-600" : r.status === "LOW" ? "text-amber-600" : "text-blue-700"}`}>
                        {r.balance.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(r.totalValue)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge color={r.status === "ZERO" ? "red" : r.status === "LOW" ? "yellow" : "green"}>{r.status === "ZERO" ? "Zerado" : r.status === "LOW" ? "Baixo" : "OK"}</Badge>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="px-5 py-3 bg-indigo-50 border-t-2 border-indigo-100 flex flex-wrap gap-6 items-center justify-between">
                  <div className="flex gap-4 text-xs">
                    <span className="text-red-600 font-semibold">{data.filter((r: any) => r.status === "ZERO").length} zerado(s)</span>
                    <span className="text-amber-600 font-semibold">{data.filter((r: any) => r.status === "LOW").length} abaixo do mínimo</span>
                    {data.some((r: any) => r.pendingReceipt > 0) && (
                      <span className="text-orange-600 font-semibold">{data.filter((r: any) => r.pendingReceipt > 0).length} com entrega pendente</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-indigo-700">Valor total em estoque: {formatCurrency(data.reduce((s: number, r: any) => s + r.totalValue, 0))}</span>
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
            {type === "financial" && (() => {
              // EXIT-EXTRA-* são informacionais (já contabilizados em exitSpent no saldo)
              const mainMov = data.filter((r: any) => !r.reference?.startsWith("EXIT-"));
              const exitExtraMov = data.filter((r: any) => r.reference?.startsWith("EXIT-"));
              const cr = mainMov.filter((r: any) => r.type === "CREDIT").reduce((s: number, r: any) => s + r.amount, 0);
              const db = mainMov.filter((r: any) => r.type === "DEBIT").reduce((s: number, r: any) => s + r.amount, 0);
              const net = cr - db;
              const totalExtra = exitExtraMov.reduce((s: number, r: any) => s + r.amount, 0);
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
                    <tbody>{mainMov.slice(0, 20).map((r: any) => (
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
                  {exitExtraMov.length > 0 && (
                    <div className="border-t-4 border-orange-200">
                      <div className="px-5 py-2 bg-orange-50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-orange-700">Memorando — Saídas Extras ({exitExtraMov.length} reg.) — já abatidas via consumo de estoque</span>
                        <span className="text-xs font-semibold text-orange-600">Total informativo: {formatCurrency(totalExtra)}</span>
                      </div>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-orange-50/60">
                          <th className="px-4 py-2 text-left font-semibold text-orange-700 border-b border-orange-100">Data</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-700 border-b border-orange-100">Programa</th>
                          <th className="px-4 py-2 text-left font-semibold text-orange-700 border-b border-orange-100">Produto</th>
                          <th className="px-4 py-2 text-right font-semibold text-orange-700 border-b border-orange-100">Valor</th>
                        </tr></thead>
                        <tbody>{exitExtraMov.slice(0, 10).map((r: any) => (
                          <tr key={r.id} className="border-b border-orange-50 hover:bg-orange-50/40">
                            <td className="px-4 py-1.5 text-slate-500">{formatDate(r.date)}</td>
                            <td className="px-4 py-1.5 text-slate-500">{r.program?.name}</td>
                            <td className="px-4 py-1.5 text-slate-600">{r.description}</td>
                            <td className="px-4 py-1.5 text-right text-orange-700 font-semibold">{formatCurrency(r.amount)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
{type === "needs_purchase" && (() => {
              const totalEst = data.reduce((s: number, r: any) => s + r.needed * (r.avgPrice ?? 0), 0);
              const zerados = data.filter((r: any) => r.balance <= 0).length;
              return (
                <>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Produto</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 border-b">Programa</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 border-b">Unidade</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Saldo Atual</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Est. Mínimo</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b font-bold text-violet-700">Qtd. a Comprar</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Preço Médio</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 border-b">Valor Estimado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 border-b">Prioridade</th>
                    </tr></thead>
                    <tbody>{data.map((r: any) => (
                      <tr key={r.id} className={`border-b hover:bg-slate-50 ${r.balance <= 0 ? "bg-red-50/40" : "bg-amber-50/30"}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-700">{r.name}<div className="text-xs font-mono text-slate-400">{r.ncmCode}</div></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{PROGRAM_TYPES[r.program?.type as keyof typeof PROGRAM_TYPES]?.label ?? r.program?.name}</td>
                        <td className="px-4 py-2.5 text-center text-xs font-mono text-slate-500">{r.unit}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${r.balance <= 0 ? "text-red-600" : "text-amber-600"}`}>{r.balance.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{r.minStock.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-violet-700">{r.needed.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{formatCurrency(r.avgPrice ?? 0)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-violet-800">{formatCurrency(r.needed * (r.avgPrice ?? 0))}</td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge color={r.balance <= 0 ? "red" : "yellow"}>{r.balance <= 0 ? "URGENTE" : "BAIXO"}</Badge>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <div className="px-5 py-3 bg-violet-50 border-t-2 border-violet-100 flex flex-wrap gap-6 items-center justify-between">
                    <div className="flex gap-4 text-xs">
                      <span><span className="font-semibold text-red-600">{zerados}</span> produto(s) zerado(s)</span>
                      <span><span className="font-semibold text-amber-600">{data.length - zerados}</span> produto(s) abaixo do mínimo</span>
                    </div>
                    <span className="text-sm font-bold text-violet-700">Valor estimado para reposição: {formatCurrency(totalEst)}</span>
                  </div>
                </>
              );
            })()}
            {data.length > 20 && type !== "needs_purchase" && <p className="px-5 py-3 text-xs text-slate-400 border-t">Mostrando 20 de {data.length} registros. O PDF conterá todos.</p>}
        </div>
      )}

      {/* ── Prévia: Execução Anual ─────────────────── */}
      {type === "annual_execution" && annualData && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">Execução Anual de Recursos — {annualData.year}</h3>
              <p className="text-xs text-slate-400">{annualData.totals.nfCount} NF(s) finalizada(s)</p>
            </div>
            <Badge color="green">Pronto para exportar</Badge>
          </div>

          {/* Consolidado geral */}
          <div className="grid grid-cols-3 gap-4 px-5 py-4 bg-emerald-50 border-b border-emerald-100">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Total Contratado (NFs)</p>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(annualData.totals.contracted)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Total Executado</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(annualData.totals.executed)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">% Execução / Saldo</p>
              <p className="text-xl font-bold text-slate-800">{annualData.totals.executionPct.toFixed(1)}%
                <span className="text-sm font-normal text-slate-400 ml-2">({formatCurrency(annualData.totals.balance)} restante)</span>
              </p>
            </div>
          </div>

          {/* Por programa */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Programa</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">NFs</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Contratado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">Executado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Saldo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">% Execução</th>
                </tr>
              </thead>
              <tbody>
                {annualData.programs.map((p: any) => (
                  <tr key={p.programId} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.programName}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{p.nfCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(p.contracted)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(p.executed)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(p.balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${p.executionPct >= 100 ? "text-emerald-600" : p.executionPct >= 70 ? "text-amber-600" : "text-red-600"}`}>
                        {p.executionPct.toFixed(1)}%
                      </span>
                      <div className="mt-1 w-full bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${p.executionPct >= 100 ? "bg-emerald-500" : p.executionPct >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${Math.min(p.executionPct, 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                  <td className="px-4 py-3 font-bold text-slate-800">TOTAL GERAL</td>
                  <td className="px-4 py-3 text-right font-bold">{annualData.totals.nfCount}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(annualData.totals.contracted)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatCurrency(annualData.totals.executed)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(annualData.totals.balance)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{annualData.totals.executionPct.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {annualData.totals.nfCount === 0 && (
            <div className="px-5 py-8 text-center text-slate-400">
              <p className="text-sm">Nenhuma NF finalizada em {annualData.year}.</p>
              <p className="text-xs mt-1">Finalize NFs na página de Entradas para fixar os recursos nos relatórios.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Prévia: Prestação de Contas ─────────────────── */}
      {type === "accountability" && accountabilityData && (
        <div className="space-y-6">
          {accountabilityData.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-10 text-center text-slate-400">
              <p className="text-sm">Nenhum programa encontrado com os filtros selecionados.</p>
            </div>
          ) : (
            accountabilityData.map((prog: any) => (
              <div key={prog.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Cabeçalho do programa */}
                <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color={prog.type === "MERENDA" ? "green" : prog.type === "MANUTENCAO" ? "blue" : "purple"}>
                        {PROGRAM_TYPES[prog.type as keyof typeof PROGRAM_TYPES]?.label ?? prog.type}
                      </Badge>
                      <h3 className="font-bold text-slate-800">{prog.name}</h3>
                    </div>
                    <p className="text-xs text-slate-500">
                      {prog.parcelas.length} parcela(s) · {prog.directNFs.length} NF(s) diretas
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-right">
                    <div>
                      <p className="text-xs text-slate-500">Orçamento</p>
                      <p className="font-bold text-slate-800">{formatCurrency(prog.totalBudget)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">NFs Emitidas</p>
                      <p className={`font-bold ${prog.totalNF > prog.totalBudget ? "text-red-600" : "text-amber-600"}`}>{formatCurrency(prog.totalNF)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Consumido</p>
                      <p className="font-bold text-red-600">{formatCurrency(prog.totalConsumption)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Saldo</p>
                      <p className={`font-bold ${prog.balance >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(prog.balance)}</p>
                    </div>
                  </div>
                </div>

                {/* Parcelas */}
                <div className="divide-y divide-slate-100">
                  {[
                    /* NFs diretas no programa pai (sem parcela) */
                    ...(prog.directNFs.length > 0 ? [{
                      id: prog.id + "-direct",
                      name: "(Lançamentos diretos — sem parcela)",
                      budget: prog.budget,
                      totalBudget: prog.budget,
                      nfTotal: prog.directNFTotal ?? 0,
                      consumptionTotal: prog.directConsumptionTotal ?? 0,
                      balance: prog.budget - (prog.directConsumptionTotal ?? 0),
                      nfs: prog.directNFs,
                      consumptions: prog.directConsumptions,
                    }] : []),
                    ...prog.parcelas,
                  ].map((parc: any) => (
                    <div key={parc.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Parcela:</span>
                          <span className="font-semibold text-slate-800">{parc.name}</span>
                        </div>
                        <div className="flex gap-5 text-xs text-right">
                          <div>
                            <span className="text-slate-400 block">Orçamento</span>
                            <span className="font-semibold text-slate-700">{formatCurrency(parc.totalBudget)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">NFs</span>
                            <span className={`font-semibold ${parc.nfTotal > parc.totalBudget ? "text-red-500" : Math.abs(parc.nfTotal - parc.totalBudget) < 0.01 ? "text-green-600" : "text-amber-600"}`}>
                              {formatCurrency(parc.nfTotal)}{Math.abs(parc.nfTotal - parc.totalBudget) < 0.01 && " ✓"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Consumido</span>
                            <span className="font-semibold text-red-600">{formatCurrency(parc.consumptionTotal)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Saldo</span>
                            <span className={`font-bold ${parc.balance >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(parc.balance)}</span>
                          </div>
                        </div>
                      </div>

                      {/* NFs desta parcela */}
                      {parc.nfs && parc.nfs.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-blue-700 mb-1.5">Notas Fiscais ({parc.nfs.length})</p>
                          <table className="w-full text-xs border border-blue-100 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="bg-blue-50">
                                <th className="px-3 py-1.5 text-left text-blue-700">NF</th>
                                <th className="px-3 py-1.5 text-left text-blue-700">Fornecedor</th>
                                <th className="px-3 py-1.5 text-left text-blue-700">Data</th>
                                <th className="px-3 py-1.5 text-right text-blue-700">Valor</th>
                                <th className="px-3 py-1.5 text-center text-blue-700">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parc.nfs.map((nf: any) => (
                                <tr key={nf.id} className="border-t border-blue-50 hover:bg-blue-50/40">
                                  <td className="px-3 py-1.5 font-medium text-slate-700">NF {nf.invoiceNumber}</td>
                                  <td className="px-3 py-1.5 text-slate-600">{nf.supplier}</td>
                                  <td className="px-3 py-1.5 text-slate-500">{formatDate(nf.invoiceDate)}</td>
                                  <td className="px-3 py-1.5 text-right font-semibold text-green-700">{formatCurrency(nf.totalValue)}</td>
                                  <td className="px-3 py-1.5 text-center">
                                    <Badge color={nf.status === "FINALIZED" ? "green" : "yellow"}>{nf.status === "FINALIZED" ? "Finalizada" : "Aberta"}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Consumos desta parcela */}
                      {parc.consumptions && parc.consumptions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-red-700 mb-1.5">Consumo / Saídas ({parc.consumptions.length})</p>
                          <table className="w-full text-xs border border-red-100 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="bg-red-50">
                                <th className="px-3 py-1.5 text-left text-red-700">Data</th>
                                <th className="px-3 py-1.5 text-left text-red-700">Motivo</th>
                                <th className="px-3 py-1.5 text-left text-red-700">Responsável</th>
                                <th className="px-3 py-1.5 text-right text-red-700">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parc.consumptions.map((c: any) => (
                                <tr key={c.id} className="border-t border-red-50 hover:bg-red-50/40">
                                  <td className="px-3 py-1.5 text-slate-500">{formatDate(c.exitDate)}</td>
                                  <td className="px-3 py-1.5 text-slate-600">{c.reason}</td>
                                  <td className="px-3 py-1.5 text-slate-600">{c.user}</td>
                                  <td className="px-3 py-1.5 text-right font-semibold text-red-700">{formatCurrency(c.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {parc.nfs?.length === 0 && parc.consumptions?.length === 0 && (
                        <p className="text-xs text-slate-400 italic">Nenhum lançamento nesta parcela.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
