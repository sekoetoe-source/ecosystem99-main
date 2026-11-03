import { useEffect, useRef, useState } from "react";

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
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    let scannerInstance: {
      start: (...args: any[]) => Promise<any>;
      stop: () => Promise<void>;
      clear: () => void;
      isScanning?: boolean;
    } | null = null;
    let isCancelled = false;
    let isStarting = false;
    let isStopped = false;

    const stopScanner = async () => {
      isCancelled = true;
      if (isStarting) return;
      if (!scannerInstance || isStopped) return;
      isStopped = true;
      try {
        if (scannerInstance.isScanning) {
          await scannerInstance.stop();
        }
      } catch {
        // html5-qrcode can report an already-stopped instance during teardown.
      }
      try {
        scannerInstance.clear();
      } catch {
        // The container may already have been removed.
      }
    };

    (async () => {
      isStarting = true;
      setError(null);
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (isCancelled) {
          isStarting = false;
          return;
        }

        const instance = new Html5Qrcode(containerId);
        scannerInstance = instance;

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

        // Attempt 1: Strict environment facing mode (ideal for mobile back camera)
        let started = false;
        try {
          await instance.start(
            { facingMode: "environment" },
            qrConfig,
            qrSuccessCallback,
            () => {},
          );
          started = true;
        } catch {
          // Attempt 2: Query enumerated devices and select rear camera or first available camera
          if (!isCancelled) {
            try {
              const cameras = await Html5Qrcode.getCameras();
              if (cameras && cameras.length > 0) {
                const backCam = cameras.find((c) =>
                  /back|rear|belakang|environment/i.test(c.label),
                );
                const targetCameraId = backCam ? backCam.id : cameras[0].id;
                await instance.start(targetCameraId, qrConfig, qrSuccessCallback, () => {});
                started = true;
              } else {
                // Attempt 3: User facing mode fallback (laptop/front camera)
                await instance.start(
                  { facingMode: "user" },
                  qrConfig,
                  qrSuccessCallback,
                  () => {},
                );
                started = true;
              }
            } catch (fallbackErr) {
              try {
                await instance.start(
                  { facingMode: "user" },
                  qrConfig,
                  qrSuccessCallback,
                  () => {},
                );
                started = true;
              } catch {
                throw fallbackErr;
              }
            }
          }
        }

        isStarting = false;
        if (isCancelled && started) {
          await stopScanner();
        }
      } catch (reason) {
        isStarting = false;
        if (!isCancelled) {
          const message =
            reason instanceof Error ? reason.message.toLowerCase() : String(reason).toLowerCase();
          const detail =
            message.includes("permission") || message.includes("notallowed")
              ? "Izin kamera ditolak. Berikan izin kamera pada browser Anda atau gunakan input NIS manual."
              : message.includes("notfound") ||
                  message.includes("devicesnotfound") ||
                  message.includes("no camera")
                ? "Perangkat kamera tidak ditemukan. Gunakan input NIS manual."
                : "Kamera tidak tersedia atau gagal dimulai. Gunakan input NIS manual.";
          setError(detail);
        }
      }
    })();

    return () => {
      isCancelled = true;
      void stopScanner();
    };
  }, [active]);

  return (
    <div className="space-y-2">
      <div
        id={containerId}
        className="overflow-hidden rounded-2xl border border-border bg-muted relative"
        style={{ minHeight: active ? 260 : 0 }}
      >
        {isLocked && (
          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center z-10">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-background/80 shadow border border-border">
              Memproses scan...
            </span>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
