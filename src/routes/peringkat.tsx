import { createFileRoute } from "@tanstack/react-router";
import { Leaderboard } from "@/components/eco/Leaderboard";
import { AdminShell } from "@/routes/admin";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/peringkat")({
  head: () => ({
    meta: [
      { title: "Papan Peringkat Eco — ecosystem99 (ecosystem99.web.id)" },
      { name: "description", content: "Papan peringkat Eco-Points siswa dan kelas SMP Negeri 99 Jakarta di ecosystem99 (ecosystem99.web.id)." },
      { property: "og:title", content: "Papan Peringkat Eco — ecosystem99" },
      { property: "og:description", content: "Lihat Jawara Lingkungan dan peringkat kelas terbaik di ecosystem99 (ecosystem99.web.id)." },
    ],
    links: [{ rel: "canonical", href: "https://ecosystem99.web.id/peringkat" }],
  }),
  component: PeringkatPage,
});

function PeringkatPage() {
  const { me } = useMe();
  return (
    <AdminShell>
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-extrabold tracking-tight">Papan Peringkat</h1>
        <p className="mt-1 text-sm text-muted-foreground">Diperbarui otomatis dari validasi scan yang disetujui.</p>
        <div className="mt-6"><Leaderboard highlightStudentId={me?.student?.id ?? null} /></div>
      </section>
    </AdminShell>
  );
}