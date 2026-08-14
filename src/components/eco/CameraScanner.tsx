import { useEffect, useRef, useState } from "react";

export function CameraScanner({
  active,
  onResult,
}: {
  active: boolean;
  onResult: (text: string) => void;
}) {
  const containerId = "eco-qr-reader";
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!active) return;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode(containerId);
        scanner = instance as unknown as { stop: () => Promise<void>; clear: () => void };
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => onResultRef.current(text),
          () => {},
        );
        if (cancelled) await instance.stop();
      } catch {
        if (!cancelled) setError("Kamera tidak dapat diakses. Gunakan input NIS manual.");
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop().then(() => scanner?.clear()).catch(() => {});
    };
  }, [active]);

  return (
    <div className="space-y-2">
      <div
        id={containerId}
        className="overflow-hidden rounded-2xl border border-border bg-muted"
        style={{ minHeight: active ? 260 : 0 }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}