import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Leaf, Plus, Edit, Trash2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AiChallengePrompt = {
  key: string;
  label: string;
  pill: string;
  name: string;
  title: string;
  body: string;
  pct: number;
  autoAward?: boolean;
  targetItemCode?: string;
  targetSession?: string;
  targetCount?: number;
  bonusPoints?: number;
};

export const AI_CHALLENGE_PROMPTS: AiChallengePrompt[] = [
  {
    key: "5-hari-tumbler",
    label: "🥤 Streak Tumbler 5 Hari",
    pill: "ACTIVE",
    name: "5 Hari Tumbler",
    title: "Build the streak.",
    body: "Scan Tumbler pada Sesi 1 selama 5 hari sekolah berbeda (Senin–Jumat) dalam satu minggu untuk mendapatkan bonus otomatis +150 Eco-Points.",
    pct: 65,
    autoAward: true,
    targetItemCode: "tumbler",
    targetSession: "entry",
    targetCount: 5,
    bonusPoints: 150,
  },
  {
    key: "full-reusable-class",
    label: "🍱 Full Reusable Class",
    pill: "ACTIVE",
    name: "100% Reusable Class",
    title: "One class, one goal.",
    body: "Target 100% siswa dalam satu kelas membawa tumbler dan lunchbox tanpa sampah plastik sekali pakai selama jam istirahat.",
    pct: 48,
  },
  {
    key: "most-improved-eco",
    label: "📈 Most Improved Class",
    pill: "ACTIVE",
    name: "Most Improved Eco",
    title: "Progress matters.",
    body: "Apresiasi khusus bagi kelas yang berhasil meningkatkan persentase partisipasi harian paling drastis dibanding minggu lalu.",
    pct: 72,
  },
  {
    key: "zero-waste-hero",
    label: "🌱 Zero Waste Hero 7 Hari",
    pill: "ACTIVE",
    name: "Zero Waste Hero",
    title: "Save our planet daily.",
    body: "Tantangan individu siswa membawa tempat makan & minum sendiri secara konsisten tanpa jeda selama 7 hari sekolah.",
    pct: 80,
  },
  {
    key: "aqi-awareness-challenge",
    label: "🌫️ Kualifikasi Remaja AQI Sehat",
    pill: "COMING SOON",
    name: "Remaja AQI Sehat",
    title: "Breathe safe, stay hydrated.",
    body: "Tantangan menjaga kecukupan cairan tumbler & pemakaian masker filter saat indeks kualitas udara Jakarta di atas 100.",
    pct: 25,
  },
  {
    key: "jawara-daur-ulang",
    label: "♻️ Jawara Daur Ulang Kertas",
    pill: "COMING SOON",
    name: "Jawara Paper Recycle",
    title: "Recycle for future.",
    body: "Tantangan pengumpulan kertas buku bekas & kardus antar kelas untuk disetorkan ke bank sampah sekolah SMPN 99.",
    pct: 10,
  },
];

export function generateAiChallenge(key?: string): AiChallengePrompt {
  if (key) {
    const found = AI_CHALLENGE_PROMPTS.find((p) => p.key === key);
    if (found) return found;
  }
  const randomIndex = Math.floor(Math.random() * AI_CHALLENGE_PROMPTS.length);
  const item = AI_CHALLENGE_PROMPTS[randomIndex];
  if (item) return item;
  const fallback = AI_CHALLENGE_PROMPTS[0];
  if (fallback) return fallback;
  return {
    key: "default",
    label: "🥤 Streak Tumbler",
    pill: "ACTIVE",
    name: "5 Hari Tumbler",
    title: "Build the streak.",
    body: "Scan Tumbler pada Sesi 1 selama 5 hari sekolah berbeda (Senin–Jumat) dalam satu minggu untuk mendapatkan bonus otomatis +150 Eco-Points.",
    pct: 50,
    autoAward: true,
    targetItemCode: "tumbler",
    targetSession: "entry",
    targetCount: 5,
    bonusPoints: 150,
  };
}

