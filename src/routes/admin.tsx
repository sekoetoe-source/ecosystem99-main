import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FileBarChart, LayoutDashboard, Users, Trophy } from "lucide-react";
import { AppShell } from "@/components/eco/AppShell";
import { Guard } from "@/components/eco/Guard";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <Guard roles={["admin"]}>
      <AppShell
        subtitle="Administrator"
        nav={[
          { to: "/admin", label: "Dasbor", icon: <LayoutDashboard className="size-4" /> },
          { to: "/admin/pengguna", label: "Pengguna", icon: <Users className="size-4" /> },
          { to: "/admin/challenge", label: "Challenge", icon: <Trophy className="size-4" /> },
          { to: "/admin/laporan", label: "Laporan", icon: <FileBarChart className="size-4" /> },
        ]}
      >
        <Outlet />
      </AppShell>
    </Guard>
  );
}