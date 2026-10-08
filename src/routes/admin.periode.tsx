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

function PeriodPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Session | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
  const periods = useQuery({
    queryKey: ["current-period", currentDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date")
        .lte("start_date", currentDate)
        .gte("end_date", currentDate)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const sessions = useQuery({
    queryKey: ["operational-sessions", periods.data?.id],
    enabled: Boolean(periods.data?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_sessions")
        .select("id, period_id, session_number, name, start_time, end_time, enabled")
        .eq("period_id", periods.data!.id)
        .in("session_number", [1, 2])
        .order("session_number");
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });
  const audits = useQuery({
    queryKey: ["period-reset-audit-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("period_reset_audit_events")
        .select(
          "id, occurred_at, source_period_name, target_period_name, source_start_date, source_end_date",
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
        .eq("period_id", periods.data?.id);
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
  const active = periods.data;
  const visibleSessions = useMemo(() => sessions.data ?? [], [sessions.data]);
  const openEditor = (session: Session) => {
    setEditing(session);
    setStartTime(session.start_time.slice(0, 5));
    setEndTime(session.end_time.slice(0, 5));
  };

  return (
    <AdminShell>
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Periode & Sesi Operasional</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atur jam sesi. Runtime status dihitung otomatis menurut waktu Asia/Jakarta.
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="label-xs text-muted-foreground">Periode aktif</p>
          {active ? (
            <>
              <h2 className="mt-2 text-2xl font-bold">{active.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {active.start_date} – {active.end_date}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Tidak ada periode aktif.</p>
          )}
        </div>
        <div className="surface-card overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="font-bold">Pengaturan Sesi Operasional</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Hanya Sesi 1 dan Sesi 2 yang digunakan.
            </p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {visibleSessions.map((session) => {
              const status = runtimeStatus(session);
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
                      Edit
                    </Button>
                  </div>
                  <p className="mt-6 text-2xl font-black tracking-tight">
                    {session.start_time.slice(0, 5)} — {session.end_time.slice(0, 5)}{" "}
                    <span className="text-sm font-semibold text-muted-foreground">WIB</span>
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
                    {period.start_date} – {period.end_date}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                  {period.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="font-bold">Audit reset point</h2>
          </div>
          <div className="divide-y divide-border">
            {audits.data?.map((audit) => (
              <div key={audit.id} className="p-5 text-sm">
                <p className="font-semibold">
                  {audit.source_period_name} → {audit.target_period_name}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {new Date(audit.occurred_at).toLocaleString("id-ID")} · {audit.source_start_date}{" "}
                  – {audit.source_end_date} ditutup
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
    </AdminShell>
  );
}
