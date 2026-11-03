import { useEffect, useRef, useState } from "react";
import { RefreshCw, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CameraScanner({
  active,
  isLocked = false,
  onResult,
}: {
  active: boolean;
  isLocked?: boolean;
  onResult: (text: string) => void;
}) {
  const containerId = "eco-qr-reader";
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    let scannerInstance: {
      stop: () => Promise<void>;
      clear: () => void;
      isScanning?: boolean;
    } | null = null;
    let isCancelled = false;

    const stopScanner = async () => {
      isCancelled = true;
      if (!scannerInstance) return;
      try {
        if (scannerInstance.isScanning) {
          await scannerInstance.stop();
        }
      } catch {
        // html5-qrcode can report already stopped
      }
      try {
        scannerInstance.clear();
      } catch {
        // container might be removed
      }
      scannerInstance = null;
    };

    (async () => {
      setIsInitializing(true);
      setError(null);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Perangkat atau browser ini tidak mendukung akses kamera (getUserMedia tidak tersedia).");
        }

        const { Html5Qrcode } = await import("html5-qrcode");
        if (isCancelled) return;

        const qrSuccessCallback = (rawText: string) => {
          const text = rawText.trim();
          if (!text || isLockedRef.current) return;
          const now = Date.now();
          if (lastScannedCodeRef.current === text && now - lastScannedTimeRef.current < 2500)
            return;
          lastScannedCodeRef.current = text;
          lastScannedTimeRef.current = now;
          onResultRef.current(text);
        };

        const qrConfig = { fps: 10, qrbox: { width: 240, height: 240 } };

        // 1. Dapatkan daftar kamera fisik yang tersedia
        let targetCamera: string | { facingMode: string } = { facingMode: "environment" };
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            const rearCamera = cameras.find((c) =>
              /back|rear|belakang|environment/i.test(c.label),
            );
            targetCamera = rearCamera ? rearCamera.id : cameras[0].id;
          }
        } catch {
          // getCameras mungkin gagal jika izin belum diberikan atau batasan browser, gunakan fallback
          targetCamera = { facingMode: "environment" };
        }

        if (isCancelled) return;

        // 2. Buat instance dan mulai scanner
        let instance = new Html5Qrcode(containerId);
        scannerInstance = instance;

        let started = false;
        try {
          await instance.start(targetCamera, qrConfig, qrSuccessCallback, () => {});
          started = true;
        } catch (firstErr) {
          // Jika gagal (misal OverconstrainedError pada environment kamera laptop), bersihkan dan gunakan instance baru
          try {
            instance.clear();
          } catch {}

          if (!isCancelled) {
            instance = new Html5Qrcode(containerId);
            scannerInstance = instance;
            try {
              await instance.start({ facingMode: "user" }, qrConfig, qrSuccessCallback, () => {});
              started = true;
            } catch (secondErr) {
              throw secondErr || firstErr;
            }
          }
        }

        if (isCancelled && started) {
          await stopScanner();
        }
      } catch (reason) {
        if (!isCancelled) {
          const rawMsg = reason instanceof Error ? reason.message : String(reason);
          const lower = rawMsg.toLowerCase();

          let friendlyMessage: string;
          if (
            lower.includes("permission") ||
            lower.includes("notallowed") ||
            lower.includes("denied")
          ) {
            friendlyMessage =
              "Izin kamera belum diberikan. Klik ikon gembok / kamera di sebelah kiri alamat web browser (URL), pilih 'Izinkan' (Allow) untuk kamera, lalu klik tombol 'Coba Lagi'.";
          } else if (
            lower.includes("notfound") ||
            lower.includes("devicesnotfound") ||
            lower.includes("no camera")
          ) {
            friendlyMessage =
              "Perangkat kamera tidak terdeteksi pada laptop/komputer ini. Pastikan webcam terpasang atau gunakan input NIS manual siswa.";
          } else if (
            lower.includes("notreadable") ||
            lower.includes("in use") ||
            lower.includes("trackstart")
          ) {
            friendlyMessage =
              "Kamera sedang digunakan oleh aplikasi lain (misal Zoom/Meet). Tutup aplikasi tersebut lalu klik 'Coba Lagi'.";
          } else {
            friendlyMessage =
              "Kamera tidak tersedia atau gagal dimulai. Pastikan izin kamera aktif pada browser atau gunakan input NIS manual.";
          }
          setError(friendlyMessage);
        }
      } finally {
        setIsInitializing(false);
      }
    })();

    return () => {
      isCancelled = true;
      void stopScanner();
    };
  }, [active, retryCount]);

  return (
    <div className="space-y-3">
      <div
        id={containerId}
        className="overflow-hidden rounded-2xl border border-border bg-muted relative"
        style={{ minHeight: active ? 260 : 0 }}
      >
        {isInitializing && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-background shadow border border-border flex items-center gap-2">
              <Camera className="size-3.5 animate-pulse text-primary" />
              Menghubungkan kamera...
            </span>
          </div>
        )}
        {isLocked && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center z-10">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-background/80 shadow border border-border">
              Memproses scan...
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
          <p className="leading-relaxed">{error}</p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRetryCount((c) => c + 1)}
              className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="size-3" /> Coba Lagi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
