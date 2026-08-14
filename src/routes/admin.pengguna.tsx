import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, QrCode, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QrImage } from "@/components/eco/QrImage";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/pengguna")({
  head: () => ({
    meta: [
      { title: "Data Pengguna — School Ecosystem" },
      {
        name: "description",
        content: "Daftar siswa, kelas, dan petugas pos yang terdaftar dalam ekosistem hijau sekolah.",
      },
      { property: "og:title", content: "Data Pengguna — School Ecosystem" },
      { property: "og:description", content: "Kelola data siswa dan petugas pos sekolah." },
    ],
  }),
  component: PenggunaPage,
});

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function PenggunaPage() {
  // CSV helpers defined at module scope below
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [printClass, setPrintClass] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function downloadQrCode(student: any) {
    try {
      const url = await QRCode.toDataURL(student.nis, { width: 720, margin: 2 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${student.nis}-${student.full_name.replace(/\s+/g, "_")}.png`;
      a.click();
      toast.success("QR Code berhasil diunduh");
    } catch (e) {
      toast.error("Gagal mengunduh QR Code");
    }
  }

  const students = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_scores")
        .select("student_id, full_name, nis, class_name, earned_points, total_items")
        .order("earned_points", { ascending: false });
      return data ?? [];
    },
  });

  const filteredStudents = (students.data ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.full_name ?? "").toLowerCase().includes(q) ||
      (s.nis ?? "").toLowerCase().includes(q) ||
      (s.class_name ?? "").toLowerCase().includes(q)
    );
  });

  const officers = useQuery({
    queryKey: ["admin-officers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("officers")
        .select("id, station, active, profiles(full_name)")
        .order("station");
      return data ?? [];
    },
  });

  const classes = useQuery({
    queryKey: ["admin-classes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .order("name");
      return data ?? [];
    },
  });

  function exportCsv() {
    const rows = students.data ?? [];
    const csv = [
      "nama,nis,kelas,item,poin",
      ...rows.map((s) =>
        [s.full_name, s.nis, s.class_name ?? "", s.total_items ?? 0, s.earned_points ?? 0]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = "data-siswa.csv";
    a.click();
  }

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) throw new Error("File CSV kosong.");
      const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
      const idxName = header.findIndex((h) => h.includes("nama"));
      const idxNis = header.findIndex((h) => h === "nis" || h.includes("nis"));
      const idxClass = header.findIndex((h) => h.includes("kelas"));
      if (idxName < 0 || idxNis < 0) throw new Error("Header wajib: nama, nis, kelas (opsional).");

      const { data: classRows } = await supabase.from("classes").select("id, name");
      const classMap = new Map((classRows ?? []).map((c) => [c.name.toLowerCase(), c.id]));

      const payload: { nis: string; full_name: string; class_id: string | null }[] = [];
      for (const line of lines.slice(1)) {
        const cols = splitCsvLine(line);
        const nis = (cols[idxNis] ?? "").trim();
        const full_name = (cols[idxName] ?? "").trim();
        if (!nis || !full_name) continue;
        const className = idxClass >= 0 ? (cols[idxClass] ?? "").trim() : "";
        let class_id: string | null = null;
        if (className) {
          const key = className.toLowerCase();
          if (!classMap.has(key)) {
            const { data: created, error } = await supabase
              .from("classes")
              .insert({ name: className })
              .select("id")
              .single();
            if (error) throw error;
            classMap.set(key, created.id);
          }
          class_id = classMap.get(key) ?? null;
        }
        payload.push({ nis, full_name, class_id });
      }
      if (payload.length === 0) throw new Error("Tidak ada baris valid.");

      const { error } = await supabase.from("students").upsert(payload, { onConflict: "nis" });
      if (error) throw error;
      toast.success(`${payload.length} siswa berhasil diimpor.`);
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengimpor data.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">Siswa</h1>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> {importing ? "Mengimpor..." : "Impor CSV"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Ekspor CSV
            </Button>
            <select
              value={printClass || ""}
              onChange={(e) => setPrintClass(e.target.value || null)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold"
              aria-label="Cetak Massal QR Kelas"
            >
              <option value="">-- Cetak Massal QR Kelas --</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.name}>
                  Cetak QR Kelas {c.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <p className="mt-2 text-xs text-muted-foreground">
          Format impor: kolom <span className="font-semibold">nama, nis, kelas</span>. Data dengan NIS
          sama akan diperbarui.
        </p>
        <div className="mt-4 flex max-w-sm items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari nama, NIS, atau kelas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="surface-card mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">NIS</th>
                <th className="px-4 py-3 font-semibold">Kelas</th>
                <th className="px-4 py-3 text-right font-semibold">Item</th>
                <th className="px-4 py-3 text-right font-semibold">Poin</th>
                <th className="px-4 py-3 text-center font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStudents.map((s) => (
                <tr key={s.student_id}>
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.nis}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.class_name ?? "-"}</td>
                  <td className="px-4 py-3 text-right">{Number(s.total_items ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">
                    {Number(s.earned_points ?? 0).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full"
                      onClick={() => setSelectedStudent(s)}
                    >
                      <QrCode className="size-3.5" />
                      QR Code
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStudents.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada siswa.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Petugas Pos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(officers.data ?? []).map((o) => (
            <div key={o.id} className="surface-card p-5">
              <p className="font-bold">
                {(o.profiles as { full_name: string | null } | null)?.full_name ?? "Tanpa nama"}
              </p>
              <p className="text-sm text-muted-foreground">Pos {o.station}</p>
              <span className="label-xs mt-3 inline-block text-eco">
                {o.active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          ))}
          {(officers.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Belum ada petugas terdaftar.</p>
          )}
        </div>
      </section>

      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Kartu Identitas QR</DialogTitle>
            <DialogDescription className="text-center">
              Pindai kode QR di bawah untuk validasi botol tumbler dan lunchbox.
            </DialogDescription>
          </DialogHeader>
          {selectedStudent && (
            <div className="flex flex-col items-center space-y-6 py-4">
              <div className="gradient-hero w-full rounded-2xl p-6 text-primary-foreground shadow-lift">
                <span className="label-xs text-primary-foreground/75">KARTU IDENTITAS ECO</span>
                <h3 className="mt-1 text-xl font-extrabold">{selectedStudent.full_name}</h3>
                <p className="text-sm opacity-90">
                  Kelas {selectedStudent.class_name || "-"} · NIS {selectedStudent.nis}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-primary-foreground/20 pt-4">
                  <span className="text-xs opacity-75">Eco Score</span>
                  <span className="text-base font-bold">{selectedStudent.earned_points} poin</span>
                </div>
              </div>

              <div className="rounded-2xl bg-card p-4 shadow-md">
                <QrImage value={selectedStudent.nis} size={200} />
              </div>

              <Button
                className="w-full gap-2 rounded-full"
                onClick={() => downloadQrCode(selectedStudent)}
              >
                <Download className="size-4" /> Unduh QR Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {printClass && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-8">
          <div className="no-print mb-8 flex justify-between items-center border-b pb-4">
            <div>
              <h2 className="text-xl font-extrabold">Cetak Massal QR Kelas {printClass}</h2>
              <p className="text-xs text-muted-foreground">
                Gunakan menu print browser (Ctrl + P) untuk mencetak semua kartu di bawah ini.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="size-4" /> Cetak Sekarang
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPrintClass(null)}>
                Kembali
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 justify-items-center">
            {(students.data ?? [])
              .filter((s) => s.class_name === printClass)
              .map((s) => (
                <div
                  key={s.student_id}
                  className="flex flex-col items-center border border-border rounded-3xl p-6 bg-card shadow-sm w-full max-w-sm"
                  style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
                >
                  <div className="gradient-hero w-full rounded-2xl p-5 text-primary-foreground shadow-sm">
                    <span className="label-xs text-primary-foreground/75">KARTU IDENTITAS ECO</span>
                    <h3 className="mt-1 text-lg font-extrabold">{s.full_name}</h3>
                    <p className="text-xs opacity-90">
                      Kelas {s.class_name || "-"} · NIS {s.nis}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 border-t border-primary-foreground/20 pt-2 text-[11px] opacity-80">
                      <p>Username: {s.nis}</p>
                      <p>Kata Sandi: S!swa@Smpn99jkt</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-white p-3 shadow-md">
                    <QrImage value={s.nis} size={160} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}