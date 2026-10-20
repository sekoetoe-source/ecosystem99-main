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

  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
  const monthStart = `${currentDate.slice(0, 7)}-01`;
  const reportRange = (() => {
    const [year, month] = currentDate.slice(0, 7).split("-").map(Number);
    return {
      start: monthStart,
      end: new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10),
    };
  })();

  const activePeriod = useQuery({
    queryKey: ["active-period"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date")
        .order("start_date", { ascending: false });
      if (error) throw error;
      const list = data ?? [];
      const found =
        list.find((p) => p.start_date <= currentDate && p.end_date >= currentDate) ??
        list.find((p) => p.start_date < reportRange.end && p.end_date >= reportRange.start) ??
        list.find((p) => p.status === "ACTIVE") ??
        list[0];
      if (found) return found;

      // Fallback for public/unauthenticated visitors if periods table returns empty due to RLS
      const { data: vData } = await supabase
        .from("validations")
        .select("period_id")
        .eq("status", "approved")
        .order("day", { ascending: false })
        .limit(1);
      if (vData?.[0]?.period_id) {
        return {
          id: vData[0].period_id,
          name: "Periode Operasional",
          status: "ACTIVE",
          start_date: monthStart,
          end_date: reportRange.end,
        };
      }
      return null;
    },
    refetchInterval: 30_000,
  });

  const activePeriodId = activePeriod.data?.id;

  const rawData = useQuery({
    queryKey: ["leaderboard-real-data", activePeriodId, monthStart],
    enabled: activePeriod.isSuccess,
    queryFn: async () => {
      // Always filter by period — if no active period exists, return empty
      if (!activePeriodId) return { studentRows: [], classRows: [] };
      const query = supabase
        .from("validation_items")
        .select("student_id, points, item_code, day, validations!inner(period_id, status)")
        .eq("validations.status", "approved")
        .eq("validations.period_id", activePeriodId)
        .gte("day", reportRange.start)
        .lt("day", reportRange.end);

      const [{ data: items, error: itemsError }, { data: students, error: studentsError }] =
        await Promise.all([
          query,
          supabase
            .from("students")
            .select("id, full_name, nis, class_id, classes(name)")
            .eq("active", true),
        ]);

      if (itemsError) throw itemsError;
      if (studentsError) throw studentsError;

      const validStudents = (students ?? []).filter((s) => {
        const className = (s.classes as { name: string } | null)?.name?.trim();
        return Boolean(
          s.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas",
        );
      });

      const validStudentMap = new Map(validStudents.map((s) => [s.id, s]));
      const pointTotals = new Map<string, number>();

      for (const item of items ?? []) {
        if (!validStudentMap.has(item.student_id)) continue;
        pointTotals.set(
          item.student_id,
          (pointTotals.get(item.student_id) ?? 0) + Number(item.points ?? 0),
        );
      }

      // Student rows
      const studentRows = validStudents
        .map((s) => ({
          student_id: s.id,
          full_name: s.full_name,
          nis: s.nis,
          class_name: ((s.classes as { name: string }).name ?? "").trim(),
          earned_points: pointTotals.get(s.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.earned_points - a.earned_points ||
            (a.full_name ?? "").localeCompare(b.full_name ?? "", "id"),
        );

      // Class rows aggregated from students
      const classMap = new Map<
        string,
        { class_id: string; class_name: string; total_points: number; student_count: number }
      >();
      for (const s of studentRows) {
        const cName = s.class_name;
        if (!cName) continue;
        const existing = classMap.get(cName) ?? {
          class_id: `class-${cName}`,
          class_name: cName,
          total_points: 0,
          student_count: 0,
        };
        existing.student_count += 1;
        existing.total_points += s.earned_points;
        classMap.set(cName, existing);
      }

      const classRows = Array.from(classMap.values())
        .map((c) => ({
          class_id: c.class_id,
          class_name: c.class_name,
          student_count: c.student_count,
          total_points: c.total_points,
          avg_points: c.student_count > 0 ? Math.round(c.total_points / c.student_count) : 0,
        }))
        .sort(
          (a, b) =>
            b.total_points - a.total_points ||
            b.avg_points - a.avg_points ||
            a.class_name.localeCompare(b.class_name, "id"),
        );

      return { studentRows, classRows };
    },
    refetchInterval: 30_000,
  });

  const studentsData = rawData.data?.studentRows ?? [];
  const rawClasses = rawData.data?.classRows ?? [];

  const rows =
    tab === "siswa"
      ? studentsData.map((s, i) => ({
          id: (s.student_id || `std-${i}`) as string,
          rank: i + 1,
          title: s.full_name as string,
          sub: s.class_name as string,
          points: Number(s.earned_points ?? 0),
        }))
      : rawClasses.map((c, i) => {
          const studentCount = Number(c.student_count ?? 0);
          const avgPoints = Number(c.avg_points ?? 0);
          const totalPoints = Number(c.total_points ?? 0);

          return {
            id: (c.class_id || `cls-${i}`) as string,
            rank: i + 1,
            title: c.class_name as string,
            sub: `${studentCount} siswa · rata-rata ${avgPoints} poin`,
            points: totalPoints,
          };
        });

  const visibleRows = rows.filter((row) => row.title.toLowerCase().includes(q.toLowerCase()));
  const podium = visibleRows.slice(0, 3);

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
        {visibleRows.map((r) => (
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
        {visibleRows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
        )}
      </div>
    </div>
  );
}
