import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Coffee,
  Droplets,
  Flame,
  Leaf,
  Menu,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/eco/Brand";
import { QrImage } from "@/components/eco/QrImage";
import { homeForRole, useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo-smpn99.png.asset.json";
import kopiLogo from "@/assets/traktir-kopi.png";

const KOPI_URL = "https://mayar.to/banyubiru";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "School Ecosystem SMPN 99 Jakarta | Tumbler & Lunchbox" },
      {
        name: "description",
        content:
          "Platform sekolah bebas sampah: scan QR tumbler & lunchbox, kumpulkan Eco Points, pantau Eco Score kelas, dan raih Jawara Lingkungan.",
      },
      { property: "og:title", content: "School Ecosystem SMPN 99 Jakarta" },
      {
        property: "og:description",
        content:
          "Scan. Catat. Dapatkan poin. Naikkan Eco Score kelasmu di SMP Negeri 99 Jakarta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const NAV = [
  { href: "#statistik", label: "Statistik" },
  { href: "#leaderboard", label: "Leaderboard" },
  { href: "#jawara", label: "Jawara" },
  { href: "#challenge", label: "Challenge" },
  { href: "#tentang", label: "Tentang Program" },
  { href: "#kopi", label: "Traktir Kopi" },
];

function useSchoolStats() {
  return useQuery({
    queryKey: ["school-stats"],
    queryFn: async () => {
      const [{ data: scores }, { count: studentCount }, { data: items }, { data: classes }] =
        await Promise.all([
          supabase.from("student_scores").select("earned_points, total_items"),
          supabase.from("students").select("id", { count: "exact", head: true }),
          supabase.from("eco_items").select("code, co2_grams"),
          supabase
            .from("class_scores")
            .select("class_name, total_points, avg_points, student_count")
            .order("avg_points", { ascending: false })
            .limit(5),
        ]);
      const totalPoints = (scores ?? []).reduce((a, s) => a + (s.earned_points ?? 0), 0);
      const totalItems = (scores ?? []).reduce((a, s) => a + Number(s.total_items ?? 0), 0);
      const avgCo2 =
        (items ?? []).reduce((a, i) => a + i.co2_grams, 0) / Math.max(1, (items ?? []).length);
      return {
        totalPoints,
        totalItems,
        studentCount: studentCount ?? 0,
        co2Kg: Math.round((totalItems * avgCo2) / 1000),
        classes: classes ?? [],
      };
    },
  });
}

