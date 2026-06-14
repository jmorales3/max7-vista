---
name: Max7 Feature Transfer Register
description: Confirmed working features in Max7 Vista to be replicated in Max7's image management section.
---

# Max7 Vista → Max7 Feature Transfer Register

This file is maintained by the Vista agent. Each entry records a feature that has been built and confirmed working in Vista, along with enough detail for the Max7 agent to replicate it faithfully.

---

## FEAT-001 — Annotation Undo History (Ctrl+Z)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-02  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Allows the user to undo the last annotation (stroke, shape, text, etc.) one step at a time, without clearing everything. A separate "Clear all" button still exists to wipe all annotations at once. "Clear all" is also undoable.

### How it works
1. A `useRef<Annotation[][]>` stack (`annotationHistoryRef`) stores snapshots of the annotations array, capped at 50 entries.
2. A `pushHistory()` helper (wrapped in `useCallback`) pushes a shallow copy of `annotationsRef.current` onto the stack and sets `canUndo = true`.
3. `undoAnnotation()` pops the last snapshot, calls `setAnnotations(prev)`, and updates `canUndo`.
4. `pushHistory()` is called immediately before every `setAnnotations` that adds or modifies annotations:
   - Pen / eraser freehand strokes (`DrawLine`)
   - Arrow (`DrawArrow`)
   - Circle (`DrawCircle`)
   - Straight line (`DrawStraightLine`)
   - Ruler (`DrawRuler`)
   - Angle marker (`DrawAngle`)
   - Text placement (`DrawText`)
   - Text drag-move (pointer tool repositioning a text annotation)
   - Clear All (so the clear itself can be undone)
5. A `useEffect` binds `Ctrl+Z` / `Cmd+Z` globally; it skips the action when focus is inside an `<input>`, `<textarea>`, or `contentEditable` element.
6. An **Undo** button (`Undo2` icon from lucide-react) is added to the editor toolbar, `disabled={!canUndo}`.

### Key state/refs added
```typescript
const [canUndo, setCanUndo] = useState(false);
const annotationHistoryRef = useRef<Annotation[][]>([]);
```

### i18n keys added (all 4 locales: en / es / fr / pt)
| Key | en | es | fr | pt |
|-----|----|----|----|----|
| `editor.undoAnnotation` | Undo | Deshacer | Annuler | Desfazer |
| `editor.clearAnnotations` | Clear all | Limpiar todo | Tout effacer | Limpar tudo |

### Notes for Max7 agent
- The annotation data model in Vista uses a discriminated union (`type` field). If Max7 uses a different shape model, adapt `pushHistory` accordingly — the logic is identical.
- The history stack deliberately excludes image-destructive operations (crop, smooth-blur, cut/paste floater) because those modify `imgRef` directly rather than the annotations array; those are separate undo concerns.
- Cap the history at 50 to keep memory reasonable; adjust as needed.

---

## FEAT-002 — Select/Move Tool Improvements (Freehand, Copy Mode, Floater Border)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-03  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Three improvements to the select/move tool:
1. **Freehand (lasso) selection is the default** — the user draws a free outline around the area instead of a rectangle. Rectangle mode is still available via the toolbar toggle.
2. **Move vs Copy toggle** — in **Move** mode the source area is blanked out (white hole) after lifting the selection; in **Copy** mode the source stays intact and only a floating copy is placed.
3. **Dashed orange border on the floating selection** — the lifted region has a visible `2px dashed #f97316` CSS outline so the user can see exactly what is floating. The border disappears when "Apply" commits it.

### How it works

**Freehand default:**
```typescript
const [selectMode, setSelectMode] = useState<"rect" | "freehand">("freehand");
```

**Move / Copy state:**
```typescript
const [selectTransferMode, setSelectTransferMode] = useState<"cut" | "copy">("cut");
```

**On pointerUp — freehand commit:**
```typescript
if (selectTransferMode === "cut") {
  // fill freehand shape with white on canvas
  ctx.fill();
  setCutPath(path);
  setCutRect({ x: bx, y: by, w: bw, h: bh });
}
setFloater({ dataUrl, x: bx, y: by, w: bw, h: bh });
```

**On pointerUp — rect commit:**
```typescript
if (selectTransferMode === "cut") {
  ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
  setCutRect(sel);
}
setFloater({ dataUrl, x: sel.x, y: sel.y, w: sel.w, h: sel.h });
```

**cancelSelection** — skips image reload in copy mode (nothing was modified):
```typescript
if (selectTransferMode === "copy") {
  setCutRect(null); setCutPath(null); setFloater(null); setSelectionRect(null);
  preCutStateRef.current = null;
  return;
}
// cut mode: reload imgRef from preCutStateRef.imgSrc to restore white hole
```

**applyFloater** — naturally handles copy mode since `cutRect`/`cutPath` are null (never set); no changes needed.

**Floater div — dashed border:**
```jsx
style={{ outline: "2px dashed #f97316", outlineOffset: "1px", cursor: "move", zIndex: 20 }}
```

