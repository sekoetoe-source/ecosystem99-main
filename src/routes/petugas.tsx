import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { AppShell } from "@/components/eco/AppShell";
import { Guard } from "@/components/eco/Guard";

export const Route = createFileRoute("/petugas")({
  component: PetugasLayout,
});

function PetugasLayout() {
  return (
    <Guard roles={["officer", "admin"]}>
      <AppShell
        subtitle="Petugas"
        nav={[{ to: "/petugas", label: "Scanner", icon: <ScanLine className="size-4" /> }]}
      >
        <Outlet />
      </AppShell>
    </Guard>
  );
}