export const Route = createFileRoute("/admin/challenge")({
  head: () => ({
    meta: [{ title: "Kelola Challenge — School Ecosystem" }],
  }),
  component: ChallengeManagementPage,
});

function ChallengeManagementPage() {
  const queryClient = useQueryClient();
  const [activeChallenge, setActiveChallenge] = useState<any | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states
  const [pill, setPill] = useState("ACTIVE");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pct, setPct] = useState(0);
  const [autoAward, setAutoAward] = useState(false);
  const [targetItemCode, setTargetItemCode] = useState("tumbler");
  const [targetSession, setTargetSession] = useState("entry");
  const [targetCount, setTargetCount] = useState(5);
  const [bonusPoints, setBonusPoints] = useState(150);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()),
  );

  const challenges = useQuery({
    queryKey: ["admin-challenges"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const challengeAwards = useQuery({
    queryKey: ["admin-challenge-award-history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("challenge_point_awards")
        .select(
          "id, week_start, earned_day, qualifying_days, bonus_points, awarded_at, reversed_at, reversal_reason, challenges(name), students(full_name, nis, classes(name))",
        )
        .order("awarded_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name || !title || !body) throw new Error("Semua kolom wajib diisi");
      const { error } = await (supabase as any).from("challenges").insert({
        pill,
        name,
        title,
        body,
        pct: Number(pct),
        auto_award: autoAward,
        target_item_code: autoAward ? targetItemCode : null,
        target_session: autoAward ? targetSession : null,
        target_count: autoAward ? Number(targetCount) : null,
        bonus_points: autoAward ? Number(bonusPoints) : 0,
        effective_from: effectiveFrom,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Challenge berhasil dibuat");
      setIsAddOpen(false);
      setName("");
      setTitle("");
      setBody("");
      setPill("ACTIVE");
      setPct(0);
      setAutoAward(false);
      setTargetItemCode("tumbler");
      setTargetSession("entry");
      setTargetCount(5);
      setBonusPoints(150);
      setEffectiveFrom(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
      queryClient.invalidateQueries({ queryKey: ["admin-challenges"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal membuat challenge"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeChallenge) return;
      const { error } = await (supabase as any)
        .from("challenges")
        .update({
          pill: activeChallenge.pill,
          name: activeChallenge.name,
          title: activeChallenge.title,
          body: activeChallenge.body,
          pct: Number(activeChallenge.pct),
          auto_award: Boolean(activeChallenge.auto_award),
          target_item_code: activeChallenge.auto_award ? activeChallenge.target_item_code : null,
          target_session: activeChallenge.auto_award ? activeChallenge.target_session : null,
          target_count: activeChallenge.auto_award ? Number(activeChallenge.target_count) : null,
          bonus_points: activeChallenge.auto_award ? Number(activeChallenge.bonus_points) : 0,
          effective_from: activeChallenge.effective_from,
        })
        .eq("id", activeChallenge.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Challenge berhasil diperbarui");
      setActiveChallenge(null);
      queryClient.invalidateQueries({ queryKey: ["admin-challenges"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal memperbarui challenge"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Apakah Anda yakin ingin menghapus challenge ini?")) return;
      const { error } = await (supabase as any).from("challenges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Challenge berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["admin-challenges"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal menghapus challenge"),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Eco Challenge</h1>
          <p className="text-sm text-muted-foreground">
            Kelola tantangan ramah lingkungan yang ditampilkan di beranda siswa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const ai = generateAiChallenge();
              setPill(ai.pill);
              setName(ai.name);
              setTitle(ai.title);
              setBody(ai.body);
              setPct(ai.pct);
              setAutoAward(Boolean(ai.autoAward));
              setTargetItemCode(ai.targetItemCode ?? "tumbler");
              setTargetSession(ai.targetSession ?? "entry");
              setTargetCount(ai.targetCount ?? 5);
              setBonusPoints(ai.bonusPoints ?? 150);
              setEffectiveFrom(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
              setIsAddOpen(true);
              toast.success(`✨ AI Challenge Generator dibuka! Tantangan "${ai.name}" disiapkan.`);
            }}
            className="rounded-full gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-bold"
          >
            <Sparkles className="size-4 text-emerald-600 animate-pulse" /> ✨ Generate AI Challenge
          </Button>
          <Button size="sm" onClick={() => setIsAddOpen(true)} className="rounded-full gap-1 font-bold">
            <Plus className="size-4" /> Tambah Challenge
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {(challenges.data ?? []).map((c) => (
          <article key={c.id} className="surface-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="label-xs rounded-full bg-accent px-2 py-1 text-accent-foreground">
                  {c.pill}
                </span>
                <b className="text-sm">{c.name}</b>
              </div>
              <h3 className="mt-4 text-lg font-bold">{c.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-eco" style={{ width: `${c.pct}%` }} />
              </div>
              <p className="mt-2 text-sm font-bold">{c.pct}% · progres manual admin</p>
              {c.auto_award && (
                <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Bonus otomatis +{Number(c.bonus_points).toLocaleString("id-ID")} poin · {c.target_count} hari sekolah
                </p>
              )}
            </div>
            
            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full gap-1.5"
                onClick={() => setActiveChallenge(c)}
              >
                <Edit className="size-3.5" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
                onClick={() => deleteMutation.mutate(c.id)}
              >
                <Trash2 className="size-3.5" /> Hapus
              </Button>
            </div>
          </article>
        ))}
        {(challenges.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center col-span-full">Belum ada challenge yang ditambahkan.</p>
        )}
      </div>

      <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-extrabold">Riwayat Bonus EcoChallenge</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ledger audit 100 pemberian terbaru. Bonus yang dibatalkan tetap terlihat sebagai riwayat, tetapi tidak dihitung ke saldo.
          </p>
        </div>
        {challengeAwards.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Memuat riwayat bonus...</p>
        ) : challengeAwards.isError ? (
          <p className="p-5 text-sm text-destructive">Riwayat bonus gagal dimuat. Periksa akses admin ke ledger.</p>
        ) : (challengeAwards.data ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3">Siswa</th>
                  <th className="px-4 py-3">Challenge</th>
                  <th className="px-4 py-3">Minggu</th>
                  <th className="px-4 py-3">Tanggal pencapaian</th>
                  <th className="px-4 py-3 text-right">Bonus</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(challengeAwards.data ?? []).map((award: any) => {
                  const student = award.students;
                  const className = student?.classes?.name ?? "Tanpa kelas";
                  return (
                    <tr key={award.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{student?.full_name ?? "Siswa"}</p>
                        <p className="text-xs text-muted-foreground">NIS {student?.nis ?? "—"} · {className}</p>
                      </td>
                      <td className="px-4 py-3">{award.challenges?.name ?? "EcoChallenge"}</td>
                      <td className="px-4 py-3 tabular-nums">{award.week_start}</td>
                      <td className="px-4 py-3">
                        <p>{award.earned_day}</p>
                        <p className="text-xs text-muted-foreground">
                          {(award.qualifying_days ?? []).length} hari tervalidasi
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        +{Number(award.bonus_points).toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        {award.reversed_at ? (
                          <div>
                            <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">Dibatalkan</span>
                            <p className="mt-1 max-w-[200px] text-[11px] text-muted-foreground">{award.reversal_reason}</p>
                          </div>
                        ) : (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">Aktif</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Belum ada bonus yang diberikan. Bonus pertama tercatat setelah siswa memenuhi lima hari scan Tumbler yang disetujui.
          </p>
        )}
      </section>

            {/* DIALOG TAMBAH CHALLENGE */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl border border-border shadow-2xl">
          <DialogHeader className="p-6 pb-3 border-b border-border/40 bg-muted/20 shrink-0">
            <DialogTitle className="text-lg font-extrabold tracking-tight">Buat Challenge Baru</DialogTitle>
            <DialogDescription className="text-xs">Tambahkan program challenge ramah lingkungan baru.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 text-left">
            {/* AI CHALLENGE GENERATOR ENGINE */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-purple-500/10 border border-emerald-500/30 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-800 dark:text-emerald-300">
                  <Sparkles className="size-4 text-emerald-600 animate-pulse" />
                  <span>✨ AI Eco-Challenge Generator</span>
                </div>
                <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                  Smart AI Prompts
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Pilih topik tantangan di bawah ini atau klik <strong>Generate Acak AI</strong> untuk membuat program eco-challenge otomatis:
              </p>
              
              <div className="flex flex-wrap gap-1.5 pt-1">
                {AI_CHALLENGE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.key}
                    type="button"
                    onClick={() => {
                      const ai = generateAiChallenge(prompt.key);
                      setPill(ai.pill);
                      setName(ai.name);
                      setTitle(ai.title);
                      setBody(ai.body);
                      setPct(ai.pct);
              setAutoAward(Boolean(ai.autoAward));
              setTargetItemCode(ai.targetItemCode ?? "tumbler");
              setTargetSession(ai.targetSession ?? "entry");
              setTargetCount(ai.targetCount ?? 5);
              setBonusPoints(ai.bonusPoints ?? 150);
              setEffectiveFrom(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
                      toast.success(`✨ Challenge AI "${ai.label}" berhasil digenerate!`);
                    }}
                    className="text-[10px] font-bold bg-background hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-600 border border-border hover:border-emerald-600 px-2.5 py-1 rounded-xl transition-all shadow-xs"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs font-extrabold gap-1.5 mt-1 border-emerald-500/40 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded-xl"
                onClick={() => {
                  const ai = generateAiChallenge();
                  setPill(ai.pill);
                  setName(ai.name);
                  setTitle(ai.title);
                  setBody(ai.body);
                  setPct(ai.pct);
              setAutoAward(Boolean(ai.autoAward));
              setTargetItemCode(ai.targetItemCode ?? "tumbler");
              setTargetSession(ai.targetSession ?? "entry");
              setTargetCount(ai.targetCount ?? 5);
              setBonusPoints(ai.bonusPoints ?? 150);
              setEffectiveFrom(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
                  toast.success(`✨ AI berhasil meng-generate challenge acak!`);
                }}
              >
                <Wand2 className="size-3.5 text-emerald-600" />
                Generate Acak (AI Smart Prompt)
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Kategori/Status (Pill)</label>
              <select
                value={pill}
                onChange={(e) => setPill(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="COMING SOON">COMING SOON</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Nama Program</label>
              <input
                type="text"
                placeholder="Contoh: 5 Hari Tumbler"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Motto/Headline</label>
              <input
                type="text"
                placeholder="Contoh: Build the streak."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Deskripsi Tantangan</label>
              <textarea
                rows={3}
                placeholder="Contoh: Bawa tumbler 5 hari berturut-turut untuk bonus poin."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-input bg-background text-sm font-normal leading-relaxed focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all resize-y min-h-[90px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Progres manual (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Diisi manual oleh admin sebagai indikator pelaksanaan. Angka ini bukan hasil hitung otomatis dari scan/peserta dan tidak menambahkan Eco-Points.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={autoAward}
                  onChange={(e) => setAutoAward(e.target.checked)}
                  className="size-4 accent-emerald-600"
                />
                Aktifkan bonus Eco-Points otomatis
              </label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Bonus diberikan satu kali per siswa per minggu setelah jumlah hari sekolah berbeda terpenuhi dengan scan berstatus approved.
              </p>
              {autoAward && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Barang yang divalidasi</label>
                    <select value={targetItemCode} onChange={(e) => setTargetItemCode(e.target.value)} className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm">
                      <option value="tumbler">Tumbler</option>
                      <option value="lunchbox">Kotak Makan</option>
                      <option value="break_combo">Combo Tumbler + Lunchbox</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Sesi scan</label>
                    <select value={targetSession} onChange={(e) => setTargetSession(e.target.value)} className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm">
                      <option value="entry">Sesi 1 · Masuk</option>
                      <option value="break">Sesi 2 · Istirahat</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Target hari sekolah</label>
                    <input type="number" min="1" max="5" value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Bonus poin</label>
                    <input type="number" min="1" value={bonusPoints} onChange={(e) => setBonusPoints(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm"/>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-semibold">Mulai berlaku</label>
                    <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm"/>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Untuk program 5 Hari Tumbler: pilih Tumbler, Sesi 1, target 5 hari sekolah (Senin–Jumat), dan bonus 150 poin. Satu bonus diberikan per siswa setiap minggu kalender.
              </p>
            </div>
          </div>

          <div className="p-4 bg-muted/20 border-t border-border/40 shrink-0">
            <Button
              className="w-full h-11 rounded-xl font-extrabold text-sm shadow-md"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              Simpan Challenge
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG EDIT CHALLENGE */}
      <Dialog open={!!activeChallenge} onOpenChange={(open) => !open && setActiveChallenge(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Challenge</DialogTitle>
            <DialogDescription>Modifikasi detail tantangan eco saat ini.</DialogDescription>
          </DialogHeader>
          {activeChallenge && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Kategori/Status (Pill)</label>
                <select
                  value={activeChallenge.pill}
                  onChange={(e) => setActiveChallenge({ ...activeChallenge, pill: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMING SOON">COMING SOON</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Nama Program</label>
                <input
                  type="text"
                  value={activeChallenge.name}
                  onChange={(e) => setActiveChallenge({ ...activeChallenge, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Motto/Headline</label>
                <input
                  type="text"
                  value={activeChallenge.title}
                  onChange={(e) => setActiveChallenge({ ...activeChallenge, title: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Deskripsi Tantangan</label>
                <textarea
                  value={activeChallenge.body}
                  onChange={(e) => setActiveChallenge({ ...activeChallenge, body: e.target.value })}
                  className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-background text-sm focus:outline-primary resize-y"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Progres manual (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeChallenge.pct}
                  onChange={(e) => setActiveChallenge({ ...activeChallenge, pct: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Persentase ini diubah manual dan tidak menentukan pemberian bonus. Bonus otomatis mengikuti target scan approved pada pengaturan di bawah.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={Boolean(activeChallenge.auto_award)}
                    onChange={(e) => setActiveChallenge({ ...activeChallenge, auto_award: e.target.checked })}
                    className="size-4 accent-emerald-600"
                  />
                  Aktifkan bonus Eco-Points otomatis
                </label>
                {activeChallenge.auto_award && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Barang</label>
                      <select value={activeChallenge.target_item_code ?? "tumbler"} onChange={(e) => setActiveChallenge({ ...activeChallenge, target_item_code: e.target.value })} className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm">
                        <option value="tumbler">Tumbler</option><option value="lunchbox">Kotak Makan</option><option value="break_combo">Combo</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Sesi</label>
                      <select value={activeChallenge.target_session ?? "entry"} onChange={(e) => setActiveChallenge({ ...activeChallenge, target_session: e.target.value })} className="w-full h-10 px-2 rounded-xl border border-input bg-background text-sm">
                        <option value="entry">Sesi 1 · Masuk</option><option value="break">Sesi 2 · Istirahat</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Target hari sekolah</label>
                      <input type="number" min="1" max="5" value={activeChallenge.target_count ?? 5} onChange={(e) => setActiveChallenge({ ...activeChallenge, target_count: Number(e.target.value) })} className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm"/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Bonus poin</label>
                      <input type="number" min="1" value={activeChallenge.bonus_points ?? 150} onChange={(e) => setActiveChallenge({ ...activeChallenge, bonus_points: Number(e.target.value) })} className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm"/>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-semibold">Mulai berlaku</label>
                      <input type="date" value={activeChallenge.effective_from ?? ""} onChange={(e) => setActiveChallenge({ ...activeChallenge, effective_from: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm"/>
                    </div>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Bonus diberikan satu kali per siswa per minggu kalender, setelah jumlah hari sekolah berbeda terpenuhi. Scan harus approved.
                </p>
              </div>
              <Button
                className="w-full rounded-full mt-2"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
              >
                Simpan Perubahan
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