**Toolbar** — two side-by-side toggles visible when `tool === "select" && !floater`:
- Shape toggle: `<RectangleHorizontal>` / `<Lasso>` icon buttons
- Transfer toggle: "Move" / "Copy" text buttons (h-7 px-2 text-xs)

### i18n keys added (all 4 locales: en / es / fr / pt)
| Key | en | es | fr | pt |
|-----|----|----|----|----|
| `editor.selectTransferCut` | Move | Mover | Déplacer | Mover |
| `editor.selectTransferCopy` | Copy | Copiar | Copier | Copiar |

### Notes for Max7 agent
- `cutRect` / `cutPath` are **only set in cut mode** — `applyFloater` and `cancelSelection` read these; if both are null, no white hole is drawn automatically.
- The dashed orange lasso path during drawing is on `cursorCanvasRef` (the cursor canvas), cleared by `clearBrushCursor()` on pointerUp. This is separate from the floater div outline.
- The floater's `outline` CSS is a simple static dashed border — no marching-ants animation required.

---

## FEAT-003 — Freehand Floater: SVG Polygon Border

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-03  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
After a freehand lasso selection is lifted into a floater, the dashed orange border traces the **exact drawn outline** (not the rectangular bounding box). Rectangle selections keep their rectangular border.

### How it works
1. Store the freehand path in **floater-local coordinates** when creating the floater:
   ```typescript
   const localPath = path.map(p => [p[0] - bx, p[1] - by] as [number, number]);
   setFloater({ dataUrl, x: bx, y: by, w: bw, h: bh, path: localPath });
   ```
2. Extend the floater type: `path?: [number, number][]`
3. Inside the floater `<div>`, render an SVG overlay when `floater.path` exists:
   ```jsx
   {floater.path && (
     <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
       width={floater.w} height={floater.h}>
       <polygon
         points={floater.path.map(([x, y]) => `${x},${y}`).join(" ")}
         fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5,4"
       />
     </svg>
   )}
   ```
4. The `div` outline is `"none"` when `floater.path` exists, `"2px dashed #f97316"` otherwise (rect mode).
5. The SVG uses `overflow: visible` so the stroke renders outside the bounding box if the path is near the edge.
6. Since the SVG is inside the floater div, it automatically moves with the floater during drag.

### Notes for Max7 agent
- `bx/by` = min x/y of the freehand path; local coords = `path[i] - [bx, by]`.
- For rect selections, `path` is not set on the floater — use CSS `outline` instead.

---

## FEAT-004 — Paste Image from Clipboard (Ctrl+V)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-03  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Reads an image from the system clipboard and places it as a draggable floater centered on the canvas. Works within the same image or across different images/patients. Triggered by Ctrl+V (Cmd+V on Mac) or a toolbar "Paste" button.

### How it works
```typescript
async function pasteFromClipboard() {
  if (floater) { toast({ title: "Apply or cancel first" }); return; }
  const items = await navigator.clipboard.read();
  let blob: Blob | null = null;
  for (const item of items) {
    const imageType = item.types.find(t => t.startsWith("image/"));
    if (imageType) { blob = await item.getType(imageType); break; }
  }
  if (!blob) { toast({ title: "Nothing to paste" }); return; }
  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    // Scale to fit 80% of canvas
    let w = img.naturalWidth, h = img.naturalHeight;
    const ratio = Math.min((cw * 0.8) / w, (ch * 0.8) / h);
    if (ratio < 1) { w = Math.round(w * ratio); h = Math.round(h * ratio); }
    // Center
    const x = Math.round((cw - w) / 2), y = Math.round((ch - h) / 2);
    const reader = new FileReader();
    reader.onload = () => {
      setFloater({ dataUrl: reader.result as string, x, y, w, h });
      setTool("select");
    };
    reader.readAsDataURL(blob!);
  };
  img.src = objectUrl;
}
```

**Keyboard shortcut** — separate `useEffect` that re-registers when `floater` changes (fresh closure):
```typescript
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (!((e.ctrlKey || e.metaKey) && e.key === "v")) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    e.preventDefault();
    pasteFromClipboard();
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [floater]);
```

**Toolbar button** — `<ClipboardPaste>` icon next to Undo.

### i18n keys added (all 4 locales)
| Key | en | es | fr | pt |
|-----|----|----|----|----|
| `editor.pasteFromClipboard` | Paste | Pegar | Coller | Colar |
| `editor.clipboardEmpty` | Nothing to paste | Nada que pegar | Rien à coller | Nada para colar |
| `editor.clipboardReadFailed` | Could not read clipboard | … | … | … |
| `editor.pasteApplyFirst` | Apply or cancel the current selection first | … | … | … |

### Notes for Max7 agent
- `navigator.clipboard.read()` requires `clipboard-read` permission — browser prompts the first time on HTTPS.
- The pasted image goes through the same floater workflow as a copied selection (drag, apply, cancel all work the same way).
- Cross-image paste works because the clipboard is OS-level — paste from a completely different image.

---

