function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadImagesZip(imageIds: number[]): Promise<void> {
  const res = await fetch("/api/images/export-zip", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Export failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = `gallery_export_${new Date().toISOString().slice(0, 10)}.zip`;
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match?.[1]) {
    try {
      filename = decodeURIComponent(match[1]);
    } catch {
      filename = match[1];
    }
  }
  triggerBlobDownload(blob, filename);
}

export interface DownloadableImage {
  url: string;
  fileName: string;
}

export async function downloadImagesIndividually(items: DownloadableImage[]): Promise<void> {
  for (const item of items) {
    try {
      const res = await fetch(item.url, { credentials: "include" });
      if (!res.ok) continue;
      const blob = await res.blob();
      triggerBlobDownload(blob, item.fileName);
      await new Promise((r) => setTimeout(r, 350));
    } catch {
      // best-effort — continue with remaining images
    }
  }
}
