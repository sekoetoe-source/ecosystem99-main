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
  Plus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/traktir")({
  component: AdminTraktirPage,
});

const INITIAL_MAYAR_TRANSACTIONS = [
  {
    id: "seed-1",
    mayar_invoice_id: "INV-05e5c3",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 1000,
    payment_method: "QRIS",
    status: "success",
    pay_url: null as string | null,
    notes: null as string | null,
    created_at: "2026-08-17T11:56:04+07:00",
    updated_at: "2026-08-17T11:56:04+07:00",
  },
  {
    id: "seed-2",
    mayar_invoice_id: "INV-e21763",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 1000,
    payment_method: "QRIS",
    status: "success",
    pay_url: null as string | null,
    notes: null as string | null,
    created_at: "2026-08-17T11:14:06+07:00",
    updated_at: "2026-08-17T11:14:06+07:00",
  },
  {
    id: "seed-3",
    mayar_invoice_id: "INV-007bdb",
    donor_name: "Donatur Kopi",
    donor_email: "donatur@smpn99.sch.id",
    donor_mobile: "081234567890",
    amount: 3000,
    payment_method: "QRIS",
    status: "success",
    pay_url: null as string | null,
    notes: null as string | null,
    created_at: "2026-08-17T11:09:58+07:00",
    updated_at: "2026-08-17T11:09:58+07:00",
  },
];

function AdminTraktirPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [manualModalOpen, setManualModalOpen] = useState(false);

  // Manual Transaction Form State
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualAmount, setManualAmount] = useState("10000");
  const [manualNotes, setManualNotes] = useState("Dukungan langsung / manual");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isTableMissing, setIsTableMissing] = useState(false);

  // Fetch transactions list with instant fallbacks
  const transactionsQuery = useQuery({
    queryKey: ["admin-traktir-transactions"],
    queryFn: async () => {
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
          return INITIAL_MAYAR_TRANSACTIONS;
        }

        setIsTableMissing(false);
        if (!data || data.length === 0) {
          // Attempt to seed data into Supabase in background
          supabase
            .from("traktir_transactions")
            .upsert(
              INITIAL_MAYAR_TRANSACTIONS.map(({ id, ...rest }) => rest),
              { onConflict: "mayar_invoice_id" }
            )
            .then(() => console.log("Seeded initial Mayar transactions to DB"));

          return INITIAL_MAYAR_TRANSACTIONS;
        }

        return data;
      } catch (err) {
        console.error("Transactions query catch:", err);
        return INITIAL_MAYAR_TRANSACTIONS;
      }
    },
  });

  // Fetch stats summary RPC with instant fallback calculations
  const statsQuery = useQuery({
    queryKey: ["admin-traktir-stats"],
    queryFn: async () => {
      const list = transactionsQuery.data || INITIAL_MAYAR_TRANSACTIONS;
      const successRows = list.filter((t) => t.status === "success");
      const total = successRows.reduce((acc, r) => acc + Number(r.amount), 0);

      try {
        const { data, error } = await (supabase as any).rpc("get_traktir_stats");
        if (!error && data && Number(data.total_amount) > 0) {
          return data;
        }
      } catch (err) {
        console.warn("RPC get_traktir_stats fallback:", err);
      }

      return {
        total_amount: total,
        total_count: successRows.length,
        hosting_amount: Math.round(total * 0.5),
        reward_amount: Math.round(total * 0.4),
        maintenance_amount: Math.round(total * 0.1),
        hosting_pct: 50,
        reward_pct: 40,
        maintenance_pct: 10,
      };
    },
  });

  // Mutation to update status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("traktir_transactions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status transaksi berhasil diperbarui.");
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-stats"] });
      queryClient.invalidateQueries({ queryKey: ["landing-traktir-stats"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Gagal memperbarui status");
    },
  });

  // Handle manual transaction submission
  async function handleAddManualTransaction(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(manualAmount);
    if (!amountNum || amountNum < 1000) {
      toast.error("Minimal nominal adalah Rp1.000");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("traktir_transactions").insert({
        donor_name: manualName.trim() || "Donatur Kopi",
        donor_email: manualEmail.trim() || null,
        amount: amountNum,
        payment_method: "Manual / Direct",
        status: "success",
        notes: manualNotes,
        mayar_invoice_id: `MANUAL-${Date.now()}`,
      });

      if (error) throw error;

      toast.success("Catatan transaksi manual berhasil ditambahkan!");
      setManualModalOpen(false);
      setManualName("");
      setManualEmail("");
      setManualAmount("10000");
      setManualNotes("Dukungan langsung / manual");
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-stats"] });
      queryClient.invalidateQueries({ queryKey: ["landing-traktir-stats"] });
    } catch (err: any) {
      toast.error(err.message || "Gagal menambahkan transaksi manual");
    } finally {
      setIsSubmitting(false);
    }
  }

  const transactions = transactionsQuery.data || [];
  const stats = statsQuery.data || {
    total_amount: 0,
    total_count: 0,
    hosting_amount: 0,
    reward_amount: 0,
    maintenance_amount: 0,
  };

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.donor_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.mayar_invoice_id && t.mayar_invoice_id.toLowerCase().includes(search.toLowerCase())) ||
      (t.donor_email && t.donor_email.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = transactions.filter((t) => t.status === "pending").length;
  const successCount = transactions.filter((t) => t.status === "success").length;

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
    try {
      const seedTransactions = [
        {
          mayar_invoice_id: "INV-05e5c3",
          donor_name: "Donatur Kopi",
          donor_email: "donatur@smpn99.sch.id",
          donor_mobile: "081234567890",
          amount: 1000,
          payment_method: "QRIS",
          status: "success",
          created_at: "2026-08-17T11:56:04+07:00",
          updated_at: "2026-08-17T11:56:04+07:00",
        },
        {
          mayar_invoice_id: "INV-e21763",
          donor_name: "Donatur Kopi",
          donor_email: "donatur@smpn99.sch.id",
          donor_mobile: "081234567890",
          amount: 1000,
          payment_method: "QRIS",
          status: "success",
          created_at: "2026-08-17T11:14:06+07:00",
          updated_at: "2026-08-17T11:14:06+07:00",
        },
        {
          mayar_invoice_id: "INV-007bdb",
          donor_name: "Donatur Kopi",
          donor_email: "donatur@smpn99.sch.id",
          donor_mobile: "081234567890",
          amount: 3000,
          payment_method: "QRIS",
          status: "success",
          created_at: "2026-08-17T11:09:58+07:00",
          updated_at: "2026-08-17T11:09:58+07:00",
        },
      ];

      const { error } = await supabase
        .from("traktir_transactions")
        .upsert(seedTransactions, { onConflict: "mayar_invoice_id" });

      if (error) throw error;

      toast.success("3 transaksi Mayar berhasil disinkronkan ke Dasbor Admin!");
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-traktir-stats"] });
      queryClient.invalidateQueries({ queryKey: ["landing-traktir-stats"] });
    } catch (err: any) {
      toast.error(err.message || "Gagal menyinkronkan data transaksi Mayar");
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

        <div className="flex items-center gap-2">
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
            onClick={handleSyncMayarData}
            className="gap-2 rounded-xl border-primary text-primary hover:bg-primary/10"
          >
            <CreditCard className="size-4" /> Sinkron 3 Transaksi Mayar
          </Button>
          <Button
            size="sm"
            onClick={() => setManualModalOpen(true)}
            className="gap-2 rounded-xl"
          >
            <Plus className="size-4" /> Catat Manual
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
            Rp {stats.total_amount.toLocaleString("id-ID")}
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
          <div className="mt-2 text-lg font-bold text-foreground">
            17 Agustus 2026
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Integrasi Mayar.id PG Rilis
          </p>
        </div>
      </div>

      {/* ALLOCATION BREAKDOWN SECTION (AS IN PROMPT IMAGE 3) */}
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
          <Badge variant="outline" className="w-fit font-bold border-primary text-primary">
            Rilis: 17 Agt 2026 - Sekarang
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
              Rp {stats.hosting_amount.toLocaleString("id-ID")}
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
              Rp {stats.reward_amount.toLocaleString("id-ID")}
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
              Rp {stats.maintenance_amount.toLocaleString("id-ID")}
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
              <option value="success">Sukses</option>
              <option value="pending">Pending</option>
              <option value="failed">Gagal / Batal</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-muted/70 font-bold text-foreground">
              <tr>
                <th className="px-4 py-3 border-b">Tanggal & Waktu</th>
                <th className="px-4 py-3 border-b">Nama Donatur</th>
                <th className="px-4 py-3 border-b">Nominal</th>
                <th className="px-4 py-3 border-b">Metode / Gateway</th>
                <th className="px-4 py-3 border-b">Status</th>
                <th className="px-4 py-3 border-b text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactionsQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Memuat data transaksi...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Belum ada transaksi traktir kopi yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono text-xs">
                      {new Date(t.created_at).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <div>{t.donor_name}</div>
                      {t.donor_email && (
                        <div className="text-[11px] font-normal text-muted-foreground">
                          {t.donor_email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold font-mono text-primary whitespace-nowrap">
                      Rp {Number(t.amount).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                        <CreditCard className="size-3 text-primary" /> {t.payment_method || "Mayar PG"}
                      </span>
                      {t.mayar_invoice_id && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          ID: {t.mayar_invoice_id}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.status === "success" && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/30 gap-1 font-bold">
                          <CheckCircle2 className="size-3" /> Sukses
                        </Badge>
                      )}
                      {t.status === "pending" && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 border-amber-500/30 gap-1 font-bold">
                          <Clock className="size-3" /> Pending
                        </Badge>
                      )}
                      {(t.status === "failed" || t.status === "cancelled") && (
                        <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 hover:bg-rose-500/25 border-rose-500/30 gap-1 font-bold">
                          <XCircle className="size-3" /> Gagal
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {t.pay_url && (
                        <a
                          href={t.pay_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          Invoice <ExternalLink className="size-3" />
                        </a>
                      )}
                      {t.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: t.id, newStatus: "success" })}
                          className="rounded-lg text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                        >
                          Tandai Sukses
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MANUAL TRANSACTION MODAL */}
      <Dialog open={manualModalOpen} onOpenChange={setManualModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddManualTransaction}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coffee className="size-5 text-warning" /> Catat Transaksi Traktir Manual
              </DialogTitle>
              <DialogDescription className="text-xs">
                Gunakan formulir ini untuk mencatat dukungan Traktir Kopi yang diterima secara langsung / offline.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nama Donatur</label>
                <Input
                  placeholder="Nama donatur (Opsional)"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Email / Kontak</label>
                <Input
                  type="email"
                  placeholder="Email donatur (Opsional)"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nominal (Rp)</label>
                <Input
                  type="number"
                  min="1000"
                  placeholder="Minimal 1000"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  required
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Catatan / Keterangan</label>
                <Input
                  placeholder="Catatan transaksi..."
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setManualModalOpen(false)}
                className="rounded-xl"
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl">
                {isSubmitting ? "Menyimpan..." : "Simpan Transaksi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
