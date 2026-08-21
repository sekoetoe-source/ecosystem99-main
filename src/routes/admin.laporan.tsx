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
  emailWebsite: "Email: smpn99dki@yahoo.co.id | Website: https://smpn99jkt.sch.id",
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

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = `${key}-01`;
  const next = new Date(Date.UTC(y!, m!, 1));
  const end = next.toISOString().slice(0, 10);
  return { start, end };
}

type ClassRow = {
  name: string;
  students: number;
  points: number;
  tumbler: number;
  lunchbox: number;
};

type ReportData = {
  rows: ClassRow[];
  totalStudents: number;
  totalItems: number;
  totalPoints: number;
  tumblerRate: number;
  lunchboxRate: number;
  growth: number | null;
  topClass: string;
};

function FormalReportDocument({
  d,
  month,
  isModal = false,
}: {
  d: ReportData | undefined;
  month: string;
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
                  Laporan Bulanan Program Lingkungan
                </h3>
                <p className="text-sm text-muted-foreground">
                  Monthly Environmental Program Report
                </p>
                <p className="mt-1 text-sm font-bold text-primary">
                  Periode / Period: {monthLabel(month)}
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    v: `${d?.tumblerRate ?? 0}%`,
                    t: "Total Tumbler Usage",
                    s: "Penggunaan Tumbler",
                  },
                  {
                    v: `${d?.lunchboxRate ?? 0}%`,
                    t: "Total Lunchbox Usage",
                    s: "Penggunaan Kotak Makan",
                  },
                  { v: d?.topClass ?? "-", t: "Top Performing Class", s: "Kelas Terbaik" },
                ].map((c) => (
                  <div
                    key={c.t}
                    className="rounded-2xl border border-border bg-surface-low p-5 text-center"
                  >
                    <p className="truncate text-2xl font-extrabold sm:text-4xl text-foreground">
                      {c.v}
                    </p>
                    <p className="mt-2 text-sm font-bold text-foreground">{c.t}</p>
                    <p className="text-xs text-muted-foreground">{c.s}</p>
                  </div>
                ))}
              </div>

              <h4 className="mt-8 text-base font-extrabold sm:text-lg text-foreground">
                Tren Partisipasi / Participation Trends
              </h4>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-border p-5">
                  <p className="text-sm font-semibold text-foreground">Ringkasan Bulan Ini</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    {[
                      ["Siswa aktif terdaftar", (d?.totalStudents ?? 0).toLocaleString("id-ID")],
                      ["Item eco tervalidasi", (d?.totalItems ?? 0).toLocaleString("id-ID")],
                      ["Total Eco-Points", (d?.totalPoints ?? 0).toLocaleString("id-ID")],
                      [
                        "Estimasi CO2 dihemat",
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
                    <p className="mt-1 text-sm text-muted-foreground">Growth from last month</p>
                  </div>
                </div>
              </div>

              <h4 className="mt-8 text-base font-extrabold sm:text-lg text-foreground">
                Peringkat Jawara Lingkungan / Environmental Champion Rankings
              </h4>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-y border-border bg-surface-low text-left">
                      <th className="label-xs px-3 py-3">Rank</th>
                      <th className="label-xs px-3 py-3">Class</th>
                      <th className="label-xs px-3 py-3 text-right">Points</th>
                      <th className="label-xs px-3 py-3 text-right">Tumbler Rate</th>
                      <th className="label-xs px-3 py-3 text-right">Lunchbox Rate</th>
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
                  <p>Mengetahui / Acknowledged by,</p>
                  <p>Kepala Sekolah / Principal</p>
                  <div className="mx-auto mt-16 w-56 border-t border-foreground pt-2">
                    <p className="font-bold">{SCHOOL.principal}</p>
                    <p className="text-xs text-primary">{SCHOOL.principalNip}</p>
                  </div>
                </div>
                <div>
                  <p>Jakarta, {monthLabel(month)}</p>
                  <p>Koordinator Program / Program Coordinator</p>
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
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) =>
      monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)),
    );
  }, []);
  const [month, setMonth] = useState(months[0]!);
  const [previewOpen, setPreviewOpen] = useState(false);

  const report = useQuery({
    queryKey: ["formal-report", month],
    queryFn: async () => {
      const { start, end } = monthRange(month);
      const prevIdx = months.indexOf(month) + 1;
      const prev = months[prevIdx];

      const [{ data: students }, { data: items }, prevItems] = await Promise.all([
        supabase.from("students").select("id, class_id, classes(name)").eq("active", true),
        supabase
          .from("validation_items")
          .select("item_code, points, student_id, day, validations!inner(status)")
          .gte("day", start)
          .lt("day", end),
        prev
          ? supabase
              .from("validation_items")
              .select("points, validations!inner(status)")
              .gte("day", monthRange(prev).start)
              .lt("day", monthRange(prev).end)
          : Promise.resolve({
              data: [] as { points: number; validations: { status: string } | null }[],
            }),
      ]);

      // Filter to only include active students who have a valid class assigned
      const validStudents = (students ?? []).filter((s) => {
        const className = (s.classes as { name: string } | null)?.name?.trim();
        return Boolean(
          s.class_id && className && className !== "-" && className.toLowerCase() !== "tanpa kelas",
        );
      });

      const approved = (items ?? []).filter(
        (i) => (i.validations as { status: string } | null)?.status === "approved",
      );
      const prevApproved = ((prevItems.data ?? []) as {
        points: number;
        validations: unknown;
      }[]).filter((i) => (i.validations as { status: string } | null)?.status === "approved");

      const classOf = new Map<string, string>();
      for (const s of validStudents) {
        const className = (s.classes as { name: string } | null)!.name.trim();
        classOf.set(s.id, className);
      }

      const classes = new Map<string, ClassRow>();
      for (const s of validStudents) {
        const name = classOf.get(s.id)!;
        const row = classes.get(name) ?? { name, students: 0, points: 0, tumbler: 0, lunchbox: 0 };
        row.students += 1;
        classes.set(name, row);
      }

      const tumblerUsers = new Set<string>();
      const lunchboxUsers = new Set<string>();
      const classTumbler = new Map<string, Set<string>>();
      const classLunchbox = new Map<string, Set<string>>();

      const approvedValid = approved.filter((i) => classOf.has(i.student_id));

      for (const i of approvedValid) {
        const name = classOf.get(i.student_id)!;
        const row = classes.get(name) ?? { name, students: 0, points: 0, tumbler: 0, lunchbox: 0 };
        row.points += Number(i.points ?? 0);
        classes.set(name, row);
        const bucket = i.item_code === "tumbler" ? classTumbler : classLunchbox;
        if (!bucket.has(name)) bucket.set(name, new Set());
        bucket.get(name)!.add(i.student_id);
        (i.item_code === "tumbler" ? tumblerUsers : lunchboxUsers).add(i.student_id);
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
        .sort((a, b) => b.points - a.points);

      const totalStudents = validStudents.length;
      const totalPoints = approvedValid.reduce((a, i) => a + Number(i.points ?? 0), 0);
      const prevPoints = prevApproved.reduce((a, i) => a + Number(i.points ?? 0), 0);

      return {
        rows,
        totalStudents,
        totalItems: approvedValid.length,
        totalPoints,
        tumblerRate: Math.round((tumblerUsers.size / Math.max(1, totalStudents)) * 100),
        lunchboxRate: Math.round((lunchboxUsers.size / Math.max(1, totalStudents)) * 100),
        growth: prevPoints > 0 ? Math.round(((totalPoints - prevPoints) / prevPoints) * 100) : null,
        topClass: rows[0]?.name ?? "-",
      };
    },
  });

  const d = report.data;

  function exportCsv() {
    const header = "Peringkat,Kelas,Siswa,Poin,Tumbler Rate,Lunchbox Rate\n";
    const body = (d?.rows ?? [])
      .map((r, i) => `${i + 1},${r.name},${r.students},${r.points},${r.tumbler}%,${r.lunchbox}%`)
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([header + body], { type: "text/csv;charset=utf-8;" }));
    a.download = `laporan-lingkungan-${month}.csv`;
    a.click();
  }

  function handlePrintDirect() {
    window.print();
  }

  return (
    <div className="space-y-5">
      <header className="no-print grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
          Laporan Formal
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold"
            aria-label="Pilih periode laporan"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
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
      <FormalReportDocument d={d} month={month} isModal={false} />

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
                Periode: <strong>{monthLabel(month)}</strong> · SMP Negeri 99 Jakarta
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
              <FormalReportDocument d={d} month={month} isModal={true} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
