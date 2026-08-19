import { createFileRoute, Link } from "@tanstack/react-router";
import { Brand } from "@/components/eco/Brand";
import { Button } from "@/components/ui/button";
import { Leaderboard } from "@/components/eco/Leaderboard";
import { homeForRole, useMe } from "@/lib/auth";

export const Route = createFileRoute("/peringkat")({
  head: () => ({
    meta: [
      { title: "Papan Peringkat Eco — ecosystem99 (ecosystem99.web.id)" },
      {
        name: "description",
        content:
          "Papan peringkat Eco-Points siswa dan kelas SMP Negeri 99 Jakarta di ecosystem99 (ecosystem99.web.id).",
      },
      { property: "og:title", content: "Papan Peringkat Eco — ecosystem99" },
      {
        property: "og:description",
        content: "Lihat Jawara Lingkungan dan peringkat kelas terbaik di ecosystem99 (ecosystem99.web.id).",
      },
    ],
    links: [
      { rel: "canonical", href: "https://ecosystem99.web.id/peringkat" },
    ],
  }),
  component: PeringkatPage,
});

function PeringkatPage() {
  const { me } = useMe();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Brand compact />
          <Button asChild variant="outline">
            <Link to={me ? homeForRole[me.primaryRole] : "/auth"}>
              {me ? "Dasbor" : "Masuk"}
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Papan Peringkat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Diperbarui otomatis dari validasi scan yang disetujui.
        </p>
        <div className="mt-6">
          <Leaderboard highlightStudentId={me?.student?.id ?? null} />
        </div>
      </main>
    </div>
  );
}