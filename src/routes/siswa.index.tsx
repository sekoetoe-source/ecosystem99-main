import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Flame, Gift, Sparkles, UtensilsCrossed, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EcoNewsTicker } from "@/components/eco/EcoNewsTicker";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ScanSession, SCAN_SESSIONS, formatValidationItemsLabel } from "@/lib/scanSession";

export const Route = createFileRoute("/siswa/")({
  head: () => ({
    meta: [
      { title: "Dasbor Siswa — School Ecosystem" },
      {
        name: "description",
        content: "Pantau Eco-Points, streak harian, status scan multi-sesi, dan penukaran reward.",
      },
      { property: "og:title", content: "Dasbor Siswa — School Ecosystem" },
      { property: "og:description", content: "Eco-Points, streak harian, dan reward siswa." },
    ],
  }),
  component: StudentDashboard,
});

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function StudentDashboard() {
  const { me } = useMe();
  const studentId = me?.student?.id ?? null;
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["student-summary", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const [score, streak, todayVals, history] = await Promise.all([
        supabase
          .from("student_scores")
          .select("earned_points, balance_points, class_name, total_items")
          .eq("student_id", studentId!)
          .maybeSingle(),
        supabase.rpc("student_streak", { _student_id: studentId! }),
        supabase
          .from("validations")
          .select("id, status, created_at, session, station, validation_items(item_code, points)")
          .eq("student_id", studentId!)
          .eq("day", todayJakarta())
          .neq("status", "rejected"),
        supabase
          .from("validations")
          .select("id, status, created_at, session, station, validation_items(item_code, points)")
          .eq("student_id", studentId!)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      return {
        score: score.data,
        streak: (streak.data as number | null) ?? 0,
        todayVals: (todayVals.data as any[]) ?? [],
        history: (history.data as any[]) ?? [],
      };
    },
  });

  const rewards = useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rewards")
        .select("id, name, description, cost_points, stock")
        .eq("active", true)
        .order("cost_points");
      return data ?? [];
    },
  });

  const redeem = useMutation({
    mutationFn: async (reward: { id: string; cost_points: number }) => {
      if (!studentId) throw new Error("Data siswa tidak ditemukan");
      const { error } = await supabase.from("redemptions").insert({
        student_id: studentId,
        reward_id: reward.id,
        points_spent: reward.cost_points,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Penukaran diajukan. Ambil di koperasi setelah disetujui.");
      queryClient.invalidateQueries({ queryKey: ["student-summary", studentId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menukar reward"),
  });

  const balance = summary.data?.score?.balance_points ?? 0;

  // Map today's validations by session
  const todayEntry = summary.data?.todayVals.find((v) => (v.session || "entry") === "entry");
  const todayBreak = summary.data?.todayVals.find((v) => v.session === "break");

  if (!me?.student) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="font-semibold">Akun Anda belum tertaut ke data siswa.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Minta admin menautkan NIS Anda agar poin bisa tercatat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EcoNewsTicker compact className="rounded-2xl border border-emerald-800/30 shadow-sm" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Halo, {me.student.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          {summary.data?.score?.class_name ?? "Belum ada kelas"} · NIS {me.student.nis}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="gradient-hero surface-card border-transparent p-6 text-primary-foreground">
          <p className="label-xs text-primary-foreground/80">Saldo Eco-Points</p>
          <p className="mt-2 text-4xl font-extrabold">{balance.toLocaleString("id-ID")}</p>
          <p className="mt-1 text-sm text-primary-foreground/80">
            Total diperoleh {(summary.data?.score?.earned_points ?? 0).toLocaleString("id-ID")} poin
          </p>
        </div>
        <div className="surface-card p-6">
          <Flame className="size-5 text-warning" />
          <p className="mt-3 text-4xl font-extrabold">{summary.data?.streak ?? 0}</p>
          <p className="label-xs text-muted-foreground">Hari beruntun aktif</p>
        </div>
        <div className="surface-card p-6">
          <Sparkles className="size-5 text-eco" />
          <p className="mt-3 text-4xl font-extrabold">
            {Number(summary.data?.score?.total_items ?? 0)}
          </p>
          <p className="label-xs text-muted-foreground">Total item eco divalidasi</p>
        </div>
      </div>

      {/* STATUS SESI SCAN HARI INI */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="size-4 text-primary" /> Status Scan Hari Ini
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {new Intl.DateTimeFormat("id-ID", {
              timeZone: "Asia/Jakarta",
              dateStyle: "full",
            }).format(new Date())}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Sesi 1: Masuk Sekolah */}
          <div
            className={cn(
              "surface-card flex items-start gap-4 p-5 transition-all border",
              todayEntry
                ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/30"
                : "border-border"
            )}
          >
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl",
                todayEntry
                  ? "gradient-eco text-eco-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              🌅
            </span>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-sm">Sesi 1 — Masuk Sekolah</p>
                {todayEntry ? (
                  <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] gap-1">
                    <CheckCircle2 className="size-3" /> Tervalidasi
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    Belum Scan
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {todayEntry ? (
                  <>
                    Tercatat pukul{" "}
                    <span className="font-semibold text-foreground">
                      {new Date(todayEntry.created_at).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    · +
                    {todayEntry.validation_items?.reduce((a: number, i: any) => a + i.points, 0)}{" "}
                    poin (
                    {todayEntry.validation_items
                      ?.map((i: any) => (i.item_code === "tumbler" ? "Tumbler" : "Kotak Makan"))
                      .join(" + ")}
                    )
                  </>
                ) : (
                  "Scan QR di Gerbang Utama saat masuk sekolah (Tumbler / Kotak Makan)"
                )}
              </p>
            </div>
          </div>

          {/* Sesi 2: Istirahat / Jajan Kantin */}
          <div
            className={cn(
              "surface-card flex items-start gap-4 p-5 transition-all border",
              todayBreak
                ? "bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/30"
                : "border-border"
            )}
          >
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl",
                todayBreak
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              🍱
            </span>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-sm">Sesi 2 — Istirahat / Kantin</p>
                {todayBreak ? (
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] gap-1">
                    <CheckCircle2 className="size-3" /> Tervalidasi
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    Belum Scan
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {todayBreak ? (
                  <>
                    Tercatat pukul{" "}
                    <span className="font-semibold text-foreground">
                      {new Date(todayBreak.created_at).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    · +
                    {todayBreak.validation_items?.reduce((a: number, i: any) => a + i.points, 0)}{" "}
                    poin (
                    {formatValidationItemsLabel(todayBreak.session, todayBreak.validation_items)}
                    )
                  </>
                ) : (
                  "Scan QR di Kantin saat istirahat (Combo Tumbler + Lunchbox = +250 poin!)"
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KATALOG REWARD */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Katalog Reward</h2>
          <span className="text-xs text-muted-foreground">Tukar poin dengan hadiah menarik</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(rewards.data ?? []).map((r) => (
            <div key={r.id} className="surface-card flex flex-col p-5">
              <Gift className="size-5 text-violet" />
              <p className="mt-3 font-bold">{r.name}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-extrabold text-primary text-base">
                  {r.cost_points.toLocaleString("id-ID")} poin
                </span>
                <Button
                  size="sm"
                  disabled={balance < r.cost_points || r.stock <= 0 || redeem.isPending}
                  onClick={() => redeem.mutate(r)}
                >
                  {r.stock <= 0 ? "Habis" : "Tukar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* RIWAYAT VALIDASI MULTI-SESI */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Riwayat Validasi</h2>
          <span className="text-xs text-muted-foreground">Aktivitas scan harian & per sesi</span>
        </div>
        <div className="surface-card divide-y divide-border">
          {(summary.data?.history ?? []).map((h: any) => {
            const sessMeta =
              SCAN_SESSIONS[(h.session as ScanSession) || "entry"] || SCAN_SESSIONS.entry;
            const itemsList = h.validation_items ?? [];
            const totalPts = itemsList.reduce((a: number, i: any) => a + Number(i.points || 0), 0);
            const displayItem = formatValidationItemsLabel(h.session, itemsList);

            return (
              <div key={h.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      {displayItem}
                    </p>
                    <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30">
                      {sessMeta.shortLabel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(h.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {new Intl.DateTimeFormat("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(h.created_at))}
                    {" · "}
                    {h.station ?? sessMeta.defaultStation}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  +{totalPts}
                </span>
                <StatusBadge status={h.status} />
              </div>
            );
          })}
          {(summary.data?.history ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Belum ada aktivitas scan.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-accent text-accent-foreground",
    pending: "bg-warning/20 text-warning-foreground",
    rejected: "bg-destructive/15 text-destructive",
  };
  const label: Record<string, string> = {
    approved: "Disetujui",
    pending: "Menunggu",
    rejected: "Ditolak",
  };
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", map[status])}>
      {label[status] ?? status}
    </span>
  );
}