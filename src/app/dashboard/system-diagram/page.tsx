"use client";

import { useState } from "react";
import { Printer, Network, Database, Globe, Shield, GitBranch, Layers, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

/* ─── tipos internos ─── */
interface ModelField { name: string; type: string; note?: string }
interface ModelDef { name: string; color: string; fields: ModelField[]; relations?: string[] }
interface ApiRoute { method: string; path: string; roles: string; description: string }
interface FlowStep { label: string; type: "action" | "branch" | "result" | "db" }
interface Flow { title: string; color: string; steps: FlowStep[] }

/* ═══════════════════════════════════════════════════════════
   DADOS DO DIAGRAMA
   ═══════════════════════════════════════════════════════════ */

const TECH_STACK = [
  { layer: "Frontend", items: ["Next.js 16 (App Router)", "React 18", "TypeScript", "Tailwind CSS", "Recharts", "jsPDF", "Sonner (toast)", "Lucide Icons"] },
  { layer: "Backend", items: ["Next.js API Routes (Edge-ready)", "NextAuth v5 (JWT)", "Zod (validação)", "bcryptjs (senhas)"] },
  { layer: "Banco de Dados", items: ["PostgreSQL (Neon serverless)", "Prisma ORM v7", "@prisma/adapter-pg", "pg (driver)", "Migrations versionadas"] },
  { layer: "Infra / Deploy", items: ["Vercel (hosting + CI/CD)", "Neon (DB serverless)", "GitHub (repositório)", "Variáveis de env: DATABASE_URL · AUTH_SECRET · NEXTAUTH_URL"] },
];

const ROLES: { role: string; color: string; desc: string; can: string[] }[] = [
  {
    role: "SUPER_ADMIN", color: "bg-purple-100 text-purple-800 border-purple-200",
    desc: "Dono do sistema. Gerencia escolas, licenças e usuários. Não acessa inventário de escolas.",
    can: ["Criar/editar/suspender escolas", "Criar/renovar/cancelar licenças", "Ver todos os usuários", "Acessar diagrama do sistema"],
  },
  {
    role: "SCHOOL_ADMIN", color: "bg-blue-100 text-blue-800 border-blue-200",
    desc: "Diretor da escola. Administra todos os dados da sua escola.",
    can: ["Criar usuários da equipe", "CRUD de fornecedores, produtos, programas", "Gerenciar todo o estoque", "Ver e editar financeiro", "Confirmar ordens de entrega", "Imprimir relatórios"],
  },
  {
    role: "MANAGER", color: "bg-cyan-100 text-cyan-800 border-cyan-200",
    desc: "Gestor. Acesso amplo ao estoque e financeiro, sem criar usuários.",
    can: ["Registrar entradas/saídas", "Compras informais", "Saldo de estoque", "Financeiro", "Relatórios"],
  },
  {
    role: "NUTRITIONIST", color: "bg-green-100 text-green-800 border-green-200",
    desc: "Nutricionista. Focado em Merenda Escolar.",
    can: ["Registrar entradas/saídas de MERENDA", "Entregas", "Relatórios de merenda"],
  },
  {
    role: "ACCOUNTANT", color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    desc: "Contador. Acesso somente leitura ao financeiro.",
    can: ["Ver financeiro (somente leitura)", "Imprimir relatórios"],
  },
  {
    role: "USER", color: "bg-slate-100 text-slate-700 border-slate-200",
    desc: "Auxiliar. Acesso básico a estoque.",
    can: ["Registrar saídas de estoque", "Ver saldo"],
  },
  {
    role: "SUPPLIER", color: "bg-orange-100 text-orange-800 border-orange-200",
    desc: "Fornecedor externo. Registra suas próprias entregas.",
    can: ["Criar ordens de entrega", "Ver histórico das suas entregas"],
  },
];

const DATA_MODELS: ModelDef[] = [
  {
    name: "School", color: "border-blue-400 bg-blue-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "name", type: "String" }, { name: "cnpj", type: "String unique" },
      { name: "address / city / state", type: "String" }, { name: "director", type: "String" },
      { name: "active", type: "Boolean default true" }, { name: "logoUrl / customHeader", type: "String?" },
    ],
    relations: ["users[]", "suppliers[]", "programs[]", "products[]", "license?", "stockAdjustments[]", "deliveryOrders[]"],
  },
  {
    name: "User", color: "border-purple-400 bg-purple-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "name / email", type: "String" }, { name: "password", type: "bcrypt hash" },
      { name: "role", type: "SUPER_ADMIN | SCHOOL_ADMIN | MANAGER | ACCOUNTANT | NUTRITIONIST | USER | SUPPLIER" },
      { name: "schoolId", type: "FK → School?" }, { name: "supplierId", type: "FK → Supplier?" }, { name: "active", type: "Boolean" },
    ],
    relations: ["school?", "supplierLink?", "stockEntries[]", "stockExits[]", "stockAdjustments[]"],
  },
  {
    name: "Program", color: "border-green-400 bg-green-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "name", type: "String" },
      { name: "type", type: "MERENDA | MANUTENCAO | PDDE" }, { name: "budget", type: "Float default 0" },
      { name: "schoolId", type: "FK → School" }, { name: "parentId", type: "FK → Program? (sub-programas)" }, { name: "active", type: "Boolean" },
    ],
    relations: ["products[]", "stockEntries[]", "stockExits[]", "budgetMovements[]", "deliveryOrders[]", "children[]"],
  },
  {
    name: "Product", color: "border-teal-400 bg-teal-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "name", type: "String" }, { name: "ncmCode", type: "String (Receita Federal)" },
      { name: "unit", type: "KG | UN | LT | CX | PCT | DZ | M" }, { name: "minStock", type: "Float" },
      { name: "barcode", type: "String? (EAN-13/EAN-8/Code-128)" },
      { name: "programId", type: "FK → Program" }, { name: "schoolId", type: "FK → School" },
    ],
    relations: ["entryItems[]", "exitItems[]", "adjustments[]", "deliveryOrderItems[]"],
  },
  {
    name: "Supplier", color: "border-orange-400 bg-orange-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "name / cnpj / ie", type: "String" },
      { name: "address / city / state / zipCode", type: "String" },
      { name: "bankName / bankAgency / bankAccount", type: "String?" },
      { name: "schoolId", type: "FK → School" }, { name: "active", type: "Boolean" },
    ],
    relations: ["entries[]", "supplierUsers[]", "deliveryOrders[]"],
  },
  {
    name: "StockEntry", color: "border-emerald-400 bg-emerald-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "invoiceNumber / invoiceSeries / invoiceKey", type: "String?" },
      { name: "invoiceDate", type: "DateTime" }, { name: "totalValue", type: "Float (apenas itens NF)" },
      { name: "supplierId", type: "FK → Supplier" }, { name: "programId", type: "FK → Program" },
      { name: "userId", type: "FK → User" }, { name: "observations", type: "String?" },
      { name: "isPurchase", type: "Boolean — compra informal → gera BudgetMovement DEBIT automático" },
    ],
    relations: ["items[] (EntryItem)"],
  },
  {
    name: "EntryItem", color: "border-emerald-300 bg-emerald-50/60",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "entryId", type: "FK → StockEntry (onDelete: Cascade)" },
      { name: "productId", type: "FK → Product" }, { name: "quantity / unitPrice / totalPrice", type: "Float" },
      { name: "lot", type: "String?" }, { name: "expiresAt", type: "DateTime?" },
      { name: "isExtra", type: "Boolean — item fora da NF → gera BudgetMovement DEBIT NF-EXTRA separado" },
    ],
    relations: [],
  },
  {
    name: "StockExit", color: "border-red-400 bg-red-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "exitDate", type: "DateTime" },
      { name: "reason", type: "CONSUMO | VENCIMENTO | DOACAO | PERDA | OUTRO" },
      { name: "programId", type: "FK → Program" }, { name: "userId", type: "FK → User" },
      { name: "observations", type: "String?" },
      { name: "isExtra", type: "Boolean — marcação visual de saída sem NF (não gera BudgetMovement; exitSpent já contabiliza)" },
    ],
    relations: ["items[] (ExitItem)"],
  },
  {
    name: "BudgetMovement", color: "border-yellow-400 bg-yellow-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "programId", type: "FK → Program" },
      { name: "type", type: "CREDIT | DEBIT" },
      { name: "category", type: "NORMAL | SALDO_ANTERIOR | DIVIDA | EXTRA" },
      { name: "amount", type: "Float" }, { name: "description", type: "String" },
      { name: "reference", type: "String? (PURCHASE-{id} | NF-EXTRA-{id} | DELIVERY-{id}); EXIT-* são excluídos do cálculo financeiro)" },
      { name: "date", type: "DateTime" }, { name: "productId / quantity / unit", type: "para category EXTRA" },
    ],
    relations: [],
  },
  {
    name: "DeliveryOrder", color: "border-indigo-400 bg-indigo-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "supplierId / schoolId / programId", type: "FK" },
      { name: "status", type: "PENDING | CONFIRMED | PARTIAL | CANCELLED" },
      { name: "deliveryDate", type: "DateTime" }, { name: "createdById / confirmedById", type: "FK → User" },
      { name: "confirmedAt", type: "DateTime?" },
    ],
    relations: ["items[] (DeliveryOrderItem)"],
  },
  {
    name: "License", color: "border-pink-400 bg-pink-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "schoolId", type: "FK unique → School" },
      { name: "plan", type: "BASICO | PROFISSIONAL | PREMIUM" },
      { name: "startDate / expiresAt", type: "DateTime" }, { name: "active", type: "Boolean" },
    ],
    relations: [],
  },
  {
    name: "StockAdjustment", color: "border-slate-400 bg-slate-50",
    fields: [
      { name: "id", type: "cuid PK" }, { name: "productId / schoolId / userId", type: "FK" },
      { name: "quantity", type: "Float (+crédito / -débito)" },
      { name: "unitPrice", type: "Float" }, { name: "description / date", type: "String / DateTime" },
    ],
    relations: [],
  },
];

