import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Flame, Gift, Sparkles, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EcoNewsTicker } from "@/components/eco/EcoNewsTicker";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/siswa/")({
  head: () => ({
    meta: [
      { title: "Dasbor Siswa — School Ecosystem" },
      {
        name: "description",
        content: "Pantau Eco-Points, streak harian, status scan tumbler & kotak makan, dan reward.",
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
      const [score, streak, today, history] = await Promise.all([
        supabase
          .from("student_scores")
          .select("earned_points, balance_points, class_name, total_items")
          .eq("student_id", studentId!)
          .maybeSingle(),
        supabase.rpc("student_streak", { _student_id: studentId! }),
        supabase
          .from("validation_items")
          .select("item_code, points, validations!inner(status)")
          .eq("student_id", studentId!)
          .eq("day", todayJakarta()),
        supabase
          .from("validations")
          .select("id, status, created_at, station, validation_items(item_code, points)")
          .eq("student_id", studentId!)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      return {
        score: score.data,
        streak: (streak.data as number | null) ?? 0,
        today: today.data ?? [],
        history: history.data ?? [],
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
  const todayItems = new Set(
    (summary.data?.today ?? [])
      .filter((t) => (t.validations as { status: string } | null)?.status !== "rejected")
      .map((t) => t.item_code),
  );

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
          <p className="label-xs text-muted-foreground">Hari beruntun</p>
        </div>
        <div className="surface-card p-6">
          <Sparkles className="size-5 text-eco" />
          <p className="mt-3 text-4xl font-extrabold">
            {Number(summary.data?.score?.total_items ?? 0)}
          </p>
          <p className="label-xs text-muted-foreground">Item eco tervalidasi</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { code: "tumbler", label: "Tumbler", points: 100, icon: Coffee },
          { code: "lunchbox", label: "Kotak Makan", points: 50, icon: UtensilsCrossed },
        ].map((item) => {
          const done = todayItems.has(item.code);
          return (
            <div
              key={item.code}
              className={cn("surface-card flex items-center gap-4 p-5", done && "bg-accent")}
            >
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-2xl",
                  done ? "gradient-eco text-eco-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <item.icon className="size-5" />
              </span>
              <div>
                <p className="font-bold">{item.label}</p>
                <p className="text-sm text-muted-foreground">
                  {done ? `Sudah tercatat hari ini · +${item.points} poin` : "Belum discan hari ini"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="text-lg font-bold">Katalog Reward</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(rewards.data ?? []).map((r) => (
            <div key={r.id} className="surface-card flex flex-col p-5">
              <Gift className="size-5 text-violet" />
              <p className="mt-3 font-bold">{r.name}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-extrabold text-primary">
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

      <section>
        <h2 className="text-lg font-bold">Riwayat Validasi</h2>
        <div className="surface-card mt-3 divide-y divide-border">
          {(summary.data?.history ?? []).map((h) => (
            <div key={h.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {(h.validation_items ?? []).map((i) => i.item_code).join(" + ") || "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("id-ID")} · {h.station ?? "-"}
                </p>
              </div>
              <span className="text-sm font-bold text-eco">
                +{(h.validation_items ?? []).reduce((a, i) => a + i.points, 0)}
              </span>
              <StatusBadge status={h.status} />
            </div>
          ))}
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