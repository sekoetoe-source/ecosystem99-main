import { useMemo } from "react";
import QRCode from "qrcode";

const qrSvgCache = new Map<string, string>();

export function generateQrSvg(text: string): string {
  if (!text) return "";
  const cached = qrSvgCache.get(text);
  if (cached) return cached;

  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M", margin: 1 });
    const size = qr.modules.size;
    const data = qr.modules.data;
    let path = "";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (data[r * size + c]) {
          path += `M${c},${r}h1v1h-1z `;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" width="100%" height="100%"><path fill="#000000" d="${path}"/></svg>`;
    qrSvgCache.set(text, svg);
    return svg;
  } catch {
    return "";
  }
}

export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const svg = useMemo(() => generateQrSvg(value), [value]);

  return (
    <div
      className="flex items-center justify-center p-0.5"
      style={{ width: size, height: size }}
    >
      {svg ? (
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          className="size-full flex items-center justify-center [&>svg]:size-full [&>svg]:block"
        />
      ) : (
        <div className="size-full animate-pulse rounded-md bg-muted" />
      )}
    </div>
  );
}