const API_ROUTES: ApiRoute[] = [
  // Auth
  { method: "GET/POST", path: "/api/auth/[...nextauth]", roles: "Público", description: "NextAuth v5 — login (credentials), JWT session, cookie __Secure-authjs.session-token" },
  { method: "POST", path: "/api/auth/verify", roles: "Autenticado", description: "Verifica senha do usuário logado (usado antes de ações destrutivas)" },
  // Schools
  { method: "GET", path: "/api/schools", roles: "SUPER_ADMIN", description: "Lista todas as escolas com licença" },
  { method: "POST", path: "/api/schools", roles: "SUPER_ADMIN", description: "Cria nova escola" },
  { method: "PATCH", path: "/api/schools/[id]", roles: "SUPER_ADMIN | SCHOOL_ADMIN", description: "Atualiza escola (SCHOOL_ADMIN apenas a própria)" },
  { method: "DELETE", path: "/api/schools/[id]", roles: "SUPER_ADMIN", description: "Remove escola" },
  // Licenses
  { method: "GET", path: "/api/licenses", roles: "SUPER_ADMIN", description: "Lista licenças" },
  { method: "POST", path: "/api/licenses", roles: "SUPER_ADMIN", description: "Cria licença para escola" },
  { method: "PATCH", path: "/api/licenses/[id]", roles: "SUPER_ADMIN", description: "Atualiza plano/validade/status" },
  { method: "DELETE", path: "/api/licenses/[id]", roles: "SUPER_ADMIN", description: "Remove licença" },
  // Users
  { method: "GET", path: "/api/users", roles: "SUPER_ADMIN | SCHOOL_ADMIN", description: "Lista usuários (SCHOOL_ADMIN filtra por schoolId)" },
  { method: "POST", path: "/api/users", roles: "SUPER_ADMIN | SCHOOL_ADMIN", description: "Cria usuário; hash bcrypt da senha" },
  { method: "PATCH", path: "/api/users/[id]", roles: "SUPER_ADMIN | SCHOOL_ADMIN", description: "Edita perfil; atualiza senha se fornecida" },
  { method: "DELETE", path: "/api/users/[id]", roles: "SUPER_ADMIN | SCHOOL_ADMIN", description: "Desativa usuário" },
  // Suppliers
  { method: "GET/POST", path: "/api/suppliers", roles: "Escola", description: "Listagem e criação de fornecedores (scoped por schoolId)" },
  { method: "PATCH/DELETE", path: "/api/suppliers/[id]", roles: "Escola", description: "Editar / remover fornecedor" },
  // Products
  { method: "GET", path: "/api/products", roles: "Escola", description: "Lista produtos; suporta ?barcode= para lookup por EAN" },
  { method: "POST", path: "/api/products", roles: "Escola + checkLicense", description: "Cria produto com NCM; verifica licença" },
  { method: "PATCH/DELETE", path: "/api/products/[id]", roles: "Escola", description: "Editar / remover produto" },
  // Programs
  { method: "GET/POST", path: "/api/programs", roles: "Escola + checkLicense", description: "CRUD de programas; suporta parentId para sub-programas" },
  { method: "PATCH/DELETE", path: "/api/programs/[id]", roles: "Escola", description: "Editar / remover programa" },
  // Stock — Entries
  { method: "GET", path: "/api/stock/entries", roles: "Escola", description: "Lista NFs; filtra por ?programId, ?purchases, ?from, ?to" },
  { method: "POST", path: "/api/stock/entries", roles: "Escola + checkLicense", description: "Registra NF; aceita extraItems (isExtra=true) + cria BudgetMovement se isPurchase ou extraItems" },
  { method: "PATCH", path: "/api/stock/entries/[id]", roles: "Escola", description: "Edita metadados da NF e quantidades dos itens" },
  { method: "DELETE", path: "/api/stock/entries/[id]", roles: "Escola", description: "Remove NF e reverte saldo (cascade EntryItems)" },
  // Stock — Exits
  { method: "GET", path: "/api/stock/exits", roles: "Escola", description: "Lista saídas; filtra por ?programId, ?from, ?to, ?extra" },
  { method: "POST", path: "/api/stock/exits", roles: "Escola + checkLicense", description: "Registra saída; forceRegister=true bypassa validação de saldo (ressalva); exitSpent alimenta autom. o saldo financeiro do programa" },
  { method: "PATCH", path: "/api/stock/exits/[id]", roles: "Escola", description: "Edita data, motivo, observações e quantidades de uma saída" },
  { method: "DELETE", path: "/api/stock/exits/[id]", roles: "Escola", description: "Remove saída e reverte saldo de estoque" },
  // Stock — Balance
  { method: "GET", path: "/api/stock/balance", roles: "Escola", description: "Calcula saldo atual: Σ(entradas + ajustes) - Σ(saídas)" },
  // Stock — Adjustments
  { method: "GET/POST", path: "/api/stock/adjustments", roles: "Escola", description: "CRUD de ajustes manuais de saldo anterior" },
  // Financial
  { method: "GET", path: "/api/financial/movements", roles: "Escola", description: "Lista BudgetMovements; filtra por ?programId, ?from, ?to; calcula programStats" },
  // Deliveries
  { method: "GET", path: "/api/deliveries", roles: "Escola + SUPPLIER", description: "Lista ordens de entrega; SUPPLIER vê apenas as suas" },
  { method: "POST", path: "/api/deliveries", roles: "Escola + SUPPLIER", description: "Cria ordem de entrega" },
  { method: "PATCH", path: "/api/deliveries/[id]", roles: "Escola", description: "Confirma entrega → gera StockEntry + BudgetMovement DEBIT" },
  { method: "DELETE", path: "/api/deliveries/[id]", roles: "Escola", description: "Cancela ordem (apenas PENDING)" },
];

