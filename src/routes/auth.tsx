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
  const { me, isLoading } = useMe();

  // Pendaftaran Google states
  const [requestedRole, setRequestedRole] = useState("student");
  const [requestedClassId, setRequestedClassId] = useState("");
  const [requestedNis, setRequestedNis] = useState("");

  const { data: classes } = useQuery({
    queryKey: ["auth-classes"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (me && me.isApproved) {
      navigate({ to: homeForRole[me.primaryRole], replace: true });
    }
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

  async function handleGoogleLogin() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan Google Login");
      setBusy(false);
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          requested_role: requestedRole,
          requested_class_id: requestedRole === "student" && requestedClassId ? requestedClassId : null,
          requested_nis: requestedRole === "student" ? requestedNis : null,
        })
        .eq("id", me.userId);
      if (error) throw error;
      toast.success("Profil tersimpan. Silakan tunggu persetujuan Admin.");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan profil");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  // JIKA SUDAH LOGIN TAPI BELUM DI-APPROVE ADMIN
  if (me && !me.isApproved) {
    const hasRequested = !!me.requestedRole;

    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md surface-card p-8 space-y-6">
          <div className="flex items-center gap-3 text-lg font-extrabold text-primary">
            <Leaf className="size-6 animate-pulse" /> School Ecosystem
          </div>

          {!hasRequested ? (
            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold">Lengkapi Data Diri Anda</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Akun Google Anda terdeteksi baru. Tentukan peran Anda sebelum masuk.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="req-role">Saya adalah seorang:</Label>
                <select
                  id="req-role"
                  value={requestedRole}
                  onChange={(e) => setRequestedRole(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="student">Siswa</option>
                  <option value="officer">Petugas Pos</option>
                  <option value="teacher">Wali Kelas</option>
                </select>
              </div>

              {requestedRole === "student" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="req-nis">NIS (Nomor Induk Siswa)</Label>
                    <Input
                      id="req-nis"
                      required
                      placeholder="Contoh: 21455"
                      value={requestedNis}
                      onChange={(e) => setRequestedNis(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="req-class">Pilih Kelas</Label>
                    <select
                      id="req-class"
                      required
                      value={requestedClassId}
                      onChange={(e) => setRequestedClassId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {(classes ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          Kelas {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                Kirim Permintaan Akses
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <h2 className="text-xl font-bold">Menunggu Persetujuan Admin ⏳</h2>
              <p className="text-sm text-muted-foreground">
                Data diri Anda ({me.fullName}) sebagai <b>{me.requestedRole === "student" ? "Siswa" : me.requestedRole === "officer" ? "Petugas" : "Wali Kelas"}</b> sedang diperiksa oleh Admin sekolah.
              </p>
              <p className="text-xs text-eco bg-green-50 p-3 rounded-xl">
                Silakan hubungi admin sekolah untuk mempercepat proses persetujuan.
              </p>
              <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut().then(() => window.location.reload())}>
                Keluar & Masuk Akun Lain
              </Button>
            </div>
          )}
        </div>
      </div>
    );
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

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">atau masuk dengan</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={busy}
          >
            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            Google
          </Button>

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