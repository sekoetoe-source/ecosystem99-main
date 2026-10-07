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
import { useState } from "react";
import { Guard } from "@/components/eco/Guard";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const ADMIN_MENU = [
  {
    section: "DASBOR",
    items: [{ to: "/admin", label: "Dasbor", icon: LayoutDashboard }],
  },
  {
    section: "AKTIVITAS",
    items: [
      { to: "/admin/pengguna", label: "Pengguna", icon: Users },
      { to: "/peringkat", label: "Leaderboard", icon: TrendingUp },
      { to: "/admin/jawara", label: "Jawara", icon: Trophy, disabled: true },
      { to: "/admin/challenge", label: "Challenge", icon: BookOpen },
    ],
  },
  {
    section: "OPERASIONAL",
    items: [
      { to: "/admin/periode", label: "Periode", icon: Calendar, disabled: true },
      { to: "/admin/laporan", label: "Laporan", icon: FileBarChart },
    ],
  },
  {
    section: "LAINNYA",
    items: [{ to: "/admin/traktir", label: "Traktir Kopi", icon: Coffee }],
  },
];

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isActive = (to: string) => location.pathname === to;

  const SidebarContent = () => (
    <nav className="space-y-8 px-4 py-6">
      {ADMIN_MENU.map((group) => (
        <div key={group.section}>
          <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            {group.section}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <a
                  key={item.to}
                  href={item.to}
                  onClick={(e) => {
                    if (item.disabled) e.preventDefault();
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    active && !item.disabled
                      ? "bg-blue-50 text-blue-700"
                      : item.disabled
                        ? "text-muted-foreground opacity-50 cursor-not-allowed"
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

  return (
    <Guard roles={["admin"]}>
      <div className="min-h-screen bg-white">
        {/* Desktop Sidebar */}
        <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-border hidden lg:flex flex-col overflow-y-auto">
          <div className="p-6 border-b border-border">
            <h1 className="text-lg font-bold text-foreground">Ecosystem99</h1>
            <p className="text-xs text-muted-foreground mt-1">Administrator</p>
          </div>
          <SidebarContent />
          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.assign("/auth");
            }}
            className="mx-4 mb-6 mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4 flex-shrink-0" />
            <span>Keluar</span>
          </button>
        </aside>

        {/* Mobile Drawer */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-border transform transition-transform lg:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground">Ecosystem99</h1>
              <p className="text-xs text-muted-foreground mt-1">Administrator</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-muted rounded-lg"
            >
              <X className="size-5" />
            </button>
          </div>
          <SidebarContent />
          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.assign("/auth");
            }}
            className="mx-4 mb-6 mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4 flex-shrink-0" />
            <span>Keluar</span>
          </button>
        </div>

        {/* Main Content */}
        <main className="lg:ml-64">
          {/* Mobile Header */}
          <div className="sticky top-0 z-30 bg-white border-b border-border lg:hidden px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-muted rounded-lg"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="font-semibold text-foreground">Ecosystem99</h1>
          </div>

          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </Guard>
  );
}