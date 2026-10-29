import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Leaf, TrendingUp, Users, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/routes/siswa.index";
import { EcoNewsTicker } from "@/components/eco/EcoNewsTicker";
import { useMe } from "@/lib/auth";
import { resolveOperationalPeriod, todayJakartaDate } from "@/lib/operationalPeriod";
import { calculateEnvironmentalImpact, formatWasteWeight } from "@/lib/environmentalImpact";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dasbor Admin — School Ecosystem" },
      {
        name: "description",
        content: "Pantau partisipasi, setujui klaim validasi, dan kelola ekosistem hijau sekolah.",
      },
      { property: "og:title", content: "Dasbor Admin — School Ecosystem" },
      {
        property: "og:description",
        content: "KPI partisipasi dan antrean validasi klaim eco-point.",
      },
    ],
  }),
  component: AdminDashboard,
});

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function AdminDashboard() {
  const { me } = useMe();

  const activePeriod = useQuery({
    queryKey: ["active-period"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, start_date, end_date, status")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return resolveOperationalPeriod(data ?? [], todayJakartaDate());
    },
    refetchInterval: 30_000,
  });

  const kpi = useQuery({
    queryKey: ["admin-kpi", activePeriod.data?.id],
    enabled: !!activePeriod.data?.id,
    queryFn: async () => {
      const period = activePeriod.data!;
      const [studentsRes, todayItems, scoresRes, pendingAccountsRes] = await Promise.all([
        supabase.from("students").select("id, class_id, classes(name)").not("class_id", "is", null),
        supabase
          .from("validation_items")
          .select("validation_id, item_code, student_id, points, day, validations!inner(status, period_id)")
          .eq("day", todayJakarta())
          .eq("validations.period_id", period.id),
        supabase
          .from("period_student_scores")
          .select("earned_points, total_items, class_name")
          .eq("period_id", period.id),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_approved", false),
      ]);

      const validStudents = (studentsRes.data ?? []).filter((s) => {
        const className = (s.classes as { name: string } | null)?.name?.trim();
        return Boolean(
          s.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas",
        );
      });
      const validScores = (scoresRes.data ?? []).filter((s) => {
        const c = (s.class_name ?? "").trim();
        return Boolean(c && c !== "-" && c.toLowerCase() !== "tanpa kelas");
      });
      const approvedToday = (todayItems.data ?? []).filter(
        (i) => (i.validations as { status: string } | null)?.status === "approved",
      );
      const participants = new Set(approvedToday.map((i) => i.student_id)).size;
      const totalItems = validScores.reduce((a, s) => a + Number(s.total_items ?? 0), 0);
      const approvedTodayValidations = new Set(
        approvedToday.map((i) => i.validation_id ?? `${i.student_id}-${i.day}`),
      );
      const impactToday = calculateEnvironmentalImpact(
        approvedTodayValidations.size,
        approvedToday,
      );
      return {
        studentCount: validStudents.length,
        participants,
        pointsToday: approvedToday.reduce((a, i) => a + i.points, 0),
        pendingCount: pendingAccountsRes.count ?? 0,
        totalItems,
        impactToday,
      };
    },
    refetchInterval: 30_000,
  });

  const queue = useQuery({
    queryKey: ["admin-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("validations")
        .select(
          "id, status, source, station, day, students(full_name, nis), validation_items(item_code, points)",
        )
        .eq("status", "pending")
        .order("day", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("validations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue"] });
      queryClient.invalidateQueries({ queryKey: ["admin-kpi"] });
    },
  });

  const participation = kpi.data?.studentCount
    ? Math.round((kpi.data.participants / kpi.data.studentCount) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Dasbor Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pantau partisipasi dan poin hari ini, kelola persetujuan, serta tinjau aktivitas
          lingkungan sekolah.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Partisipasi hari ini",
            value: `${participation}%`,
            icon: TrendingUp,
            color: "text-blue-600",
            to: "/admin/laporan#partisipasi-hari-ini",
          },
          {
            label: "Siswa terdaftar",
            value: kpi.data?.studentCount ?? 0,
            icon: Users,
            color: "text-emerald-600",
            to: "/admin/pengguna?tab=siswa#user-tab-panel-siswa",
          },
          {
            label: "Poin hari ini",
            value: (kpi.data?.pointsToday ?? 0).toLocaleString("id-ID"),
            icon: Leaf,
            color: "text-green-600",
            to: "/admin/leaderboard#poin-periode",
          },
          {
            label: "Akun menunggu",
            value: kpi.data?.pendingCount ?? 0,
            icon: AlertCircle,
            color: "text-orange-600",
            to: "/admin/pengguna?tab=persetujuan#user-tab-panel-persetujuan",
          },
        ].map((k) => (
          <Link
            key={k.label}
            to={k.to}
            id={`dashboard-card-${k.label.toLowerCase().replaceAll(" ", "-")}`}
            className="group rounded-2xl border border-border bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`${k.label}: ${k.value}. Buka halaman terkait.`}
          >
            <k.icon className={`size-6 ${k.color} transition-transform group-hover:scale-110`} />
            <p className="mt-4 text-3xl font-extrabold text-foreground">{k.value}</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">{k.label}</p>
          </Link>
        ))}
      </div>

      {kpi.data?.impactToday && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <Leaf className="size-5" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-emerald-950">
                Estimasi Sampah Sekali Pakai Dicegah Hari Ini
              </p>
              <p className="text-xs text-emerald-800">
                {kpi.data.impactToday.validatedTumblerUses} tumbler ({formatWasteWeight(kpi.data.impactToday.bottleWasteAvoidedG)}) •{" "}
                {kpi.data.impactToday.validatedLunchboxUses} kotak makan ({formatWasteWeight(kpi.data.impactToday.foodLinerWasteAvoidedG)})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xl sm:text-2xl font-black text-emerald-900">
              {formatWasteWeight(kpi.data.impactToday.totalWasteAvoidedG)}
            </span>
            <Link
              to="/admin/laporan"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
            >
              Laporan Lengkap →
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">📢</span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">Berita & Tips</h2>
            <p className="text-sm text-muted-foreground">Running text eco & health dari AI</p>
          </div>
        </div>
        <div className="rounded-xl overflow-hidden border border-border bg-gradient-to-r from-emerald-50 to-blue-50">
          <EcoNewsTicker />
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">Antrean Validasi Klaim</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {queue.data?.length ?? 0} klaim menunggu validasi
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
          {(queue.data ?? []).length > 0 ? (
            <div className="divide-y divide-border">
              {queue.data?.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col gap-4 p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">
                        {(v.students as { full_name: string; nis: string } | null)?.full_name ??
                          "-"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        NIS {(v.students as { nis: string } | null)?.nis}
                      </p>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {(v.validation_items ?? []).map((i) => i.item_code).join(" + ")} •{" "}
                    <span className="font-semibold">
                      {(v.validation_items ?? []).reduce((a, i) => a + i.points, 0)} poin
                    </span>{" "}
                    • {v.source === "manual" ? "Input manual" : "Scan"} • {v.station ?? "-"}
                  </p>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => review.mutate({ id: v.id, status: "approved" })}
                      disabled={review.isPending}
                    >
                      <Check className="size-4" /> Setujui
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review.mutate({ id: v.id, status: "rejected" })}
                      disabled={review.isPending}
                    >
                      <X className="size-4" /> Tolak
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
              Tidak ada klaim menunggu validasi.
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-foreground mb-4">Akses Cepat</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { to: "/admin/pengguna", label: "Kelola Pengguna", icon: "👥" },
            { to: "/peringkat", label: "Lihat Leaderboard", icon: "🏆" },
            { to: "/admin/laporan", label: "Laporan Lengkap", icon: "📊" },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group rounded-xl border border-border bg-white p-4 no-underline transition-all hover:border-blue-300 hover:shadow-md hover:bg-blue-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{link.icon}</span>
                <span className="font-medium text-foreground group-hover:text-blue-700">
                  {link.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
