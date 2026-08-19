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
};

export const AI_CHALLENGE_PROMPTS: AiChallengePrompt[] = [
  {
    key: "5-hari-tumbler",
    label: "🥤 Streak Tumbler 5 Hari",
    pill: "ACTIVE",
    name: "5 Hari Tumbler",
    title: "Build the streak.",
    body: "Minimal 5 kali validasi membawa tumbler pribadi ke sekolah dalam 1 minggu untuk membuka bonus +150 Eco-Points.",
    pct: 65,
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
    body: "Minimal 5 kali validasi membawa tumbler pribadi.",
    pct: 50,
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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name || !title || !body) throw new Error("Semua kolom wajib diisi");
      const { error } = await (supabase as any).from("challenges").insert({
        pill,
        name,
        title,
        body,
        pct: Number(pct),
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
              <p className="mt-2 text-sm font-bold">{c.pct}% progress</p>
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
              <label className="text-xs font-bold text-foreground">Progress Default (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              />
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
                <label className="text-xs font-bold text-muted-foreground">Progress (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeChallenge.pct}
                  onChange={(e) => setActiveChallenge({ ...activeChallenge, pct: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-primary"
                />
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
