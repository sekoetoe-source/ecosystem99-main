import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Filter, Search, Trophy, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard & Point — Admin Ecosystem99" },
      {
        name: "description",
        content: "Leaderboard operasional berdasarkan periode aktif",
      },
    ],
  }),
  component: AdminLeaderboardPage,
});

type Tab = "siswa" | "kelas" | "jawara";

type JawaraStudent = {
  id: string;
  full_name: string | null;
  nis: string | null;
  class_id: string | null;
  classes: { name: string | null } | null;
};
type JawaraItem = {
  student_id: string;
  points: number | null;
  validations: { students: JawaraStudent | null } | null;
};

export function JawaraTab({ periodId }: { periodId: string; periodName?: string }) {
  const dailyData = useQuery({
    queryKey: ["jawara-data", periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
      const { data, error } = await supabase
        .from("validation_items")
        .select("student_id, points, validations!inner(period_id, day, status, students(id, full_name, nis, class_id, classes(name)))")
        .eq("validations.period_id", periodId)
        .eq("validations.status", "approved")
        .eq("validations.day", today);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!periodId,
    refetchInterval: 30_000,
  });

  const rankings = (() => {
    const global = new Map<string, { name: string; nis: string; className: string; points: number }>();
    const byClass = new Map<string, { studentCount: number; totalPoints: number; students: Map<string, { name: string; points: number }> }>();
    for (const item of (dailyData.data ?? []) as Array<{ student_id: string; points: number | null; validations: { students: JawaraStudent | null } | null }>) {
      const student = item.validations?.students;
      const className = student?.classes?.name?.trim();
      if (!student?.id || !className || className === "-" || className.toLowerCase() === "tanpa kelas") continue;
      const points = Number(item.points ?? 0);
      const current = global.get(student.id) ?? { name: student.full_name ?? "-", nis: student.nis ?? "-", className, points: 0 };
      current.points += points;
      global.set(student.id, current);
      const classEntry = byClass.get(className) ?? { studentCount: 0, totalPoints: 0, students: new Map() };
      const classStudent = classEntry.students.get(student.id) ?? { name: student.full_name ?? "-", points: 0 };
      classStudent.points += points;
      classEntry.students.set(student.id, classStudent);
      classEntry.totalPoints += points;
      byClass.set(className, classEntry);
    }
    return {
      students: [...global.entries()].map(([id, row]) => ({ id, ...row })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "id")),
      classes: [...byClass.entries()].map(([name, row]) => ({ name, totalPoints: row.totalPoints, studentCount: row.students.size, students: [...row.students.entries()].map(([id, student]) => ({ id, ...student })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "id")) })).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name, "id")),
    };
  })();

  if (dailyData.isLoading) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">Memuat data Jawara hari ini...</div>;
  if (dailyData.isError) return <div className="surface-card p-8 text-center text-sm text-destructive">Data Jawara gagal dimuat.</div>;
  if (rankings.students.length === 0) return <div className="surface-card p-12 text-center"><Trophy className="mx-auto mb-4 size-12 text-muted-foreground/40" /><h3 className="font-semibold">Belum ada data Jawara hari ini</h3><p className="mt-1 text-sm text-muted-foreground">Peringkat memakai klaim yang disetujui hari ini, sesuai laporan.</p></div>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Data hari ini • diperbarui otomatis setiap 30 detik</p>
      <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h3 className="font-bold">Jawara Individu Hari Ini</h3></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="bg-surface-low text-left text-muted-foreground"><th className="px-4 py-3">Peringkat</th><th className="px-4 py-3">Nama</th><th className="px-4 py-3">NIS</th><th className="px-4 py-3">Kelas</th><th className="px-4 py-3 text-right">Poin</th></tr></thead><tbody className="divide-y divide-border">{rankings.students.map((row, index) => <tr key={row.id}><td className="px-4 py-3 font-bold">{index + 1}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3 text-muted-foreground">{row.nis}</td><td className="px-4 py-3 text-muted-foreground">{row.className}</td><td className="px-4 py-3 text-right font-bold">{row.points.toLocaleString("id-ID")}</td></tr>)}</tbody></table></div>
      </section>
      <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h3 className="font-bold">Jawara Kelas Hari Ini</h3></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-sm"><thead><tr className="bg-surface-low text-left text-muted-foreground"><th className="px-4 py-3">Peringkat</th><th className="px-4 py-3">Kelas</th><th className="px-4 py-3">Siswa berpartisipasi</th><th className="px-4 py-3 text-right">Total poin</th></tr></thead><tbody className="divide-y divide-border">{rankings.classes.map((row, index) => <tr key={row.name}><td className="px-4 py-3 font-bold">{index + 1}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3">{row.studentCount}</td><td className="px-4 py-3 text-right font-bold">{row.totalPoints.toLocaleString("id-ID")}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

function AdminLeaderboardPage() {
  const [tab, setTab] = useState<Tab>("siswa");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const activePeriod = useQuery({
    queryKey: ["active-period"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, start_date, end_date, status")
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const periods = useQuery({
    queryKey: ["periods", "leaderboard-selector"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, start_date, end_date, status")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((period) => period.status !== "DRAFT");
    },
    refetchInterval: 30_000,
  });

  // Keep the current active period as the default; archived periods remain selectable for review.
  const effectivePeriodId = selectedPeriodId || activePeriod.data?.id || "";

  const studentScores = useQuery({
    queryKey: ["period-student-scores", effectivePeriodId],
    queryFn: async () => {
      if (!effectivePeriodId) return [];
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
      const [{ data, error }, { data: students, error: studentsError }, { data: period, error: periodError }] = await Promise.all([
        supabase
          .from("validation_items")
          .select("student_id, points, validations!inner(period_id, day, status)")
          .eq("validations.period_id", effectivePeriodId)
          .eq("validations.status", "approved")
          .eq("validations.day", today),
        supabase.from("students").select("id, full_name, nis, class_id, classes(name)").eq("active", true),
        supabase.from("periods").select("id, name").eq("id", effectivePeriodId).maybeSingle(),
      ]);
      if (error) throw error;
      if (studentsError) throw studentsError;
      if (periodError) throw periodError;
      if (!period) return [];

      const validStudents = (students ?? []).filter((student) => {
        const className = (student.classes as { name: string } | null)?.name?.trim();
        return Boolean(student.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas");
      });
      const validStudentIds = new Set(validStudents.map((student) => student.id));
      const pointTotals = new Map<string, number>();
      for (const item of data ?? []) {
        if (!validStudentIds.has(item.student_id)) continue;
        pointTotals.set(item.student_id, (pointTotals.get(item.student_id) ?? 0) + Number(item.points ?? 0));
      }
      return validStudents.map((student) => ({
        period_id: effectivePeriodId,
        period_name: period.name,
        student_id: student.id,
        nis: student.nis,
        full_name: student.full_name,
        class_id: student.class_id,
        class_name: (student.classes as { name: string }).name,
        earned_points: pointTotals.get(student.id) ?? 0,
        total_items: 0,
      })).sort((a, b) => b.earned_points - a.earned_points || (a.full_name ?? "").localeCompare(b.full_name ?? "", "id"));
    },
    enabled: !!effectivePeriodId,
    refetchInterval: 30_000,
  });

  const classScores = useQuery({
    queryKey: ["period-class-scores", effectivePeriodId, studentScores.dataUpdatedAt],
    queryFn: async () => {
      if (!effectivePeriodId) return [];
      const students = studentScores.data ?? [];
      const classMap = new Map<string, { class_id: string; class_name: string; student_count: number; total_points: number; avg_points: number }>();
      for (const student of students) {
        if (!student.class_id || !student.class_name) continue;
        const row = classMap.get(student.class_id) ?? {
          class_id: student.class_id,
          class_name: student.class_name,
          student_count: 0,
          total_points: 0,
          avg_points: 0,
        };
        row.student_count += 1;
        row.total_points += student.earned_points;
        classMap.set(student.class_id, row);
      }
      return [...classMap.values()]
        .map((row) => ({ ...row, avg_points: row.student_count ? Math.round(row.total_points / row.student_count) : 0 }))
        .sort((a, b) => b.total_points - a.total_points || a.class_name.localeCompare(b.class_name, "id"));
    },
    enabled: studentScores.isSuccess,
    refetchInterval: 30_000,
  });

  // Get unique classes for filter
  const classOptions = Array.from(
    new Set((studentScores.data ?? []).map((s) => s.class_name).filter((c): c is string => Boolean(c))),
  );

  // Filter student data
  const filteredStudents = (studentScores.data ?? [])
    .filter((s) => !selectedClass || s.class_name === selectedClass)
    .filter((s) => {
      const query = searchQuery.toLowerCase();
      return (
        (s.full_name ?? "").toLowerCase().includes(query) ||
        (s.nis ?? "").toLowerCase().includes(query) ||
        (s.class_name ?? "").toLowerCase().includes(query)
      );
    });

  const studentRows = filteredStudents.map((s, i) => ({
    rank: i + 1,
    id: s.student_id,
    name: s.full_name,
    nis: s.nis,
    class: s.class_name,
    points: s.earned_points,
  }));

  const classRows = (classScores.data ?? []).map((c, i) => ({
    rank: i + 1,
    id: c.class_id,
    name: c.class_name,
    studentCount: c.student_count,
    totalPoints: c.total_points,
    avgPoints: c.avg_points,
  }));

  const currentPeriod = periods.data?.find((p) => p.id === effectivePeriodId) || activePeriod.data;

  return (
      <div id="poin-periode" className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Leaderboard & Point</h1>
            {currentPeriod && (
              <p className="mt-2 text-sm text-muted-foreground">
                Periode: <span className="font-semibold text-foreground">{currentPeriod.name}</span> •{" "}
                {currentPeriod.start_date} – {currentPeriod.end_date}
              </p>
            )}
          </div>
          <Trophy className="size-8 text-blue-600" />
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Period Selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Periode</label>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger className="w-full">
                <Calendar className="size-4 mr-2" />
                <SelectValue placeholder="Pilih periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  {activePeriod.data?.name || "Periode Aktif"}
                </SelectItem>
                {(periods.data ?? [])
                  .filter((p) => p.id !== activePeriod.data?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class Filter */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Kelas</label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-full">
                <Filter className="size-4 mr-2" />
                <SelectValue placeholder="Semua kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Semua kelas</SelectItem>
                {classOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Cari</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nama, NIS, atau kelas"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {[
          { id: "siswa" as const, label: "Siswa" },
          { id: "kelas" as const, label: "Kelas" },
          { id: "jawara" as const, label: "Jawara" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-3 font-medium text-sm transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "siswa" && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          {studentScores.isLoading ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Memuat leaderboard siswa...</p>
          ) : studentScores.isError ? (
            <p className="px-6 py-12 text-center text-sm text-destructive">Leaderboard siswa gagal dimuat.</p>
          ) : studentRows.length > 0 ? (
            <div className="divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 font-semibold text-sm text-muted-foreground">
                <div className="col-span-1">Rank</div>
                <div className="col-span-4">Nama</div>
                <div className="col-span-2">NIS</div>
                <div className="col-span-3">Kelas</div>
                <div className="col-span-2 text-right">Point</div>
              </div>
              {/* Rows */}
              {studentRows.map((row) => (
                <div key={row.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors items-center">
                  <div className="col-span-1">
                    <span className="font-bold text-lg text-blue-600">#{row.rank}</span>
                  </div>
                  <div className="col-span-4">
                    <p className="font-semibold text-foreground">{row.name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">{row.nis}</p>
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm text-muted-foreground">{row.class}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="font-bold text-lg text-green-600">{(row.points ?? 0).toLocaleString("id-ID")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Tidak ada data siswa untuk periode ini.</p>
          )}
        </div>
      )}

      {tab === "kelas" && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          {classScores.isLoading ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Memuat leaderboard kelas...</p>
          ) : classScores.isError ? (
            <p className="px-6 py-12 text-center text-sm text-destructive">Leaderboard kelas gagal dimuat.</p>
          ) : classRows.length > 0 ? (
            <div className="divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 font-semibold text-sm text-muted-foreground">
                <div className="col-span-1">Rank</div>
                <div className="col-span-4">Kelas</div>
                <div className="col-span-2">Siswa</div>
                <div className="col-span-3">Total Point</div>
                <div className="col-span-2 text-right">Rata-rata</div>
              </div>
              {/* Rows */}
              {classRows.map((row) => (
                <div key={row.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors items-center">
                  <div className="col-span-1">
                    <span className="font-bold text-lg text-blue-600">#{row.rank}</span>
                  </div>
                  <div className="col-span-4">
                    <p className="font-semibold text-foreground">{row.name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">{row.studentCount} siswa</p>
                  </div>
                  <div className="col-span-3">
                    <p className="font-bold text-lg text-green-600">{(row.totalPoints ?? 0).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-muted-foreground">{(row.avgPoints ?? 0).toLocaleString("id-ID")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Tidak ada data kelas untuk periode ini.</p>
          )}
        </div>
      )}

      {tab === "jawara" && (
        <JawaraTab periodId={effectivePeriodId} {...(currentPeriod?.name ? { periodName: currentPeriod.name } : {})} />
      )}
    </div>
  );
}
