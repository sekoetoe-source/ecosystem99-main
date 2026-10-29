import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Coffee,
  Download,
  FileText,
  Leaf,
  Printer,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import logoAsset from "@/assets/logo-smpn99.png.asset.json";
import { resolveOperationalPeriod, todayJakartaDate } from "@/lib/operationalPeriod";
import {
  calculateEnvironmentalImpact,
  formatWasteWeight,
  ENVIRONMENTAL_IMPACT_CONFIG,
  type EnvironmentalImpactMetrics,
} from "@/lib/environmentalImpact";

export const Route = createFileRoute("/admin/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Bulanan Program Lingkungan — SMPN 99 Jakarta" },
      {
        name: "description",
        content:
          "Laporan formal bulanan program lingkungan: estimasi sampah sekali pakai dicegah, penggunaan tumbler, kotak makan, dan peringkat kelas.",
      },
      { property: "og:title", content: "Laporan Bulanan Program Lingkungan" },
      {
        property: "og:description",
        content: "Laporan resmi dampak program tumbler & kotak makan SMP Negeri 99 Jakarta.",
      },
    ],
  }),
  component: LaporanPage,
});

const SCHOOL = {
  name: "SMP NEGERI 99 JAKARTA",
  address: "Jalan Sirap, Kelurahan Kayu Putih, Kecamatan Pulo Gadung, Jakarta Timur",
  contact: "Telp. 021.4891456 Fax. 47881356",
  emailWebsite: "Surel: smpn99dki@yahoo.co.id | Situs web: https://smpn99jkt.sch.id",
  principal: "Etty Indarti, S.Pd",
  principalNip: "NIP. 19700418 1998022 001",
  coordinator: "Indah Novitasari, S.Pd, M.Si",
  coordinatorNip: "NIP. 19911115 2023212 028",
};

function monthKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

function monthLabel(key: string) {
  if (!key) return "-";
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(y!, (m ?? 1) - 1, 1),
  );
}

function monthRange(key: string) {
  if (!key) {
    const today = todayJakartaDate();
    return { start: `${today.slice(0, 7)}-01`, end: today };
  }
  const [y, m] = key.split("-").map(Number);
  const start = `${key}-01`;
  const next = new Date(Date.UTC(y!, m!, 1));
  const end = next.toISOString().slice(0, 10);
  return { start, end };
}

