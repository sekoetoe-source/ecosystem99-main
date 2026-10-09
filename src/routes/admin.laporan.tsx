import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText, Printer, X } from "lucide-react";
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

export const Route = createFileRoute("/admin/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Bulanan Program Lingkungan — SMPN 99 Jakarta" },
      {
        name: "description",
        content:
          "Laporan formal bulanan program lingkungan: penggunaan tumbler, kotak makan, tren partisipasi, dan peringkat jawara lingkungan.",
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
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(y!, (m ?? 1) - 1, 1),
  );
}

function monthsInPeriods(periods: { start_date: string; end_date: string }[]) {
  const months = new Set<string>([monthKey(new Date())]);
  for (const period of periods) {
    const cursor = new Date(`${period.start_date}T00:00:00Z`);
    const last = new Date(`${period.end_date}T00:00:00Z`);
    cursor.setUTCDate(1);
    last.setUTCDate(1);
    while (cursor <= last) {
      months.add(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = `${key}-01`;
  const next = new Date(Date.UTC(y!, m!, 1));
  const end = next.toISOString().slice(0, 10);
  return { start, end };
}

type KelasRow = {
  name: string;
  students: number;
  points: number;
  tumbler: number;
  lunchbox: number;
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
};

function FormalReportDocument({
  d,
  month,
  isModal = false,
}: {
  d: ReportData | undefined;
  month: string | undefined;
  isModal?: boolean;
}) {
  return (
    <article
      className={`print-report-sheet ${
        isModal
          ? "bg-white text-slate-900 shadow-2xl rounded-sm p-6 sm:p-10 max-w-3xl mx-auto border border-slate-200"
          : "surface-card px-4 py-6 sm:px-10 sm:py-10"
      }`}
    >
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr>
            <td className="w-full">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-b-2 border-foreground pb-5 mb-6">
                <img
                  src={logoAsset.url}
                  alt="Logo SMP Negeri 99 Jakarta"
                  className="size-16 shrink-0 object-contain sm:size-20"
                />
                <div className="min-w-0 text-center">
                  <h2 className="text-lg font-extrabold tracking-tight sm:text-3xl text-foreground">
                    {SCHOOL.name}
                  </h2>
                  <p className="text-xs text-muted-foreground sm:text-sm">{SCHOOL.address}</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">{SCHOOL.contact}</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">{SCHOOL.emailWebsite}</p>
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="w-full">
              <div className="text-center">
                <h3 className="text-base font-extrabold uppercase tracking-tight sm:text-xl text-foreground">
                  LAPORAN BULANAN PROGRAM LINGKUNGAN
                </h3>
                <p className="mt-1 text-sm font-bold text-primary">
                  Periode: {month ? monthLabel(month) : "-"}
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    v: `${d?.tumblerRate ?? 0}%`,
                    t: "Total Penggunaan Tumbler",
                  },
                  {
                    v: `${d?.lunchboxRate ?? 0}%`,
                    t: "Total Penggunaan Kotak Makan",
                  },
                  { v: d?.topKelas ?? "-", t: "Performa Kelas Terbaik" },
                ].map((c) => (
                  <div
                    key={c.t}
                    className="rounded-2xl border border-border bg-surface-low p-5 text-center"
                  >
                    <p className="truncate text-2xl font-extrabold sm:text-4xl text-foreground">
                      {c.v}
                    </p>
                    <p className="mt-2 text-sm font-bold text-foreground">{c.t}</p>
                  </div>
                ))}
              </div>

              <h4 className="mt-8 text-base font-extrabold sm:text-lg text-foreground">
                Tren Partisipasi
              </h4>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-border p-5">
                  <p className="text-sm font-semibold text-foreground">Ringkasan Bulan Ini</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    {[
                      ["Siswa aktif terdaftar", (d?.totalStudents ?? 0).toLocaleString("id-ID")],
                      [
                        "Aktivitas lingkungan tervalidasi",
                        (d?.totalItems ?? 0).toLocaleString("id-ID"),
                      ],
                      ["Total Poin Lingkungan", (d?.totalPoin ?? 0).toLocaleString("id-ID")],
                      [
                        "Perkiraan Pengurangan Emisi Karbon Dioksida",
                        `${Math.round(((d?.totalItems ?? 0) * 70) / 1000)} kg`,
                      ],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-3 border-b border-border pb-2"
                      >
                        <dt className="min-w-0 truncate text-muted-foreground">{k}</dt>
                        <dd className="shrink-0 font-bold text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="grid place-items-center rounded-2xl border border-border bg-surface-low p-8 text-center">
                  <div>
                    <p className="text-3xl font-extrabold text-eco sm:text-4xl">
                      {d?.growth === null || d?.growth === undefined
                        ? "—"
                        : `${d.growth > 0 ? "+" : ""}${d.growth}%`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Perkembangan dari Bulan Lalu
                    </p>
                  </div>
                </div>
              </div>

              <h4 className="mt-8 text-base font-extrabold sm:text-lg text-foreground">
                Peringkat Jawara Lingkungan
              </h4>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-y border-border bg-surface-low text-left">
                      <th className="label-xs px-3 py-3">Peringkat</th>
                      <th className="label-xs px-3 py-3">Kelas</th>
                      <th className="label-xs px-3 py-3 text-right">Poin</th>
                      <th className="label-xs px-3 py-3 text-right">
                        Persentase Penggunaan Tumbler
                      </th>
                      <th className="label-xs px-3 py-3 text-right">
                        Persentase Penggunaan Kotak Makan
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(d?.rows ?? []).map((r, i) => (
                      <tr key={r.name}>
                        <td className={`px-3 py-3 font-bold ${i < 3 ? "text-primary" : ""}`}>
                          {i + 1}
                        </td>
                        <td className="px-3 py-3 font-semibold text-foreground">{r.name}</td>
                        <td className="px-3 py-3 text-right font-mono text-foreground">
                          {r.points.toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-foreground">
                          {r.tumbler}%
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-foreground">
                          {r.lunchbox}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(d?.rows ?? []).length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada data pada periode ini.
                  </p>
                )}
              </div>

              <div className="mt-12 grid gap-10 text-center text-sm sm:grid-cols-2 text-foreground">
                <div>
                  <p>Mengetahui,</p>
                  <p>Kepala Sekolah</p>
                  <div className="mx-auto mt-16 w-56 border-t border-foreground pt-2">
                    <p className="font-bold">{SCHOOL.principal}</p>
                    <p className="text-xs text-primary">{SCHOOL.principalNip}</p>
                  </div>
                </div>
                <div>
                  <p>Jakarta, {month ? monthLabel(month) : "-"}</p>
                  <p>Koordinator Program</p>
                  <div className="mx-auto mt-16 w-56 border-t border-foreground pt-2">
                    <p className="font-bold">{SCHOOL.coordinator}</p>
                    <p className="text-xs text-primary">{SCHOOL.coordinatorNip}</p>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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
  });
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const availableMonths = monthsInPeriods(periods.data ?? []);
  const report = useQuery({
    queryKey: ["formal-report", selectedMonth],
    queryFn: async () => {
      const currentRange = monthRange(selectedMonth);
      const [year, month] = selectedMonth.split("-").map(Number);
      const previousMonthDate = new Date(Date.UTC(year!, month! - 2, 1));
      const previousRange = monthRange(monthKey(previousMonthDate));
      const [{ data: students }, { data: items }, prevItems] = await Promise.all([
        supabase.from("students").select("id, class_id, classes(name)").eq("active", true),
        supabase
          .from("validation_items")
          .select("item_code, points, student_id, day, validations!inner(status, period_id)")
          .gte("day", currentRange.start)
          .lt("day", currentRange.end),
        supabase
          .from("validation_items")
          .select("item_code, validations!inner(status, period_id)")
          .gte("day", previousRange.start)
          .lt("day", previousRange.end),
      ]);
      const validStudents = (students ?? []).filter((s) => {
        const className = (s.classes as { name: string } | null)?.name?.trim();
        return Boolean(
          s.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas",
        );
      });
      const approved = (items ?? []).filter(
        (i) => (i.validations as { status: string } | null)?.status === "approved",
      );
      const prevApproved = (prevItems.data ?? []).filter(
        (i) => (i.validations as { status: string } | null)?.status === "approved",
      );
      const classOf = new Map(
        validStudents.map((s) => [s.id, (s.classes as { name: string }).name.trim()]),
      );
      const classes = new Map<string, KelasRow>();
      const tumblerUsers = new Set<string>();
      const lunchboxUsers = new Set<string>();
      const classTumbler = new Map<string, Set<string>>();
      const classLunchbox = new Map<string, Set<string>>();
      for (const s of validStudents) {
        const name = classOf.get(s.id)!;
        classes.set(
          name,
          classes.get(name) ?? { name, students: 0, points: 0, tumbler: 0, lunchbox: 0 },
        );
        classes.get(name)!.students += 1;
      }
      for (const i of approved.filter((item) => classOf.has(item.student_id))) {
        const name = classOf.get(i.student_id)!;
        const row = classes.get(name)!;
        row.points += Number(i.points ?? 0);
        if (i.item_code === "tumbler" || i.item_code === "break_combo") {
          if (!classTumbler.has(name)) classTumbler.set(name, new Set());
          classTumbler.get(name)!.add(i.student_id);
          tumblerUsers.add(i.student_id);
        }
        if (i.item_code === "lunchbox" || i.item_code === "break_combo") {
          if (!classLunchbox.has(name)) classLunchbox.set(name, new Set());
          classLunchbox.get(name)!.add(i.student_id);
          lunchboxUsers.add(i.student_id);
        }
      }
      const rows = [...classes.values()]
        .map((r) => ({
          ...r,
          tumbler: Math.round(
            ((classTumbler.get(r.name)?.size ?? 0) / Math.max(1, r.students)) * 100,
          ),
          lunchbox: Math.round(
            ((classLunchbox.get(r.name)?.size ?? 0) / Math.max(1, r.students)) * 100,
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "id"));
      const totalPoin = approved.reduce((a, i) => a + Number(i.points ?? 0), 0);
      const usageCount = (values: typeof approved) =>
        values.reduce(
          (total, item) =>
            total +
            (item.item_code === "break_combo"
              ? 2
              : item.item_code === "tumbler" || item.item_code === "lunchbox"
                ? 1
                : 0),
          0,
        );
      const monthlyUsage = usageCount(approved);
      const previousMonthlyUsage = usageCount(prevApproved);
      const topClass = [...rows].sort(
        (a, b) => b.points - a.points || a.name.localeCompare(b.name, "id"),
      )[0];
      return {
        rows,
        totalStudents: validStudents.length,
        totalItems: approved.length,
        totalPoin,
        tumblerRate: Math.round((tumblerUsers.size / Math.max(1, validStudents.length)) * 100),
        lunchboxRate: Math.round((lunchboxUsers.size / Math.max(1, validStudents.length)) * 100),
        growth:
          previousMonthlyUsage > 0
            ? Math.round(((monthlyUsage - previousMonthlyUsage) / previousMonthlyUsage) * 100)
            : null,
        topKelas: topClass && topClass.points > 0 ? topClass.name : "-",
      };
    },
  });
  const d = report.data;
  function exportCsv() {
    const header =
      "Peringkat,Kelas,Siswa,Poin,Persentase Penggunaan Tumbler,Persentase Penggunaan Kotak Makan\n";
    const body = (d?.rows ?? [])
      .map((r, i) => `${i + 1},${r.name},${r.students},${r.points},${r.tumbler}%,${r.lunchbox}%`)
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([header + body], { type: "text/csv;charset=utf-8;" }));
    a.download = `laporan-lingkungan-${selectedMonth}.csv`;
    a.click();
  }
  function handlePrintDirect() {
    window.print();
  }

  return (
    <div className="space-y-5">
      <header className="no-print grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
          Laporan Resmi
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold"
            aria-label="Pilih bulan laporan"
          >
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" /> Ekspor CSV
          </Button>
          <Button
            size="sm"
            onClick={() => setPreviewOpen(true)}
            className="font-bold gap-1.5 shadow-sm"
          >
            <Printer className="size-4" /> Cetak / PDF
          </Button>
        </div>
      </header>

      {/* DOCUMENT ON MAIN PAGE */}
      <FormalReportDocument d={d} month={selectedMonth} isModal={false} />

      {/* POP UP PREVIEW PDF MODAL */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border shadow-2xl sm:rounded-2xl">
          {/* MODAL HEADER WITH CONTROLS */}
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

          {/* SCROLLABLE PDF SIMULATION VIEWER */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-900/60">
            <div className="mx-auto flex flex-col items-center">
              <FormalReportDocument d={d} month={selectedMonth} isModal={true} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
