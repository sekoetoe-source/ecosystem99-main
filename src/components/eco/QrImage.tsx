import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-card p-4 shadow-lift"
      style={{ width: size + 32, height: size + 32 }}
    >
      {src ? (
        <img src={src} alt={`QR Code ${value}`} width={size} height={size} />
      ) : (
        <div className="size-full animate-pulse rounded-xl bg-muted" />
      )}
    </div>
  );
}