const BUSINESS_FLOWS: Flow[] = [
  {
    title: "Entrada por Nota Fiscal (NF)",
    color: "border-emerald-400",
    steps: [
      { label: "Usuário preenche cabeçalho: Programa + Fornecedor + Data + Nº NF", type: "action" },
      { label: "Adiciona itens da NF (Produto + Qtd + Vl.Unit + Lote)", type: "action" },
      { label: "Opcionalmente adiciona Produtos Extra NF (fora da nota)", type: "branch" },
      { label: "POST /api/stock/entries → valida Zod → checkLicense", type: "db" },
      { label: "Cria StockEntry (totalValue = apenas itens NF)", type: "db" },
      { label: "Cria EntryItems (isExtra=false para NF, isExtra=true para extras)", type: "db" },
      { label: "Se extraItems.total > 0 → cria BudgetMovement DEBIT EXTRA (ref: NF-EXTRA-{id})", type: "branch" },
      { label: "Se isPurchase → cria BudgetMovement DEBIT EXTRA (ref: PURCHASE-{id})", type: "branch" },
      { label: "Saldo de estoque aumenta; financeiro é debitado conforme tipo", type: "result" },
    ],
  },
  {
    title: "Saída de Estoque",
    color: "border-red-400",
    steps: [
      { label: "Usuário seleciona Programa + Produto + Quantidade + Motivo + Data", type: "action" },
      { label: "Sistema exibe saldo atual do produto no dropdown", type: "action" },
      { label: "Produto SEM SALDO: alerta vermelho (Estoque ESGOTADO)", type: "branch" },
      { label: "Produto com saldo INSUFICIENTE: alerta âmbar (Estoque se esgotando + valor excedente)", type: "branch" },
      { label: "POST /api/stock/exits com forceRegister=true se deficit detectado", type: "db" },
      { label: "API bypassa validação de saldo quando forceRegister=true", type: "branch" },
      { label: "Cria StockExit + ExitItems; observações recebem [RESSALVA: déficit de X un.]", type: "db" },
      { label: "exitSpent do programa é atualizado automaticamente (consumo = gasto financeiro)", type: "result" },
      { label: "Lista exibe nome do produto (não mais '1 produto(s)')", type: "result" },
    ],
  },
  {
    title: "Confirmação de Entrega (DeliveryOrder)",
    color: "border-indigo-400",
    steps: [
      { label: "Fornecedor cria DeliveryOrder (status: PENDING) com itens", type: "action" },
      { label: "SCHOOL_ADMIN / MANAGER vê na lista de entregas", type: "action" },
      { label: "Informa quantidades confirmadas por item", type: "action" },
      { label: "PATCH /api/deliveries/[id] → status = CONFIRMED", type: "db" },
      { label: "Cria StockEntry automático (entradas confirmadas entram no estoque)", type: "db" },
      { label: "Cria BudgetMovement DEBIT (ref: DELIVERY-{id})", type: "db" },
      { label: "Se confirmado parcialmente → status = PARTIAL", type: "branch" },
      { label: "Estoque e financeiro atualizados automaticamente", type: "result" },
    ],
  },
  {
    title: "Cálculo do Saldo Financeiro",
    color: "border-yellow-400",
    steps: [
      { label: "Orçamento = Program.budget + BudgetMovements CREDIT (repasses adicionais)", type: "action" },
      { label: "NFs registradas = Σ(StockEntry.totalValue por programa) — validação/prestacão de contas", type: "action" },
      { label: "NFs devem casar com o orçamento da parcela (vert ✓ no card se igual)", type: "branch" },
      { label: "Gasto (Consumo) = Σ(StockExit.items.totalPrice por programa) = exitSpent", type: "action" },
      { label: "+ BudgetMovements DEBIT excluindo referências EXIT-* (sem dupla contagem)", type: "action" },
      { label: "Saldo = Orçamento − Consumo − DEBIT manuais (non-EXIT)", type: "result" },
      { label: "Card exibe: Orçamento / NFs registradas / Consumo / Saldo por programa", type: "result" },
    ],
  },
  {
    title: "Controle de Licença",
    color: "border-pink-400",
    steps: [
      { label: "Cada escola tem no máximo 1 License (relation unique)", type: "action" },
      { label: "checkLicense(schoolId) chamado em: POST products, suppliers, stock/entries, exits", type: "db" },
      { label: "Se sem licença → 403 'Sem licença ativa'", type: "branch" },
      { label: "Se licença expirada ou suspensa → 403", type: "branch" },
      { label: "Se active=true e expiresAt > now → permite operação", type: "result" },
    ],
  },
  {
    title: "Autenticação e Autorização",
    color: "border-purple-400",
    steps: [
      { label: "Login via /api/auth/[...nextauth] (NextAuth v5 + Credentials)", type: "action" },
      { label: "Verifica email + bcrypt.compare(senha, hash)", type: "db" },
      { label: "JWT incluí: id, name, email, role, schoolId, schoolName, supplierId", type: "action" },
      { label: "Cookie: __Secure-authjs.session-token (HTTPS) / authjs.session-token (HTTP)", type: "action" },
      { label: "Middleware (src/middleware.ts) protege /dashboard/* — redireciona para /login se sem token", type: "branch" },
      { label: "Cada API route chama auth() e verifica role antes de agir", type: "db" },
      { label: "Ações destrutivas (delete/edit) exigem reconfirmação de senha via /api/auth/verify", type: "branch" },
    ],
  },
];