function formattedReportDate() {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

type KelasRow = {
  name: string;
  students: number;
  points: number;
  tumbler: number;
  lunchbox: number;
  tumblerCount: number;
  lunchboxCount: number;
  wasteAvoidedG: number;
};

type ReportData = {
  rows: KelasRow[];
  totalStudents: number;
  totalItems: number;
  totalPoin: number;
  tumblerRate: number;
  lunchboxRate: number;
  growth: number | null;
  topKelas: string;
  impact: EnvironmentalImpactMetrics;
};

function FormalReportDocument({
  d,
  month,
  isModal = false,
  className = "",
}: {
  d: ReportData | undefined;
  month: string | undefined;
  isModal?: boolean;
  className?: string;
}) {
  const currentDateFormatted = useMemo(() => formattedReportDate(), []);

  return (
    <article
      className={`${!isModal ? "print-report-sheet" : "no-print"} ${className} ${
        isModal
          ? "bg-white text-slate-900 shadow-xl rounded-sm p-6 sm:p-10 max-w-4xl mx-auto border border-slate-200"
          : "surface-card print:bg-white print:border-none print:shadow-none print:p-0 px-4 py-6 sm:px-10 sm:py-10 max-w-5xl mx-auto"
      }`}
    >
      {/* 1. KOP SURAT RESMI SEKOLAH */}
      <header className="report-header print-avoid-break border-b-4 border-double border-slate-900 pb-4 mb-6">
        <div className="flex items-center gap-5 sm:gap-6">
          <img
            src={logoAsset.url}
            alt="Logo SMP Negeri 99 Jakarta"
            className="size-16 sm:size-20 shrink-0 object-contain"
          />
          <div className="flex-1 text-center min-w-0">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 uppercase">
              {SCHOOL.name}
            </h2>
            <p className="text-xs sm:text-sm font-medium text-slate-700 leading-snug">
              {SCHOOL.address}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-600">
              {SCHOOL.contact} • {SCHOOL.emailWebsite}
            </p>
          </div>
        </div>
      </header>

      {/* 2. JUDUL DOKUMEN & PERIODE */}
      <section className="print-avoid-break text-center mb-6">
        <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-950">
          LAPORAN RESMI PROGRAM LINGKUNGAN HIDUP & PENGURANGAN SAMPAH
        </h3>
        <p className="mt-1 text-xs sm:text-sm font-bold text-emerald-800">
          Periode Evaluasi: {month ? monthLabel(month) : "-"}
        </p>
      </section>

      {/* 3. HIGHLIGHT 4 KPI UTAMA */}
      <section className="print-avoid-break grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-slate-300 bg-slate-50/80 p-3.5 text-center">
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {(d?.impact.validatedActivities ?? 0).toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-bold text-slate-700">
            Aktivitas Tervalidasi
          </p>
        </div>

        <div className="rounded-xl border border-slate-300 bg-slate-50/80 p-3.5 text-center">
          <p className="text-xl sm:text-2xl font-black text-emerald-800">
            {(d?.impact.validatedTumblerUses ?? 0).toLocaleString("id-ID")}
            <span className="text-xs font-semibold ml-1 text-slate-600">({d?.tumblerRate ?? 0}%)</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-bold text-slate-700">
            Penggunaan Tumbler
          </p>
        </div>

        <div className="rounded-xl border border-slate-300 bg-slate-50/80 p-3.5 text-center">
          <p className="text-xl sm:text-2xl font-black text-blue-800">
            {(d?.impact.validatedLunchboxUses ?? 0).toLocaleString("id-ID")}
            <span className="text-xs font-semibold ml-1 text-slate-600">({d?.lunchboxRate ?? 0}%)</span>
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-bold text-slate-700">
            Penggunaan Kotak Makan
          </p>
        </div>

        <div className="rounded-xl border-2 border-emerald-600 bg-emerald-50/60 p-3.5 text-center">
          <p className="text-xl sm:text-2xl font-black text-emerald-900">
            {formatWasteWeight(d?.impact.totalWasteAvoidedG ?? 0)}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs font-bold text-emerald-950">
            Estimasi Sampah Dicegah
          </p>
        </div>
      </section>

      {/* 4. BREAKDOWN DAMPAK LINGKUNGAN & METODOLOGI */}
      <section className="print-avoid-break rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 mb-6">
        <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-emerald-950 mb-2.5 flex items-center gap-1.5">
          <Leaf className="size-4 text-emerald-700 shrink-0" />
          Perhitungan Sampah Sekali Pakai yang Dihindari
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3">
          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <span className="text-slate-600 font-medium block">Botol Plastik Sekali Pakai</span>
            <p className="text-sm font-black text-slate-900 mt-1">
              {formatWasteWeight(d?.impact.bottleWasteAvoidedG ?? 0)}
            </p>
            <span className="text-[10px] text-slate-500">
              {(d?.impact.validatedTumblerUses ?? 0).toLocaleString("id-ID")} tumbler × 15,5 gram
            </span>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-white p-3">
            <span className="text-slate-600 font-medium block">Alas Makan Kantin Sekali Pakai</span>
            <p className="text-sm font-black text-slate-900 mt-1">
              {formatWasteWeight(d?.impact.foodLinerWasteAvoidedG ?? 0)}
            </p>
            <span className="text-[10px] text-slate-500">
              {(d?.impact.validatedLunchboxUses ?? 0).toLocaleString("id-ID")} kotak makan × 3,9 gram
            </span>
          </div>

          <div className="rounded-lg border border-emerald-300 bg-emerald-100/60 p-3">
            <span className="text-emerald-900 font-bold block">Total Sampah Sekali Pakai Dicegah</span>
            <p className="text-base font-black text-emerald-950 mt-1">
              {(d?.impact.totalWasteAvoidedKg ?? 0).toLocaleString("id-ID", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}{" "}
              kg
            </p>
            <span className="text-[10px] text-emerald-800 font-medium">
              {(d?.impact.totalWasteAvoidedG ?? 0).toLocaleString("id-ID")} gram
            </span>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-2.5 text-[11px] text-slate-700 leading-relaxed">
          <strong>Keterangan Metodologi:</strong> Estimasi dihitung berdasarkan berat rata-rata barang
          sekali pakai yang dapat dicegah: 1 botol air mineral sekali pakai (15,5 gram) dan 1 alas makan
          kantin sekali pakai (3,9 gram). Angka di atas merupakan estimasi sampah yang berhasil dicegah
          dari kebiasaan ramah lingkungan siswa dan bukan hasil penimbangan fisik langsung.
        </div>
      </section>

      {/* 5. TREN & RINGKASAN BULANAN */}
      <section className="print-avoid-break mb-6">
        <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900 mb-2">
          Tren Partisipasi & Ringkasan Operasional
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <span className="text-slate-600">Siswa aktif terdaftar:</span>
              <strong className="text-slate-900">
                {(d?.totalStudents ?? 0).toLocaleString("id-ID")} siswa
              </strong>
            </div>
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <span className="text-slate-600">Total poin lingkungan terkumpul:</span>
              <strong className="text-slate-900">
                {(d?.totalPoin ?? 0).toLocaleString("id-ID")} poin
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Performa kelas terbaik:</span>
              <strong className="text-emerald-800 font-extrabold">{d?.topKelas ?? "-"}</strong>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex flex-col justify-center items-center text-center">
            <span className="text-[11px] font-bold text-slate-600">
              Pertumbuhan Partisipasi dari Bulan Lalu
            </span>
            <p className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1">
              {d?.growth === null || d?.growth === undefined
                ? "—"
                : `${d.growth > 0 ? "+" : ""}${d.growth}%`}
            </p>
            <span className="text-[10px] text-slate-500 mt-0.5">
              Berdasarkan perbandingan total penggunaan barang tervalidasi
            </span>
          </div>
        </div>
      </section>

      {/* 6. TABEL PERFORMA KELAS (JAWARA LINGKUNGAN) */}
      <section className="mb-6">
        <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900 mb-2">
          Peringkat Partisipasi & Dampak per Kelas
        </h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-200 font-extrabold">
                <th className="px-3 py-2 text-center w-12">No</th>
                <th className="px-3 py-2">Kelas</th>
                <th className="px-3 py-2 text-right">Siswa</th>
                <th className="px-3 py-2 text-right">Poin</th>
                <th className="px-3 py-2 text-right">Tumbler (%)</th>
                <th className="px-3 py-2 text-right">Kotak Makan (%)</th>
                <th className="px-3 py-2 text-right">Sampah Dicegah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {(d?.rows ?? []).map((r, i) => (
                <tr key={r.name} className={i < 3 ? "bg-emerald-50/30" : ""}>
                  <td className="px-3 py-2 text-center font-bold text-slate-700">{i + 1}</td>
                  <td className="px-3 py-2 font-bold text-slate-900">{r.name}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{r.students}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                    {r.points.toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{r.tumbler}%</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{r.lunchbox}%</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                    {formatWasteWeight(r.wasteAvoidedG)}
                  </td>
                </tr>
              ))}
              {(d?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500 italic">
                    Belum ada data pada periode evaluasi ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. BLOK TANDA TANGAN & PENGESAHAN */}
      <footer className="report-footer print-avoid-break mt-8 pt-4 border-t border-slate-300">
        <div className="grid grid-cols-2 gap-8 text-center text-xs text-slate-900">
          <div>
            <p className="font-medium">Mengetahui,</p>
            <p className="font-bold">Kepala SMP Negeri 99 Jakarta</p>
            <div className="mx-auto mt-16 w-48 sm:w-56 border-t border-slate-900 pt-1.5">
              <p className="font-black text-slate-950">{SCHOOL.principal}</p>
              <p className="text-[10px] text-slate-600">{SCHOOL.principalNip}</p>
            </div>
          </div>

          <div>
            <p className="font-medium">Jakarta, {currentDateFormatted}</p>
            <p className="font-bold">Koordinator Program Lingkungan Hidup</p>
            <div className="mx-auto mt-16 w-48 sm:w-56 border-t border-slate-900 pt-1.5">
              <p className="font-black text-slate-950">{SCHOOL.coordinator}</p>
              <p className="text-[10px] text-slate-600">{SCHOOL.coordinatorNip}</p>
            </div>
          </div>
        </div>
      </footer>
    </article>
  );
}

function LaporanPage() {
  const [previewOpen, setPreviewOpen] = useState(false);

  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("id, name, status, start_date, end_date")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const operationalPeriod = resolveOperationalPeriod(periods.data ?? [], todayJakartaDate());
  const selectedMonth = operationalPeriod?.start_date.slice(0, 7) ?? "";

  const report = useQuery({
    queryKey: ["formal-report", selectedMonth, periods.dataUpdatedAt],
    queryFn: async (): Promise<ReportData> => {
      const currentRange = monthRange(selectedMonth);
      const [year, month] = selectedMonth.split("-").map(Number);
      const previousMonthDate = new Date(Date.UTC(year!, month! - 2, 1));
      const previousRange = monthRange(monthKey(previousMonthDate));
      const selectedPeriod = operationalPeriod;

      const [studentsRes, itemsRes, prevItemsRes] = await Promise.all([
        supabase.from("students").select("id, class_id, classes(name)").eq("active", true),
        selectedPeriod
          ? supabase
              .from("validation_items")
              .select(
                "validation_id, item_code, points, student_id, day, validations!inner(status, period_id)",
              )
              .eq("validations.period_id", selectedPeriod.id)
              .gte("day", currentRange.start)
              .lt("day", currentRange.end)
          : Promise.resolve({
              data: [] as Array<{
                validation_id?: string;
                item_code: string;
                points: number;
                student_id: string;
                day: string;
                validations: unknown;
              }>,
              error: null,
            }),
        selectedPeriod
          ? supabase
              .from("validation_items")
              .select("validation_id, item_code, points, student_id, day, validations!inner(status, period_id)")
              .eq("validations.period_id", selectedPeriod.id)
              .gte("day", previousRange.start)
              .lt("day", previousRange.end)
          : Promise.resolve({
              data: [] as Array<{
                validation_id?: string;
                item_code: string;
                points: number;
                student_id: string;
                day: string;
                validations: unknown;
              }>,
              error: null,
            }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (prevItemsRes.error) throw prevItemsRes.error;

      const students = studentsRes.data ?? [];
      const items = itemsRes.data ?? [];
      const prevItems = prevItemsRes.data ?? [];

      const validStudents = students.filter((s) => {
        const className = (s.classes as { name: string } | null)?.name?.trim();
        return Boolean(
          s.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas",
        );
      });
      const validStudentIds = new Set(validStudents.map((s) => s.id));

      const approved = items.filter(
        (i) =>
          (i.validations as { status: string } | null)?.status === "approved" &&
          validStudentIds.has(i.student_id),
      );

      const prevApproved = prevItems.filter(
        (i) =>
          (i.validations as { status: string } | null)?.status === "approved" &&
          validStudentIds.has(i.student_id),
      );

      // Distinct approved validations (activities)
      const approvedValidationIds = new Set(
        approved.map((i) => i.validation_id ?? `${i.student_id}-${i.day}`),
      );

      const impact = calculateEnvironmentalImpact(approvedValidationIds.size, approved);

      const classOf = new Map(
        validStudents.map((s) => [s.id, (s.classes as { name: string }).name.trim()]),
      );

      const classes = new Map<
        string,
        {
          name: string;
          students: number;
          points: number;
          tumblerUsers: Set<string>;
          lunchboxUsers: Set<string>;
          tumblerCount: number;
          lunchboxCount: number;
        }
      >();

      const tumblerUsers = new Set<string>();
      const lunchboxUsers = new Set<string>();

      for (const s of validStudents) {
        const name = classOf.get(s.id)!;
        if (!classes.has(name)) {
          classes.set(name, {
            name,
            students: 0,
            points: 0,
            tumblerUsers: new Set(),
            lunchboxUsers: new Set(),
            tumblerCount: 0,
            lunchboxCount: 0,
          });
        }
        classes.get(name)!.students += 1;
      }

      for (const i of approved) {
        const name = classOf.get(i.student_id);
        if (!name || !classes.has(name)) continue;
        const row = classes.get(name)!;
        row.points += Number(i.points ?? 0);
        const code = i.item_code?.toLowerCase().trim();
        if (code === "tumbler" || code === "break_combo") {
          row.tumblerUsers.add(i.student_id);
          row.tumblerCount += 1;
          tumblerUsers.add(i.student_id);
        }
        if (code === "lunchbox" || code === "break_combo") {
          row.lunchboxUsers.add(i.student_id);
          row.lunchboxCount += 1;
          lunchboxUsers.add(i.student_id);
        }
      }

      const rows: KelasRow[] = [...classes.values()]
        .map((r) => {
          const wasteAvoidedG =
            Math.round(
              (r.tumblerCount * ENVIRONMENTAL_IMPACT_CONFIG.single_use_bottle_weight_grams +
                r.lunchboxCount *
                  ENVIRONMENTAL_IMPACT_CONFIG.single_use_canteen_food_liner_weight_grams) *
                10,
            ) / 10;
          return {
            name: r.name,
            students: r.students,
            points: r.points,
            tumbler: Math.round((r.tumblerUsers.size / Math.max(1, r.students)) * 100),
            lunchbox: Math.round((r.lunchboxUsers.size / Math.max(1, r.students)) * 100),
            tumblerCount: r.tumblerCount,
            lunchboxCount: r.lunchboxCount,
            wasteAvoidedG,
          };
        })
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "id"));

      const totalPoin = approved.reduce((a, i) => a + Number(i.points ?? 0), 0);
      const topClass = rows[0];
      const monthlyUsage = approved.length;
      const prevMonthlyUsage = prevApproved.length;
      const growth =
        prevMonthlyUsage > 0
          ? Math.round(((monthlyUsage - prevMonthlyUsage) / prevMonthlyUsage) * 100)
          : null;

      return {
        rows,
        totalStudents: validStudents.length,
        totalItems: approved.length,
        totalPoin,
        tumblerRate: Math.round((tumblerUsers.size / Math.max(1, validStudents.length)) * 100),
        lunchboxRate: Math.round((lunchboxUsers.size / Math.max(1, validStudents.length)) * 100),
        growth,
        topKelas: topClass && topClass.points > 0 ? topClass.name : "-",
        impact,
      };
    },
    refetchInterval: 30_000,
  });

  const d = report.data;

  function exportCsv() {
    const header =
      "Peringkat,Kelas,Siswa,Poin,Penggunaan Tumbler (%),Penggunaan Kotak Makan (%),Estimasi Sampah Sekali Pakai Dicegah (gram)\n";
    const body = (d?.rows ?? [])
      .map(
        (r, i) =>
          `${i + 1},"${r.name}",${r.students},${r.points},${r.tumbler}%,${r.lunchbox}%,${r.wasteAvoidedG}`,
      )
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([header + body], { type: "text/csv;charset=utf-8;" }));
    a.download = `laporan-lingkungan-smpn99-${selectedMonth}.csv`;
    a.click();
  }

  function handlePrintDirect() {
    setPreviewOpen(false);
    setTimeout(() => {
      const handleAfterPrint = () => {
        window.removeEventListener("afterprint", handleAfterPrint);
        setPreviewOpen(true);
      };
      window.addEventListener("afterprint", handleAfterPrint);
      window.print();
    }, 120);
  }

  return (
    <div id="partisipasi-hari-ini" className="space-y-5 scroll-mt-5">
      <header className="no-print grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
          Laporan Resmi
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold">
            {operationalPeriod ? operationalPeriod.name : "Tidak ada periode berjalan"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!operationalPeriod || report.isLoading}
          >
            <Download className="size-4" /> Ekspor CSV
          </Button>
          <Button
            size="sm"
            onClick={() => setPreviewOpen(true)}
            disabled={!operationalPeriod || report.isLoading}
            className="font-bold gap-1.5 shadow-sm"
          >
            <Printer className="size-4" /> Cetak / PDF
          </Button>
        </div>
      </header>

      {/* DOKUMEN CETAK TUNGGAL (TARGET PRINT RESMI) */}
      <FormalReportDocument d={d} month={selectedMonth} isModal={false} />

      {/* POP UP PRATINJAU DOKUMEN MODAL (HANYA LAYAR, NO-PRINT) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="no-print max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border shadow-2xl sm:rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-card flex flex-row items-center justify-between gap-4 no-print">
            <div className="text-left space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                <DialogTitle className="text-base sm:text-lg font-extrabold">
                  Pratinjau Dokumen Laporan (PDF)
                </DialogTitle>
                <Badge variant="outline" className="hidden sm:inline-flex text-xs font-semibold">
                  Format A4 Siap Cetak
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Periode: <strong>{monthLabel(selectedMonth)}</strong> · SMP Negeri 99 Jakarta
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2 pr-6">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                className="hidden sm:flex gap-1.5 text-xs font-medium"
              >
                <Download className="size-3.5" /> CSV
              </Button>
              <Button
                size="sm"
                onClick={handlePrintDirect}
                className="gap-2 font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Printer className="size-4" /> Cetak / Simpan PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-900/60 no-print">
            <div className="mx-auto flex flex-col items-center no-print">
              <FormalReportDocument d={d} month={selectedMonth} isModal={true} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
