import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/eco/AppShell";
import { Guard } from "@/components/eco/Guard";

export const Route = createFileRoute("/teacher")({
  component: TeacherLayout,
});

function TeacherLayout() {
  return (
    <Guard roles={["teacher", "admin"]}>
      <AppShell
        subtitle="Wali Kelas"
        nav={[{ to: "/teacher", label: "Dasbor Kelas", icon: <LayoutDashboard className="size-4" /> }]}
      >
        <Outlet />
      </AppShell>
    </Guard>
  );
}
