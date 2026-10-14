import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/routes/admin";
import { JawaraTab } from "@/routes/admin.leaderboard";

export const Route = createFileRoute("/admin/jawara")({ component: JawaraPage });

function JawaraPage() {
  const activePeriod = useQuery({
    queryKey: ["active-period"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name")
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
  return (
    <AdminShell>
      <section className="w-full max-w-6xl">
        <h1 className="text-3xl font-extrabold tracking-tight">Jawara</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jawara Lingkungan berdasarkan periode aktif. Data diperbarui otomatis.
        </p>
        <div className="mt-6">
          {activePeriod.data?.id ? (
            <JawaraTab
              periodId={activePeriod.data.id}
              periodName={activePeriod.data.name ?? undefined}
            />
          ) : (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">
              {activePeriod.isLoading
                ? "Memuat periode aktif..."
                : "Belum ada Periode Aktif. Buat atau aktifkan periode terlebih dahulu."}
            </div>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