## FEAT-005 — Toolbar Overflow Fix (overflow-x-auto)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-03  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Prevents toolbar buttons from being hidden when tool-specific context controls push the toolbar past the container width.

### Root cause
The toolbar left section used `flex-wrap`. In narrow viewports (≤700px), extra context controls (select-mode toggles, ruler controls, etc.) caused the row to wrap onto a second line that was **clipped by the parent's fixed `h-14` height**. Buttons like Smooth, Undo, Paste would silently disappear.

### Fix
```jsx
// Before
<div className="flex items-center gap-2 flex-wrap">
// After
<div className="flex items-center gap-2 overflow-x-auto min-w-0">
```

Single-line change. All content stays on one row; the bar scrolls horizontally if it gets too wide.

### Notes for Max7 agent
- Apply `overflow-x-auto min-w-0` (not `flex-wrap`) on any fixed-height toolbar left section.
- `min-w-0` prevents flex children from overflowing without triggering the scroll.

---

## FEAT-006 — Direct-to-GCS Upload (Bypass Replit Proxy)

**Status:** ✅ Confirmed working in Vista (production)
**Date:** 2026-06-04
**Vista files:**
- `artifacts/patient-images/src/lib/upload.ts` — client-side three-step flow
- `artifacts/api-server/src/lib/gcsStorage.ts` — `getSignedUploadUrl()` added
- `artifacts/api-server/src/routes/images.ts` — two new endpoints added

### Why this was needed
The Replit deployment proxy stalls large POST bodies (JSON+base64 or multipart) before they reach the Express server. This causes a silent timeout with no error in server logs. Any image upload that goes through the proxy will fail in production for files over ~100 KB.

### Architecture — three steps, all tiny except the GCS PUT

```
Browser                     API Server              Google Cloud Storage
  │                              │                          │
  │ POST /api/images/upload-url  │                          │
  │ { fileName, mimeType,        │                          │
  │   patientId }  (~100 bytes)  │                          │
  │──────────────────────────────>                          │
  │                              │ sidecar: signed PUT URL  │
  │                              │<─────────────────────────│ (sidecar call)
  │ { signedUrl, objectName }    │                          │
  │<─────────────────────────────│                          │
  │                              │                          │
  │ PUT <signedUrl>  (raw bytes) │                          │
  │  *** BYPASSES PROXY ***      │                          │
  │─────────────────────────────────────────────────────────>
  │ 200 OK                       │                          │
  │<─────────────────────────────────────────────────────────
  │                              │                          │
  │ POST /api/images/register    │                          │
  │ { objectName, fileName, …}   │                          │
  │──────────────────────────────>                          │
  │ 201 image row JSON           │                          │
  │<─────────────────────────────│                          │
```

### New server endpoint: `POST /api/images/upload-url`
Accepts `{ fileName, mimeType, patientId }`. Validates patient exists, builds an `objectName` path (`images/<patientId>/<date>/<timestamp>.ext`), calls `getSignedUploadUrl(objectName)`, and returns `{ signedUrl, objectName }`.

### New server endpoint: `POST /api/images/register`
Accepts `{ objectName, fileName, mimeType, patientId, notes, capturedAt }`. Converts `objectName` to a `gcs:` path via `toGcsPath()`, inserts the DB record, returns the full image row. This is called only after the client's GCS PUT succeeds.

### New gcsStorage function: `getSignedUploadUrl(objectName, ttlSec = 900)`
Calls the Replit sidecar at `REPLIT_SIDECAR_ENDPOINT/object-storage/signed-object-url` with `method: "PUT"` — same pattern as the existing `getSignedDownloadUrl` but using PUT. TTL defaults to 15 minutes.

```typescript
export async function getSignedUploadUrl(objectName: string, ttlSec = 900): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: getBucketName(),
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Sidecar signed-url error ${response.status}`);
  const { signed_url } = await response.json();
  return signed_url as string;
}
```

### Client upload flow (upload.ts)
```typescript
// Step 1 — tiny metadata → get signed URL
const { signedUrl, objectName } = await fetch("/api/images/upload-url", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fileName, mimeType, patientId }),
  signal: AbortSignal.timeout(30_000),
}).then(r => r.json());

// Step 2 — PUT raw bytes DIRECTLY to GCS (no proxy involved)
await fetch(signedUrl, {
  method: "PUT",
  headers: { "Content-Type": mimeType },
  body: uploadBlob,               // Blob, not base64
  signal: AbortSignal.timeout(120_000),
});

