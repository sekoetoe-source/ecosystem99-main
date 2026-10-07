import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/routes/admin";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/periode")({ component: PeriodPage });

function PeriodPage() {
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("periods").select("id, name, status, start_date, end_date").order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const audits = useQuery({
    queryKey: ["period-reset-audit-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("period_reset_audit_events").select("id, occurred_at, source_period_name, target_period_name, source_start_date, source_end_date, target_start_date, target_end_date, before_total_earned_points, after_total_earned_points").order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const active = periods.data?.find((period) => period.status === "ACTIVE");
  return <AdminShell><section className="mx-auto w-full max-w-6xl space-y-6"><div><h1 className="text-3xl font-extrabold tracking-tight">Periode</h1><p className="mt-1 text-sm text-muted-foreground">Periode aktif dan riwayat reset point.</p></div><div className="surface-card p-5"><p className="label-xs text-muted-foreground">Periode aktif</p>{active ? <><h2 className="mt-2 text-2xl font-bold">{active.name}</h2><p className="mt-2 text-sm text-muted-foreground">Status: <span className="font-semibold text-emerald-600">{active.status}</span> · {active.start_date} – {active.end_date}</p></> : <p className="mt-2 text-sm text-muted-foreground">Tidak ada periode aktif.</p>}</div><div className="surface-card overflow-hidden"><div className="border-b border-border p-5"><h2 className="font-bold">Riwayat periode</h2></div><div className="divide-y divide-border">{periods.data?.map((period) => <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-semibold">{period.name}</p><p className="text-sm text-muted-foreground">{period.start_date} – {period.end_date}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{period.status}</span></div>)}{!periods.data?.length && <p className="p-5 text-sm text-muted-foreground">Memuat riwayat periode...</p>}</div></div><div className="surface-card overflow-hidden"><div className="border-b border-border p-5"><h2 className="font-bold">Audit reset point</h2></div><div className="divide-y divide-border">{audits.data?.map((audit) => <div key={audit.id} className="p-5 text-sm"><p className="font-semibold">{audit.source_period_name} → {audit.target_period_name}</p><p className="mt-1 text-muted-foreground">{new Date(audit.occurred_at).toLocaleString("id-ID")} · {audit.source_start_date} – {audit.source_end_date} ditutup</p><p className="mt-1 text-muted-foreground">Poin sebelum: {audit.before_total_earned_points.toLocaleString("id-ID")} · sesudah: {audit.after_total_earned_points.toLocaleString("id-ID")}</p></div>)}{!audits.data?.length && <p className="p-5 text-sm text-muted-foreground">Belum ada audit reset point.</p>}</div></div></section></AdminShell>;
}
