import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, CameraOff, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CameraScanner } from "@/components/eco/CameraScanner";
import { StatusBadge } from "@/routes/siswa.index";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/petugas/")({
  head: () => ({
    meta: [
      { title: "Scanner Petugas — School Ecosystem" },
      {
        name: "description",
        content: "Pindai QR siswa untuk memvalidasi tumbler dan kotak makan di pos pemeriksaan.",
      },
      { property: "og:title", content: "Scanner Petugas — School Ecosystem" },
      { property: "og:description", content: "Validasi Eco-Points siswa lewat pemindaian QR." },
    ],
  }),
  component: ScannerPage,
});

function ScannerPage() {
  const { me } = useMe();
  const queryClient = useQueryClient();
  const [nis, setNis] = useState("");
  const [items, setItems] = useState<string[]>(["tumbler"]);
  const [camera, setCamera] = useState(false);

  const ecoItems = useQuery({
    queryKey: ["eco-items"],
    queryFn: async () => {
      const { data } = await supabase
        .from("eco_items")
        .select("code, label, points")
        .eq("active", true)
        .order("points", { ascending: false });
      return data ?? [];
    },
  });

  const recent = useQuery({
    queryKey: ["officer-recent", me?.officer?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("validations")
        .select("id, status, created_at, students(full_name, nis), validation_items(item_code, points)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async ({ code, source }: { code: string; source: "scan" | "manual" }) => {
      if (items.length === 0) throw new Error("Pilih minimal satu item");
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("nis", code.trim())
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) throw new Error(`Siswa dengan NIS ${code} tidak ditemukan`);

      const { data: validation, error: vError } = await supabase
        .from("validations")
        .insert({
          student_id: student.id,
          officer_id: me?.officer?.id ?? null,
          status: source === "scan" ? "approved" : "pending",
          source,
          station: me?.officer?.station ?? "Pos Admin",
          reviewed_at: source === "scan" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (vError) throw vError;

      const rows = items.map((code2) => ({
        validation_id: validation.id,
        item_code: code2,
        student_id: student.id,
        points: ecoItems.data?.find((i) => i.code === code2)?.points ?? 0,
      }));
      const { error: iError } = await supabase.from("validation_items").insert(rows);
      if (iError) {
        await supabase.from("validations").delete().eq("id", validation.id);
        if (iError.code === "23505")
          throw new Error(`${student.full_name} sudah mendapat poin item tersebut hari ini`);
        throw iError;
      }
      return { student, source };
    },
    onSuccess: ({ student, source }) => {
      toast.success(
        source === "scan"
          ? `Validasi ${student.full_name} disetujui`
          : `Validasi manual ${student.full_name} menunggu persetujuan admin`,
      );
      setNis("");
      queryClient.invalidateQueries({ queryKey: ["officer-recent"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memvalidasi"),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold">Pos {me?.officer?.station ?? "Admin"}</h1>
              <p className="text-sm text-muted-foreground">
                Scan kamera otomatis disetujui, input manual butuh persetujuan admin.
              </p>
            </div>
            <Button variant={camera ? "secondary" : "default"} onClick={() => setCamera(!camera)}>
              {camera ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
              {camera ? "Tutup" : "Kamera"}
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            <Label>Item yang dibawa</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(ecoItems.data ?? []).map((item) => (
                <label
                  key={item.code}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-4"
                >
                  <Checkbox
                    checked={items.includes(item.code)}
                    onCheckedChange={(checked) =>
                      setItems((prev) =>
                        checked ? [...prev, item.code] : prev.filter((c) => c !== item.code),
                      )
                    }
                  />
                  <span>
                    <span className="block font-semibold">{item.label}</span>
                    <span className="text-xs text-muted-foreground">+{item.points} poin</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {camera && (
            <div className="mt-5">
              <CameraScanner
                active={camera}
                onResult={(text) => {
                  if (!submit.isPending) submit.mutate({ code: text, source: "scan" });
                }}
              />
            </div>
          )}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate({ code: nis, source: "manual" });
            }}
          >
            <Input
              value={nis}
              onChange={(e) => setNis(e.target.value)}
              placeholder="Input NIS manual"
              required
            />
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )}
              Validasi
            </Button>
          </form>
        </div>
      </div>

      <div className="surface-card divide-y divide-border">
        <p className="px-5 py-4 font-bold">Aktivitas Terakhir</p>
        {(recent.data ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {(r.students as { full_name: string } | null)?.full_name ?? "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {(r.validation_items ?? []).map((i) => i.item_code).join(" + ")} ·{" "}
                {new Date(r.created_at).toLocaleTimeString("id-ID")}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
        {(recent.data ?? []).length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Belum ada validasi hari ini.
          </p>
        )}
      </div>
    </div>
  );
}