// Step 3 — tiny confirmation → creates DB record
const image = await fetch("/api/images/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ objectName, fileName, mimeType, patientId, notes, capturedAt }),
  signal: AbortSignal.timeout(30_000),
}).then(r => r.json());
```

### Image compression
The client compresses images over 512 KB before upload using `canvas.toBlob()` (returns a `Blob`, not a data URL). Max dimension 1920px, JPEG quality 0.85. The Blob is used directly as the PUT body.

### Notes for Max7 agent
- **Do NOT use the old `/api/images/upload` (base64 JSON) path for any web client.** Keep it only as a fallback for mobile / migration import CLI callers.
- The old base64 endpoint is kept in the router but the web app no longer uses it.
- `toGcsPath(objectName)` converts a bare object name (`images/1/2026-06-04/123.jpg`) to the `gcs:` prefixed path used in the DB (`gcs:images/1/2026-06-04/123.jpg`). Use the existing `toGcsPath` export from `gcsStorage.ts`.
- Invalidate `getListImagesQueryKey()` and `getListPatientImagesQueryKey(patientId)` from `@workspace/api-client-react` after step 3 to refresh the gallery.
- GCS SDK writes give 403 in production (Replit sidecar auth change). Only use the **sidecar signed URL** approach for writes; reads via `createReadStream` still work.

---

## FEAT-007 — Angle Label Hover Visibility

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-07  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Angle annotations are visually quiet by default — the two arm lines are drawn at 25% opacity and no label is shown. When the user hovers within 60px of the vertex, the full annotation (solid arms + degree label) fades in. Save/export always renders the full annotation regardless of hover state.

### How it works
1. Track mouse position in `mousePosRef = useRef<{x:number,y:number}>({x:0,y:0})`.
2. In `drawAnnotation` for `type === "angle"`, accept a `hoverVertex?: {x,y}` parameter.
3. Compute `const dist = Math.hypot(vertex.x - hoverVertex.x, vertex.y - hoverVertex.y)`.
4. If `dist > 60` (no hover): draw arms with `ctx.globalAlpha = 0.25`, skip the label.
5. If `dist ≤ 60` (hover): draw arms at full opacity + draw the degree label.
6. For save/export calls, always pass a fake `hoverVertex` that matches the vertex exactly (distance = 0) so labels always render in saved images.
7. In the canvas `onMouseMove` handler, update `mousePosRef` and call `redrawCanvas()` to refresh the hover state.

### Notes for Max7 agent
- The 60px threshold is in **canvas-pixel** space (before scale). If your canvas uses a device-pixel-ratio transform, adjust accordingly.
- Only angle annotations use this pattern — rulers and other annotations are always fully visible.
- Save/export override: pass `hoverVertex: annotation.vertex` (or equivalent center point) so the label is never suppressed in exported images.

---

## FEAT-008 — Ruler HUD: Stacked Buttons & Context-Aware Instruction

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-07  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Two UX fixes for the ruler tool inside the floating HUD:
1. **Stacked buttons** — "Measure" and "Resize" buttons are arranged vertically (flex-col) inside the HUD so they never overflow horizontally.
2. **Context-aware instruction text** — when neither mode is active the HUD shows *"Press Measure or Resize first, then draw a line"*; once a mode is active it switches to *"Draw a line on the image"*.

### Correct ruler workflow (important — previous doc was wrong)
The correct order is:
1. User clicks **Measure** (or **Resize**) in the HUD **first**.
2. User **draws a line** on the canvas.
3. A dialog prompts for the real-world length.

**Do NOT** instruct users to draw a line first and then click Measure.

### Implementation
```jsx
// Buttons inside HUD — stacked vertically
<div className="flex flex-col gap-1">
  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs w-full justify-start"
    onClick={() => { setCalibrating(true); setResizeMode(false); }}>
    <Ruler className="h-3 w-3" />{t("editor.rulerMeasure")}
  </Button>
  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs w-full justify-start"
    onClick={() => { setResizeMode(true); setCalibrating(false); }}>
    <Minimize2 className="h-3 w-3" />{t("editor.rulerResize")}
  </Button>
