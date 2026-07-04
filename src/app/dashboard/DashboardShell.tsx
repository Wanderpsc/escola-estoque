"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  School,
  Users,
  Truck,
  Package,
  ShoppingCart,
  ArrowUpDown,
  BarChart3,
  DollarSign,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Utensils,
  Wrench,
  BookOpen,
  Bell,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Escolas", href: "/dashboard/schools", icon: School, role: ["SUPER_ADMIN"] },
  { name: "Usuários", href: "/dashboard/users", icon: Users, role: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { name: "Fornecedores", href: "/dashboard/suppliers", icon: Truck },
  { name: "Produtos (NCM)", href: "/dashboard/products", icon: Package },
  {
    name: "Programas",
    icon: ShoppingCart,
    children: [
      { name: "Merenda Escolar", href: "/dashboard/programs/merenda", icon: Utensils },
      { name: "Manutenção", href: "/dashboard/programs/manutencao", icon: Wrench },
      { name: "PDDE", href: "/dashboard/programs/pdde", icon: BookOpen },
    ],
  },
  {
    name: "Estoque",
    icon: ArrowUpDown,
    children: [
      { name: "Entradas (NF)", href: "/dashboard/stock/entries", icon: ShoppingCart },
      { name: "Saídas", href: "/dashboard/stock/exits", icon: ArrowUpDown },
      { name: "Saldo Atual", href: "/dashboard/stock/balance", icon: Package },
    ],
  },
  { name: "Financeiro", href: "/dashboard/financial", icon: DollarSign },
  { name: "Relatórios", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings, role: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(["Programas", "Estoque"]);

  const userRole = (session?.user as any)?.role ?? "USER";

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]
    );
  };

  const filteredNav = navigation.filter(
    (item) => !item.role || item.role.includes(userRole)
  );

  const NavItem = ({ item }: { item: typeof navigation[0] }) => {
    if (item.children) {
      const isOpen = openGroups.includes(item.name);
      const isActive = item.children.some((c) => pathname === c.href);
      return (
        <div>
          <button
            onClick={() => toggleGroup(item.name)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-3">
              <item.icon className="w-5 h-5" />
              {item.name}
            </span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
          </button>
          {isOpen && (
            <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-100 pl-3">
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                    pathname === child.href
                      ? "bg-blue-600 text-white font-semibold"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <child.icon className="w-4 h-4" />
                  {child.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        href={item.href!}
        onClick={() => setSidebarOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          pathname === item.href
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-100"
        )}
      >
        <item.icon className="w-5 h-5" />
        {item.name}
      </Link>
    );
  };

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
        <div className="w-9 h-9 bg-blue-700 rounded-lg flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-slate-800 text-sm leading-none">EscolaEstoque</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[140px]">
            {(session?.user as any)?.schoolName ?? "Sistema"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {filteredNav.map((item) => (
          <NavItem key={item.name} item={item} />
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm shrink-0">
            {session?.user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{session?.user?.name}</p>
            <p className="text-xs text-slate-400 truncate">{session?.user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-72 flex flex-col">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 h-14 bg-white border-b border-slate-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <Bell className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              {session?.user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-700 leading-none">{session?.user?.name}</p>
              <p className="text-xs text-slate-400">{userRole}</p>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
