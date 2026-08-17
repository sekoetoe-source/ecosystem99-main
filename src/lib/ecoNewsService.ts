import { supabase } from "@/integrations/supabase/client";

export type EcoNewsCategory = "lingkungan" | "kesehatan" | "sekolah" | "aqi";

export type EcoNewsItem = {
  id: string;
  category: EcoNewsCategory;
  title: string;
  summary: string;
  content: string;
  source?: string;
  sourceUrl?: string;
  date?: string;
  icon?: string;
  badge?: string;
  is_published?: boolean;
};

export const DEFAULT_ECO_NEWS: EcoNewsItem[] = [
  {
    id: "news-aqi-live",
    category: "aqi",
    title: "🌬️ Live AQI Jakarta (106 - Buruk/Sedang): PM2.5 38µg/m³ · Disarankan Pakai Masker & Minum dari Tumbler",
    summary: "Indeks Kualitas Udara (AQI) Jakarta real-time terpantau 106 dengan polutan utama PM2.5. Gunakan masker saat berangkat sekolah!",
    content: "Berdasarkan data real-time AQI.in Jakarta:\n\n• Indeks Kualitas Udara (AQI): 106 (Tingkat Buruk/Sedang)\n• Polutan Utama PM2.5: 38 µg/m³ | PM10: 66 µg/m³ | Suhu: 29.1°C\n• Rekomendasi Kesehatan Remaja SMPN 99:\n  1. Kenakan masker saat berangkat/pulang sekolah atau beraktivitas luar ruangan.\n  2. Sering minum air putih dari Tumbler pribadi untuk membilas tenggorokan dan menjaga kelembapan mukosa sel pernapasan dari partikel debu halus PM2.5.\n  3. Kurangi olahraga luar ruangan yang berlebihan saat Indeks AQI di atas 100.",
    source: "AQI.in Jakarta Live Dashboard",
    sourceUrl: "https://www.aqi.in/id/dashboard/indonesia/jakarta/jakarta",
    date: "Real-time Live",
    icon: "🌫️",
    badge: "AQI Jakarta Real-Time",
    is_published: true,
  },
  {
    id: "news-1",
    category: "lingkungan",
    title: "🌿 Kualitas Udara Jakarta & Tips Menjaga Kesehatan Paru Remaja Sekolah",
    summary: "Pantau indeks AQI Jakarta dan gunakan tumbler stainless untuk mengurangi sampah botol sekali pakai.",
    content: "Polusi udara di DKI Jakarta memerlukan perhatian khusus dari remaja sekolah. Selalu bawa tumbler stainless steel pribadi ke SMPN 99 Jakarta untuk menjaga kelembapan tenggorokan, gunakan masker saat berada di luar ruangan pada pagi hari, dan kurangi penggunaan plastik sekali pakai yang pembakarannya dapat memperburuk kualitas udara.",
    source: "Dinas Lingkungan Hidup DKI Jakarta",
    sourceUrl: "https://www.aqi.in/id/dashboard/indonesia/jakarta/jakarta",
    date: "Hari Ini",
    icon: "🌬️",
    badge: "Lingkungan Jakarta",
    is_published: true,
  },
  {
    id: "news-2",
    category: "kesehatan",
    title: "🥤 Minum 2 Liter Air Putih dari Tumbler: Rahasia Konsentrasi Belajar Remaja",
    summary: "Dehidrasi ringan dapat menurunkan daya ingat hingga 15%. Isi ulang tumbler di pos sekolah!",
    content: "Penelitian kesehatan remaja menunjukkan bahwa minum minimal 8 gelas (2 liter) air putih setiap hari meningkatkan daya tangkap belajar dan stamina saat jam pelajaran. Dengan membawa tumbler sendiri ke sekolah, siswa SMPN 99 Jakarta tidak hanya sehat tetapi juga menyelamatkan 300+ botol plastik per tahun!",
    source: "Kementerian Kesehatan RI",
    date: "Rekomendasi Medis",
    icon: "💧",
    badge: "Kesehatan Remaja",
    is_published: true,
  },
  {
    id: "news-3",
    category: "sekolah",
    title: "🍱 Kebiasaan Bawa Lunchbox Sekolah: Bebas Mikroplastik & Hemat Uang Saku",
    summary: "Membawa bekal dari rumah memastikan asupan gizi seimbang dan bebas dari kemasan sterofoam berbahaya.",
    content: "Penggunaan wadah makan berulang (lunchbox) di SMP Negeri 99 Jakarta melindungi makanan dari bahaya lelehan kimia wadah plastik sekali pakai saat terpapar panas. Pastikan bekal sekolahmu mengandung protein, sayuran hijau, dan karbohidrat seimbang untuk energi optimal sepanjang hari.",
    source: "Gerakan Sekolah Sehat SMPN 99",
    date: "Tips Harian",
    icon: "🍱",
    badge: "Kantin Sehat",
    is_published: true,
  },
  {
    id: "news-4",
    category: "lingkungan",
    title: "🌱 Gerakan Zero Waste SMPN 99 Jakarta: Kumpulkan Eco-Points & Raih Jawara Class",
    summary: "Scan QR tumbler dan kotak makanmu setiap hari di pos scanner petugas untuk poin kelas tertinggi!",
    content: "Tiap scan tumbler dan lunchbox menyumbangkan poin berharga bagi kelasmu. Kelas dengan rata-rata Eco Score tertinggi berhak atas gelar Jawara Lingkungan dan piagam penghargaan sekolah. Yuk buat kelasmu jadi nomor 1 di leaderboard!",
    source: "Tim Eco-School SMPN 99",
    date: "Info Kompetisi",
    icon: "🏆",
    badge: "Eco Challenge",
    is_published: true,
  },
  {
    id: "news-5",
    category: "kesehatan",
    title: "👀 Tips Kesehatan Mata & Postur Belajar Saat Menggunakan Gadget/Komputer",
    summary: "Terapkan aturan 20-20-20 dan jaga jarak mata minimal 30 cm saat belajar digital.",
    content: "Bagi siswa yang sering belajar menggunakan HP atau laptop, gunakan aturan 20-20-20: Setiap 20 menit menatap layar, istirahatkan mata selama 20 detik dengan melihat objek hijau/jauh berjarak 20 kaki (6 meter). Jangan lupa duduk tegak agar tulang belakang tumbuh sehat!",
    source: "Edukasi Kesehatan Remaja",
    date: "Tips Kesehatan",
    icon: "🧘‍♂️",
    badge: "Kesehatan Fisik",
    is_published: true,
  },
  {
    id: "news-6",
    category: "lingkungan",
    title: "🌏 Fakta Sampah Plastik Jakarta: 7.500 Ton Sampah Per Hari & Solusi Nyata Sekolah",
    summary: "Setiap langkah kecilmu membawa botol & lunchbox mengurangi beban TPA Bantar Gebang.",
    content: "DKI Jakarta menghasilkan lebih dari 7.500 ton sampah harian. Dengan menjadi bagian dari program School Ecosystem SMPN 99 Jakarta, kamu telah membantu mencegah ribuan sedotan dan botol plastik berakhir di laut dan sungai Jakarta.",
    source: "DLH DKI & Eco-Movement",
    sourceUrl: "https://www.aqi.in/id/dashboard/indonesia/jakarta/jakarta",
    date: "Fakta Lingkungan",
    icon: "🌍",
    badge: "Jakarta Eco",
    is_published: true,
  },
];

