import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/traktir")({
  component: AdminTraktirPage,
});

export const INITIAL_MAYAR_TRANSACTIONS: any[] = [];

// Syarat tanggal rilis fitur: status 0 (menunggu >5% siswa aktif)
export const IS_TRAKTIR_RELEASED = false;

function AdminTraktirPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);

  // Fetch transactions list with release condition
  const transactionsQuery = useQuery({
    queryKey: ["admin-traktir-transactions", IS_TRAKTIR_RELEASED],
    queryFn: async () => {
      // Riwayat transaksi baru akan dihitung sesuai syarat tanggal rilis fitur
      if (!IS_TRAKTIR_RELEASED) {
        return [];
      }

      try {
        const { data, error } = await supabase
          .from("traktir_transactions")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("Supabase traktir_transactions notice:", error);
          if (
            error.message?.includes("traktir_transactions") ||
            error.message?.includes("schema cache") ||
            error.code === "PGRST205" ||
            error.code === "42P01"
          ) {
            setIsTableMissing(true);
          }
          return [];
        }

        setIsTableMissing(false);
        return data || [];
      } catch (err) {
        console.error("Transactions query catch:", err);
        return [];
      }
    },
  });

  // Fetch stats summary RPC with instant fallback calculations
  const statsQuery = useQuery({
    queryKey: ["admin-traktir-stats", IS_TRAKTIR_RELEASED],
    queryFn: async () => {
      // Set to 0 sesuai syarat tanggal rilis fitur
      return {
        total_amount: 0,
        total_count: 0,
        hosting_amount: 0,
        reward_amount: 0,
        maintenance_amount: 0,
        hosting_pct: 50,
        reward_pct: 40,
        maintenance_pct: 10,
      };
    },
  });

  const transactions = transactionsQuery.data || [];
  const stats = statsQuery.data || {
    total_amount: 0,
    total_count: 0,
    hosting_amount: 0,
    reward_amount: 0,
    maintenance_amount: 0,
  };

  const filteredTransactions = transactions.filter((t: any) => {
    const matchesSearch =
      (t.donor_name && t.donor_name.toLowerCase().includes(search.toLowerCase())) ||
      (t.mayar_invoice_id && t.mayar_invoice_id.toLowerCase().includes(search.toLowerCase())) ||
      (t.donor_email && t.donor_email.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = 0;
  const successCount = 0;

  const [copied, setCopied] = useState(false);

  const migrationSql = `-- Run this in Supabase Dashboard -> SQL Editor -> Run
CREATE TABLE IF NOT EXISTS public.traktir_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mayar_invoice_id TEXT UNIQUE,
    donor_name TEXT NOT NULL DEFAULT 'Donatur Kopi',
    donor_email TEXT,
    donor_mobile TEXT,
    amount NUMERIC NOT NULL CHECK (amount >= 1000),
    payment_method TEXT DEFAULT 'Mayar PG',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    pay_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes')
);

CREATE OR REPLACE FUNCTION public.cancel_expired_traktir_transactions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT := 0;
BEGIN
    UPDATE public.traktir_transactions SET status = 'cancelled', updated_at = now() WHERE status = 'pending' AND expired_at <= now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

ALTER TABLE public.traktir_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read success traktir_transactions" ON public.traktir_transactions;
CREATE POLICY "Public read success traktir_transactions" ON public.traktir_transactions FOR SELECT USING (status = 'success');
DROP POLICY IF EXISTS "Admin full access traktir_transactions" ON public.traktir_transactions;
CREATE POLICY "Admin full access traktir_transactions" ON public.traktir_transactions FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION public.get_traktir_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total_amount NUMERIC := 0; v_total_count INT := 0; v_hosting_amount NUMERIC := 0; v_reward_amount NUMERIC := 0; v_maintenance_amount NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_total_amount, v_total_count FROM public.traktir_transactions WHERE status = 'success';
    v_hosting_amount := ROUND(v_total_amount * 0.50, 0); v_reward_amount := ROUND(v_total_amount * 0.40, 0); v_maintenance_amount := ROUND(v_total_amount * 0.10, 0);
    RETURN jsonb_build_object('total_amount', v_total_amount, 'total_count', v_total_count, 'hosting_amount', v_hosting_amount, 'reward_amount', v_reward_amount, 'maintenance_amount', v_maintenance_amount, 'hosting_pct', 50, 'reward_pct', 40, 'maintenance_pct', 10);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_traktir_stats() TO anon, authenticated;`;

  function copySql() {
    navigator.clipboard.writeText(migrationSql);
    setCopied(true);
    toast.success("Script SQL berhasil disalin ke clipboard!");
    setTimeout(() => setCopied(false), 3000);
  }

  async function handleSyncMayarData() {
    if (!IS_TRAKTIR_RELEASED) {
      toast.info("Fitur Traktir Kopi saat ini berstatus Rilis: 0 (Menunggu >5% siswa aktif). Riwayat transaksi baru akan mulai dihitung setelah rilis resmi.");
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Try invoking Edge Function `mayar-sync`
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke("mayar-sync");

      if (!edgeErr && edgeData?.summary) {
        toast.success(`Sinkron Mayar Berhasil! ${edgeData.summary}`);
      } else {
        toast.info("Sinkronisasi Mayar selesai.");
      }

      queryClient.invalidateQueries({ queryKey: ["admin-traktir-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-stats"] });
      queryClient.invalidateQueries({ queryKey: ["landing-traktir-stats"] });
    } catch (err: any) {
      toast.error(err.message || "Gagal menyinkronkan data transaksi Mayar");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* WARNING BANNER FOR MISSING TABLE */}
      {isTableMissing && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-amber-800 dark:text-amber-200">
                Tabel Database `public.traktir_transactions` Belum Dibuat
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                Supabase database Anda belum memiliki tabel <code>public.traktir_transactions</code>. Silakan salin script SQL di bawah dan jalankan di <strong>Supabase Dashboard -&gt; SQL Editor -&gt; Run</strong>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={copySql}
              className="gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Script Berhasil Disalin!" : "Salin Script SQL Migration"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                transactionsQuery.refetch();
                statsQuery.refetch();
              }}
              className="gap-2 rounded-xl border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
            >
              <RefreshCw className="size-4" /> Coba Lagi
            </Button>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Coffee className="size-6 text-warning" />
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Dasbor Transaksi Traktir Kopi
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau real-time pemasukan dukungan komunitas via Mayar.id, rincian persentase alokasi dana, dan riwayat transaksi sejak rilis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              transactionsQuery.refetch();
              statsQuery.refetch();
              toast.info("Data diperbarui");
            }}
            className="gap-2 rounded-xl"
          >
            <RefreshCw className="size-4" /> Segarkan Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isSyncing}
            onClick={handleSyncMayarData}
            className="gap-2 rounded-xl border-primary text-primary hover:bg-primary/10 font-bold"
          >
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            {isSyncing ? "Menyinkronkan..." : "Sinkron Mayar"}
          </Button>
        </div>
      </div>

      {/* METRICS SUMMARY CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Total Pemasukan Sukses</span>
            <Coffee className="size-4 text-warning" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-primary">
            Rp {Number(stats.total_amount).toLocaleString("id-ID")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Dari total {successCount} transaksi berhasil
          </p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Transaksi Sukses</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
            {successCount} Transaksi
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tervalidasi otomatis oleh Mayar
          </p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Pending / Memproses</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-amber-600">
            {pendingCount} Transaksi
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Menunggu penyelesaian checkout
          </p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Tanggal Rilis Fitur</span>
            <Sparkles className="size-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-foreground">
            0
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Menunggu akumulasi &gt;5% siswa aktif
          </p>
        </div>
      </div>

      {/* ALLOCATION BREAKDOWN SECTION */}
      <div className="surface-card p-6 border-primary/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg font-extrabold flex items-center gap-2">
              <Sparkles className="size-5 text-primary" /> Rincian Persentase Alokasi Penggunaan Dana
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Target kebutuhan operasional, alokasi dana, dan estimasi rupiah berdasarkan total traktir terakumulasi.
            </p>
          </div>
          <Badge variant="outline" className="w-fit font-bold border-amber-500/40 text-amber-600 dark:text-amber-400">
            Status Rilis: 0 (Menunggu &gt;5% Siswa Aktif)
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mt-4">
          <div className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Building2 className="size-4" /> Hosting & Domain
              </span>
              <span className="text-base font-black text-blue-600 dark:text-blue-400">50%</span>
            </div>
            <div className="mt-3 text-xl font-extrabold text-foreground">
              Rp {Number(stats.hosting_amount).toLocaleString("id-ID")}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: "50%" }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Operasional server, domain, database Supabase & CDN.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Trophy className="size-4" /> Reward Siswa & Kelas
              </span>
              <span className="text-base font-black text-amber-600 dark:text-amber-400">40%</span>
            </div>
            <div className="mt-3 text-xl font-extrabold text-foreground">
              Rp {Number(stats.reward_amount).toLocaleString("id-ID")}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: "40%" }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Apresiasi voucher & hadiah bagi Jawara Lingkungan.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="size-4" /> Maintenance & Dev
              </span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">10%</span>
            </div>
            <div className="mt-3 text-xl font-extrabold text-foreground">
              Rp {Number(stats.maintenance_amount).toLocaleString("id-ID")}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "10%" }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Pengembangan fitur baru & perbaikan sistem berkala.
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs italic text-muted-foreground">
          *Persentase tersebut merupakan ketetapan pengelola sejak peluncuran fitur Traktir Kopi untuk transparansi penggunaan dana publik.
        </p>
      </div>

      {/* TRANSACTIONS TABLE SECTION */}
      <div className="surface-card p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-extrabold">Riwayat Transaksi Traktir Kopi</h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari donatur / ID invoice..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 text-xs rounded-xl border border-input bg-background font-medium focus:outline-primary"
            >
              <option value="all">Semua Status</option>
              <option value="success">Paid / Sukses</option>
              <option value="pending">Pending</option>
              <option value="failed">Gagal / Batal</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-muted/70 font-bold text-foreground">
              <tr>
                <th className="px-4 py-3 border-b">ID</th>
                <th className="px-4 py-3 border-b">Nama Pembayaran</th>
                <th className="px-4 py-3 border-b">ID Product</th>
                <th className="px-4 py-3 border-b">Jumlah</th>
                <th className="px-4 py-3 border-b">Nama</th>
                <th className="px-4 py-3 border-b">Email</th>
                <th className="px-4 py-3 border-b">Hp</th>
                <th className="px-4 py-3 border-b">Status</th>
                <th className="px-4 py-3 border-b">Tipe</th>
                <th className="px-4 py-3 border-b">Metode</th>
                <th className="px-4 py-3 border-b text-right">Kode Ku...</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactionsQuery.isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                    Memuat data transaksi...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center justify-center space-y-3">
                      <div className="rounded-full bg-amber-100 dark:bg-amber-950/60 p-3 text-amber-600 dark:text-amber-400">
                        <Sparkles className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-foreground text-sm">
                          Riwayat Transaksi Belum Dihitung
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Riwayat transaksi baru akan mulai dihitung dan dicatat secara otomatis sesuai syarat tanggal rilis fitur (Status Rilis: 0 / Menunggu akumulasi &gt;5% siswa aktif).
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t: any, index: number) => {
                  const invoiceId = t.mayar_invoice_id || `INV-${index}`;
                  const shortId = invoiceId.startsWith("INV-") ? invoiceId.replace("INV-", "") : invoiceId;
                  const productId = t.product_id || invoiceId.slice(0, 6);
                  const mobile = t.donor_mobile || "081234567890";
                  const email = t.donor_email || "donatur@smpn99.sch.id";
                  const isPaid = t.status === "success" || t.status === "paid";

                  return (
                    <tr key={t.id || index} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                        {shortId}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        INVOICE
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                        {productId}
                      </td>
                      <td className="px-4 py-3 font-bold font-mono text-foreground whitespace-nowrap">
                        Rp {Number(t.amount).toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">
                        {t.donor_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {email.length > 12 ? `${email.slice(0, 8)}...` : email}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-foreground">
                        <div className="flex items-center gap-1">
                          <span>{mobile}</span>
                          <a
                            href={`https://wa.me/${mobile.replace(/^0/, "62")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700"
                            title="Hubungi via WhatsApp"
                          >
                            <MessageSquare className="size-3.5 fill-emerald-600 text-white" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                            Paid
                          </span>
                        ) : t.status === "pending" ? (
                          <span className="inline-flex items-center rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-rose-500 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-slate-600 px-2 py-0.5 text-[11px] font-medium text-white">
                          Invoice
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <span className="font-extrabold tracking-tighter text-slate-800 dark:text-slate-200">
                            QRIS
                          </span>
                          <span className="text-[9px] text-muted-foreground leading-tight hidden sm:inline">
                            QR Code Standar
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                        -
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
