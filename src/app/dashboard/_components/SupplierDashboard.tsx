import Link from "next/link";
import { Clock, CheckCircle, Truck, Plus, AlertTriangle, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface RecentOrder {
  id: string;
  status: string;
  deliveryDate: string;
  notes: string | null;
  program: { name: string } | null;
  stockEntry: { invoiceNumber: string; invoiceSeries: string | null } | null;
  items: Array<{ quantityOrdered: number; unitPrice: number; product: { name: string; unit: string } }>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando confirmação",
  CONFIRMED: "Confirmada",
  PARTIAL: "Parcialmente confirmada",
  CANCELLED: "Cancelada",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-green-100 text-green-700",
  PARTIAL: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function SupplierDashboard({
  supplierName,
  pendingCount,
  confirmedCount,
  recentOrders,
}: {
  supplierName: string;
  pendingCount: number;
  confirmedCount: number;
  recentOrders: RecentOrder[];
}) {
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Minhas Entregas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Bem-vindo, {supplierName}. Gerencie suas entregas de mercadorias.
          </p>
        </div>
        <Link href="/dashboard/deliveries"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
          <Plus className="w-4 h-4" /> Registrar Entrega
        </Link>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-yellow-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-500">Aguardando confirmação</span>
            <Clock className="w-5 h-5 text-yellow-500" />
          </div>
          <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
          <p className="text-xs text-slate-400 mt-1">entrega(s) pendente(s)</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-500">Confirmadas</span>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-700">{confirmedCount}</p>
          <p className="text-xs text-slate-400 mt-1">entrega(s) aceita(s)</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-500">Total de entregas</span>
            <Truck className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-blue-700">{recentOrders.length > 0 ? pendingCount + confirmedCount : 0}</p>
          <p className="text-xs text-slate-400 mt-1">no período</p>
        </div>
      </div>

      {/* Alerta se há pendentes */}
      {pendingCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-800">
            Você tem <strong>{pendingCount}</strong> entrega(s) aguardando confirmação do administrador da escola.
          </p>
          <Link href="/dashboard/deliveries" className="ml-auto text-xs font-semibold text-yellow-700 hover:text-yellow-900 flex items-center gap-1">
            Ver <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Entregas recentes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Entregas Recentes</h2>
          <Link href="/dashboard/deliveries" className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            Ver todas <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Truck className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-400">Nenhuma entrega registrada ainda.</p>
            <Link href="/dashboard/deliveries"
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
              <Plus className="w-4 h-4" /> Registrar primeira entrega
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentOrders.map((order) => {
              const total = order.items.reduce((s, i) => s + i.quantityOrdered * i.unitPrice, 0);
              return (
                <div key={order.id} className="px-5 py-3 hover:bg-slate-50 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {STATUS_LABEL[order.status] ?? order.status}
                      </span>
                      {order.stockEntry && (
                        <span className="text-xs text-slate-500 font-mono">
                          NF {order.stockEntry.invoiceNumber}{order.stockEntry.invoiceSeries ? ` · Parc. ${order.stockEntry.invoiceSeries}` : ""}
                        </span>
                      )}
                      {order.program && <span className="text-xs text-slate-400">{order.program.name}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(order.deliveryDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{order.items.length} item(ns)
                      {order.notes && ` · ${order.notes.slice(0, 40)}${order.notes.length > 40 ? "…" : ""}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-700 shrink-0">{formatCurrency(total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">Como funciona:</p>
        <p>1. Clique em <strong>"Registrar Entrega"</strong> e selecione a Nota Fiscal autorizada pelo administrador.</p>
        <p>2. Informe as quantidades entregues para cada produto. Adicione itens fora da NF com justificativa, se necessário.</p>
        <p>3. Sua entrega ficará <strong>"Aguardando confirmação"</strong> até o administrador da escola aceitar o recebimento.</p>
      </div>
    </div>
  );
}
