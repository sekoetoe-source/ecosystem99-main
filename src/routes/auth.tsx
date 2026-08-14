import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Leaf, Loader2, ScanLine, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/eco/Brand";
import { homeForRole, useMe } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — School Ecosystem SMPN 99 Jakarta" },
      {
        name: "description",
        content: "Masuk atau daftar akun School Ecosystem untuk siswa, petugas, dan admin sekolah.",
      },
      { property: "og:title", content: "Masuk — School Ecosystem SMPN 99 Jakarta" },
      {
        property: "og:description",
        content: "Portal autentikasi School Ecosystem SMP Negeri 99 Jakarta.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [nis, setNis] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { me } = useMe();

  useEffect(() => {
    if (me) navigate({ to: homeForRole[me.primaryRole], replace: true });
  }, [me, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let finalEmail = email.trim();
      if (!finalEmail.includes("@")) {
        finalEmail = `${finalEmail}@smpn99.sch.id`;
      }

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
        if (error) throw error;
        toast.success("Berhasil masuk");
      } else {
        const { error } = await supabase.auth.signUp({
          email: finalEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, nis },
          },
        });
        if (error) throw error;
        toast.success("Akun dibuat. Silakan masuk.");
        setMode("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="gradient-hero relative hidden flex-col justify-between p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3 text-lg font-extrabold">
          <Leaf className="size-6" /> School Ecosystem
        </div>
        <div>
          <h2 className="max-w-sm text-4xl font-extrabold leading-tight tracking-tight">
            Sekolah bebas sampah dimulai dari satu tumbler.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-primary-foreground/85">
            Bawa tumbler & kotak makan, scan QR di pos petugas, kumpulkan Eco-Points, dan jadi
            Jawara Lingkungan SMP Negeri 99 Jakarta.
          </p>
          <div className="mt-8 flex gap-6 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <ScanLine className="size-4" /> Scan harian
            </span>
            <span className="flex items-center gap-2">
              <Trophy className="size-4" /> Leaderboard kelas
            </span>
          </div>
        </div>
        <p className="label-xs text-primary-foreground/70">Eco-Points · Eco Challenge · Reward</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Brand />
          </div>
          <h1 className="mt-8 text-2xl font-extrabold tracking-tight">
            {mode === "login" ? "Masuk ke akun Anda" : "Daftar akun baru"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Peran akun (siswa, petugas, admin) ditentukan otomatis oleh sekolah.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nama lengkap</Label>
                  <Input
                    id="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama sesuai absen"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nis">NIS (opsional)</Label>
                  <Input
                    id="nis"
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    placeholder="Contoh: 2023058491"
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">{mode === "login" ? "NIS / Email" : "Email"}</Label>
              <Input
                id="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "login" ? "NIS atau email sekolah" : "nama@smpn99.sch.id"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Kata sandi</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "login" ? "Masuk" : "Daftar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Daftar" : "Masuk"}
            </button>
          </p>
          <p className="mt-2 text-center text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Kembali ke beranda
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}