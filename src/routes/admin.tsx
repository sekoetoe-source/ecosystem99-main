import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Coffee,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Trophy,
  Users,
  X,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Guard } from "@/components/eco/Guard";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const ADMIN_MENU = [
  { section: "DASBOR", items: [{ to: "/admin", label: "Dasbor", icon: LayoutDashboard }] },
  {
    section: "AKTIVITAS",
    items: [
      { to: "/admin/pengguna", label: "Pengguna", icon: Users },
      { to: "/peringkat", label: "Leaderboard", icon: TrendingUp },
      { to: "/admin/jawara", label: "Jawara", icon: Trophy },
      { to: "/admin/challenge", label: "Challenge", icon: BookOpen },
    ],
  },
  {
    section: "OPERASIONAL",
    items: [
      { to: "/admin/periode", label: "Periode", icon: Calendar },
      { to: "/admin/laporan", label: "Laporan", icon: FileBarChart },
    ],
  },
  { section: "LAINNYA", items: [{ to: "/admin/traktir", label: "Traktir Kopi", icon: Coffee }] },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isActive = (to: string) => location.pathname === to;
  const logout = async () => {
    await signOut();
    window.location.assign("/auth");
  };
  const SidebarContent = () => (
    <nav className="space-y-8 px-4 py-6">
      {ADMIN_MENU.map((group) => (
        <div key={group.section}>
          <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {group.section}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.to}
                  href={item.to}
                  onClick={(e) => {
                    if (item.disabled) e.preventDefault();
                    else setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.to) && !item.disabled
                      ? "bg-blue-50 text-blue-700"
                      : item.disabled
                        ? "cursor-not-allowed text-muted-foreground opacity-50"
                        : "text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
  const Logout = () => (
    <button
      type="button"
      onClick={logout}
      className="mx-4 mb-6 mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <LogOut className="size-4 flex-shrink-0" />
      <span>Keluar</span>
    </button>
  );
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r border-border bg-white lg:flex">
        <div className="border-b border-border p-6">
          <h1 className="text-lg font-bold">Ecosystem99</h1>
          <p className="mt-1 text-xs text-muted-foreground">Administrator</p>
        </div>
        <SidebarContent />
        <Logout />
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-white transition-transform lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h1 className="text-lg font-bold">Ecosystem99</h1>
            <p className="mt-1 text-xs text-muted-foreground">Administrator</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        <SidebarContent />
        <Logout />
      </div>
      <main className="lg:ml-64">
        {!sidebarOpen && (
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 hover:bg-muted"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="font-semibold">Ecosystem99</h1>
          </div>
        )}
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}

function AdminLayout() {
  return (
    <Guard roles={["admin"]}>
      <AdminShell>
        <Outlet />
      </AdminShell>
    </Guard>
  );
}