const MIGRATIONS = [
  { version: "20260704220421_init", desc: "Modelos base: School, User, Supplier, Product, Program, StockEntry, EntryItem, StockExit, ExitItem, BudgetMovement, StockAdjustment, NcmCode" },
  { version: "20260705012859_add_license_model", desc: "Modelo License (plan BASICO | PROFISSIONAL | PREMIUM)" },
  { version: "20260705030000_add_stock_adjustment", desc: "StockAdjustment (ajuste de saldo anterior)" },
  { version: "20260705040000_add_delivery_orders", desc: "DeliveryOrder + DeliveryOrderItem (PENDING → CONFIRMED)" },
  { version: "20260705050000_add_program_subdivisions_and_movement_category", desc: "Program.parentId (sub-programas); BudgetMovement.category (NORMAL|SALDO_ANTERIOR|DIVIDA|EXTRA)" },
  { version: "20260705060000_add_product_barcode", desc: "Product.barcode (EAN-13, EAN-8, Code-128)" },
  { version: "20260804000000_add_extra_movement", desc: "BudgetMovement.productId / quantity / unit (para category EXTRA)" },
  { version: "20260804010000_add_school_header", desc: "School.logoUrl + School.customHeader" },
  { version: "20260804020000_add_stock_exit_is_extra", desc: "StockExit.isExtra — marcação visual de saída sem NF" },
  { version: "20260804030000_add_stock_entry_is_purchase", desc: "StockEntry.isPurchase — compra informal gera BudgetMovement DEBIT automático" },
  { version: "20260805000000_add_entry_item_is_extra", desc: "EntryItem.isExtra — produto extra NF gera BudgetMovement DEBIT NF-EXTRA separado" },
  { version: "2026-08-06 (sem migração)", desc: "Modelo financeiro atualizado: Gasto = exitSpent (saídas); NFs = validação da parcela; saídas com ressalva (forceRegister) permitidas quando saldo esgotado" },
];

