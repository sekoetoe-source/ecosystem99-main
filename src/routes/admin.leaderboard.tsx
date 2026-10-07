import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, Filter, Search, Trophy } from "lucide-react";
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

function AdminLeaderboardPage() {
  const [tab, setTab] = useState<Tab>("siswa");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all periods
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch active period
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
  });

  // Set selected period to active period by default
  const effectivePeriodId = selectedPeriodId || activePeriod.data?.id || "";

  // Fetch period student scores
  const studentScores = useQuery({
    queryKey: ["period-student-scores", effectivePeriodId],
    queryFn: async () => {
      if (!effectivePeriodId) return [];
      const { data, error } = await supabase
        .from("period_student_scores")
        .select("period_id, period_name, student_id, nis, full_name, class_id, class_name, earned_points, total_items")
        .eq("period_id", effectivePeriodId)
        .order("earned_points", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((s) => {
        const c = (s.class_name ?? "").trim();
        return Boolean(c && c !== "-" && c.toLowerCase() !== "tanpa kelas");
      });
    },
    enabled: !!effectivePeriodId,
  });

  // Fetch period class scores
  const classScores = useQuery({
    queryKey: ["period-class-scores", effectivePeriodId],
    queryFn: async () => {
      if (!effectivePeriodId) return [];
      const { data, error } = await supabase
        .from("period_class_scores")
        .select("period_id, period_name, class_id, class_name, student_count, total_points, avg_points")
        .eq("period_id", effectivePeriodId)
        .order("total_points", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((c) => {
        const name = (c.class_name ?? "").trim();
        return Boolean(name && name !== "-" && name.toLowerCase() !== "tanpa kelas");
      });
    },
    enabled: !!effectivePeriodId,
  });

  // Get unique classes for filter
  const classOptions = Array.from(new Set((studentScores.data ?? []).map((s) => s.class_name).filter(Boolean)));

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
    <div className="space-y-8">
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
          {studentRows.length > 0 ? (
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
                    <p className="font-bold text-lg text-green-600">{row.points.toLocaleString("id-ID")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Tidak ada data siswa.</p>
          )}
        </div>
      )}

      {tab === "kelas" && (
        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          {classRows.length > 0 ? (
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
                    <p className="font-bold text-lg text-green-600">{row.totalPoints.toLocaleString("id-ID")}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-muted-foreground">{row.avgPoints.toLocaleString("id-ID")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">Tidak ada data kelas.</p>
          )}
        </div>
      )}

      {tab === "jawara" && (
        <div className="rounded-2xl border border-border bg-white p-12 text-center">
          <Trophy className="size-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Jawara Lingkungan</h3>
          <p className="text-sm text-muted-foreground">Fitur Jawara sedang dalam tahap pengembangan.</p>
        </div>
      )}
    </div>
  );
}
