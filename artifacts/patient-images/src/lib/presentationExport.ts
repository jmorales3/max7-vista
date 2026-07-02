import jsPDF from "jspdf";
import PptxGenJS from "pptxgenjs";
import type { Slide } from "@/components/PresentationBuilder";

const SLIDE_W = 1280;
const SLIDE_H = 720;

function imageUrl(id: number) {
  return `/api/images/${id}/file`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(w / imgW, h / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function loadVideoFrame(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const onError = () => reject(new Error("Failed to load video"));
    video.addEventListener("error", onError, { once: true });
    video.addEventListener(
      "loadeddata",
      () => {
        video.currentTime = Math.min(0.1, video.duration || 0.1);
      },
      { once: true },
    );
    video.addEventListener("seeked", () => resolve(), { once: true });
  });
  return video;
}

async function renderSlideToCanvas(slide: Slide): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

  if (slide.type === "single") {
    const img = await loadImage(imageUrl(slide.imageId));
    drawContain(ctx, img, img.naturalWidth, img.naturalHeight, 0, 0, SLIDE_W, SLIDE_H);
  } else if (slide.type === "video") {
    try {
      const video = await loadVideoFrame(imageUrl(slide.imageId));
      drawContain(ctx, video, video.videoWidth, video.videoHeight, 0, 0, SLIDE_W, SLIDE_H);
    } catch {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
    }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(SLIDE_W / 2, SLIDE_H / 2, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.moveTo(SLIDE_W / 2 - 16, SLIDE_H / 2 - 26);
    ctx.lineTo(SLIDE_W / 2 - 16, SLIDE_H / 2 + 26);
    ctx.lineTo(SLIDE_W / 2 + 32, SLIDE_H / 2);
    ctx.closePath();
    ctx.fill();
  } else if (slide.type === "compare") {
    const [before, after] = await Promise.all([
      loadImage(imageUrl(slide.beforeId)),
      loadImage(imageUrl(slide.afterId)),
    ]);
    const half = SLIDE_W / 2;
    drawContain(ctx, before, before.naturalWidth, before.naturalHeight, 0, 0, half, SLIDE_H);
    drawContain(ctx, after, after.naturalWidth, after.naturalHeight, half, 0, half, SLIDE_H);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, SLIDE_H);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(12, 12, 96, 30);
    ctx.fillRect(SLIDE_W - 108, 12, 96, 30);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("BEFORE", 24, 33);
    ctx.fillText("AFTER", SLIDE_W - 94, 33);
  } else if (slide.type === "superimpose") {
    const [base, overlay] = await Promise.all([
      loadImage(imageUrl(slide.baseId)),
      loadImage(imageUrl(slide.overlayId)),
    ]);
    const bs = Math.min(SLIDE_W / base.naturalWidth, SLIDE_H / base.naturalHeight);
    const bW = base.naturalWidth * bs;
    const bH = base.naturalHeight * bs;
    const bx = (SLIDE_W - bW) / 2;
    const by = (SLIDE_H - bH) / 2;
    ctx.drawImage(base, bx, by, bW, bH);

    const os = bs * slide.overlayScaleCorrection;
    const oW = overlay.naturalWidth * os;
    const oH = overlay.naturalHeight * os;
    const scaleFactor = slide.overlayBaseScale ? bs / slide.overlayBaseScale : 1;
    ctx.globalAlpha = slide.overlayOpacity;
    ctx.drawImage(
      overlay,
      (SLIDE_W - oW) / 2 + slide.overlayOffsetX * scaleFactor,
      (SLIDE_H - oH) / 2 + slide.overlayOffsetY * scaleFactor,
      oW,
      oH,
    );
    ctx.globalAlpha = 1;
  }

  return canvas;
}

function sanitizeFilename(name: string): string {
  return (name || "presentation").replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "presentation";
}

export async function exportPresentationToPdf(title: string, slides: Slide[]): Promise<void> {
  if (slides.length === 0) throw new Error("No slides to export");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [SLIDE_W, SLIDE_H] });
  for (let i = 0; i < slides.length; i++) {
    const canvas = await renderSlideToCanvas(slides[i]);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], "landscape");
    pdf.addImage(dataUrl, "JPEG", 0, 0, SLIDE_W, SLIDE_H);
  }
  pdf.save(`${sanitizeFilename(title)}.pdf`);
}

export async function exportPresentationToPptx(title: string, slides: Slide[]): Promise<void> {
  if (slides.length === 0) throw new Error("No slides to export");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "GALLERY_16x9", width: 13.333, height: 7.5 });
  pptx.layout = "GALLERY_16x9";
  for (const slide of slides) {
    const canvas = await renderSlideToCanvas(slide);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const s = pptx.addSlide();
    s.addImage({ data: dataUrl, x: 0, y: 0, w: 13.333, h: 7.5 });
  }
  await pptx.writeFile({ fileName: `${sanitizeFilename(title)}.pptx` });
}