/* ═══════════════════════════════════════════════════════════
   COMPONENTES AUXILIARES
   ═══════════════════════════════════════════════════════════ */

function SectionTitle({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 print:mb-3">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 print:bg-blue-600">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function ModelCard({ model }: { model: ModelDef }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-2 rounded-xl overflow-hidden ${model.color} print:break-inside-avoid`}>
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 font-bold text-sm text-slate-800 hover:opacity-80 print:pointer-events-none"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-mono">{model.name}</span>
        <span className="print:hidden">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
      </button>
      <div className={`${open ? "block" : "hidden"} print:block border-t border-current border-opacity-20 px-4 py-3 space-y-1`}>
        {model.fields.map((f) => (
          <div key={f.name} className="flex gap-2 text-xs">
            <span className="font-mono font-semibold text-slate-700 shrink-0 min-w-[130px]">{f.name}</span>
            <span className="text-slate-500">{f.type}</span>
          </div>
        ))}
        {model.relations && model.relations.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Relações</p>
            <div className="flex flex-wrap gap-1">
              {model.relations.map((r) => (
                <span key={r} className="text-xs bg-white/60 border border-slate-300 rounded px-1.5 py-0.5 text-slate-600 font-mono">{r}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  const stepStyle: Record<FlowStep["type"], string> = {
    action: "bg-blue-50 border-blue-200 text-blue-800",
    branch: "bg-amber-50 border-amber-200 text-amber-800",
    result: "bg-green-50 border-green-200 text-green-800",
    db: "bg-slate-100 border-slate-300 text-slate-700",
  };
  const stepLabel: Record<FlowStep["type"], string> = {
    action: "Ação", branch: "Condição", result: "Resultado", db: "DB",
  };
  return (
    <div className={`border-2 rounded-xl overflow-hidden ${flow.color} bg-white print:break-inside-avoid`}>
      <div className="px-4 py-3 border-b border-current border-opacity-20 bg-white/80">
        <h3 className="font-bold text-sm text-slate-800">{flow.title}</h3>
      </div>
      <div className="px-4 py-3 space-y-2">
        {flow.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-bold text-slate-400 w-4 pt-0.5">{i + 1}</span>
            <div className={`flex-1 text-xs border rounded-lg px-3 py-2 ${stepStyle[step.type]}`}>
              <span className="font-semibold mr-1.5 opacity-60">[{stepLabel[step.type]}]</span>
              {step.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════ */

const TABS = [
  { id: "overview", label: "Visão Geral", icon: Layers },
  { id: "models", label: "Modelos de Dados", icon: Database },
  { id: "apis", label: "APIs & Rotas", icon: Globe },
  { id: "flows", label: "Fluxos de Negócio", icon: GitBranch },
  { id: "roles", label: "Papéis & Permissões", icon: Shield },
];

/* ═══════════════════════════════════════════════════════════
   PAGE PRINCIPAL
   ═══════════════════════════════════════════════════════════ */

export default function SystemDiagramPage() {
  const [activeTab, setActiveTab] = useState("overview");

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 print:border-b-2 print:border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">Diagrama Completo do Sistema</h1>
              <p className="text-xs text-slate-500">EscolaEstoque — Arquitetura, Modelos, APIs, Fluxos e Permissões</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="print:hidden flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 print:hidden">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-10 print:px-0 print:py-4">

        {/* ── VISÃO GERAL ── */}
        <div className={activeTab === "overview" ? "block" : "hidden print:block"}>
          <SectionTitle icon={Layers} title="Visão Geral da Arquitetura" subtitle="Stack completa, multi-tenant SaaS" />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {TECH_STACK.map((layer) => (
              <div key={layer.layer} className="bg-white border border-slate-200 rounded-xl p-4 print:break-inside-avoid">
                <h3 className="font-bold text-sm text-slate-700 mb-2 pb-2 border-b border-slate-100">{layer.layer}</h3>
                <ul className="space-y-1">
                  {layer.items.map((item) => (
                    <li key={item} className="text-xs text-slate-600 flex items-start gap-1.5">
                      <span className="text-blue-400 shrink-0 mt-0.5">▸</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Multi-tenant */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4 print:break-inside-avoid">
            <h3 className="font-bold text-slate-700 mb-3">Modelo Multi-Tenant (SaaS por escola)</h3>
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { label: "SUPER_ADMIN", color: "bg-purple-100 text-purple-800", desc: "Painel do sistema: escolas, licenças, usuários" },
                { label: "SCHOOL_ADMIN", color: "bg-blue-100 text-blue-800", desc: "Estoque + Financeiro da escola" },
                { label: "MANAGER / NUTRITIONIST", color: "bg-cyan-100 text-cyan-800", desc: "Operação diária" },
                { label: "SUPPLIER", color: "bg-orange-100 text-orange-800", desc: "Portal de entregas externo" },
              ].map((t) => (
                <div key={t.label} className={`border rounded-lg px-3 py-2 ${t.color}`}>
                  <p className="font-bold">{t.label}</p>
                  <p className="opacity-70">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Migrations */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 print:break-inside-avoid">
            <h3 className="font-bold text-slate-700 mb-3">Histórico de Migrations</h3>
            <div className="space-y-1.5">
              {MIGRATIONS.map((m) => (
                <div key={m.version} className="flex gap-3 text-xs items-start">
                  <span className="font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded shrink-0">{m.version}</span>
                  <span className="text-slate-600 pt-0.5">{m.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── MODELOS DE DADOS ── */}
        <div className={activeTab === "models" ? "block" : "hidden print:block"}>
          <SectionTitle icon={Database} title="Modelos de Dados (Prisma Schema)" subtitle="Clique no nome do modelo para expandir os campos" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {DATA_MODELS.map((m) => <ModelCard key={m.name} model={m} />)}
          </div>
        </div>

        {/* ── APIs & ROTAS ── */}
        <div className={activeTab === "apis" ? "block" : "hidden print:block"}>
          <SectionTitle icon={Globe} title="APIs & Rotas (Next.js App Router)" subtitle="Todos os endpoints com roles e descrição" />
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-20">Método</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-72">Rota</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-48">Roles</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {API_ROUTES.map((r, i) => {
                  const methodColor: Record<string, string> = {
                    GET: "bg-green-100 text-green-700", POST: "bg-blue-100 text-blue-700",
                    PATCH: "bg-yellow-100 text-yellow-700", DELETE: "bg-red-100 text-red-700",
                    "GET/POST": "bg-teal-100 text-teal-700", "PATCH/DELETE": "bg-orange-100 text-orange-700",
                  };
                  return (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-4 py-2">
                        <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${methodColor[r.method] ?? "bg-slate-100 text-slate-700"}`}>{r.method}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-700">{r.path}</td>
                      <td className="px-4 py-2 text-slate-500">{r.roles}</td>
                      <td className="px-4 py-2 text-slate-600">{r.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FLUXOS DE NEGÓCIO ── */}
        <div className={activeTab === "flows" ? "block" : "hidden print:block"}>
          <SectionTitle icon={GitBranch} title="Fluxos de Negócio" subtitle="Passo a passo de cada operação principal do sistema" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {BUSINESS_FLOWS.map((f) => <FlowCard key={f.title} flow={f} />)}
          </div>
        </div>

        {/* ── PAPÉIS & PERMISSÕES ── */}
        <div className={activeTab === "roles" ? "block" : "hidden print:block"}>
          <SectionTitle icon={Shield} title="Papéis & Permissões" subtitle="Controle de acesso por perfil de usuário" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ROLES.map((r) => (
              <div key={r.role} className={`border rounded-xl p-4 ${r.color} print:break-inside-avoid`}>
                <p className="font-bold text-sm font-mono mb-1">{r.role}</p>
                <p className="text-xs opacity-70 mb-3">{r.desc}</p>
                <ul className="space-y-1">
                  {r.can.map((perm) => (
                    <li key={perm} className="text-xs flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5">✓</span>
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Matriz resumida */}
          <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-sm text-slate-700">Matriz de Acesso por Funcionalidade</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Funcionalidade</th>
                    {["SUPER_ADMIN", "SCHOOL_ADMIN", "MANAGER", "NUTRITIONIST", "ACCOUNTANT", "USER", "SUPPLIER"].map((role) => (
                      <th key={role} className="px-3 py-2 font-semibold text-slate-600 text-center whitespace-nowrap">{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feat: "Painel de escolas / licenças", access: [true, false, false, false, false, false, false] },
                    { feat: "Criar / editar escola", access: [true, false, false, false, false, false, false] },
                    { feat: "Gerenciar usuários", access: [true, true, false, false, false, false, false] },
                    { feat: "Fornecedores / Produtos", access: [false, true, true, true, false, false, false] },
                    { feat: "Programas", access: [false, true, true, true, false, false, false] },
                    { feat: "Entradas NF", access: [false, true, true, true, false, false, false] },
                    { feat: "Saídas de estoque", access: [false, true, true, true, false, true, false] },
                    { feat: "Compras informais", access: [false, true, true, true, false, false, false] },
                    { feat: "Saldo de estoque", access: [false, true, true, true, true, true, false] },
                    { feat: "Financeiro (leitura)", access: [false, true, true, true, true, false, false] },
                    { feat: "Financeiro (escrita)", access: [false, true, true, false, false, false, false] },
                    { feat: "Entregas (criar)", access: [false, true, true, true, false, false, true] },
                    { feat: "Entregas (confirmar)", access: [false, true, true, false, false, false, false] },
                    { feat: "Relatórios / Impressão", access: [false, true, true, true, true, false, false] },
                    { feat: "Diagrama do Sistema", access: [true, false, false, false, false, false, false] },
                  ].map((row) => (
                    <tr key={row.feat} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{row.feat}</td>
                      {row.access.map((a, i) => (
                        <td key={i} className="px-3 py-2 text-center">
                          {a
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-slate-200">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Rodapé de impressão */}
        <div className="hidden print:block mt-8 pt-4 border-t border-slate-300 text-xs text-slate-400 text-center">
          EscolaEstoque — Diagrama do Sistema — Gerado em {new Date().toLocaleDateString("pt-BR")}
        </div>
      </div>

      {/* Estilos de impressão via style tag */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { font-size: 11px; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>
    </div>
  );
}
