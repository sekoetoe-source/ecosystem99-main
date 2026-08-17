import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Leaf, TrendingUp, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/routes/siswa.index";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dasbor Admin — School Ecosystem" },
      {
        name: "description",
        content: "Pantau partisipasi, setujui klaim validasi, dan kelola ekosistem hijau sekolah.",
      },
      { property: "og:title", content: "Dasbor Admin — School Ecosystem" },
      { property: "og:description", content: "KPI partisipasi dan antrean persetujuan validasi." },
    ],
  }),
  component: AdminDashboard,
});

function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function AdminDashboard() {
  const { me } = useMe();
  const queryClient = useQueryClient();

  const kpi = useQuery({
    queryKey: ["admin-kpi"],
    queryFn: async () => {
      const [studentsRes, todayItems, scoresRes, pending] = await Promise.all([
        supabase.from("students").select("id, class_id, classes(name)").not("class_id", "is", null),
        supabase
          .from("validation_items")
          .select("student_id, points, validations!inner(status)")
          .eq("day", todayJakarta()),
        supabase.from("student_scores").select("earned_points, total_items, class_name"),
        supabase.from("validations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      const validStudents = (studentsRes.data ?? []).filter((s) => {
        const className = (s.classes as { name: string } | null)?.name?.trim();
        return Boolean(s.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas");
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
      return {
        studentCount: validStudents.length,
        participants,
        pointsToday: approvedToday.reduce((a, i) => a + i.points, 0),
        pendingCount: pending.count ?? 0,
        co2Kg: Math.round((totalItems * 70) / 1000),
      };
    },
  });

  const queue = useQuery({
    queryKey: ["admin-queue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("validations")
        .select("id, status, created_at, station, source, students(full_name, nis), validation_items(item_code, points)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("validations")
        .update({ status, reviewed_by: me?.userId ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status validasi diperbarui");
      queryClient.invalidateQueries({ queryKey: ["admin-queue"] });
      queryClient.invalidateQueries({ queryKey: ["admin-kpi"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui"),
  });

  const participation = kpi.data
    ? Math.round((kpi.data.participants / Math.max(1, kpi.data.studentCount)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Ikhtisar Ekosistem</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Partisipasi hari ini", value: `${participation}%`, icon: TrendingUp },
          { label: "Siswa terdaftar", value: kpi.data?.studentCount ?? 0, icon: Users },
          { label: "Poin hari ini", value: (kpi.data?.pointsToday ?? 0).toLocaleString("id-ID"), icon: Leaf },
          { label: "Menunggu persetujuan", value: kpi.data?.pendingCount ?? 0, icon: Check },
        ].map((k) => (
          <div key={k.label} className="surface-card p-5">
            <k.icon className="size-5 text-primary" />
            <p className="mt-3 text-3xl font-extrabold">{k.value}</p>
            <p className="label-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-bold">Antrean Persetujuan Klaim</h2>
        <div className="surface-card mt-3 divide-y divide-border">
          {(queue.data ?? []).map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {(v.students as { full_name: string; nis: string } | null)?.full_name ?? "-"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    NIS {(v.students as { nis: string } | null)?.nis}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {(v.validation_items ?? []).map((i) => i.item_code).join(" + ")} ·{" "}
                  {(v.validation_items ?? []).reduce((a, i) => a + i.points, 0)} poin ·{" "}
                  {v.source === "manual" ? "Input manual" : "Scan"} · {v.station ?? "-"}
                </p>
              </div>
              <StatusBadge status={v.status} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review.mutate({ id: v.id, status: "approved" })}>
                  <Check className="size-4" /> Setujui
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => review.mutate({ id: v.id, status: "rejected" })}
                >
                  <X className="size-4" /> Tolak
                </Button>
              </div>
            </div>
          ))}
          {(queue.data ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Tidak ada klaim menunggu persetujuan.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}