import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, QrCode, Printer } from "lucide-react";
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
        .order("earned_points", { ascending: false })
        .limit(200);
      return data ?? [];
    },
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
          </div>
        </header>
        <p className="mt-2 text-xs text-muted-foreground">
          Format impor: kolom <span className="font-semibold">nama, nis, kelas</span>. Data dengan NIS
          sama akan diperbarui.
        </p>
        <div className="surface-card mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">NIS</th>
                <th className="px-4 py-3 font-semibold">Kelas</th>
                <th className="px-4 py-3 text-right font-semibold">Item</th>
                <th className="px-4 py-3 text-right font-semibold">Poin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(students.data ?? []).map((s) => (
                <tr key={s.student_id}>
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.nis}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.class_name ?? "-"}</td>
                  <td className="px-4 py-3 text-right">{Number(s.total_items ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">
                    {Number(s.earned_points ?? 0).toLocaleString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(students.data ?? []).length === 0 && (
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
    </div>
  );
}