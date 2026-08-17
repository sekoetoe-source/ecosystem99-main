import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Crown, Medal, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "siswa" | "kelas";

export function Leaderboard({ highlightStudentId }: { highlightStudentId?: string | null }) {
  const [tab, setTab] = useState<Tab>("siswa");
  const [q, setQ] = useState("");

  const students = useQuery({
    queryKey: ["leaderboard", "siswa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select("student_id, full_name, nis, class_name, earned_points")
        .order("earned_points", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).filter((s) => {
        const c = (s.class_name ?? "").trim();
        return Boolean(c && c !== "-" && c.toLowerCase() !== "tanpa kelas");
      });
    },
  });

  const classes = useQuery({
    queryKey: ["leaderboard", "kelas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_scores")
        .select("class_id, class_name, student_count, total_points, avg_points")
        .order("total_points", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((c) => {
        const name = (c.class_name ?? "").trim();
        return Boolean(name && name !== "-" && name.toLowerCase() !== "tanpa kelas");
      });
    },
  });

  const rows =
    tab === "siswa"
      ? (students.data ?? [])
          .filter((s) => (s.full_name ?? "").toLowerCase().includes(q.toLowerCase()))
          .map((s, i) => ({
            id: s.student_id as string,
            rank: i + 1,
            title: s.full_name as string,
            sub: s.class_name as string,
            points: s.earned_points ?? 0,
          }))
      : (classes.data ?? [])
          .filter((c) => (c.class_name ?? "").toLowerCase().includes(q.toLowerCase()))
          .map((c, i) => ({
            id: c.class_id as string,
            rank: i + 1,
            title: c.class_name as string,
            sub: `${c.student_count ?? 0} siswa · rata-rata ${c.avg_points ?? 0} poin`,
            points: Number(c.total_points ?? 0),
          }));

  const podium = rows.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-2xl bg-muted p-1">
          {(["siswa", "kelas"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors",
                tab === t ? "bg-card shadow-soft text-foreground" : "text-muted-foreground",
              )}
            >
              {t === "siswa" ? "Individu" : "Kelas"}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau kelas"
            className="pl-9"
          />
        </div>
      </div>

      {podium.length === 3 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[podium[1]!, podium[0]!, podium[2]!].map((p) => (
            <div
              key={p.id}
              className={cn(
                "surface-card flex flex-col items-center p-6 text-center",
                p.rank === 1 && "gradient-hero text-primary-foreground border-transparent",
              )}
            >
              {p.rank === 1 ? (
                <Crown className="size-6" />
              ) : (
                <Medal className="size-6 text-muted-foreground" />
              )}
              <p className="mt-3 text-lg font-bold">{p.title}</p>
              <p
                className={cn(
                  "label-xs",
                  p.rank === 1 ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {p.sub}
              </p>
              <p className="mt-3 text-2xl font-extrabold">{p.points.toLocaleString("id-ID")}</p>
            </div>
          ))}
        </div>
      )}

      <div className="surface-card divide-y divide-border overflow-hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            className={cn(
              "flex items-center gap-4 px-5 py-3",
              highlightStudentId && r.id === highlightStudentId && "bg-accent",
            )}
          >
            <span className="w-8 text-sm font-bold text-muted-foreground">{r.rank}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">{r.sub}</p>
            </div>
            <span className="font-bold text-primary">{r.points.toLocaleString("id-ID")}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
        )}
      </div>
    </div>
  );
}