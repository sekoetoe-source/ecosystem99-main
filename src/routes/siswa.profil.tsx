import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QrImage } from "@/components/eco/QrImage";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/siswa/profil")({
  head: () => ({
    meta: [
      { title: "Kartu Identitas QR — School Ecosystem" },
      {
        name: "description",
        content: "Kartu identitas digital siswa dengan QR Code untuk validasi scan di pos petugas.",
      },
      { property: "og:title", content: "Kartu Identitas QR — School Ecosystem" },
      { property: "og:description", content: "QR Code identitas siswa School Ecosystem." },
    ],
  }),
  component: ProfilPage,
});

function ProfilPage() {
  const { me } = useMe();
  const student = me?.student;

  const score = useQuery({
    queryKey: ["profil-score", student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_scores")
        .select("earned_points, class_name")
        .eq("student_id", student!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!student) {
    return (
      <div className="surface-card p-8 text-center text-sm text-muted-foreground">
        Akun belum tertaut ke data siswa.
      </div>
    );
  }

  async function download() {
    const url = await QRCode.toDataURL(student!.nis, { width: 720, margin: 2 });
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${student!.nis}.png`;
    a.click();
    toast.success("QR Code tersimpan");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="gradient-hero surface-card border-transparent p-6 text-primary-foreground">
        <p className="label-xs text-primary-foreground/80">Kartu Identitas Eco</p>
        <h1 className="mt-2 text-2xl font-extrabold">{student.full_name}</h1>
        <p className="text-sm text-primary-foreground/85">
          {score.data?.class_name ?? "Belum ada kelas"} · NIS {student.nis}
        </p>
        <p className="mt-4 text-3xl font-extrabold">
          {(score.data?.earned_points ?? 0).toLocaleString("id-ID")}{" "}
          <span className="text-base font-semibold">poin</span>
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <QrImage value={student.nis} />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-eco" /> Tunjukkan QR ini ke petugas pos
        </p>
        <Button variant="outline" onClick={download}>
          <Download className="size-4" /> Simpan QR
        </Button>
      </div>
    </div>
  );
}