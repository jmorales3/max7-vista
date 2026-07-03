import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ServerAddressQr({ value, size = 176 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="rounded-md border bg-muted animate-pulse"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR code for clinic server address"
      width={size}
      height={size}
      className="rounded-md border bg-white p-2"
    />
  );
}
