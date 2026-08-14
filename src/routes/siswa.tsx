import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Home, QrCode, Trophy } from "lucide-react";
import { AppShell } from "@/components/eco/AppShell";
import { Guard } from "@/components/eco/Guard";

export const Route = createFileRoute("/siswa")({
  component: SiswaLayout,
});

function SiswaLayout() {
  return (
    <Guard roles={["student", "admin"]}>
      <AppShell
        subtitle="Siswa"
        nav={[
          { to: "/siswa", label: "Dasbor", icon: <Home className="size-4" /> },
          { to: "/peringkat", label: "Peringkat", icon: <Trophy className="size-4" /> },
          { to: "/siswa/profil", label: "Kartu QR", icon: <QrCode className="size-4" /> },
        ]}
      >
        <Outlet />
      </AppShell>
    </Guard>
  );
}