const LOCAL_STORAGE_KEY = "eco_news_items_v2";

export function getAllEcoNewsLocal(): EcoNewsItem[] {
  if (typeof window === "undefined") return DEFAULT_ECO_NEWS;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (_) {}
  return DEFAULT_ECO_NEWS;
}

export function saveAllEcoNewsLocal(items: EcoNewsItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (_) {}
}

export async function fetchEcoNews(): Promise<EcoNewsItem[]> {
  const list = getAllEcoNewsLocal();
  // Filter only published / active news items for ticker
  return list.filter((item) => item.is_published !== false);
}

export function toggleEcoNewsStatusLocal(id: string): EcoNewsItem[] {
  const current = getAllEcoNewsLocal();
  const updated = current.map((item) => {
    if (item.id === id) {
      return { ...item, is_published: item.is_published === false ? true : false };
    }
    return item;
  });
  saveAllEcoNewsLocal(updated);
  return updated;
}

export function addEcoNewsItemLocal(newItem: Omit<EcoNewsItem, "id">): EcoNewsItem[] {
  const current = getAllEcoNewsLocal();
  const created: EcoNewsItem = {
    ...newItem,
    id: `custom-news-${Date.now()}`,
    is_published: true,
    date: newItem.date || "Baru",
  };
  const updated = [created, ...current];
  saveAllEcoNewsLocal(updated);
  return updated;
}

