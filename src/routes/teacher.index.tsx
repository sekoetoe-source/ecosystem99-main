import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Leaf, Users, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/routes/siswa.index";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [
      { title: "Dasbor Wali Kelas — School Ecosystem" },
      {
        name: "description",
        content: "Pantau poin, total item, dan perkembangan kebiasaan ramah lingkungan kelas Anda.",
      },
    ],
  }),
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const { me } = useMe();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const classInfo = me?.teacherClass;

  const classStudents = useQuery({
    queryKey: ["teacher-class-students", classInfo?.name],
    enabled: !!classInfo?.name,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_scores")
        .select("student_id, full_name, nis, class_name, earned_points, total_items")
        .eq("class_name", classInfo!.name)
        .order("earned_points", { ascending: false });
      return data ?? [];
    },
  });

  const queue = useQuery({
    queryKey: ["teacher-queue", classInfo?.id],
    enabled: !!classInfo?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("validations")
        .select(`
          id, 
          status, 
          created_at, 
          station, 
          source, 
          students!inner(full_name, nis, class_id), 
          validation_items(item_code, points)
        `)
        .eq("status", "pending")
        .eq("students.class_id", classInfo!.id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
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
      queryClient.invalidateQueries({ queryKey: ["teacher-queue"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-class-students"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui"),
  });

  const studentsList = classStudents.data ?? [];

  const totalPoints = studentsList.reduce((acc, s) => acc + Number(s.earned_points ?? 0), 0);
  const totalItems = studentsList.reduce((acc, s) => acc + Number(s.total_items ?? 0), 0);

  const filteredStudents = studentsList.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.full_name ?? "").toLowerCase().includes(q) ||
      (s.nis ?? "").toLowerCase().includes(q)
    );
  });

  if (!classInfo) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-3 text-center">
        <h2 className="text-xl font-bold">Belum Dikaitkan dengan Kelas</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Akun Anda belum dikaitkan dengan kelas mana pun. Silakan hubungi Administrator untuk
          menghubungkan akun Anda dengan kelas yang Anda ampu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dasbor Kelas {classInfo.name}</h1>
        <p className="text-sm text-muted-foreground">
          Pantau kebiasaan ramah lingkungan siswa di kelas yang Anda ampu.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          <Users className="size-5 text-primary" />
          <p className="mt-3 text-3xl font-extrabold">{studentsList.length}</p>
          <p className="label-xs text-muted-foreground">Total Siswa</p>
        </div>
        <div className="surface-card p-5">
          <Leaf className="size-5 text-eco" />
          <p className="mt-3 text-3xl font-extrabold">{totalPoints.toLocaleString("id-ID")}</p>
          <p className="label-xs text-muted-foreground">Total Poin Kelas</p>
        </div>
        <div className="surface-card p-5">
          <Leaf className="size-5 text-primary" />
          <p className="mt-3 text-3xl font-extrabold">{totalItems.toLocaleString("id-ID")}</p>
          <p className="label-xs text-muted-foreground">Total Item Terbawa</p>
        </div>
      </div>

      {/* ANTREAN PERSETUJUAN KLAIM KELAS */}
      <section>
        <h2 className="text-lg font-bold">Antrean Persetujuan Klaim Kelas {classInfo.name}</h2>
        <div className="surface-card mt-3 divide-y divide-border">
          {(queue.data ?? []).map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {(v.students as any)?.full_name ?? "-"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    NIS {(v.students as any)?.nis}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {(v.validation_items ?? []).map((i: any) => i.item_code).join(" + ")} ·{" "}
                  {(v.validation_items ?? []).reduce((a: number, i: any) => a + i.points, 0)} poin ·{" "}
                  {v.source === "manual" ? "Input manual" : "Scan"} · {v.station ?? "-"}
                </p>
              </div>
              <StatusBadge status={v.status} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review.mutate({ id: v.id, status: "approved" })} disabled={review.isPending}>
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
          {(queue.data ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Tidak ada klaim menunggu persetujuan dari kelas ini.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Daftar Siswa Kelas {classInfo.name}</h2>
        
        <div className="mt-4 flex max-w-sm items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari siswa berdasarkan nama atau NIS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="surface-card mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">NIS</th>
                <th className="px-4 py-3 text-right font-semibold">Item</th>
                <th className="px-4 py-3 text-right font-semibold">Poin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStudents.map((s) => (
                <tr key={s.student_id}>
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.nis}</td>
                  <td className="px-4 py-3 text-right">{Number(s.total_items ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">
                    {Number(s.earned_points ?? 0).toLocaleString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Siswa tidak ditemukan.</p>
          )}
        </div>
      </section>
    </div>
  );
}
