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
  item_code: string;
  validations: { students: JawaraStudent | null } | null;
};
type JawaraClassRow = {
  name: string;
  points: number;
  students: number;
  tumbler: number;
  lunchbox: number;
};

export function JawaraTab({ periodId }: { periodId: string; periodName?: string }) {
  const reportMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date());
  const reportRange = (() => {
    const [year, month] = reportMonth.split("-").map(Number);
    return { start: `${reportMonth}-01`, end: new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10) };
  })();
  const dailyData = useQuery({
    queryKey: ["jawara-data", periodId, reportMonth],
    queryFn: async () => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
      const tomorrow = new Date(`${today}T00:00:00+07:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const throughToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(tomorrow);
      const { data: period, error: periodError } = await supabase.from("periods").select("id, start_date, end_date").eq("id", periodId).maybeSingle();
      if (periodError) throw periodError;
      if (!period) return { items: [] as JawaraItem[], students: [] as JawaraStudent[] };
      const monthStart = reportRange.start > period.start_date ? reportRange.start : period.start_date;
      const periodEndExclusive = new Date(`${period.end_date}T00:00:00+07:00`);
      periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);
      const periodEndNext = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(periodEndExclusive);
      const monthEnd = [reportRange.end, throughToday, periodEndNext].sort()[0]!;
      const [{ data, error }, { data: students, error: studentsError }] = await Promise.all([
        supabase.from("validation_items").select("student_id, points, item_code, day, validations!inner(period_id, status)").eq("validations.period_id", periodId).eq("validations.status", "approved").gte("day", monthStart).lt("day", monthEnd),
        supabase.from("students").select("id, class_id, classes(name)").eq("active", true),
      ]);
      if (error) throw error;
      if (studentsError) throw studentsError;
      return { items: (data ?? []) as unknown as JawaraItem[], students: (students ?? []) as unknown as JawaraStudent[] };
    },
    enabled: !!periodId,
    refetchInterval: 30_000,
  });

  const classRows = (() => {
    const classes = new Map<string, JawaraClassRow>();
    const classTumbler = new Map<string, Set<string>>();
    const classLunchbox = new Map<string, Set<string>>();
    const classOf = new Map<string, string>();
    for (const student of dailyData.data?.students ?? []) {
      const className = student.classes?.name?.trim();
      if (!student.class_id || !className || className === "-" || className.toLowerCase() === "tanpa kelas") continue;
      classOf.set(student.id, className);
      if (!classes.has(className)) classes.set(className, { name: className, points: 0, students: 0, tumbler: 0, lunchbox: 0 });
      classes.get(className)!.students += 1;
    }
    for (const item of dailyData.data?.items ?? []) {
      const className = classOf.get(item.student_id);
      if (!className) continue;
      const row = classes.get(className)!;
      row.points += Number(item.points ?? 0);
      if (item.item_code === "tumbler" || item.item_code === "break_combo") {
        if (!classTumbler.has(className)) classTumbler.set(className, new Set());
        classTumbler.get(className)!.add(item.student_id);
      }
      if (item.item_code === "lunchbox" || item.item_code === "break_combo") {
        if (!classLunchbox.has(className)) classLunchbox.set(className, new Set());
        classLunchbox.get(className)!.add(item.student_id);
      }
    }
    return [...classes.values()].map((row) => ({
      ...row,
      tumbler: Math.round(((classTumbler.get(row.name)?.size ?? 0) / Math.max(1, row.students)) * 100),
      lunchbox: Math.round(((classLunchbox.get(row.name)?.size ?? 0) / Math.max(1, row.students)) * 100),
    })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "id"));
  })();

  if (dailyData.isLoading) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">Memuat data Jawara...</div>;
  if (dailyData.isError) return <div className="surface-card p-8 text-center text-sm text-destructive">Data Jawara gagal dimuat.</div>;
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-border px-5 py-4"><h3 className="font-bold">Peringkat Jawara Lingkungan — {new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", month: "long", year: "numeric" }).format(new Date(`${reportRange.start}T00:00:00+07:00`))}</h3><p className="mt-1 text-xs text-muted-foreground">Data dan perhitungan mengikuti laporan bulanan • diperbarui otomatis setiap 30 detik</p></div>
      {classRows.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-sm"><thead><tr className="bg-surface-low text-left text-muted-foreground"><th className="px-4 py-3">Peringkat</th><th className="px-4 py-3">Kelas</th><th className="px-4 py-3 text-right">Poin</th><th className="px-4 py-3 text-right">Persentase penggunaan tumbler</th><th className="px-4 py-3 text-right">Persentase penggunaan kotak makan</th></tr></thead><tbody className="divide-y divide-border">{classRows.map((row, index) => <tr key={row.name}><td className="px-4 py-3 font-bold">{index + 1}</td><td className="px-4 py-3 font-semibold">{row.name}</td><td className="px-4 py-3 text-right font-mono">{row.points.toLocaleString("id-ID")}</td><td className="px-4 py-3 text-right">{row.tumbler}%</td><td className="px-4 py-3 text-right">{row.lunchbox}%</td></tr>)}</tbody></table></div> : <p className="px-6 py-12 text-center text-sm text-muted-foreground">Belum ada data kelas untuk bulan ini.</p>}
    </section>
  );
}

function AdminLeaderboardPage() {
  const [tab, setTab] = useState<Tab>("siswa");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const periods = useQuery({
    queryKey: ["periods", "leaderboard-selector"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, start_date, end_date, status")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const reportMonth = currentDate.slice(0, 7);
  const [year, month] = reportMonth.split("-").map(Number);
  const reportRangeEnd = new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10);
  const currentPeriod = periods.data?.find((period) => period.start_date <= currentDate && period.end_date >= currentDate)
    ?? periods.data?.find((period) => period.start_date < reportRangeEnd && period.end_date >= `${reportMonth}-01`)
    ?? periods.data?.find((period) => period.status === "ACTIVE")
    ?? periods.data?.[0];
  const effectivePeriodId = selectedPeriodId || currentPeriod?.id || "";

  const studentScores = useQuery({
    queryKey: ["period-student-scores", effectivePeriodId],
    queryFn: async () => {
      if (!effectivePeriodId) return [];
      const { data: period, error: periodError } = await supabase
        .from("periods")
        .select("id, name, start_date, end_date")
        .eq("id", effectivePeriodId)
        .maybeSingle();
      if (periodError) throw periodError;
      if (!period) return [];
      const [periodYear, periodMonth] = period.start_date.slice(0, 7).split("-").map(Number);
      const periodMonthStart = `${period.start_date.slice(0, 7)}-01`;
      const periodMonthEnd = new Date(Date.UTC(periodYear!, periodMonth!, 1)).toISOString().slice(0, 10);
      const [{ data, error }, { data: students, error: studentsError }] = await Promise.all([
        supabase
          .from("validation_items")
          .select("student_id, points, validations!inner(period_id, day, status)")
          .eq("validations.period_id", effectivePeriodId)
          .eq("validations.status", "approved")
          .gte("day", period.start_date > periodMonthStart ? period.start_date : periodMonthStart)
          .lte("day", period.end_date < new Date(Date.UTC(periodYear!, periodMonth!, 0)).toISOString().slice(0, 10) ? period.end_date : new Date(Date.UTC(periodYear!, periodMonth!, 0)).toISOString().slice(0, 10)),
        supabase.from("students").select("id, full_name, nis, class_id, classes(name)").eq("active", true),
      ]);
      if (error) throw error;
      if (studentsError) throw studentsError;

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
            <Select value={effectivePeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger className="w-full">
                <Calendar className="size-4 mr-2" />
                <SelectValue placeholder="Pilih periode" />
              </SelectTrigger>
              <SelectContent>
                {(periods.data ?? []).map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {period.name}{period.id === currentPeriod?.id ? " (Bulan berjalan)" : ""}
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
