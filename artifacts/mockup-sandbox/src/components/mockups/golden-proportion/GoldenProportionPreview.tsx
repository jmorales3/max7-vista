import { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, GripVertical } from "lucide-react";

const PHI = 1.6180339887;

function drawScene(
  canvas: HTMLCanvasElement,
  showGolden: boolean,
  lineColor: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background — faint grid like the editor
  ctx.fillStyle = "#f8f8f8";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // A sample straight line
  const x1 = 80, y1 = H / 2 - 30;
  const x2 = W - 80, y2 = H / 2 + 30;

  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // End-point dots
  for (const [px, py] of [[x1, y1], [x2, y2]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
  }

  if (showGolden) {
    // Golden proportion marker: smaller segment = total / PHI  (≈ 0.618 × total)
    // Marker sits at 0.618 from x1 toward x2
    const t = 1 / PHI; // ≈ 0.618
    const mx = x1 + (x2 - x1) * t;
    const my = y1 + (y2 - y1) * t;

    // Perpendicular tick
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const perp = angle + Math.PI / 2;
    const tickLen = 10;

    ctx.beginPath();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.moveTo(mx + Math.cos(perp) * tickLen, my + Math.sin(perp) * tickLen);
    ctx.lineTo(mx - Math.cos(perp) * tickLen, my - Math.sin(perp) * tickLen);
    ctx.stroke();

    // Small filled circle at the marker
    ctx.beginPath();
    ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();

    // Φ label above the marker
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#92400e";
    ctx.fillText("φ", mx, my - tickLen - 3);

    // Dimension annotations — smaller segment label
    const smMidX = x1 + (mx - x1) / 2;
    const smMidY = y1 + (my - y1) / 2;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#92400e";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const offsetX = Math.cos(perp) * 18;
    const offsetY = Math.sin(perp) * 18;
    ctx.fillText("0.618×", smMidX + offsetX, smMidY + offsetY);

    const lgMidX = mx + (x2 - mx) / 2;
    const lgMidY = my + (y2 - my) / 2;
    ctx.fillText("1×", lgMidX + offsetX, lgMidY + offsetY);
  }
}

export function GoldenProportionPreview() {
  const [showGolden, setShowGolden] = useState(true);
  const [zoom] = useState(100);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const LINE_COLOR = "#3b82f6";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawScene(canvas, showGolden, LINE_COLOR);
  }, [showGolden]);

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center p-6">
      <div className="relative w-[680px] h-[380px] rounded-xl shadow-xl overflow-hidden border border-slate-300">

        {/* Canvas area */}
        <canvas
          ref={canvasRef}
          width={680}
          height={380}
          className="absolute inset-0"
        />

        {/* Floating HUD — matches the real editor panel style */}
        <div
          className="absolute bottom-4 left-4 z-10 bg-white border border-slate-200 rounded-lg shadow-lg select-none"
          style={{ minWidth: 148 }}
        >
          {/* Drag handle */}
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-slate-100 cursor-grab">
            <GripVertical className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              Line Tool
            </span>
          </div>

          {/* Stroke colour swatch */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-100">
            <span className="text-[11px] text-slate-500">Color</span>
            <div
              className="w-5 h-5 rounded-full border border-slate-300 ml-auto"
              style={{ background: LINE_COLOR }}
            />
          </div>

          {/* Zoom row */}
          <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-100">
            <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100">
              <ZoomOut className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <span className="text-xs font-mono w-10 text-center text-slate-700">
              {zoom}%
            </span>
            <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100">
              <ZoomIn className="h-3.5 w-3.5 text-slate-600" />
            </button>
          </div>

          {/* ── Golden Proportion toggle ── */}
          <div className="px-2.5 py-2 border-b border-slate-100">
            <button
              onClick={() => setShowGolden((v) => !v)}
              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                showGolden
                  ? "bg-amber-50 text-amber-800 border border-amber-300"
                  : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {/* Phi symbol */}
              <span
                className={`text-sm font-bold leading-none ${
                  showGolden ? "text-amber-500" : "text-slate-400"
                }`}
              >
                φ
              </span>
              <span>Golden Proportion</span>
              {/* Toggle pill */}
              <div
                className={`ml-auto w-7 h-4 rounded-full transition-colors flex items-center px-0.5 ${
                  showGolden ? "bg-amber-400" : "bg-slate-300"
                }`}
              >
                <div
                  className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    showGolden ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Utilities placeholder */}
          <div className="px-2.5 py-1.5">
            <button className="w-full text-left text-[11px] text-slate-400 hover:text-slate-600 py-0.5">
              Clear annotations
            </button>
            <button className="w-full text-left text-[11px] text-slate-400 hover:text-slate-600 py-0.5">
              Undo
            </button>
          </div>
        </div>

        {/* Callout label */}
        {showGolden && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 shadow-sm pointer-events-none">
            <p className="text-[11px] text-amber-800 font-medium text-center">
              φ marker at 61.8% — smaller : larger = 0.618 : 1
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
