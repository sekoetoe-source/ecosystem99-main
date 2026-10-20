import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JawaraTab } from "@/routes/admin.leaderboard";
import { resolveOperationalPeriod } from "@/lib/operationalPeriod";

export const Route = createFileRoute("/admin/jawara")({ component: JawaraPage });

function JawaraPage() {
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
  const monthStart = `${currentDate.slice(0, 7)}-01`;
  const reportRange = (() => {
    const [year, month] = currentDate.slice(0, 7).split("-").map(Number);
    return {
      start: monthStart,
      end: new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10),
    };
  })();
  const activePeriod = useQuery({
    queryKey: ["active-period"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return resolveOperationalPeriod(data ?? [], currentDate);
    },
    refetchInterval: 30_000,
  });
  return (
    <div id="jawara-page" className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Jawara</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jawara Lingkungan berdasarkan periode aktif. Data diperbarui otomatis.
        </p>
      </div>
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
  );
}
