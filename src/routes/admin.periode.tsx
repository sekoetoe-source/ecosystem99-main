import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Pencil, School, UtensilsCrossed } from "lucide-react";

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

function periodStatusLabel(status: Period["status"]) {
  if (status === "ACTIVE") return "Aktif";
  if (status === "CLOSED") return "Ditutup";
  return "Belum dibuka";
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
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
  const periods = useQuery({
    queryKey: ["period-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date")
        .order("start_date", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });
  const sessions = useQuery({
    queryKey: [
      "operational-sessions",
      periods.data?.find((period) => period.status === "ACTIVE")?.id,
    ],
    enabled: Boolean(periods.data?.some((period) => period.status === "ACTIVE")),
    queryFn: async () => {
      const period = periods.data?.find((candidate) => candidate.status === "ACTIVE");
      if (!period) return [] as Session[];
      const { data, error } = await supabase
        .from("operational_sessions")
        .select("id, period_id, session_number, name, start_time, end_time, enabled")
        .eq("period_id", period.id)
        .in("session_number", [1, 2])
        .order("session_number");
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });
  const audits = useQuery({
    queryKey: ["point-reset-audit-events"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("point_reset_audit_events")
        .select(
          "id, occurred_at, period_name, before_total_points, before_students_with_points, reset_validation_items, reason",
        )
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      start_time: string;
      end_time: string;
      enabled: boolean;
    }) => {
      if (!input.start_time || !input.end_time || input.start_time >= input.end_time)
        throw new Error("Jam mulai harus lebih awal dari jam selesai.");
      const { error } = await (supabase as any)
        .from("operational_sessions")
        .update({
          start_time: input.start_time,
          end_time: input.end_time,
          enabled: input.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("period_id", periods.data?.find((period) => period.status === "ACTIVE")?.id);
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
  const active = periods.data?.find((period) => period.status === "ACTIVE");
  const activePeriodContainsToday = Boolean(
    active && active.start_date <= currentDate && active.end_date >= currentDate,
  );
  const activePeriodDateStatus = active
    ? currentDate < active.start_date
      ? "Periode belum dimulai"
      : currentDate > active.end_date
        ? "Tanggal periode sudah berakhir"
        : "Periode berjalan"
    : "Tidak ada periode berjalan";
  const visibleSessions = useMemo(() => sessions.data ?? [], [sessions.data]);
  const openEditor = (session: Session) => {
    setEditing(session);
    setStartTime(session.start_time.slice(0, 5));
    setEndTime(session.end_time.slice(0, 5));
  };

  return (
    <div className="space-y-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div>
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
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
            {active && (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">
                {periodStatusLabel(active.status)}
              </span>
            )}
          </div>
          {active ? (
            <>
              <h2 className="mt-2 text-2xl font-bold">{active.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatDate(active.start_date)} – {formatDate(active.end_date)}
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">{activePeriodDateStatus}</p>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Pemindaian biasa dan pemindaian susulan masuk ke periode ini selama periode
                berstatus aktif dan tanggalnya masih berlaku. Reset poin untuk uji coba mengosongkan
                nilai poin pada periode aktif, tetapi tidak menutup periode dan tidak menghapus
                catatan pemindaian. Periode ditutup hanya saat masa operasionalnya berakhir dan
                admin mengarsipkannya.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Tidak ada periode berstatus aktif. Pemindaian baru tidak dapat dicatat sampai admin
              membuka periode berikutnya. Laporan periode yang sudah ditutup tetap dapat dilihat.
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
              mencatat sesi yang terlewat pada hari yang sama setelah sesi berakhir, paling lambat
              pukul 17.00 WIB. Catatan tetap masuk ke sesi asal.
            </li>
            <li className="rounded-xl bg-surface-low p-4">
              <strong className="text-foreground">4. Periode ditutup.</strong> Periode yang sudah
              diarsipkan tidak menerima pemindaian atau poin baru. Reset poin uji coba tidak menutup
              periode dan hanya mengosongkan nilai poin yang ada.
            </li>
          </ol>
        </div>
        <div className="surface-card overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="font-bold">Pengaturan Sesi Operasional</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Jam tetap tersimpan untuk membuka sesi otomatis, tetapi tidak ditampilkan pada kartu.
            </p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {visibleSessions.map((session) => {
              const status = !session.enabled
                ? "Tidak digunakan"
                : activePeriodContainsToday
                  ? runtimeStatus(session)
                  : activePeriodDateStatus;
              const Icon = session.session_number === 1 ? School : UtensilsCrossed;
              return (
                <div
                  key={session.id}
                  className={`rounded-2xl border p-5 ${status === "Sedang berlangsung" ? "border-blue-500 bg-blue-500/10" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 size-5 text-primary" />
                      <div>
                        <p className="font-extrabold">Sesi {session.session_number}</p>
                        <p className="text-sm text-muted-foreground">{session.name}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openEditor(session)}
                    >
                      <Pencil className="size-3.5" />
                      Atur Jadwal
                    </Button>
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
            <h2 className="font-bold">Riwayat periode</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Status menunjukkan siklus mana yang menerima pemindaian baru dan mana yang hanya
              menjadi arsip laporan.
            </p>
          </div>
          <div className="divide-y divide-border">
            {periods.data?.map((period) => (
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
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                  {periodStatusLabel(period.status)}
                </span>
              </div>
            ))}
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
            {audits.data?.map((audit) => (
              <div key={audit.id} className="p-5 text-sm">
                <p className="font-semibold">Poin periode {audit.period_name} dihapus</p>
                <p className="mt-1 text-muted-foreground">
                  {new Date(audit.occurred_at).toLocaleString("id-ID")} ·{" "}
                  {audit.before_total_points} poin dari {audit.before_students_with_points} siswa
                  dihapus pada {audit.reset_validation_items} catatan.
                </p>
              </div>
            ))}
          </div>
        </div>
        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {editing ? `Sesi ${editing.session_number}` : "Sesi"}</DialogTitle>
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
                    start_time: startTime,
                    end_time: endTime,
                    enabled: editing.enabled,
                  });
                }}
              >
                <div>
                  <Label>Nama</Label>
                  <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm">{editing.name}</p>
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
  );
}