export function deleteEcoNewsItemLocal(id: string): EcoNewsItem[] {
  const current = getAllEcoNewsLocal();
  const updated = current.filter((item) => item.id !== id);
  saveAllEcoNewsLocal(updated);
  return updated;
}

export function getCategoryBadgeStyle(category: EcoNewsCategory) {
  switch (category) {
    case "aqi":
      return "bg-purple-600 text-white font-black px-2.5 py-0.5 rounded-full shadow border border-purple-300 shrink-0 whitespace-nowrap animate-pulse";
    case "lingkungan":
      return "bg-emerald-600 text-white font-bold px-2.5 py-0.5 rounded-full shadow border border-emerald-300 shrink-0 whitespace-nowrap";
    case "kesehatan":
      return "bg-sky-600 text-white font-bold px-2.5 py-0.5 rounded-full shadow border border-sky-300 shrink-0 whitespace-nowrap";
    case "sekolah":
      return "bg-amber-500 text-slate-950 font-extrabold px-2.5 py-0.5 rounded-full shadow border border-amber-300 shrink-0 whitespace-nowrap";
    default:
      return "bg-emerald-700 text-white font-bold px-2.5 py-0.5 rounded-full border border-emerald-400 shrink-0 whitespace-nowrap";
  }
}

export type AiPromptTopic = {
  key: string;
  label: string;
  category: EcoNewsCategory;
  icon: string;
  title: string;
  summary: string;
  content: string;
  source: string;
};

