import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/routes/admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Pencil, RotateCcw, School, UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/admin/periode")({ component: PeriodPage });

type Session = {
  id: string;
  period_id: string;
  session_number: number;
  name: string;
  start_time: string;
  end_time: string;
  enabled: boolean;
};

type Period = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  start_date: string;
  end_date: string;
  late_scan_start_date?: string | null;
  late_scan_end_date?: string | null;
};

type RuntimeStatus = "Belum dimulai" | "Sedang berlangsung" | "Selesai";

function jakartaMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return (
    Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  );
}

function runtimeStatus(session: Session): RuntimeStatus {
  const now = jakartaMinutes();
  const start =
    Number(session.start_time.slice(0, 2)) * 60 + Number(session.start_time.slice(3, 5));
  const end = Number(session.end_time.slice(0, 2)) * 60 + Number(session.end_time.slice(3, 5));
  if (now < start) return "Belum dimulai";
  if (now < end) return "Sedang berlangsung";
  return "Selesai";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function PeriodPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Session | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [lateStartDate, setLateStartDate] = useState("");
  const [lateEndDate, setLateEndDate] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const currentMonthName = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const periods = useQuery({
    queryKey: ["period-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date, late_scan_start_date, late_scan_end_date")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Period[];
    },
    refetchInterval: 30_000,
  });
  const active = periods.data?.find((period) => period.status === "ACTIVE");
  const sessions = useQuery({
    queryKey: ["operational-sessions", active?.id],
    enabled: Boolean(active?.id),
    queryFn: async () => {
      if (!active) return [] as Session[];
      const { data, error } = await supabase
        .from("operational_sessions")
        .select("id, period_id, session_number, name, start_time, end_time, enabled")
        .eq("period_id", active.id)
        .in("session_number", [1, 2])
        .order("session_number");
      if (error) throw error;
      return (data ?? []) as Session[];
    },
    refetchInterval: 30_000,
  });
  useEffect(() => {
    setLateStartDate(active?.late_scan_start_date ?? "");
    setLateEndDate(active?.late_scan_end_date ?? "");
  }, [active?.id, active?.late_scan_start_date, active?.late_scan_end_date]);
  const saveLateDateRange = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error("Tidak ada periode pada bulan berjalan.");
      if ((lateStartDate && !lateEndDate) || (!lateStartDate && lateEndDate))
        throw new Error(
          "Isi tanggal mulai dan tanggal akhir, atau kosongkan keduanya untuk menonaktifkan.",
        );
      if (lateStartDate && lateEndDate && lateStartDate > lateEndDate)
        throw new Error("Tanggal mulai harus sebelum atau sama dengan tanggal akhir.");
      if (lateStartDate && (lateStartDate < active.start_date || lateEndDate > active.end_date))
        throw new Error("Rentang tanggal harus berada di dalam periode bulan berjalan.");
      const { error } = await supabase
        .from("periods")
        .update({
          late_scan_start_date: lateStartDate || null,
          late_scan_end_date: lateEndDate || null,
        })
        .eq("id", active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["period-history"] });
      toast.success("Rentang tanggal susulan disimpan");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const audits = useQuery({
    queryKey: ["point-reset-audit-events"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("point_reset_audit_events")
        .select("id, occurred_at, period_name, before_total_points, before_students_with_points, reset_validation_items, reason, actor_id, actor_name")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
  const resetPoint = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reset_active_period_points_only" as never);
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      setResetConfirmOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["period-history"] }),
        queryClient.invalidateQueries({ queryKey: ["active-period"] }),
        queryClient.invalidateQueries({ queryKey: ["period-student-scores"] }),
        queryClient.invalidateQueries({ queryKey: ["period-class-scores"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-kpi"] }),
        queryClient.invalidateQueries({ queryKey: ["formal-report"] }),
        queryClient.invalidateQueries({ queryKey: ["jawara-data"] }),
        queryClient.invalidateQueries({ queryKey: ["point-reset-audit-events"] }),
      ]);
      if (data && typeof data === "object" && !Array.isArray(data) && typeof data["period_name"] === "string") {
        toast.success(`Poin uji coba periode ${data["period_name"]} berhasil direset.`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gagal mereset poin."),
  });
  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      start_time: string;
      end_time: string;
      enabled: boolean;
    }) => {
      if (!input.name.trim()) throw new Error("Nama sesi wajib diisi.");
      if (!input.start_time || !input.end_time || input.start_time >= input.end_time)
        throw new Error("Jam mulai harus lebih awal dari jam selesai.");
      if (!active) throw new Error("Tidak ada Periode Aktif.");
      const { error } = await (supabase as any)
        .from("operational_sessions")
        .update({
          name: input.name.trim(),
          start_time: input.start_time,
          end_time: input.end_time,
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("period_id", active.id);
      if (error)
        throw new Error(
          error.code === "23P01" ? "Jam sesi bertumpuk dengan sesi lain." : error.message,
        );
    },
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["operational-sessions"] });
      toast.success("Jam sesi diperbarui");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
  const activePeriodDateStatus = active
    ? currentDate < active.start_date
      ? "Periode belum dimulai"
      : currentDate > active.end_date
        ? "Periode sudah berakhir"
        : "Periode Aktif"
    : "Tidak ada Periode Aktif";
  const visibleSessions = useMemo(() => sessions.data ?? [], [sessions.data]);
  const openEditor = (session: Session) => {
    setEditing(session);
    setStartTime(session.start_time.slice(0, 5));
    setEndTime(session.end_time.slice(0, 5));
  };

  return (
    <AdminShell>
      <div className="min-w-0 space-y-5">
        <header className="min-w-0">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              Periode dan Sesi Operasional
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Periode menentukan siklus poin. Sesi menentukan kapan pemindaian biasa dibuka. Semua
              jadwal mengikuti waktu WIB.
            </p>
          </div>
        </header>
        <section className="space-y-6">
          <div className="surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="label-xs text-muted-foreground">Periode berjalan</p>
              {active ? (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">
                  Periode Aktif
                </span>
              ) : null}
            </div>
            {active ? (
              <>
                <h2 className="mt-2 text-2xl font-bold">{active.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDate(active.start_date)} – {formatDate(active.end_date)}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {activePeriodDateStatus}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3 text-sm text-amber-950">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>Reset mengubah poin pada catatan periode aktif menjadi 0. Catatan dan periode tetap tersimpan.</p>
                  </div>
                  <Button variant="outline" className="gap-2 border-amber-300 bg-white" onClick={() => setResetConfirmOpen(true)} disabled={resetPoint.isPending}>
                    <RotateCcw className="size-4" />
                    {resetPoint.isPending ? "Memproses..." : "Reset Poin"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Belum ada periode berstatus aktif. Aktifkan periode agar pemindaian dan pengaturan
                sesi tersedia.
              </p>
            )}
          </div>
          <div className="surface-card p-5">
            <h2 className="font-bold">Tanggal Pemindaian Susulan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin menetapkan rentang tanggal. Petugas memilih tanggal dalam rentang dan sesi saat
              mencatat susulan. Tidak ada batas jam.
            </p>
            {active ? (
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveLateDateRange.mutate();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="late-scan-start-date">Tanggal mulai</Label>
                    <input
                      id="late-scan-start-date"
                      type="date"
                      value={lateStartDate}
                      min={active.start_date}
                      max={active.end_date}
                      onChange={(event) => setLateStartDate(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="late-scan-end-date">Tanggal akhir</Label>
                    <input
                      id="late-scan-end-date"
                      type="date"
                      value={lateEndDate}
                      min={lateStartDate || active.start_date}
                      max={active.end_date}
                      onChange={(event) => setLateEndDate(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Kosongkan kedua tanggal untuk menonaktifkan pemindaian susulan.
                  </p>
                  <Button type="submit" disabled={saveLateDateRange.isPending}>
                    Simpan Rentang Tanggal
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Pengaturan tersedia setelah periode diaktifkan.
              </p>
            )}
          </div>
          <div className="surface-card p-5">
            <h2 className="font-bold">Alur periode dan pemindaian</h2>
            <ol className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
              <li className="rounded-xl bg-surface-low p-4">
                <strong className="text-foreground">1. Periode aktif.</strong> Poin hasil pemindaian
                dicatat pada periode yang sedang berjalan.
              </li>
              <li className="rounded-xl bg-surface-low p-4">
                <strong className="text-foreground">2. Dua sesi harian.</strong> Setiap siswa dapat
                tercatat satu kali pada Sesi 1 dan satu kali pada Sesi 2 dalam satu hari.
              </li>
              <li className="rounded-xl bg-surface-low p-4">
                <strong className="text-foreground">3. Pemindaian susulan.</strong> Petugas dapat
                mencatat sesi yang terlewat pada tanggal yang ditetapkan admin, tanpa batas jam.
                Catatan tetap masuk ke sesi dan tanggal asal.
              </li>
              <li className="rounded-xl bg-surface-low p-4">
                <strong className="text-foreground">4. Periode ditutup.</strong> Periode yang sudah
                diarsipkan tidak menerima pemindaian atau poin baru. Reset poin uji coba tidak
                menutup periode dan hanya mengosongkan nilai poin yang ada.
              </li>
            </ol>
          </div>
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="font-bold">Pengaturan Sesi Operasional</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pemindaian susulan adalah pencatatan terlambat ke Sesi 1 atau Sesi 2, bukan sesi harian ketiga.
                Rentang tanggalnya dapat diatur di atas; skor tetap mengikuti sesi asal.
              </p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {visibleSessions.map((session) => {
                const status = !session.enabled ? "Tidak digunakan" : runtimeStatus(session);
                const Icon = session.session_number === 1 ? School : UtensilsCrossed;
                return (
                  <div
                    key={session.id}
                    className={`rounded-2xl border p-5 ${status === "Sedang berlangsung" ? "border-blue-500 bg-blue-500/10" : "border-border"}`}
                  >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold">Sesi {session.session_number}</p>
                      <p className="text-sm text-muted-foreground">{session.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {session.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openEditor(session)}
                      >
                        <Pencil className="size-3.5" />
                        Atur Sesi
                      </Button>
                    </div>
                  </div>
                    <p className="mt-6 text-sm text-muted-foreground">
                      Pemindaian biasa dibuka otomatis sesuai jadwal yang tersimpan.
                    </p>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span
                        className={session.enabled ? "text-emerald-600" : "text-muted-foreground"}
                      >
                        ● {session.enabled ? "Digunakan" : "Tidak digunakan"}
                      </span>
                      <span
                        className={
                          status === "Sedang berlangsung"
                            ? "font-bold text-blue-600"
                            : "text-muted-foreground"
                        }
                      >
                        {status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="font-bold">Arsip periode</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Periode yang sudah ditutup, dengan rentang tanggalnya. Periode aktif dan draft ditampilkan di bagian pengaturan masing-masing.
              </p>
            </div>
            <div className="divide-y divide-border">
              {periods.isLoading ? (
                <p className="p-5 text-sm text-muted-foreground">Memuat riwayat periode...</p>
              ) : periods.isError ? (
                <p className="p-5 text-sm text-destructive">Riwayat periode gagal dimuat.</p>
              ) : (periods.data ?? []).filter((period) => period.status === "CLOSED").length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">Belum ada periode yang ditutup. Periode aktif tidak ditampilkan sebagai arsip.</p>
              ) : (
                periods.data?.filter((period) => period.status === "CLOSED").map((period) => (
                  <div
                    key={period.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-5"
                  >
                    <div>
                      <p className="font-semibold">{period.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(period.start_date)} – {formatDate(period.end_date)}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">Ditutup · Arsip</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border p-5">
              <h2 className="font-bold">Riwayat reset poin</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Setiap reset mengosongkan poin periode aktif untuk keperluan uji coba. Riwayat
                pemindaian tetap tersimpan.
              </p>
            </div>
            <div className="divide-y divide-border">
              {audits.isLoading ? (
                <p className="p-5 text-sm text-muted-foreground">Memuat riwayat reset poin...</p>
              ) : audits.isError ? (
                <p className="p-5 text-sm text-destructive">Riwayat reset poin gagal dimuat.</p>
              ) : (audits.data ?? []).length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">Belum ada riwayat reset poin.</p>
              ) : (
                audits.data.map((audit) => (
                  <div key={audit.id} className="p-5 text-sm">
                    <p className="font-semibold">Poin periode {audit.period_name} dihapus</p>
                    <p className="mt-1 text-muted-foreground">
                      {new Date(audit.occurred_at).toLocaleString("id-ID")} · {audit.before_total_points} poin dari {audit.before_students_with_points} siswa diubah pada {audit.reset_validation_items} catatan.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Admin: {audit.actor_name || audit.actor_id || "Identitas tidak tersedia"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
          <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Edit {editing ? `Sesi ${editing.session_number}` : "Sesi"}
                </DialogTitle>
                <DialogDescription>
                  Perubahan waktu memakai zona waktu Asia/Jakarta.
                </DialogDescription>
              </DialogHeader>
              {editing && (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    update.mutate({
                      id: editing.id,
                      name: editing.name,
                      start_time: startTime,
                      end_time: endTime,
                      enabled: editing.enabled,
                    });
                  }}
                >
                  <div>
                    <Label htmlFor="session-name">Nama sesi</Label>
                    <input
                      id="session-name"
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      required
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="session-start-time">Jam mulai</Label>
                      <input
                        id="session-start-time"
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        required
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="session-end-time">Jam selesai</Label>
                      <input
                        id="session-end-time"
                        type="time"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        required
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <Label htmlFor="session-enabled">Sesi aktif</Label>
                    <input
                      id="session-enabled"
                      type="checkbox"
                      checked={editing.enabled}
                      onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
                      className="size-4 accent-primary"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={update.isPending}>
                      Simpan Perubahan
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </section>
      </div>
    </AdminShell>
  );
}