function SectionHead({
  kicker,
  title,
  lead,
  invert,
}: {
  kicker: string;
  title: string;
  lead?: string;
  invert?: boolean;
}) {
  return (
    <div className="mb-10 max-w-3xl">
      <p className={cn("label-xs", invert ? "text-eco-foreground/80" : "text-primary")}>{kicker}</p>
      <h2 className="mt-3 text-3xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl">
        {title}
      </h2>
      {lead && (
        <p className={cn("mt-4 text-base", invert ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {lead}
        </p>
      )}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold"
        aria-expanded={open}
      >
        {q}
        <Plus className={cn("size-4 shrink-0 transition-transform", open && "rotate-45")} />
      </button>
      {open && <p className="px-5 pb-5 text-sm text-muted-foreground">{a}</p>}
    </div>
  );
}

function Index() {
  const { data } = useSchoolStats();
  const { me } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const dashHref = me ? homeForRole[me.primaryRole] : "/auth";

  const challenges = useQuery({
    queryKey: ["landing-challenges"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const challengesList = (challenges.data && challenges.data.length > 0)
    ? challenges.data
    : [
        { pill: "ACTIVE", name: "5 Hari Tumbler", title: "Build the streak.", body: "Minimal 5 record valid membawa tumbler dalam periode challenge.", pct: 72 },
        { pill: "COMING SOON", name: "Full Reusable Class", title: "One class, one goal.", body: "Target reusable untuk kelas dengan progress yang dapat dipantau.", pct: 48 },
        { pill: "ACTIVE", name: "Most Improved", title: "Progress matters.", body: "Apresiasi peningkatan, bukan hanya posisi tertinggi.", pct: 61 },
      ];

  const stats = [
    { label: "Siswa terdaftar", value: `${data?.studentCount ?? 0}`, icon: Users },
    { label: "Sampah plastik dicegah", value: `${data?.totalItems ?? 0}x`, icon: Droplets },
    { label: "Estimasi CO₂ dihemat", value: `${data?.co2Kg ?? 0} kg`, icon: Leaf },
    {
      label: "Total Eco-Points",
      value: `${(data?.totalPoints ?? 0).toLocaleString("id-ID")}`,
      icon: Trophy,
    },
    { label: "Kelas aktif", value: `${data?.classes.length ?? 0}`, icon: ShieldCheck },
  ];

  const champion = data?.classes?.[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand />
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition-colors hover:text-primary">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild className="rounded-full">
              <Link to={dashHref}>Login</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              aria-label="Buka menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Menu className="size-4" />
            </Button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-border bg-background px-4 py-3 lg:hidden">
            <div className="grid gap-1">
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  {n.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section id="home" className="border-b border-border/60 bg-gradient-to-b from-secondary/40 to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.03fr_.97fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-foreground">
              <span className="size-2 rounded-full bg-eco" />
              Environmental behavior, made visible
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
              Bawa Tumbler.
              <br />
              Bawa Lunchbox.
              <br />
              <span className="bg-gradient-to-r from-primary to-eco bg-clip-text text-transparent">
                Bangun Kebiasaan Baik.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              School Ecosystem mengubah kebiasaan ramah lingkungan siswa SMP Negeri 99 Jakarta
              menjadi sesuatu yang mudah dicatat, seru diikuti, dan terlihat perkembangannya.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to={dashHref}>
                  Mulai dari Hari Ini <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link to="/peringkat">Lihat Leaderboard</Link>
              </Button>
            </div>
            <p className="label-xs mt-5 text-muted-foreground">
              Scan · Catat · Dapatkan Poin · Naikkan Eco Score
            </p>
          </div>

          {/* Phone mock */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute right-2 top-6 size-72 rounded-full bg-accent/70 blur-2xl" />
            <div className="surface-card relative mx-auto w-[280px] rotate-2 overflow-hidden rounded-[2.5rem] border-8 border-ink p-0">
              <div className="mx-auto h-6 w-24 rounded-b-2xl bg-ink" />
              <div className="p-5">
                <p className="label-xs text-muted-foreground">Petugas Scanner</p>
                <p className="mt-1 text-xl font-extrabold">Scan Siswa</p>
                <div className="relative mt-4 grid h-40 place-items-center rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/50">
                  <QrCode className="size-20 text-ink" />
                  <span className="absolute inset-x-7 top-1/2 h-0.5 bg-primary shadow-[0_0_12px_var(--primary)]" />
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-surface-low p-3 text-xs">
                  {[
                    ["Nama", "Andi Pratama"],
                    ["Tumbler", "YA"],
                    ["Lunchbox", "YA"],
                    ["Status", "LENGKAP"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-bold text-eco">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="surface-card absolute right-0 top-8 hidden px-4 py-3 text-xs font-bold sm:block">
              +10 Eco Points
              <span className="label-xs block text-muted-foreground">Tumbler + Lunchbox</span>
            </div>
            <div className="surface-card absolute bottom-24 left-0 hidden px-4 py-3 text-xs font-bold sm:block">
              #1 {champion?.class_name ?? "VIII A"}
              <span className="label-xs block text-muted-foreground">Eco Class</span>
            </div>
            <div className="surface-card absolute -bottom-4 right-1 flex items-center gap-2 px-3 py-2 text-xs font-bold sm:bottom-6 sm:right-2 sm:px-4 sm:py-3">
              <Flame className="size-4 text-warning" /> 7 Hari Streak
            </div>
          </div>
        </div>
      </section>

      {/* STATISTIK */}
      <section id="statistik" className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="surface-card p-5">
              <s.icon className="size-5 text-eco" />
              <p className="mt-4 text-2xl font-extrabold tracking-tight">{s.value}</p>
              <p className="label-xs mt-1 text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Statistik ditarik langsung dari data operasional sistem.
        </p>
      </section>

      {/* PROBLEM */}
      <section id="tentang" className="bg-surface-low py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead
            kicker="The real problem"
            title="Kebiasaan Baik Butuh Sistem yang Mudah."
            lead="Masalahnya bukan siswa tidak peduli lingkungan. Kebiasaan baik belum memiliki sistem yang mudah dicatat, dipantau, dan diapresiasi."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Pencatatan Lambat", "Proses manual membuat rekap harian lebih berat daripada seharusnya."],
              ["02", "Tidak Ada Feedback", "Siswa sulit melihat apakah konsistensi mereka meningkat dari hari ke hari."],
              ["03", "Performa Kelas Sulit Dilihat", "Wali kelas butuh insight sederhana, bukan tumpukan data mentah."],
              ["04", "Data Belum Jadi Insight", "Sekolah butuh data siap pakai untuk evaluasi program lingkungan."],
            ].map(([n, t, b]) => (
              <article key={n} className="surface-card p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-sm font-extrabold text-secondary-foreground">
                  {n}
                </span>
                <h3 className="mt-4 text-lg font-bold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead
          kicker="One simple loop"
          title="Satu Sistem untuk Membentuk Kebiasaan."
          lead="Identitas siswa bertemu pencatatan cepat, gamifikasi, challenge, dan apresiasi."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[
            ["01", "Identitas", "QR siswa"],
            ["02", "Scan", "HP petugas"],
            ["03", "Catat", "Tumbler & lunchbox"],
            ["04", "Poin", "Eco Points"],
            ["05", "Challenge", "Target seru"],
            ["06", "Ranking", "Eco Score"],
            ["07", "Jawara", "Apresiasi"],
          ].map(([n, t, s]) => (
            <div key={n} className="surface-card px-3 py-5 text-center">
              <p className="label-xs text-primary">{n}</p>
              <p className="mt-2 text-sm font-bold">{t}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SCANNER */}
      <section id="scanner" className="gradient-hero py-20 text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <SectionHead
              kicker="Mobile-first scanning"
              title="HP Petugas Bisa Jadi Scanner."
              lead="Tidak perlu perangkat khusus. Petugas cukup membuka halaman Scanner di browser HP, scan QR, verifikasi, lalu simpan."
              invert
            />
            <Button asChild size="lg" variant="secondary" className="rounded-full">
              <Link to={me ? dashHref : "/auth"}>
                <ScanLine className="size-4" /> Explore Scanner Flow
              </Link>
            </Button>
          </div>
          <div className="mx-auto w-[250px] rounded-[2.25rem] border-8 border-primary-foreground bg-surface p-4 text-foreground shadow-lift">
            <p className="label-xs text-muted-foreground">Scanner</p>
            <p className="mt-1 text-lg font-extrabold">Scan QR Siswa</p>
            <div className="relative my-4 grid h-44 place-items-center rounded-3xl bg-secondary/60">
              <QrCode className="size-24 text-ink" />
              <span className="absolute inset-x-8 top-1/2 h-0.5 bg-primary" />
            </div>
            <p className="text-xs text-muted-foreground">QR terbaca</p>
            <p className="mb-3 font-extrabold">Andi Pratama · VIII A</p>
            <div className="grid grid-cols-2 gap-2">
              <span className="rounded-full bg-accent px-2 py-2 text-center text-[11px] font-bold text-accent-foreground">
                Tumbler ✓
              </span>
              <span className="rounded-full bg-accent px-2 py-2 text-center text-[11px] font-bold text-accent-foreground">
                Lunchbox ✓
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* GAMIFIKASI */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead
          kicker="Engagement"
          title="Biar Kebiasaan Baik Jadi Seru."
          lead="Gamifikasi memberi feedback positif tanpa mengubah program menjadi kompetisi yang toxic."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="gradient-eco rounded-3xl p-8 text-eco-foreground">
            <h3 className="text-2xl font-extrabold">Eco Points</h3>
            <p className="mt-2 text-sm opacity-80">Setiap perilaku tervalidasi punya nilai jelas.</p>
            <p className="mt-6 text-6xl font-extrabold tracking-tight">+10</p>
            <p className="text-xs opacity-80">Tumbler + Lunchbox</p>
            <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-eco-foreground/20">
              <span className="block h-full w-[74%] rounded-full bg-eco-foreground" />
            </div>
            <div className="mt-2 flex justify-between text-xs opacity-80">
              <span>Monthly progress</span>
              <b>74%</b>
            </div>
          </div>
          <div className="rounded-3xl bg-ink p-8 text-primary-foreground">
            <h3 className="text-2xl font-extrabold">Badge & Streak</h3>
            <p className="mt-2 text-sm opacity-75">Progress dibuat terlihat dan terasa rewarding.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {["🌱", "🥤", "🍱", "♻️", "🏆"].map((b, i) => (
                <span
                  key={b}
                  className={cn(
                    "grid size-14 place-items-center rounded-2xl bg-surface text-2xl",
                    i === 4 && "opacity-30",
                  )}
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="mt-6 font-extrabold">🔥 7 Hari Eco Streak</p>
            <p className="text-xs opacity-75">3/5 badge unlocked</p>
          </div>
        </div>
      </section>

      {/* CHALLENGE */}
      <section id="challenge" className="bg-surface-low py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead
            kicker="Eco Challenge"
            title="Jangan Cuma Scan. Ikuti Challenge."
            lead="Challenge membuat program bergerak dari rutinitas pencatatan menuju perilaku yang konsisten dan terukur."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {challengesList.map(({ pill, name, title, body, pct }) => (
              <article key={name} className="surface-card p-6">
                <div className="flex items-start justify-between gap-2">
                  <span className="label-xs rounded-full bg-accent px-2 py-1 text-accent-foreground">
                    {pill}
                  </span>
                  <b className="text-sm">{name}</b>
                </div>
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-eco" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-sm font-bold">{pct}% progress</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* LEADERBOARD */}
      <section id="leaderboard" className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead
          kicker="Positive competition"
          title="Kelas Mana yang Paling Konsisten?"
          lead="Eco Score memakai rata-rata poin per siswa, bukan jumlah absolut, agar perbandingan antarkelas tetap adil."
        />
        <div className="surface-card overflow-hidden">
          <div className="grid grid-cols-[60px_1fr_110px_110px] bg-surface-low px-5 py-4">
            {["Rank", "Kelas", "Siswa", "Rata-rata"].map((h) => (
              <span key={h} className="label-xs text-muted-foreground">
                {h}
              </span>
            ))}
          </div>
          {(data?.classes ?? []).map((c, i) => (
            <div
              key={c.class_name ?? i}
              className="grid grid-cols-[60px_1fr_110px_110px] items-center border-t border-border px-5 py-4 text-sm"
            >
              <span className="text-lg font-extrabold text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <strong>{c.class_name}</strong>
              <span className="text-muted-foreground">{c.student_count ?? 0}</span>
              <strong>{Math.round(Number(c.avg_points ?? 0))}</strong>
            </div>
          ))}
          {(data?.classes ?? []).length === 0 && (
            <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
              Belum ada data kelas.
            </p>
          )}
        </div>

        <div
          id="jawara"
          className="surface-card mt-6 flex flex-wrap items-center gap-6 bg-gradient-to-br from-accent/60 to-surface p-7"
        >
          <span className="grid size-20 place-items-center rounded-3xl bg-surface text-4xl">🏆</span>
          <div className="flex-1">
            <p className="label-xs text-eco">Jawara Lingkungan Periode Ini</p>
            <h3 className="mt-1 text-2xl font-extrabold">
              {champion?.class_name ?? "Belum ada"} · #1 Eco Class
            </h3>
            <p className="text-sm text-muted-foreground">
              {champion?.student_count ?? 0} siswa · total {Math.round(Number(champion?.total_points ?? 0))} poin
            </p>
          </div>
          <span className="text-3xl font-extrabold text-eco">
            {Math.round(Number(champion?.avg_points ?? 0))}
          </span>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Bersaing positif. Tumbuh bersama. Most Improved Class tetap punya panggung.
        </p>
      </section>

      {/* PRIVACY + REPORTING */}
      <section className="bg-surface-low py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead
            kicker="Data & reporting"
            title="Dari Pencatatan Menjadi Insight."
            lead="Data operasional dapat divalidasi, difilter, dan diekspor menjadi laporan siap pakai untuk evaluasi program."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Rekap Harian", "Validasi klaim tumbler & lunchbox lengkap dengan jejak petugas."],
              ["Laporan Dampak", "Estimasi sampah plastik dicegah dan CO₂ yang dihemat."],
              ["Privacy by Design", "Halaman publik hanya menampilkan data agregat—tanpa NIS atau identitas QR."],
            ].map(([t, b]) => (
              <div key={t} className="surface-card p-6">
                <strong className="text-base">{t}</strong>
                <p className="mt-2 text-sm text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRAKTIR KOPI */}
      <section id="kopi" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_.8fr] lg:gap-12">
          <div>
            <div className="mb-4 flex min-w-0 items-center gap-3">
              <img
                src={kopiLogo}
                alt="Logo Traktir Kopi"
                width={512}
                height={512}
                loading="lazy"
                className="size-12 shrink-0 object-contain sm:size-14"
              />
              <span className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
                Traktir Kopi
              </span>
            </div>
            <SectionHead
              kicker="Community support"
              title="Traktir Kopi, Dukung Sekolah Lebih Hijau."
              lead="Dukungan kecil membantu School Ecosystem tetap online sekaligus mendukung reward untuk siswa dan kelas yang konsisten."
            />
            <p className="font-extrabold">“Secangkir kopi untuk developer, semangat untuk siswa.”</p>
            <p className="label-xs mt-4 text-muted-foreground">
              Traktir Kopi bersifat sukarela dan bukan biaya akses.
            </p>
          </div>
          <div className="surface-card p-5 sm:p-7">
            <Coffee className="size-9 text-warning" />
            <h3 className="mt-3 text-xl font-extrabold">Scan untuk traktir kopi</h3>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <QrImage value={KOPI_URL} size={160} />
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-sm text-muted-foreground">
                  Pindai QR dengan kamera ponsel atau buka tautan pembayaran resmi.
                </p>
                <Button asChild className="mt-3 w-full sm:w-auto">
                  <a href={KOPI_URL} target="_blank" rel="noopener noreferrer">
                    <Coffee className="size-4" /> Buka halaman dukungan
                  </a>
                </Button>
                <p className="mt-2 break-all text-xs text-muted-foreground">{KOPI_URL}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Rp5.000", "Rp10.000", "Rp20.000", "Rp50.000", "Nominal lain"].map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-border px-4 py-2 text-xs font-bold"
                >
                  {a}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Traktir Kopi tidak menghasilkan poin dan tidak memengaruhi ranking, badge, atau Jawara.
            </p>
            <p className="mt-4 rounded-2xl bg-accent px-4 py-3 text-xs font-extrabold text-accent-foreground">
              No pay-to-win.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-surface-low py-20">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHead kicker="FAQ" title="Pertanyaan yang Sering Muncul." />
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ["Apa itu School Ecosystem?", "Platform untuk mencatat dan membangun kebiasaan membawa tumbler dan lunchbox melalui QR, gamifikasi, leaderboard, dan Eco Challenge."],
              ["Apakah siswa butuh aplikasi khusus?", "Tidak. Sistem berbasis web dan dapat diakses melalui browser."],
              ["Apakah HP bisa dipakai sebagai scanner?", "Ya. Petugas dapat menggunakan kamera HP melalui halaman Scanner."],
              ["Bagaimana jika QR tidak terbaca?", "Petugas dapat mencari siswa berdasarkan nama atau NIS sebagai fallback."],
              ["Bagaimana Eco Score dihitung?", "Eco Score memakai rata-rata poin perilaku ramah lingkungan yang tervalidasi."],
              ["Apa itu Jawara Lingkungan?", "Kelas dengan Eco Score tertinggi pada periode berjalan."],
              ["Apakah Traktir Kopi wajib?", "Tidak. Dukungan bersifat sukarela dan tidak memengaruhi akses maupun poin."],
              ["Apakah data siswa tampil publik?", "Tidak. Halaman publik hanya menampilkan data agregat yang aman."],
            ] as const).map(([q, a]) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-gradient-to-b from-background to-accent/40 py-24 text-center">
        <div className="mx-auto max-w-3xl px-4">
          <p className="label-xs text-primary">Start the loop</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Satu Kebiasaan Kecil. Satu Sekolah yang Lebih Hijau.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Mulai dari satu scan hari ini. Bangun kebiasaan. Naikkan Eco Score. Jadikan kelasmu
            Jawara Lingkungan berikutnya.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to={dashHref}>
                Login School Ecosystem <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/peringkat">Lihat Papan Peringkat</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="bg-ink py-12 text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src={logoAsset.url} alt="Logo SMP Negeri 99 Jakarta" className="size-10 object-contain" />
              <span className="leading-tight">
                <span className="block font-extrabold">School Ecosystem</span>
                <span className="label-xs block opacity-70">SMP Negeri 99 Jakarta</span>
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm opacity-70">
              Platform pendukung program budaya ramah lingkungan sekolah.
            </p>
          </div>
          <div>
            <h4 className="font-bold">Explore</h4>
            <div className="mt-3 grid gap-2 text-sm opacity-70">
              {NAV.slice(0, 4).map((n) => (
                <a key={n.href} href={n.href}>
                  {n.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-bold">Program</h4>
            <div className="mt-3 grid gap-2 text-sm opacity-70">
              <a href="#tentang">Tentang Program</a>
              <a href="#scanner">Scanner</a>
              <a href="#kopi">Traktir Kopi</a>
              <Link to="/peringkat">Peringkat</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap justify-between gap-3 border-t border-primary-foreground/10 px-4 pt-5 text-xs opacity-60">
          <span>© {new Date().getFullYear()} School Ecosystem · SMP Negeri 99 Jakarta</span>
          <span>Environmental behavior + engagement + measurable impact</span>
        </div>
      </footer>
    </div>
  );
}