export const AI_NEWS_PROMPTS: AiPromptTopic[] = [
  {
    key: "hidrasi-belajar",
    label: "🥤 Hidrasi & Tumbler Belajar",
    category: "kesehatan",
    icon: "💧",
    title: "🥤 AI Health Tip: Hidrasi 2 Liter Air Putih dari Tumbler Tingkatkan Fokus Belajar",
    summary: "Asupan air putih yang cukup dari tumbler pribadi meningkatkan fokus otak & fungsi sel tubuh hingga 20%.",
    content: "Berdasarkan rekomendasi edukasi kesehatan remaja:\n\n1. Mengonsumsi 8 gelas (2 liter) air bersih harian menjaga metabolisme dan konsentrasi konsisten selama jam sekolah.\n2. Menggunakan tumbler stainless bebas BPA mencegah mikroplastik dari wadah sekali pakai masuk ke dalam organ pencernaan.\n3. Jangan menunggu merasa haus baru minum; biasakan minum 2-3 teguk air di sela pergantian mata pelajaran.",
    source: "AI Eco-Health Intelligence SMPN 99",
  },
  {
    key: "kualitas-udara-aqi",
    label: "🌫️ Kualitas Udara & Masker Remaja",
    category: "aqi",
    icon: "🌬️",
    title: "🌫️ AI AQI Alert: Solusi Paru-Paru Sehat Remaja Saat Indeks Udara Tinggi",
    summary: "Lindungi pernapasan dari partikel PM2.5 dengan memakai masker medis & membilas mukosa mulut dari tumbler.",
    content: "Analisis perlindungan kualitas udara remaja sekolah:\n\n• Saat Indeks Kualitas Udara (AQI) mencapai zona kuning/oranye (>100), gunakan masker filter saat berangkat dan pulang sekolah.\n• Rajin meminum air putih hangat dari tumbler pribadi untuk mengikis debu halus yang menempel di mukosa tenggorokan.\n• Hindari berdiri di dekat area pembakaran sampah liar yang melepas dioksin berbahaya bagi paru-paru remaja yang sedang berkembang.",
    source: "AI AQI & Environmental Guardian",
  },
  {
    key: "lunchbox-nutrisi",
    label: "🍱 Bekal Lunchbox Bebas Sterofoam",
    category: "kesehatan",
    icon: "🍱",
    title: "🍱 AI Nutrition Guide: Bekal Sehat Lunchbox Bebas Kimia Sterofoam & Plastik",
    summary: "Membawa lunchbox wadah berulang memastikan nutrisi gizi seimbang tanpa kontaminasi panas plastik.",
    content: "Tips nutrisi dan bekal aman untuk remaja sekolah:\n\n• Wadah plastik sekali pakai atau sterofoam saat terpapar makanan panas dapat melepaskan senyawa kimia berbahaya bagi hormon pertumbuhan.\n• Bawa bekal makanan dari rumah dalam wadah lunchbox food-grade (BPA Free) yang berisi sayuran hijau, protein, dan buah-buahan segar.\n• Menggunakan lunchbox berulang hemat hingga Rp 15.000,- per hari sekaligus mengurangi akumulasi sampah TPA.",
    source: "AI Eco-Nutrition Specialist",
  },
  {
    key: "zero-waste-sekolah",
    label: "🌱 Zero Waste & Daur Ulang Remaja",
    category: "lingkungan",
    icon: "♻️",
    title: "🌱 AI Green Tip: Aksi Nyata Zero Waste Remaja SMPN 99 Kurangi Sampah Plastik",
    summary: "Aksi sederhana membawa tempat makan & minum sendiri berdampak menyelamatkan 350+ botol plastik per siswa per tahun.",
    content: "Fakta lingkungan & aksi dampak nyata sekolah:\n\n1. Satu siswa yang konsisten menggunakan tumbler dan lunchbox selama 1 tahun ajaran mencegah lebih dari 350 kemasan sekali pakai terbuang ke lingkungan.\n2. Kumpulkan Eco-Points harian dengan melakukan scan di Pos Scanner Petugas sekolah untuk membawa kelasmu menjadi Jawara Lingkungan.\n3. Salurkan sampah kertas dan kardus bekas ke tempat daur ulang sekolah untuk mendukung ekonomi sirkular.",
    source: "AI Zero Waste Movement",
  },
  {
    key: "postur-duduk-mata",
    label: "🧘‍♂️ Postur Belajar & Mata Remaja",
    category: "kesehatan",
    icon: "👓",
    title: "🧘‍♂️ AI Ergonomic Tip: Jaga Postur Duduk Tegak & Istirahat Mata Saat Belajar",
    summary: "Cegah kelainan tulang belakang & mata lelah dengan aturan 20-20-20 serta duduk tegak simetris.",
    content: "Edukasi kesehatan fisik & ergonomi remaja:\n\n• Duduklah tegak dengan punggung menempel pada sandaran kursi dan kaki menapak rata di lantai untuk mencegah gangguan skoliosis.\n• Jaga jarak mata dengan buku atau HP minimal 30 cm.\n• Terapkan aturan 20-20-20: Setiap 20 menit menatap layar HP/buku, alihkan pandangan mata ke pohon atau daun hijau di luar kelas selama 20 detik.",
    source: "AI Adolescent Health Guide",
  },
];

export function generateAiEcoNews(promptKey?: string): AiPromptTopic {
  if (promptKey) {
    const found = AI_NEWS_PROMPTS.find((p) => p.key === promptKey);
    if (found) return found;
  }
  const randomIndex = Math.floor(Math.random() * AI_NEWS_PROMPTS.length);
  const item = AI_NEWS_PROMPTS[randomIndex];
  if (item) return item;
  const fallback = AI_NEWS_PROMPTS[0];
  if (fallback) return fallback;
  return {
    key: "default",
    label: "🥤 Hidrasi & Tumbler",
    category: "kesehatan",
    icon: "💧",
    title: "🥤 AI Health Tip: Hidrasi 2 Liter Air Putih dari Tumbler",
    summary: "Asupan air putih yang cukup dari tumbler pribadi meningkatkan fokus otak & fungsi sel tubuh.",
    content: "Minum air putih 2 liter per hari dari tumbler pribadi.",
    source: "AI Eco-Health Intelligence SMPN 99",
  };
}
