import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Info,
  Leaf,
  Pause,
  Play,
  Sparkles,
  X,
} from "lucide-react";
import {
  fetchEcoNews,
  getCategoryBadgeStyle,
  type EcoNewsItem,
  DEFAULT_ECO_NEWS,
} from "@/lib/ecoNewsService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface EcoNewsTickerProps {
  compact?: boolean;
  className?: string;
}

export function EcoNewsTicker({ compact = false, className = "" }: EcoNewsTickerProps) {
  const { data: newsItems = DEFAULT_ECO_NEWS } = useQuery({
    queryKey: ["eco-news-items"],
    queryFn: fetchEcoNews,
    staleTime: 1000 * 60 * 5, // 5 menit
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedNews, setSelectedNews] = useState<EcoNewsItem | null>(null);

  // Auto-advance interval
  useEffect(() => {
    if (isPaused || newsItems.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % newsItems.length);
    }, 6000); // 6 detik per slide
    return () => clearInterval(interval);
  }, [isPaused, newsItems.length]);

  const activeItem = newsItems[currentIndex] || newsItems[0];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % newsItems.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + newsItems.length) % newsItems.length);
  };

  if (!activeItem) return null;

  return (
    <>
      <div
        className={`w-full overflow-hidden bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white shadow-md transition-all ${
          compact ? "py-1.5 px-3 text-xs" : "py-2 px-4 border-b border-emerald-800/40"
        } ${className}`}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Label Live Info */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-extrabold tracking-wider uppercase text-[10px] sm:text-xs text-emerald-300 flex items-center gap-1.5 bg-emerald-900/60 px-2.5 py-1 rounded-full border border-emerald-500/30 shadow-inner">
              <Sparkles className="size-3 text-amber-300 animate-pulse" />
              <span>Info Sehat & Lingkungan</span>
            </span>
          </div>

          {/* Headline Berjalan (Running Text Content) */}
          <div className="flex-1 overflow-hidden cursor-pointer group" onClick={() => setSelectedNews(activeItem)}>
            <div className="flex items-center gap-2.5 transition-all duration-500 ease-in-out transform">
              <span className="text-base sm:text-lg shrink-0">{activeItem.icon || "🌿"}</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadgeStyle(
                  activeItem.category
                )}`}
              >
                {activeItem.badge || activeItem.category}
              </span>
              <p className="text-xs sm:text-sm font-semibold truncate group-hover:text-emerald-300 transition-colors">
                {activeItem.title}
              </p>
              <span className="hidden md:inline-block text-xs text-emerald-200/70 truncate max-w-xs">
                — {activeItem.summary}
              </span>
              <span className="hidden lg:inline-flex text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded-full font-bold transition-all ml-1">
                Baca Detail →
              </span>
            </div>
          </div>

          {/* Controls: Prev, Pause/Play, Next */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1 rounded-full hover:bg-white/15 text-emerald-200 transition-colors"
              title="Berita Sebelumnya"
            >
              <ChevronLeft className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPaused((v) => !v)}
              className="p-1 rounded-full hover:bg-white/15 text-emerald-200 transition-colors"
              title={isPaused ? "Putar Berita" : "Jeda Berita"}
            >
              {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="p-1 rounded-full hover:bg-white/15 text-emerald-200 transition-colors"
              title="Berita Selanjutnya"
            >
              <ChevronRight className="size-4" />
            </button>

            <span className="hidden sm:inline-block text-[10px] text-emerald-300/60 font-mono ml-1">
              {currentIndex + 1}/{newsItems.length}
            </span>
          </div>
        </div>
      </div>

      {/* Modal Detail Berita / Tips Kesehatan & Lingkungan */}
      <Dialog open={!!selectedNews} onOpenChange={(open) => !open && setSelectedNews(null)}>
        {selectedNews && (
          <DialogContent className="max-w-xl rounded-2xl border-emerald-500/20 bg-background p-6">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{selectedNews.icon || "🌿"}</span>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold border ${getCategoryBadgeStyle(
                    selectedNews.category
                  )}`}
                >
                  {selectedNews.badge || selectedNews.category}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {selectedNews.date}
                </span>
              </div>
              <DialogTitle className="text-xl font-extrabold leading-snug text-foreground">
                {selectedNews.title}
              </DialogTitle>
              <DialogDescription className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                {selectedNews.summary}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="p-4 rounded-xl bg-muted/60 border border-border text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                {selectedNews.content}
              </div>

              {selectedNews.source && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 p-3 rounded-xl border border-primary/10">
                  <span className="flex items-center gap-1.5 font-semibold text-primary">
                    <Info className="size-4" /> Sumber Informasi & Tips:
                  </span>
                  <span className="font-bold">{selectedNews.source}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                  <Leaf className="size-4" /> SMP Negeri 99 Jakarta Eco-Care
                </div>
                <Button variant="default" size="sm" onClick={() => setSelectedNews(null)}>
                  Tutup Informasi
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
