import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Leaf, Loader2, ScanLine, ShieldCheck, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/eco/Brand";
import { homeForRole, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — ecosystem99 (ecosystem99.web.id)" },
      {
        name: "description",
        content: "Masuk atau daftar akun ecosystem99 (ecosystem99.web.id) untuk siswa, petugas, dan admin SMP Negeri 99 Jakarta.",
      },
      { property: "og:title", content: "Masuk — ecosystem99" },
      {
        property: "og:description",
        content: "Portal autentikasi ecosystem99 SMP Negeri 99 Jakarta (ecosystem99.web.id).",
      },
    ],
    links: [
      { rel: "canonical", href: "https://ecosystem99.web.id/auth" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginRole, setLoginRole] = useState<"student" | "staff">("student");

  // State untuk login siswa (NIS)
  const [studentNis, setStudentNis] = useState("");
  const [studentPassword, setStudentPassword] = useState("");

  // State untuk login guru/staf & pendaftaran
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
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
      const err = params.get("error_description") || hashParams.get("error_description") || params.get("error");
      if (err) {
        toast.error(`Google Login Notice: ${err}`);
      }
    }
    if (me && me.isApproved) {
      navigate({ to: homeForRole[me.primaryRole], replace: true });
    }
  }, [me, navigate]);

  // Handler Login Khusus Siswa menggunakan NIS & Password
  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    const cleanNis = studentNis.trim();
    if (!cleanNis) {
      toast.error("Silakan masukkan NIS Anda");
      return;
    }
    if (cleanNis.includes("@")) {
      toast.error("Gunakan NIS (angka) untuk masuk sebagai siswa");
      return;
    }
    if (!studentPassword) {
      toast.error("Silakan masukkan kata sandi");
      return;
    }

    setBusy(true);
    try {
      // 1. Resolve NIS ke identitas autentikasi Supabase tanpa membocorkan email internal ke siswa
      const authEmail = `${cleanNis}@smpn99.sch.id`;

      // 2. Autentikasi melalui Supabase Auth canonical
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: studentPassword,
      });

      if (authError || !authData.user) {
        // Pesan login gagal yang aman, tidak membocorkan keberadaan NIS secara berlebihan
        throw new Error("NIS atau kata sandi tidak sesuai. Periksa kembali NIS dan kata sandi Anda.");
      }

      const userId = authData.user.id;

      // 3. Post-authentication validations:
      // a. Validasi status persetujuan akun (approval lifecycle)
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, is_approved")
        .eq("id", userId)
        .maybeSingle();

      if (profileErr || !profile || !profile.is_approved) {
        await supabase.auth.signOut();
        throw new Error("Akun siswa belum disetujui oleh admin sekolah. Silakan hubungi admin sekolah.");
      }

      // b. Validasi kepemilikan role student
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const roles = (roleRows ?? []).map((r) => r.role);
      if (roleErr || !roles.includes("student")) {
        await supabase.auth.signOut();
        throw new Error("Akun ini tidak memiliki hak akses sebagai siswa.");
      }

      // c. Validasi keberadaan student record yang valid
      let { data: studentRecord } = await supabase
        .from("students")
        .select("id, nis, full_name, class_id, profile_id")
        .eq("profile_id", userId)
        .maybeSingle();

      // Jika belum terhubung secara langsung via profile_id, cek record student dengan NIS yang sama
      if (!studentRecord) {
        const { data: matchingNisStudent } = await supabase
          .from("students")
          .select("id, nis, full_name, class_id, profile_id")
          .eq("nis", cleanNis)
          .maybeSingle();

        if (matchingNisStudent && !matchingNisStudent.profile_id) {
          // Hubungkan record student milik siswa sesuai RLS policy students_claim_own
          await supabase
            .from("students")
            .update({ profile_id: userId })
            .eq("id", matchingNisStudent.id);

          studentRecord = matchingNisStudent;
        }
      }

      if (!studentRecord) {
        // Jangan membuat student record baru secara otomatis
        await supabase.auth.signOut();
        throw new Error("Data siswa tidak ditemukan dalam sistem sekolah. Silakan hubungi admin sekolah.");
      }

      // d. Sukses: Invalidate cache 'me' dan arahkan langsung ke Dashboard Siswa
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Selamat datang, ${studentRecord.full_name}!`);
      navigate({ to: "/siswa", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setBusy(false);
    }
  }

  // Handler Login untuk Guru, Petugas, dan Admin (Email / Password)
  async function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let finalEmail = email.trim();
      if (!finalEmail.includes("@")) {
        finalEmail = `${finalEmail}@smpn99.sch.id`;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password,
      });

      if (authError || !authData?.user) {
        throw new Error(authError?.message || "Email atau kata sandi tidak sesuai.");
      }

      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Berhasil masuk");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan saat masuk");
    } finally {
      setBusy(false);
    }
  }

  // Handler Pendaftaran Akun Baru
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let finalEmail = email.trim();
      if (!finalEmail.includes("@")) {
        finalEmail = `${finalEmail}@smpn99.sch.id`;
      }

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mendaftar");
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
        .upsert({
          id: me.userId,
          full_name: me.fullName,
          requested_role: requestedRole,
          requested_class_id: requestedRole === "student" && requestedClassId ? requestedClassId : null,
          requested_nis: requestedRole === "student" ? requestedNis : null,
          is_approved: false,
        }, { onConflict: "id" });
      if (error) throw error;
      toast.success("Permintaan profil tersimpan. Silakan tunggu persetujuan Admin.");
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
                  Akun Google Anda ({me.email}) terdeteksi baru. Pilih peran Anda untuk diproses oleh Admin.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Saya adalah seorang:</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestedRole("officer")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                      requestedRole === "officer"
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span className="text-xl mb-1">👮</span>
                    Petugas Pos
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestedRole("student")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                      requestedRole === "student"
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span className="text-xl mb-1">🎒</span>
                    Siswa
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestedRole("teacher")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                      requestedRole === "teacher"
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span className="text-xl mb-1">👨‍🏫</span>
                    Wali Kelas
                  </button>
                </div>
              </div>

              {requestedRole === "student" && (
                <div className="space-y-3 pt-1 border-t border-border">
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
                </div>
              )}

              {requestedRole === "officer" && (
                <p className="text-xs text-blue-600 bg-blue-50 p-3 rounded-xl leading-relaxed">
                  📌 Permintaan akses sebagai <b>Petugas Pos</b> akan langsung masuk ke daftar persetujuan Admin sekolah.
                </p>
              )}

              {requestedRole === "teacher" && (
                <p className="text-xs text-blue-600 bg-blue-50 p-3 rounded-xl leading-relaxed">
                  📌 Permintaan akses sebagai <b>Wali Kelas</b> akan langsung masuk ke daftar persetujuan Admin sekolah.
                </p>
              )}

              <Button type="submit" className="w-full font-bold" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                Kirim Permintaan Akses ({requestedRole === "officer" ? "Petugas Pos" : requestedRole === "student" ? "Siswa" : "Wali Kelas"})
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
              >
                Keluar & Masuk Akun Lain
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

          {mode === "login" ? (
            <>
              {/* Tab pemilih role login: Siswa (NIS) vs Guru & Petugas */}
              <div className="mt-6 grid grid-cols-2 p-1 bg-muted/60 border border-border rounded-xl text-xs sm:text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setLoginRole("student")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all",
                    loginRole === "student"
                      ? "bg-background text-foreground shadow-sm font-bold ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <GraduationCap className="size-4 text-primary" />
                  Siswa (NIS)
                </button>
                <button
                  type="button"
                  onClick={() => setLoginRole("staff")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all",
                    loginRole === "staff"
                      ? "bg-background text-foreground shadow-sm font-bold ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="size-4 text-primary" />
                  Guru & Petugas
                </button>
              </div>

              {loginRole === "student" ? (
                /* Form Login Siswa dengan NIS dan Password */
                <form onSubmit={handleStudentLogin} className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="student-nis">NIS (Nomor Induk Siswa)</Label>
                    <Input
                      id="student-nis"
                      type="text"
                      inputMode="numeric"
                      required
                      value={studentNis}
                      onChange={(e) => setStudentNis(e.target.value)}
                      placeholder="Contoh: 21151"
                      autoComplete="username"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Gunakan NIS yang tertera pada kartu identitas atau tag QR siswa Anda.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="student-password">Kata Sandi</Label>
                    <Input
                      id="student-password"
                      type="password"
                      required
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full font-bold" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    Masuk sebagai Siswa
                  </Button>
                </form>
              ) : (
                /* Form Login Guru, Petugas, dan Admin (Email / Password & Google) */
                <div className="mt-5 space-y-4">
                  <form onSubmit={handleStaffLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-email">Email Sekolah</Label>
                      <Input
                        id="staff-email"
                        type="text"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@smpn99.sch.id atau email admin"
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-password">Kata Sandi</Label>
                      <Input
                        id="staff-password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan kata sandi"
                        autoComplete="current-password"
                      />
                    </div>
                    <Button type="submit" className="w-full font-bold" disabled={busy}>
                      {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                      Masuk
                    </Button>
                  </form>

                  <div className="relative my-4">
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
                </div>
              )}
            </>
          ) : (
            /* Form Pendaftaran Akun Baru */
            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name">Nama lengkap</Label>
                <Input
                  id="signup-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama sesuai absen / SK"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-nis">NIS (khusus siswa)</Label>
                <Input
                  id="signup-nis"
                  value={nis}
                  onChange={(e) => setNis(e.target.value)}
                  placeholder="Contoh: 21151"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@smpn99.sch.id"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password">Kata sandi</Label>
                <Input
                  id="signup-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                />
              </div>
              <Button type="submit" className="w-full font-bold" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                Daftar Akun Baru
              </Button>
            </form>
          )}

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