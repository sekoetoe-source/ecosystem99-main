import { supabase } from "@/integrations/supabase/client";

export type EcoNewsCategory = "lingkungan" | "kesehatan" | "sekolah";

export type EcoNewsItem = {
  id: string;
  category: EcoNewsCategory;
  title: string;
  summary: string;
  content: string;
  source?: string;
  date?: string;
  icon?: string;
  badge?: string;
};

export const DEFAULT_ECO_NEWS: EcoNewsItem[] = [
  {
    id: "news-1",
    category: "lingkungan",
    title: "🌿 Kualitas Udara Jakarta Hari Ini & Tips Menjaga Kesehatan Paru Remaja",
    summary: "Pantau indeks AQI Jakarta dan gunakan tumbler stainless untuk mengurangi sampah botol sekali pakai.",
    content: "Polusi udara di DKI Jakarta memerlukan perhatian khusus dari remaja sekolah. Selalu bawa tumbler stainless steel pribadi ke SMPN 99 Jakarta untuk menjaga kelembapan tenggorokan, gunakan masker saat berada di luar ruangan pada pagi hari, dan kurangi penggunaan plastik sekali pakai yang pembakarannya dapat memperburuk kualitas udara.",
    source: "Dinas Lingkungan Hidup DKI Jakarta",
    date: "Hari Ini",
    icon: "🌬️",
    badge: "Lingkungan Jakarta",
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
  },
  {
    id: "news-3",
    category: "sekolah",
    title: "🍱 Kebiasaan Bawa Lunchbox Sekolah: Bebas Mikroplastik & Hemat Uang Jaku",
    summary: "Membawa bekal dari rumah memastikan asupan gizi seimbang dan bebas dari kemasan sterofoam berbahaya.",
    content: "Penggunaan wadah makan berulang (lunchbox) di SMP Negeri 99 Jakarta melindungi makanan dari bahaya lelehan kimia wadah plastik sekali pakai saat terpapar panas. Pastikan bekal sekolahmu mengandung protein, sayuran hijau, dan karbohidrat seimbang untuk energi optimal sepanjang hari.",
    source: "Gerakan Sekolah Sehat SMPN 99",
    date: "Tips Harian",
    icon: "🍱",
    badge: "Kantin Sehat",
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
  },
  {
    id: "news-6",
    category: "lingkungan",
    title: "🌏 Fakta Sampah Plastik Jakarta: 7.500 Ton Sampah Per Hari & Solusi Nyata Sekolah",
    summary: "Setiap langkah kecilmu membawa botol & lunchbox mengurangi beban TPA Bantar Gebang.",
    content: "DKI Jakarta menghasilkan lebih dari 7.500 ton sampah harian. Dengan menjadi bagian dari program School Ecosystem SMPN 99 Jakarta, kamu telah membantu mencegah ribuan sedotan dan botol plastik berakhir di laut dan sungai Jakarta.",
    source: "DLH DKI & Eco-Movement",
    date: "Fakta Lingkungan",
    icon: "🌍",
    badge: "Jakarta Eco",
  },
];

export async function fetchEcoNews(): Promise<EcoNewsItem[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("eco_news")
      .select("id, category, title, summary, content, source, date, icon, badge")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data as EcoNewsItem[];
    }
  } catch (_) {
    // Fallback jika tabel supabase belum dibuat
  }
  return DEFAULT_ECO_NEWS;
}

export function getCategoryBadgeStyle(category: EcoNewsCategory) {
  switch (category) {
    case "lingkungan":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "kesehatan":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
    case "sekolah":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    default:
      return "bg-primary/15 text-primary border-primary/30";
  }
}
