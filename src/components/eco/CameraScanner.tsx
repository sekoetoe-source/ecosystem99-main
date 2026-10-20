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
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    (async () => {
      let started = false;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode(containerId);
        scanner = instance as unknown as { stop: () => Promise<void>; clear: () => void };

        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (rawText) => {
            const text = rawText.trim();
            if (!text || isLockedRef.current) return;
            const now = Date.now();
            if (lastScannedCodeRef.current === text && now - lastScannedTimeRef.current < 2500)
              return;
            lastScannedCodeRef.current = text;
            lastScannedTimeRef.current = now;
            onResultRef.current(text);
          },
          () => {},
        );
        started = true;
        if (cancelled) await instance.stop();
      } catch {
        if (!cancelled) setError("Kamera tidak dapat diakses. Gunakan input NIS manual.");
      } finally {
        if (cancelled && started) {
          try {
            await scanner?.stop();
          } catch {
            // Scanner may already be stopped by the library during teardown.
          }
          try {
            scanner?.clear();
          } catch {
            // The container may already have been removed.
          }
        }
      }
    })();

    return () => {
      cancelled = true;
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
