import { createFileRoute } from "@tanstack/react-router";
import { Trophy, Home, QrCode } from "lucide-react";
import { Leaderboard } from "@/components/eco/Leaderboard";
import { AppShell } from "@/components/eco/AppShell";
import { Guard } from "@/components/eco/Guard";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/peringkat")({
  head: () => ({
    meta: [
      { title: "Papan Peringkat Eco — ecosystem99 (ecosystem99.web.id)" },
      {
        name: "description",
        content: "Papan peringkat Eco-Points siswa dan kelas SMP Negeri 99 Jakarta di ecosystem99.",
      },
      { property: "og:title", content: "Papan Peringkat Eco — ecosystem99" },
      {
        property: "og:description",
        content: "Lihat peringkat siswa dan kelas terbaik di ecosystem99.",
      },
    ],
    links: [{ rel: "canonical", href: "https://ecosystem99.web.id/peringkat" }],
  }),
  component: PeringkatPage,
});

function PeringkatPage() {
  const { me } = useMe();
  return (
    <Guard roles={["student", "admin"]}>
      <AppShell
        subtitle="Peringkat"
        nav={[
          { to: "/siswa", label: "Dasbor", icon: <Home className="size-4" /> },
          { to: "/peringkat", label: "Peringkat", icon: <Trophy className="size-4" /> },
          { to: "/siswa/profil", label: "Kartu QR", icon: <QrCode className="size-4" /> },
        ]}
      >
        <section className="mx-auto w-full max-w-6xl">
          <h1 className="text-3xl font-extrabold tracking-tight">Papan Peringkat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Diperbarui otomatis dari validasi scan yang disetujui.
          </p>
          <div className="mt-6">
            <Leaderboard highlightStudentId={me?.student?.id ?? null} />
          </div>
        </section>
      </AppShell>
    </Guard>
  );
}