</div>
```

```typescript
// Instruction logic
if (tool === "ruler") {
  instruction = (calibrating || resizeMode)
    ? t("editor.rulerDrawHint")      // "Draw a line on the image"
    : t("editor.rulerSelectModeHint"); // "Press Measure or Resize first, then draw a line"
}
```

### i18n keys added (all 4 locales: en / es / fr / pt)
| Key | en |
|-----|----|
| `editor.rulerSelectModeHint` | Press Measure or Resize first, then draw a line |

### Notes for Max7 agent
- The HUD buttons replace any ruler controls that were previously in the secondary toolbar.
- Ruler buttons must only appear when `tool === "ruler"` — gate the HUD section accordingly.

---

## FEAT-009 — Angle Tool Auto-Reverts to Pointer After Completion

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-07  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
After the user clicks the 3rd point to complete an angle annotation, the active tool automatically switches back to the pointer tool. This avoids the user being stuck in angle-drawing mode after finishing.

### How it works
In the angle tool's 3rd-click handler, after `setAnnotations(...)` and `pushHistory()`:
```typescript
setAngleStep(0);
anglePointsRef.current = [];
setTool("pointer"); // ← auto-revert
```

### Notes for Max7 agent
- Apply the same pattern to other "place-and-done" tools if desired (e.g. text placement).
- The cancel button in the HUD (`angleStep > 0`) should still be available for steps 1 and 2.

---

## FEAT-010 — Overlay Thumbnail Picker: Floating Canvas Strip

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-07  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
When the overlay tool is active, a frosted-glass pill floats at the **bottom-center of the canvas** showing thumbnails of other patient images the user can pick as the overlay. Previously this was crammed into the secondary toolbar; moving it to the canvas gives more space and keeps it visually associated with the canvas rather than the toolbar.

### How it works
The strip is an `absolute z-30` div anchored to the canvas container:
```jsx
{tool === "overlay" && (
  <div className="absolute z-30 bottom-3 left-1/2 -translate-x-1/2
                  bg-card/95 backdrop-blur-sm border rounded-xl shadow-lg
                  px-2 py-1.5 flex items-center gap-2 select-none max-w-[90%]">
    <span className="text-xs text-muted-foreground shrink-0">{pickHintLabel}:</span>

    {/* "None" button — only shown when an overlay is active */}
    {overlayImageId && (
      <button className="shrink-0 h-7 px-2 text-xs rounded border hover:bg-muted flex items-center gap-1"
        onClick={clearOverlay}>
        <X className="h-3 w-3" />{t("editor.overlayNone")}
      </button>
    )}

    {/* Scrollable thumbnail strip with prev/next chevrons */}
    <button onClick={() => scrollRef.current?.scrollBy({ left: -160, behavior:"smooth" })}>
      <ChevronLeft className="h-3 w-3" />
    </button>
    <div ref={scrollRef} className="flex gap-1 overflow-x-auto scroll-smooth"
         style={{ scrollbarWidth:"none", maxWidth:320 }}>
      {otherImages.map(pi => (
        <button key={pi.id}
          className={`shrink-0 w-10 h-10 rounded border-2 overflow-hidden ${
            overlayImageId === String(pi.id) ? "border-primary" : "border-transparent hover:border-muted-foreground/40"
          }`}
          onClick={() => toggleOverlay(pi.id)}>
          <img src={`/api/images/${pi.id}/file`} crossOrigin="anonymous"
               className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
    <button onClick={() => scrollRef.current?.scrollBy({ left: 160, behavior:"smooth" })}>
      <ChevronRight className="h-3 w-3" />
    </button>
  </div>
)}
```

The parent canvas container must be `position: relative` and `overflow: hidden`. Place this JSX inside it (not in the toolbar).

### Notes for Max7 agent
- The secondary toolbar still holds the opacity/scale/XY offset controls for the active overlay — only the picker (thumbnail chooser) moves to the canvas strip.
- `max-w-[90%]` prevents the strip from overflowing on narrow canvases.

---

## FEAT-011 — Built-in Chatbot (GPT-4o-mini, SSE Streaming)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-07  
**Vista files:**
- `artifacts/api-server/src/routes/chat.ts` — SSE streaming endpoint
- `artifacts/patient-images/src/components/ChatBot.tsx` — floating chat UI

### What it does
A floating chat bubble (bottom-right corner) opens a panel where staff can ask questions about how to use Max7 Vista. Responses stream token-by-token via SSE. The bot uses a detailed system prompt covering every feature.

### API endpoint — `POST /chat` (mounted at `/api/chat`)
**Critical:** the router is already mounted at `/api` — register the route as `/chat` (not `/api/chat`) or the path becomes `/api/api/chat` and returns 404.

```typescript
import { openai } from "@workspace/integrations-openai-ai-server";

router.post("/chat", async (req, res) => {
  if (!openai) return res.status(503).json({ error: "AI chat not available." });

  const { messages } = req.body;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",          // ← must be "gpt-4o-mini", not "gpt-5-mini"
    max_completion_tokens: 1024,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? "";
    if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
  }
  res.write("data: {\"done\":true}\n\n");
  res.end();
});
```

### System prompt — ruler section (correct wording)
```
Ruler: To use Measure mode: click "Measure" in the HUD first, then draw a line
over a known reference structure, then enter its real-world length — this
calibrates the mm/px scale. To use Resize mode: click "Resize" in the HUD
first, then draw a line over a landmark, then enter the desired length — the
image is rescaled so that line matches the target measurement.
```

### Chat UI — `ChatBot.tsx`
- Fixed bottom-right button (`h-14 w-14 rounded-full`) toggles the panel.
- Panel: `fixed bottom-24 right-6 w-[360px] max-h-[520px]`, flex-col with header / scroll area / input row.
- **Scrollable message area**: use a plain `<div className="flex-1 overflow-y-auto min-h-0">` — do **not** use the `ScrollArea` shadcn component; its custom scrollbar overlay does not render reliably in this layout.
- Auto-scroll on new messages: `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` in a `useEffect([messages])`.
- SSE read loop: split on `\n`, parse `data: {...}` lines, append `content` tokens to the active assistant message.

### Notes for Max7 agent
- The `openai` client comes from `@workspace/integrations-openai-ai-server` (Replit-managed proxy). In Max7's Electron context use the OpenAI SDK directly with the clinic's API key from settings.
- Keep the system prompt updated whenever a workflow changes (e.g. ruler order, new features).
- `max_completion_tokens: 1024` keeps responses concise; increase if needed.

---

## FEAT-012 — Bulk ZIP Import: GCS Signed-URL Bypass (Cloud Deployment)

**Status:** ✅ Confirmed working in Vista (dev + production)
**Date:** 2026-06-08
**Vista files:**
- `artifacts/api-server/src/routes/import.ts` — two new endpoints
- `artifacts/patient-images/src/pages/bulk-import.tsx` — updated `ZipImportTab.handleSubmit`

### Why this was needed
The Replit deployment proxy rejects large POST bodies with HTTP 413. A ZIP of patient images can easily be 50–500 MB — far over the proxy limit. The same GCS signed-URL bypass pattern from FEAT-006 (single image upload) is applied here for bulk ZIP import.

### Architecture — three steps, all tiny except the GCS PUT

```
Browser                        API Server               Google Cloud Storage
  │                                │                            │
  │ POST /api/import/bulk-upload-url│                            │
  │ (empty body)                   │                            │
  │────────────────────────────────>                            │
  │ { signedUrl, objectName }      │ sidecar: signed PUT URL    │
  │<────────────────────────────────│<───────────────────────────│
  │                                │                            │
  │ PUT <signedUrl>  (raw ZIP bytes)│                            │
  │  *** BYPASSES PROXY ***         │                            │
  │─────────────────────────────────────────────────────────────>
  │ 200 OK                         │                            │
  │<─────────────────────────────────────────────────────────────
  │                                │                            │
  │ POST /api/import/bulk-from-gcs │                            │
  │ { objectName, csvContent? }    │                            │
  │ (small JSON, proxy-safe)       │                            │
  │────────────────────────────────>                            │
  │                                │ reads ZIP from GCS         │
  │                                │────────────────────────────>
  │                                │ extracts + saves images    │
  │                                │────────────────────────────>
  │ ImportSummary JSON             │                            │
  │<────────────────────────────────│                            │
```

### New server endpoint: `POST /api/import/bulk-upload-url`
No request body. Generates a temporary object name (`imports/bulk/<timestamp>_<random>.zip`), calls `getSignedUploadUrl(objectName, 3600)` (1-hour TTL for large ZIPs), and returns `{ signedUrl, objectName }`.

```typescript
router.post("/import/bulk-upload-url", async (req, res): Promise<void> => {
  try {
    const objectName = `imports/bulk/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`;
    const signedUrl = await getSignedUploadUrl(objectName, 3600);
    res.json({ signedUrl, objectName });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Could not generate upload URL: ${reason}` });
  }
});
```

### New server endpoint: `POST /api/import/bulk-from-gcs`
Accepts `{ objectName, csvContent? }` (JSON body, proxy-safe). Reads the ZIP from GCS with `readFileAsBuffer(toGcsPath(objectName))`, opens it with `AdmZip`, extracts patient folders and image files, saves each image to GCS with `uploadToGcs(buffer, imgObjectName, mimeType)`, inserts DB records, and returns an `ImportSummary`. Deletes the temporary ZIP from GCS at the end (best-effort).

Key steps inside the handler:
1. Download ZIP: `await readFileAsBuffer(toGcsPath(objectName))`
2. Parse: `new AdmZip(zipBuffer)`
3. Detect single root wrapper folder (same logic as the original `/import/bulk`)
4. For each patient folder → each image entry:
   - `entry.getData()` → Buffer
   - Extract EXIF date (or fall back to ZIP entry timestamp)
   - Build `imgObjectName = images/<patientId>/<dateStr>/<timestamp>_<random>.ext`
   - `await uploadToGcs(buffer, imgObjectName, mimeType)` → `gcs:` path
   - Insert DB record with `filePath = gcsPath`
5. Delete temp ZIP: `await deleteFile(toGcsPath(objectName))`

### Frontend: `ZipImportTab.handleSubmit` (bulk-import.tsx)
Replace the single multipart POST with the 3-step flow:

```typescript
// Step 1 — get signed URL (empty body)
const { signedUrl, objectName } = await fetch(getApiUrl("/api/import/bulk-upload-url"), {
  method: "POST", credentials: "include",
}).then(r => r.json());

// Step 2 — PUT ZIP directly to GCS (bypasses proxy)
await fetch(signedUrl, {
  method: "PUT",
  headers: { "Content-Type": "application/zip" },
  body: archiveFile,                    // the File object from <input type="file">
});

// Step 3 — trigger server-side processing (small JSON body)
const csvContent = csvFile ? await csvFile.text() : undefined;
const result = await fetch(getApiUrl("/api/import/bulk-from-gcs"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ objectName, csvContent }),
}).then(r => r.json());
```

Note: the CSV file is read as a text string (`csvFile.text()`) and sent in the small JSON body in step 3 — it never goes through multipart.

### Notes for Max7 agent
- **Do NOT send the ZIP through the API proxy** — it will always 413 on large files in a cloud deployment.
- The `getSignedUploadUrl` function is shared with FEAT-006 (single image upload). No new GCS functions needed beyond `readFileAsBuffer`, `uploadToGcs`, `toGcsPath`, and `deleteFile` — all already in `gcsStorage.ts`.
- In the Electron/LAN build, `gcsStorage.ts` is aliased to `localDiskStorage.ts`. The `localDiskStorage` stub must export `getSignedUploadUrl`, `uploadToGcs`, `toGcsPath`, `readFileAsBuffer`, and `deleteFile` with matching signatures (they can operate on the local `uploads/` directory).
- The original `POST /import/bulk` (multipart) endpoint can be kept for LAN builds where the proxy is not involved.
- Image MIME type for `uploadToGcs`: derive from file extension — `image/${ext.slice(1)}` (e.g. `.jpg` → `image/jpg`; use `image/jpeg` for correctness if preferred).

---

## FEAT-012 — Canvas Coordinate Scale Fix (getCanvasPoint)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-14  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
Fixes a systematic offset where ALL annotations (pen strokes, arrows, circles, straight lines, rulers, angles, text) appeared to the right of the cursor. The offset was proportional to the mismatch between the canvas buffer pixel size and its CSS display size.

### Root cause
`getCanvasPoint` computed:
```typescript
// WRONG — mixes CSS pixels and buffer pixels
const cx = (e.clientX - rect.left - canvas.width / 2) / scale;
```
`canvas.width` is the buffer size in device/buffer pixels. `e.clientX - rect.left` is the offset in CSS display pixels. When the canvas is displayed at a different size than its buffer (flex layout, sub-pixel rounding, device pixel ratio), these two measurements do not share the same unit and subtracting them produces a wrong result.

### Fix
```typescript
function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
  const canvas = canvasRef.current!;
  const rect = canvas.getBoundingClientRect();
  const rx = canvas.width / rect.width;   // buffer px per CSS px (X)
  const ry = canvas.height / rect.height; // buffer px per CSS px (Y)
  const cx = ((e.clientX - rect.left) * rx - canvas.width / 2 - panOffsetRef.current.x) / scale;
  const cy = ((e.clientY - rect.top)  * ry - canvas.height / 2 - panOffsetRef.current.y) / scale;
  // then apply rotation as before
}
```
Multiply the CSS-pixel offset by the ratio `canvas.width / rect.width` before subtracting the canvas center. This converts the CSS-pixel mouse position into buffer pixels before doing arithmetic.

### Scope
Every drawing tool and annotation placement goes through `getCanvasPoint`, so a single fix here covers the entire editor: pen, eraser, arrow, circle, straight line, ruler, angle, text, and pointer (annotation drag).

The same inline formula existed in one other place (angle-hover detection in `handlePointerMove`) and was fixed there too — look for the `cx = ((e.clientX - rect.left) * rx - canvas.width / 2 …` block.

### Notes for Max7 agent
- `getScreenPoint()` is a separate helper that returns raw CSS pixel coords — used only for operations that intentionally work in screen space (brush cursor, crop, eyedropper, select path). Do **not** apply this scaling fix there.
- If the canvas uses a `devicePixelRatio` transform as well, the `rx`/`ry` computation already accounts for it via `getBoundingClientRect()`.

---

## FEAT-013 — General Annotation Drag/Move (All Types)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-14  
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
The pointer tool can now drag and reposition any annotation type — straight lines, arrows, circles, rulers, angles, and freehand pen strokes — not just text labels. Undoable via Ctrl+Z.

### How it works

**Three helpers added:**
```typescript
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function findAnnotationAt(x: number, y: number): Annotation | null {
  const HIT = 12; // pixels
  const anns = annotationsRef.current;
  for (let i = anns.length - 1; i >= 0; i--) {
    const ann = anns[i];
    if (ann.type === "text") { /* existing text hit-test */ }
    else if (ann.type === "arrow" || ann.type === "straightline" || ann.type === "ruler") {
      if (distToSegment(x, y, ann.x1, ann.y1, ann.x2, ann.y2) < HIT) return ann;
    } else if (ann.type === "circle") {
      if (Math.abs(Math.hypot(x - ann.cx, y - ann.cy) - ann.r) < HIT) return ann;
    } else if (ann.type === "angle") {
      if (distToSegment(x, y, ann.vx, ann.vy, ann.p1x, ann.p1y) < HIT) return ann;
      if (distToSegment(x, y, ann.vx, ann.vy, ann.p2x, ann.p2y) < HIT) return ann;
    } else if (ann.type === "line") {
      for (let j = 0; j < ann.points.length - 3; j += 2) {
        if (distToSegment(x, y, ann.points[j], ann.points[j+1], ann.points[j+2], ann.points[j+3]) < HIT) return ann;
      }
    }
  }
  return null;
}

function moveAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
  switch (ann.type) {
    case "text": return { ...ann, x: ann.x + dx, y: ann.y + dy };
    case "arrow": case "straightline": case "ruler":
      return { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy };
    case "circle": return { ...ann, cx: ann.cx + dx, cy: ann.cy + dy };
    case "angle": return { ...ann, vx: ann.vx + dx, vy: ann.vy + dy,
                           p1x: ann.p1x + dx, p1y: ann.p1y + dy,
                           p2x: ann.p2x + dx, p2y: ann.p2y + dy };
    case "line": return { ...ann, points: ann.points.map((v, i) => i % 2 === 0 ? v + dx : v + dy) };
  }
}
```

**Drag ref added:**
```typescript
const draggingAnnRef = useRef<{
  id: string; origAnn: Annotation; mouseStartX: number; mouseStartY: number;
} | null>(null);
```

**handlePointerDown** — when `tool === "pointer"`:
- Call `findAnnotationAt(x, y)` (searches all types, text still handled by `draggingTextRef`)
- If hit and not text: `draggingAnnRef.current = { id: hit.id, origAnn: hit, mouseStartX: x, mouseStartY: y }`

**handlePointerMove** — if `draggingAnnRef.current`:
- Compute `dx = mx - mouseStartX`, `dy = my - mouseStartY`
- Live-preview by calling `renderCanvas` with `annotationsRef.current.map(ann => ann.id === id ? moveAnnotation(origAnn, dx, dy) : ann)`

**handlePointerUp** — if `draggingAnnRef.current`:
- Call `pushHistory()`, then `setAnnotations(prev => prev.map(ann => ann.id === id ? moveAnnotation(origAnn, dx, dy) : ann))`
- Clear `draggingAnnRef.current = null`

### Key requirement: DrawLine needs an `id` field
`DrawLine` previously lacked `id`. Add it to the interface and generate it at creation:
```typescript
interface DrawLine {
  type: "line"; points: number[]; color: string; width: number; id: string;
}
// At creation:
const newLine: DrawLine = { ..., id: Date.now().toString() };
```

### Notes for Max7 agent
- The existing `draggingTextRef` for text is kept as-is — `findAnnotationAt` returns the annotation, then the pointer-down handler checks `hit.type === "text"` and branches to the appropriate ref.
- `distToSegment` returns `Infinity` when the segment has zero length (division by zero guarded by the `dx*dx + dy*dy` check via `isNaN` fallback — add `|| 0` or guard before using).
- Drag is only committed to history if `Math.hypot(dx, dy) > 0.5` (prevents a click from creating a spurious undo entry).

---

## FEAT-014 — Image Library Page

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-14  
**Vista files:**
- `artifacts/patient-images/src/pages/image-library.tsx` — new page
- `artifacts/patient-images/src/router.tsx` — route `/library` added
- `artifacts/patient-images/src/components/layout.tsx` — nav item added
- `artifacts/patient-images/src/i18n/locales/{en,es,fr,pt}.json` — `nav.library` + `library.*` keys added

### What it does
A dedicated image repository page (`/library`) where the user browses ALL images across all patients in a large thumbnail grid. They can filter by patient, multi-select images, and add the selection to any existing presentation (or create a new one) with a single dialog interaction.

### How it works

**Grid with multi-select:**
- Loads `useListImages({})` (all images) and `useListPatients({})` for the filter dropdown.
- `patientFilter` state drives filtering client-side (`"all"` | `"unassigned"` | `"<patientId>"`).
- `selected: Set<number>` tracks selected image IDs. Clicking a thumbnail toggles membership.
- Selected thumbnails show a primary-coloured checkmark badge and a ring + scale-down effect.
- Hovering an "all patients" thumbnail shows a patient name label (bottom overlay, opacity transition).

**Add to Presentation dialog:**
- Visible when `selected.size > 0`.
- Opens a `<Dialog>` listing all presentations (fetched with `useListPresentations({})`).
- First row is "New Presentation" (creates via `useCreatePresentation`).
- Subsequent rows are existing presentations with their slide count.
- On selection: calls `useUpdatePresentation` with the existing slides merged with new `{ type: "single", imageId }` entries, deduplicating by imageId.
- On success: toast, clears selection, closes dialog.

**Nav:**
- Route: `/library`
- Sidebar item: "Image Library" (`Library` icon from lucide-react), placed between Gallery and Presentations.

### i18n keys added (all 4 locales: en / es / fr / pt)
| Key | en |
|-----|----|
| `nav.library` | Image Library |
| `library.title` | Image Library |
| `library.subtitle` | Browse and select images to include in your presentations. |
| `library.noImages` | No images found |
| `library.selectedCount` | {{count}} selected |
| `library.addToPresentation` | Add to Presentation |
| `library.clearSelection` | Clear Selection |
| `library.selectPresentation` | Select a Presentation |
| `library.selectPresentationDesc` | Choose a presentation to add the selected images to as slides. |
| `library.newPresentation` | New Presentation |
| `library.addedSuccess` | Added {{count}} image(s) to presentation |
| `library.noPresentations` | No presentations yet |

### Notes for Max7 agent
- Slide deduplication: filter new slides to exclude any imageId already in an existing `{ type: "single" }` slide.
- `CompareSlide` members are left untouched during the merge — only single slides are deduplicated.
- The page reuses the same `imageUrl = (id) => /api/images/${id}/file` pattern as the rest of the app.

---

<!-- Add new entries below as features are confirmed in Vista -->
