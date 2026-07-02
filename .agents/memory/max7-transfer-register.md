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
A standalone media asset repository (`/library`) for NON-clinical decorative images (title slides, landscapes, section headers, etc.) that staff upload and reuse across presentations. Completely separate from patient Gallery images — users upload their own decorative images here and add them to any presentation as slides.

### DB change
Added `is_library_asset BOOLEAN NOT NULL DEFAULT FALSE` column to the `images` table. Library assets are regular image rows with this flag set to `true`. Both Drizzle schemas were updated (`lib/db/src/schema/images.ts` and `lib/db/src/schema-sqlite/images.ts`), and the SQLite CREATE TABLE IF NOT EXISTS in `artifacts/api-server/src/index.ts` was updated. Applied via `ALTER TABLE images ADD COLUMN IF NOT EXISTS is_library_asset BOOLEAN NOT NULL DEFAULT FALSE`.

### API routes (`artifacts/api-server/src/routes/library.ts`)
All routes registered in `routes/index.ts` as `libraryRouter`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/library-assets` | List all library assets (`isLibraryAsset = true`) |
| POST | `/api/library-assets/upload-url` | Get GCS signed PUT URL (same pattern as FEAT-006) |
| POST | `/api/library-assets/register` | Register after GCS PUT; sets `isLibraryAsset=true` |
| PATCH | `/api/library-assets/:id` | Update title (stored in `notes` column) |
| DELETE | `/api/library-assets/:id` | Delete GCS object + DB row |
| GET | `/api/library-assets/:id/file` | Stream file via `streamFile(filePath, fileName, res)` |

GCS object path: `library/YYYY-MM-DD/<timestamp>.<ext>`

Response shape: `{ id, title, filePath, fileName, uploadedAt, createdAt }`

### Frontend (`artifacts/patient-images/src/pages/image-library.tsx`)
Uses raw `fetch()` calls to `/api/library-assets/*` (no generated API client for these routes). Uses `@tanstack/react-query` with key `["library-assets"]`.

**Upload flow** (3-step GCS bypass, same as FEAT-006):
1. POST `/api/library-assets/upload-url` → `{ signedUrl, objectName }`
2. PUT raw bytes to `signedUrl` (bypasses Replit proxy)
3. POST `/api/library-assets/register` → DB record

Supports file input and **drag-and-drop** onto the grid. Batches multiple file uploads sequentially and shows `uploadProgress` percentage.

**Grid features:**
- `aspect-square` thumbnail grid (responsive 2–6 columns)
- Click to toggle multi-select (primary ring + checkmark badge)
- Hover shows edit-title (Pencil) and delete (Trash2) action buttons
- Title overlay at image bottom (gradient, truncated)
- "Upload" tile always shown as last grid item (dashed border button)
- Empty state: full-width dashed drop zone

**Presentation integration** (reuses existing hooks from `@workspace/api-client-react`):
- Select assets → "Add to Presentation" button in header
- Dialog: pick existing presentation or create new one with optional title
- Merges selected `{ type: "single", imageId: id }` slides into existing presentation slides
- Uses `useCreatePresentation` + `useUpdatePresentation` hooks

### i18n keys (all 4 locales: en / es / fr / pt)
| Key | en |
|-----|----|
| `library.title` | Image Library |
| `library.subtitle` | Upload and manage decorative images for use as presentation slides. |
| `library.upload` | Upload Images |
| `library.uploadedCount` | Uploaded {{count}} image(s) |
| `library.noAssets` | No images in the library yet |
| `library.dropHint` | Drag & drop images here, or click Upload |
| `library.selectedCount` | {{count}} selected |
| `library.addToPresentation` | Add to Presentation |
| `library.clearSelection` | Clear Selection |
| `library.selectPresentation` | Select a Presentation |
| `library.selectPresentationDesc` | Choose a presentation to add the selected images to as slides. |
| `library.newPresentation` | New Presentation |
| `library.newPresentationPlaceholder` | Presentation title… |
| `library.defaultPresentationTitle` | Untitled Presentation |
| `library.addedSuccess` | Added {{count}} image(s) to presentation |
| `library.noPresentations` | No presentations yet |
| `library.deleteTitle` | Delete Image |
| `library.deleteDesc` | This will permanently remove the image from your library. |
| `library.deleted` | Image deleted |
| `library.editTitle` | Edit Title |
| `library.titlePlaceholder` | Enter a title for this image… |

### Notes for Max7 agent
- Library assets share the `images` table — filter by `is_library_asset = true` when listing.
- Title is stored in the `notes` column of the images table (no separate column added).
- File serving uses the same `streamFile(filePath, fileName, res)` from `gcsStorage.ts`.
- The presentation `{ type: "single", imageId: id }` slide format works for library asset IDs too — no slide type change needed since image IDs are globally unique.

---

## FEAT-015 — Admin-Only Patient Image Export (ZIP Download)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-15  
**Vista files:**
- `artifacts/api-server/src/routes/images.ts` — new export endpoint
- `artifacts/patient-images/src/pages/patient-detail.tsx` — export dialog UI
- `artifacts/patient-images/src/i18n/locales/{en,es,fr,pt}.json` — 15 new keys
- `artifacts/api-server/src/routes/chat.ts` — system prompt updated
- `artifacts/patient-images/src/pages/manual.tsx` — new "exportImages" section

### What it does
Admins and Super Admins can select one or more of a patient's images and download them as a ZIP archive. The option is hidden from regular users. The export is recorded in the Audit Log.

### API endpoint — `POST /api/patients/:id/export-images`

```typescript
import AdmZip from "adm-zip";
import { requireRole } from "../middlewares/requireAuth";
import { readFileAsBuffer } from "../lib/gcsStorage";
import { inArray } from "drizzle-orm";

router.post(
  "/patients/:id/export-images",
  requireRole("admin", "superadmin"),
  async (req, res): Promise<void> => {
    const patientId = parseInt(String(req.params.id), 10);
    if (isNaN(patientId)) { res.status(400).json({ error: "Invalid patient ID" }); return; }

    const [patient] = await db
      .select({ id: patientsTable.id, name: patientsTable.name, patientCode: patientsTable.patientCode })
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId))
      .limit(1);
    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }

    const { imageIds } = (req.body ?? {}) as { imageIds?: number[] };
    const hasFilter = Array.isArray(imageIds) && imageIds.length > 0;

    const rows = await db
      .select()
      .from(imagesTable)
      .where(
        hasFilter
          ? and(eq(imagesTable.patientId, patientId), inArray(imagesTable.id, imageIds!))
          : eq(imagesTable.patientId, patientId)
      )
      .orderBy(imagesTable.capturedAt);

    if (rows.length === 0) { res.status(404).json({ error: "No images found for export" }); return; }

    const zip = new AdmZip();
    let added = 0;

    for (const image of rows) {
      const buffer = await readFileAsBuffer(image.filePath);
      if (!buffer) continue;
      const ext = path.extname(image.fileName) || ".jpg";
      const dateStr = new Date(image.capturedAt).toISOString().slice(0, 10);
      const baseName = path.basename(image.fileName, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
      zip.addFile(`${image.id}_${dateStr}_${baseName}${ext}`, buffer);
      added++;
    }

    if (added === 0) { res.status(404).json({ error: "No image files could be retrieved" }); return; }

    const zipBuffer = zip.toBuffer();
    const safeCode = patient.patientCode.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `patient_${safeCode}_images_${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.end(zipBuffer);

    await logAudit(req, "export", "patient", patientId,
      JSON.stringify({ imageCount: added, imageIds: rows.map(r => r.id) }));
  }
);
```

**Key points:**
- `adm-zip` is already a dependency — no new package needed.
- `readFileAsBuffer` handles both GCS (`gcs:` prefix) and legacy local-disk paths.
- Each ZIP entry is named `{id}_{YYYY-MM-DD}_{sanitisedOriginalName}.ext` to be both unique and human-readable.
- The endpoint is added to the existing `images.ts` router which is already mounted under `/api` — no change to `routes/index.ts` needed.
- `requireRole` comes from `../middlewares/requireAuth` — also exports `requireAuth` (already used). Import it alongside the existing import.

### Frontend — export dialog in `patient-detail.tsx`

**New imports:**
```typescript
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/apiUrl";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react"; // add to existing lucide import
```

**New state (inside the component):**
```typescript
const { user } = useAuth();
const isAdmin = user?.role === "admin" || user?.role === "superadmin";

const [exportOpen, setExportOpen] = useState(false);
const [selectedExportIds, setSelectedExportIds] = useState<Set<number>>(new Set());
const [exporting, setExporting] = useState(false);
```

**openExportDialog** — pre-selects all images:
```typescript
const openExportDialog = () => {
  setSelectedExportIds(new Set((images ?? []).map(img => img.id)));
  setExportOpen(true);
};
```

**handleExport** — fetch → blob → anchor click:
```typescript
const handleExport = async () => {
  setExporting(true);
  try {
    const res = await fetch(getApiUrl(`/api/patients/${id}/export-images`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: Array.from(selectedExportIds) }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient-${patient?.patientCode ?? id}-images.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    toast({ title: t("patients.exportSuccess") });
  } catch (err) {
    toast({ variant: "destructive", title: t("patients.exportError"),
      description: err instanceof Error ? err.message : String(err) });
  } finally {
    setExporting(false);
  }
};
```

**Dropdown item** — inside the existing `DropdownMenuContent`, shown only when admin AND patient has images:
```jsx
{isAdmin && (images?.length ?? 0) > 0 && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={openExportDialog}>
      <Download className="mr-2 h-4 w-4" />
      {t("patients.exportImages")}
    </DropdownMenuItem>
  </>
)}
```

**Export dialog** — placed before the existing `<AlertDialog open={showDeleteDialog}…>`:
```jsx
<Dialog open={exportOpen} onOpenChange={(o) => { if (!o) setExportOpen(false); }}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Download className="h-5 w-5 text-primary" />
        {t("patients.exportImagesTitle")}
      </DialogTitle>
    </DialogHeader>

    {(images ?? []).length === 0 ? (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t("patients.exportNoImages")}
      </p>
    ) : (
      <>
        <p className="text-sm text-muted-foreground">{t("patients.exportImagesDesc")}</p>

        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("patients.exportSelected", { count: selectedExportIds.size })}
          </span>
          <div className="flex items-center gap-2">
            <button className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => setSelectedExportIds(new Set((images ?? []).map(img => img.id)))}>
              {t("patients.exportSelectAll")}
            </button>
            <span className="text-muted-foreground">·</span>
            <button className="text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => setSelectedExportIds(new Set())}>
              {t("patients.exportDeselectAll")}
            </button>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/30">
          {(images ?? []).map(img => (
            <label key={img.id}
              className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-accent transition-colors">
              <Checkbox
                checked={selectedExportIds.has(img.id)}
                onCheckedChange={() => toggleExportId(img.id)} />
              <span className="text-sm truncate flex-1">{img.fileName}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {format(new Date(img.capturedAt), "MMM d, yyyy")}
              </span>
            </label>
          ))}
        </div>
      </>
    )}

    <DialogFooter>
      <Button variant="outline" onClick={() => setExportOpen(false)}>{t("common.cancel")}</Button>
      <Button onClick={handleExport} disabled={exporting || selectedExportIds.size === 0}>
        {exporting ? t("patients.exportPreparing") : (
          <><Download className="mr-2 h-4 w-4" />{t("patients.exportDownload")}</>
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### i18n keys — add to `patients` section in all 4 locales

| Key | en | es | fr | pt |
|-----|----|----|----|----|
| `exportImages` | Export Images | Exportar imágenes | Exporter les images | Exportar imagens |
| `exportImagesTitle` | Export Patient Images | Exportar imágenes del paciente | Exporter les images du patient | Exportar imagens do paciente |
| `exportImagesDesc` | Select the images to include in the ZIP download. All images are pre-selected by default. | Seleccione las imágenes… | Sélectionnez les images… | Selecione as imagens… |
| `exportSelectAll` | Select All | Seleccionar todas | Tout sélectionner | Selecionar todas |
| `exportDeselectAll` | Deselect All | Deseleccionar todas | Tout désélectionner | Desmarcar todas |
| `exportSelected` | {{count}} image(s) selected | {{count}} imagen(es) seleccionada(s) | {{count}} image(s) sélectionnée(s) | {{count}} imagem(ns) selecionada(s) |
| `exportDownload` | Download ZIP | Descargar ZIP | Télécharger le ZIP | Baixar ZIP |
| `exportNoImages` | No images available for this patient. | No hay imágenes… | Aucune image… | Nenhuma imagem… |
| `exportSuccess` | Export complete | Exportación completada | Exportation terminée | Exportação concluída |
| `exportError` | Export failed | Error en la exportación | Échec de l'exportation | Falha na exportação |
| `exportPreparing` | Preparing… | Preparando… | Préparation… | Preparando… |

Also add to `manual.sections` and a new `manual.exportImages` object in all 4 locales (heading + body explaining the admin-only restriction, how to open the dialog, and that the action is audited).

### Manual section — add `"exportImages"` to `manual.tsx`

In the `SectionKey` type and `SECTIONS` array, insert `"exportImages"` right after `"patients"`. The manual renders it with `t("manual.exportImages.heading")` and `t("manual.exportImages.body")` automatically — no JSX changes needed beyond adding it to the type and array.

### Chatbot system prompt update

Add this bullet to `SYSTEM_PROMPT` in `chat.ts` (before the Migration bullet):
```
- Image Export (Admin only): Admins and Super Admins can export one or more of a patient's
  images as a ZIP archive from the patient detail page. Click the ⋮ menu → "Export Images".
  A dialog lists all images (all pre-selected). Tick/untick individually or use Select All /
  Deselect All. Click "Download ZIP". The archive is named with the patient code and today's
  date; each file inside is named with its ID, capture date, and original filename. The export
  is recorded in the Audit Log. Hidden from regular users.
```

### Notes for Max7 agent
- `adm-zip` is already installed in Vista's API server — verify it is in Max7's `package.json` before assuming it's available.
- `readFileAsBuffer` handles both GCS and local-disk paths transparently — the same function used by migration export. No new storage helpers needed.
- The endpoint lives in the images router (already registered in `routes/index.ts`) — do not add it to a separate router file.
- Role check: use `requireRole("admin", "superadmin")` from `requireAuth.ts`. In Electron/LAN mode, `requireRole` calls `next()` unconditionally — all users can export locally, which is acceptable for a clinic-local deployment without role separation.
- The frontend uses raw `fetch` + `getApiUrl` (not the generated API client) because the generated client does not include this endpoint. Follow the same `blob → URL.createObjectURL → anchor.click` pattern used by the migration export in `settings.tsx`.
- ZIP entry naming convention: `{imageId}_{YYYY-MM-DD}_{sanitisedFilename}{ext}` — sanitise with `/[^a-zA-Z0-9._-]/g → "_"`.

---

## FEAT-016 — Patient Profile Photo

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-16  
**Vista files:**
- `lib/db/src/schema/patients.ts` — `profileImageId` column
- `lib/api-zod/src/generated/api.ts` — Zod schemas updated
- `lib/api-client-react/src/generated/api.schemas.ts` — `Patient` + `PatientUpdate` interfaces updated
- `artifacts/api-server/src/routes/patients.ts` — `profileImageId` in all SELECT + PATCH
- `artifacts/patient-images/src/components/image-grid.tsx` — star button + badge overlay
- `artifacts/patient-images/src/pages/patient-detail.tsx` — `setProfileMutation` + props passed to ImageGrid
- `artifacts/patient-images/src/pages/patients.tsx` — cover image banner on patient cards

### What it does
Lets users designate one of a patient's images as the official profile photo. On the patient gallery page, hovering any image reveals a ⭐ button in the top-right corner; clicking it sets that image as the profile photo. The active profile photo shows a filled-star badge and a "Profile photo" label at the bottom-left of its thumbnail. On the patient list page, cards for patients with a profile photo display a 112px-tall cover image banner at the top of the card with a smooth hover-zoom effect.

### DB change
```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS profile_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL;
```

### API changes
- `GET /api/patients` and `GET /api/patients/:id` — now return `profileImageId` in the response object.
- `PATCH /api/patients/:id` — accepts `profileImageId` in the body (already handled by the generic `.set(parsed.data)` pattern; only the Zod `UpdatePatientBody` schema needed updating).

### i18n keys added (all 4 locales)
```
patients.setAsProfile   — "Set as profile photo"
patients.profilePhoto   — "Profile photo"
patients.profileSet     — "Profile photo updated"
patients.removeProfile  — "Remove profile photo"
```

### ImageGrid props added
```tsx
profileImageId?: number | null   // which image is currently the profile
onSetProfile?: (imageId: number) => void  // callback — only passed on patient detail page
```
When `onSetProfile` is not provided the star button is hidden entirely (safe to use ImageGrid in gallery/library views).

### Notes for Max7 agent
- The star button is a plain `<button>` inside the image `<div>` (not a `<Link>`) — both `e.preventDefault()` and `e.stopPropagation()` are required to prevent the card navigation link from triggering.
- The profile image is fetched via the same `/api/images/:id/file` route already used for thumbnails — no new endpoint needed.
- The `ON DELETE SET NULL` FK ensures removing an image automatically clears the patient's profile pointer without requiring application-level cleanup.
- In the patient list, each card now has `overflow-hidden` on the `<Card>` element — make sure it was not already removed for a different styling reason before adding the cover banner.

---

## FEAT-017 — Superimpose Presentation Slide Type

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-16  
**Vista files:**
- `artifacts/patient-images/src/components/PresentationBuilder.tsx` — new `SuperimposeSlide` type + `SuperimposeViewer` component; updated viewer, slide list, dot navigation
- `artifacts/patient-images/src/pages/editor.tsx` — "Save to Presentation" button in overlay HUD; dialog to pick/create presentation; `handleSaveOverlayToPresentation`; presentation hooks
- `artifacts/patient-images/src/pages/presentations.tsx` — thumbnail strip narrowed for superimpose slides
- All 4 locale files — `presentation.superimposeSlide` + 8 `editor.overlay*` keys

### What it does
When the user activates the Overlay tool in the editor and loads an image on top of the base image, a **Save to Presentation** button appears in the overlay toolbar. Clicking it opens a dialog where the user can add the superimposition as a new slide in an existing presentation, or create a new presentation with it as the first slide. The slide stores both image IDs plus `overlayOpacity`, `overlayOffsetX`, `overlayOffsetY`, `overlayScaleCorrection` — the full overlay state.

During the presentation viewer, **Superimpose slides** render a canvas-based component (`SuperimposeViewer`) that draws the base image with the overlay on top. A live **opacity slider** floats at the bottom center so the presenter can sweep transparency in real time without leaving the viewer. A "SUPERIMPOSE" label appears at the top.

### Slide type added
```typescript
export type SuperimposeSlide = {
  type: "superimpose";
  baseId: number;
  overlayId: number;
  overlayOpacity: number;     // 0.0 – 1.0
  overlayOffsetX: number;     // pixels, relative to canvas center
  overlayOffsetY: number;
  overlayScaleCorrection: number; // multiplier on top of fit-to-container scale
};
```
The API's `slides` column uses `zod.array(zod.unknown())` so no schema migration is needed — the new type round-trips as plain JSON.

### SuperimposeViewer rendering approach
Uses a `<canvas>` element with a `ResizeObserver` for responsive sizing. Stores a mutable `drawRef.current` closure (updated each render) so effects called from hooks never see stale closure values. The canvas draws:
1. Base image — `object-contain` equivalent via `Math.min(W/natW, H/natH)` scale
2. Overlay image — same base scale × `scaleCorrection`, offset by `offsetX/Y` from center, `globalAlpha = opacity`

### i18n keys added (all 4 locales)
```
presentation.superimposeSlide       — "Superimpose" / "Superposición" / "Superposition" / "Sobreposição"
editor.saveOverlayToPresentation    — "Save to Presentation"
editor.overlayPresentationTitle     — dialog title
editor.overlayPresentationDesc      — dialog description
editor.overlayPresentationAddTo     — select label
editor.overlayPresentationNewLabel  — "— New presentation —" option
editor.overlayPresentationNewName   — input label
editor.overlaySavedOk               — success toast
```

### Notes for Max7 agent
- The `drawRef.current = () => { ... }` pattern (updating a ref each render) keeps the draw function always-fresh without stale closures — preferred for canvas components that need to read React state from effects.
- Dot navigation in the viewer uses a different colour for superimpose slides (violet) vs compare (primary) vs single (white/grey).
- The "Save to Presentation" button is always visible when `tool === "overlay" && overlayImageId` — no extra condition needed.
- The offset values are in canvas/screen pixels from the time the overlay was positioned. They will look approximately correct at other screen sizes; exact pixel-perfect alignment is not guaranteed across sizes (the opacity sweep is the primary presentation value).

---

## FEAT-016 — Library Tags (Admin CRUD + Per-Asset Assignment + Filter Bar)

**Status:** ✅ Confirmed working in Vista
**Date:** 2026-06-17
**Vista files:**
- `lib/db/src/schema/library-asset-tags.ts` — junction table
- `lib/db/src/schema/images.ts` — `mediaType` column added
- `artifacts/api-server/src/routes/library.ts` — tag CRUD endpoints
- `artifacts/patient-images/src/pages/admin/tags.tsx` — admin UI
- `artifacts/patient-images/src/pages/image-library.tsx` — tag display, filter, assign

### What it does
- Admins manage a tenant-scoped tag list at `/admin/tags` (create / delete)
- Tags appear as coloured badges on each library asset card
- Users can assign/remove tags on any asset via the edit dialog
- A filter bar above the grid filters assets by tag; "All" shows everything

### DB schema
```sql
-- junction table
CREATE TABLE library_asset_tags (
  library_asset_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (library_asset_id, tag_id)
);
-- mediaType column on images
ALTER TABLE images ADD COLUMN media_type VARCHAR(10) DEFAULT 'image';
```

### API endpoints added to `library.ts`
- `GET  /library-assets/:id/tags` — list tags for asset
- `POST /library-assets/:id/tags` — assign tag `{ tagId }`
- `DELETE /library-assets/:id/tags/:tagId` — remove tag
- `GET /library-assets` response now includes `tags` array

### i18n keys added (all 4 locales)
- `nav.tagManagement`
- `adminTags.*` (title, subtitle, namePlaceholder, addTag, created, deleted, noTags, deleteTitle, deleteDesc)
- `library.video`, `library.allAssets`, `library.assignTags`, `library.unsupportedFile`

---

## FEAT-017 — Videos in Library

**Status:** ✅ Confirmed working in Vista
**Date:** 2026-06-17
**Vista files:** `artifacts/api-server/src/routes/library.ts`, `artifacts/patient-images/src/pages/image-library.tsx`

### What it does
- Library accepts video uploads (mp4, webm, mov, ogg)
- Video cards show a play-button overlay; clicking opens an in-page video player modal
- Videos can be added to presentations as a `{ type: "video", imageId }` slide
- `VideoSlide` type added to the `Slide` union in `PresentationBuilder.tsx`
- PresentationBuilder renders a `<video>` element for video slides
- `src` for video slides: `/api/library/assets/{imageId}/file`

### Notes for Max7 agent
- `mediaType` is stored as `"image"` or `"video"` in the `images` table
- API route must allow `video/mp4`, `video/webm`, `video/quicktime`, `video/ogg` MIME types
- File input should accept `.mp4,.webm,.mov,.ogg,image/*`
- Presentations thumbnail strip: for `s.type === "video"`, use `s.imageId` as the image ID (show poster frame or a video icon)

---

## FEAT-018 — Select/Move HUD Redesign + Flip + Free Rotation

**Status:** ✅ Confirmed working in Vista
**Date:** 2026-06-17
**Vista file:** `artifacts/patient-images/src/pages/editor.tsx`

### What it does
All Select/Move controls moved from the top toolbar into the HUD floating window:
- **Before floater**: Selection Mode (Freehand / Rectangle) + Operation (Move / Copy)
- **After floater**: Transform section (Flip Horizontal, Rotate Left 90°, Rotate Right 90°, angle slider ±180°) + Apply / Copy to Clipboard / Cancel buttons
- Clear All and Undo in the HUD now immediately re-render the canvas

### Floater state extensions
```typescript
type Floater = { dataUrl: string; x: number; y: number; w: number; h: number;
  path?: [number, number][];
  flipH?: boolean;   // ← new
  angle?: number;    // ← new, degrees
};
```

### applyFloater — flip + rotation burn-in
```typescript
const { x, y, w, h, flipH: fh, angle: ang } = floater;
const angRad = ((ang ?? 0) * Math.PI) / 180;
if (fh || angRad !== 0) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angRad);
  if (fh) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
} else {
  ctx.drawImage(img, x, y, w, h);
}
```

### Floater live preview CSS transform
```jsx
style={{
  transform: [
    floater.flipH ? "scaleX(-1)" : "",
    (floater.angle ?? 0) !== 0 ? `rotate(${floater.angle}deg)` : "",
  ].filter(Boolean).join(" ") || undefined,
}}
```

### Clear All / Undo immediate re-render fix
Added `scaleRef` and `rotationRef` (always-current refs synced via useEffect). Used in `undoAnnotation` and the Clear All onClick to call `renderCanvas` immediately after syncing `annotationsRef.current`.

### i18n keys added (all 4 locales)
- `editor.selectionMode`, `editor.transferMode`, `editor.transformLabel`
- `editor.flipHorizontal`, `editor.rotateLeft`, `editor.rotateRight`, `editor.angle`

---

## FEAT-016 — Per-Patient Access Control

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-17  
**Vista files:**
- `lib/db/src/schema/patient-access.ts` — DB schema
- `artifacts/api-server/src/lib/patientAccess.ts` — access helpers
- `artifacts/api-server/src/routes/user-patient-access.ts` — GET/PUT `/users/:id/patient-access`
- `artifacts/api-server/src/routes/patients.ts`, `images.ts`, `documents.ts` — access checks
- `artifacts/patient-images/src/pages/admin/users.tsx` — PatientAccessDialog UI
- `artifacts/patient-images/src/lib/auth.ts` — `getPatientAccess`, `setPatientAccess`

### What it does
Admins can restrict any `role=user` account to a specific set of patients. Admins/superadmins are always unrestricted. Restrictions apply to every patient-facing endpoint (list, detail, gallery, upload, documents).

### DB schema (`patient_access` table)
```sql
CREATE TABLE patient_access (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL,
  user_id     INT NOT NULL,
  patient_id  INT NOT NULL,
  UNIQUE (tenant_id, user_id, patient_id)
);
```

### Access semantics
`getAccessiblePatientIds(req)` → `null` = unrestricted (admins, superadmins, users with 0 rows). Non-null array = restricted to those IDs.

```typescript
export async function getAccessiblePatientIds(req: Request): Promise<number[] | null> {
  const user = (req as any).user;
  if (!user || user.role === "admin" || user.role === "superadmin") return null;
  const rows = await db.select({ patientId: patientAccess.patientId })
    .from(patientAccess)
    .where(and(eq(patientAccess.tenantId, user.tenantId), eq(patientAccess.userId, user.id)));
  if (rows.length === 0) return null; // no rows = unrestricted
  return rows.map(r => r.patientId);
}

export async function canAccessPatient(req: Request, patientId: number): Promise<boolean> {
  const ids = await getAccessiblePatientIds(req);
  if (ids === null) return true;
  return ids.includes(patientId);
}
```

### API endpoints
- `GET /api/users/:id/patient-access` → `{ patientIds: number[] }`
- `PUT /api/users/:id/patient-access` `{ patientIds: number[] }` → replaces all rows for that user (delete-then-insert); empty array = unrestricted

### Frontend UI (PatientAccessDialog in users.tsx)
- "Access" button appears only on rows where `role === "user"`
- Badge shows "Restricted (N)" or "Unrestricted" below the role badge
- Dialog lists all patients with checkboxes (ScrollArea for long lists)
- Select All / Clear All quick-actions
- Uses `initialized` ref to avoid re-setting selection on re-open

### Route enforcement pattern
```typescript
// List endpoint
const accessibleIds = await getAccessiblePatientIds(req);
if (accessibleIds !== null) {
  query = query.where(inArray(patients.id, accessibleIds as any));
}

// Single-item endpoint
if (!(await canAccessPatient(req, id))) {
  return res.status(403).json({ error: "Access denied" });
}
```

### i18n keys (all 4 locales: en / es / fr / pt)
All keys under `admin.patientAccess*`:
- `patientAccess`, `patientAccessTitle`, `patientAccessDesc`, `patientAccessSave`
- `patientAccessSaved`, `patientAccessSaveError`, `patientAccessLoading`
- `patientAccessUnrestricted`, `patientAccessRestricted`, `patientAccessManage`
- `patientAccessSelectAll`, `patientAccessClearAll`, `patientAccessNoPatients`, `patientAccessBadge`

Manual section key: `manual.sections.patientAccess` + `manual.patientAccess.{heading,body}`

---

## FEAT-017 — Ceph Tracing: Treatment Phase Selection & Colour Coding

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-28  
**Vista files:**
- `artifacts/patient-images/src/pages/cephalometrics-trace.tsx` — phase selector in setup dialog
- `artifacts/patient-images/src/pages/cephalometrics-tracing.tsx` — phase badge + colour-coded canvas
- `lib/db/src/schema/ceph-tracings.ts` — `record_phase TEXT DEFAULT 'initial'` column
- `artifacts/api-server/src/routes/ceph.ts` — POST stores `recordPhase`, GET returns it

### What it does
Each ceph tracing is tagged with a treatment phase (Initial · Progress · Final · Retention). The phase is set in the "New Tracing" setup dialog and is stored persistently. In the result view, the phase badge is colour-coded and the tracing lines + landmark dots use the same phase colour instead of a fixed colour.

### Phase colours
```typescript
const PHASE_COLORS: Record<string, string> = {
  initial:   "#3b82f6",  // blue
  progress:  "#f59e0b",  // amber
  final:     "#22c55e",  // green
  retention: "#a855f7",  // purple
};
```

### DB column
```sql
ALTER TABLE ceph_tracings ADD COLUMN IF NOT EXISTS record_phase TEXT DEFAULT 'initial';
```

### API
- **POST** `/api/ceph/tracings` — accepts `recordPhase` in body, validates against `['initial','progress','final','retention']`, defaults to `'initial'`
- **GET** `/api/ceph/tracings/:id` — returns `recordPhase` in response

### i18n keys (all 4 locales: en / es / fr / pt)
```
ceph.phase.initial, ceph.phase.progress, ceph.phase.final, ceph.phase.retention
ceph.trace.selectPhase
```

---

## FEAT-018 — Ceph Result View: Show/Hide Tracing Overlay Toggle

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-28  
**Vista file:** `artifacts/patient-images/src/pages/cephalometrics-tracing.tsx`

### What it does
An Eye/EyeOff toggle button in the tracing result header lets the clinician hide all tracing overlays (landmark dots and measurement lines) from the canvas, revealing the raw radiograph underneath. Clicking again restores the overlay. This allows direct visual comparison without leaving the page.

### Implementation
```typescript
const [showOverlay, setShowOverlay] = useState(true);

// renderCanvas now accepts showOverlay param
function renderCanvas(..., showOverlay: boolean) {
  // draw image always
  if (img && img.complete) ctx.drawImage(img, ...);
  // conditionally draw overlays
  if (showOverlay) {
    drawMeasurementOverlays(...);
    for (const pt of placed) { /* draw dots */ }
  }
}

function doRender(overlay = showOverlay) {
  renderCanvas(canvas, imgRef.current, scale, panX, panY, placed, measurements, phaseColor, phaseColor + "cc", overlay);
}

useEffect(() => { doRender(); }, [scale, panX, panY, placed.length, measurements.length, phaseColor, showOverlay]);
```

### Button (placed in header between info and zoom controls)
```jsx
<Button variant={showOverlay ? "secondary" : "outline"} size="sm"
  onClick={() => setShowOverlay(v => !v)}>
  {showOverlay ? <Eye /> : <EyeOff />}
  {showOverlay ? t("ceph.trace.hideOverlay") : t("ceph.trace.showOverlay")}
</Button>
```

### i18n keys
`ceph.trace.showOverlay`, `ceph.trace.hideOverlay`

---

## FEAT-019 — Ceph Result View: Save Traced Radiograph to Patient Gallery

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-28  
**Vista file:** `artifacts/patient-images/src/pages/cephalometrics-tracing.tsx`

### What it does
An "ImagePlus" button in the tracing result header renders the radiograph + full tracing overlay at the **original image resolution** (not the viewport size) into an offscreen canvas and uploads it as a new PNG in the patient's image gallery. The saved image can then be used in presentations, superimpositions, and print documents.

### Implementation
```typescript
import { uploadPatientImage } from "@/lib/upload";

async function handleSaveToGallery() {
  const img = imgRef.current;
  if (!img || !img.complete || img.naturalWidth === 0) { /* toast error */ return; }
  setIsSaving(true);
  try {
    // Offscreen canvas at full image resolution
    const offscreen = document.createElement("canvas");
    offscreen.width = img.naturalWidth;
    offscreen.height = img.naturalHeight;
    // Render at scale=1, panX=0, panY=0 → fills canvas at 1:1 pixel quality
    renderCanvas(offscreen, img, 1, 0, 0, placed, measurements, phaseColor, phaseColor + "cc", true);
    const blob = await new Promise<Blob>((resolve, reject) =>
      offscreen.toBlob(b => b ? resolve(b) : reject(), "image/png")
    );
    const name = `${tracing.templateName ?? "Tracing"}_${format(new Date(tracing.createdAt), "yyyy-MM-dd")}.png`;
    const file = new File([blob], name, { type: "image/png" });
    await uploadPatientImage(file, tracing.patientId, `Cephalometric tracing — ${tracing.templateName}`);
    toast({ title: t("ceph.trace.savedToGallery") });
  } catch {
    toast({ variant: "destructive", title: t("ceph.trace.saveGalleryFailed") });
  } finally {
    setIsSaving(false);
  }
}
```

### Key notes for Max7 agent
- Uses `renderCanvas` with `scale=1, panX=0, panY=0` — this makes the image fill the offscreen canvas at pixel-perfect resolution because the canvas transform becomes `translate(w/2, h/2), scale(1)` and the image is drawn at `(-w/2, -h/2)`.
- Always saves with `showOverlay=true` regardless of the current toggle state.
- Reuses the existing `uploadPatientImage` three-step signed-URL flow (FEAT-006) — no new API endpoints needed.
- After upload, the gallery query cache is automatically invalidated by `uploadPatientImage`.

### i18n keys
`ceph.trace.saveToGallery`, `ceph.trace.savedToGallery`, `ceph.trace.saveGalleryFailed`, `ceph.trace.saveGalleryNoImage`, `ceph.trace.saveGalleryNote`

---

## FEAT-016 — Witts Analysis (new geometry type: witts)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-06-28  
**Vista files:**
- `artifacts/api-server/src/routes/ceph.ts` — `wittsMm()` function + `case "witts"` in `computeMeasurement`
- `artifacts/api-server/src/index.ts` — seed block for Witts Analysis template

### What it does
Adds a 4th system cephalometric analysis template — the Witts Appraisal — which measures the sagittal jaw relationship by projecting Points A and B perpendicularly onto the occlusal plane and computing the signed distance between their feet (AO and BO).

### New measurement type: `witts`
The existing 4 types (line, angle, perpendicular, line_angle) cannot express this because they don't compute derived intermediate points. A new 5th type was required:
- `p1` = Point A, `p2` = Point B
- `p3` = anterior occlusal reference (OcP1 — premolar region), `p4` = posterior reference (OcP2 — molar region)
- Result unit: **mm**, signed

```typescript
function wittsMm(a: Pt, b: Pt, lineP: Pt, lineQ: Pt, pxPerMm: number): number {
  const dx = lineQ.x - lineP.x, dy = lineQ.y - lineP.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const tA = ((a.x - lineP.x) * dx + (a.y - lineP.y) * dy) / lenSq;
  const tB = ((b.x - lineP.x) * dx + (b.y - lineP.y) * dy) / lenSq;
  // tB - tA > 0 when A is anterior to B (Class III)
  return (tB - tA) * Math.sqrt(lenSq) / pxPerMm;
}
```

**Sign convention (Jacobson 1975):** positive = AO anterior to BO = Class III tendency; negative = Class II tendency. Ideal range: −2 to +2 mm.

### Template landmarks
| Label | Name |
|-------|------|
| A | Point A |
| B | Point B |
| OcP1 | Occlusal Plane (Anterior) — between upper/lower premolar cusp tips |
| OcP2 | Occlusal Plane (Posterior) — between upper/lower molar cusp tips |

### Notes for Max7 agent
- `witts` type uses p1, p2, p3, p4 (all 4 point slots) — no `angleQuadrant` needed.
- The `computeMeasurement` switch must include `case "witts"` returning `wittsMm(p1, p2, p3, p4, pxPerMm)`.
- No front-end rendering change needed — result is displayed as a plain mm value like `perpendicular`.
- i18n key: `ceph.trace.wittsAppraisal` → "Witts Appraisal" / "Valoración de Witts" / "Analyse de Witts" / "Análise de Witts"

---

## FEAT-020 — License & Activation System (Desktop/Electron Only)

**Status:** ✅ Confirmed working in Vista  
**Date:** 2026-07-01  
**Vista files:**
- `artifacts/api-server/src/lib/license.ts` — core license library
- `artifacts/api-server/src/routes/license.ts` — GET /api/license/status, POST /api/license/activate
- `artifacts/api-server/src/index.ts` — `license` table in `initSqlite()`
- `artifacts/electron-app/src/main.ts` — license gate on startup, `createLicenseWindow()`, IPC handlers
- `artifacts/electron-app/src/preload.ts` — `license.activated` / `license.skip` IPC bridges
- `artifacts/electron-app/src/license.html` — blocking activation page
- `artifacts/patient-images/src/components/layout.tsx` — `TrialBanner` component
- `artifacts/patient-images/src/pages/settings.tsx` — License card section
- `tools/gen-license.mjs` — vendor-side code generator script

### What it does
A 30-day free trial gates the desktop app. After expiry (or if a license is tampered/expired), a blocking HTML window appears at startup. Users enter a vendor-issued activation code tied to their machine ID to unlock. A trial banner appears in the sidebar during the trial period. Settings → License shows status, machine ID, and an activation form.

### License code format
`MAX7-{base64url(JSON{mid,plan,exp})}.{HMAC-SHA256-hex}`
- `mid`: machine ID (HMAC-derived hardware fingerprint stored in `userData/machine.id`)
- `plan`: `"standard"` | `"pro"` | `"lifetime"` | etc.
- `exp`: ISO expiry date string, or `null` for lifetime

### License states
| State | Meaning |
|-------|---------|
| `trial` | Within 30-day trial window |
| `trial_expired` | Trial period elapsed, no activation |
| `active` | Valid license activated |
| `expired` | Activated license past expiry date |
| `tampered` | Record hash mismatch (DB row modified) |

### SQLite schema
```sql
CREATE TABLE IF NOT EXISTS license (
  id INTEGER PRIMARY KEY,
  machineId TEXT NOT NULL,
  code TEXT NOT NULL,
  plan TEXT NOT NULL,
  activatedAt TEXT NOT NULL,
  expiresAt TEXT,
  recordHash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
- `app_meta` stores `install_date` (ISO string, set on first launch).
- `recordHash` = HMAC-SHA256 of `${machineId}|${code}|${plan}|${activatedAt}|${expiresAt ?? ""}`.
- Trial start = `install_date` from `app_meta`. Trial ends 30 days later.

### Machine ID derivation
```typescript
// computeMachineId() in license.ts
const raw = `${cpuModel}:${macAddr}:${hostname}`;
const id = crypto.createHmac("sha256", machineSecret).update(raw).digest("hex");
// Persisted to userData/machine.id + userData/machine.id.sig for tamper detection
```
`machineSecret` = `LICENSE_HMAC_SECRET` env var (baked into Electron build); same secret used for HMAC-signing license codes and record hashes.

### Startup gate in main.ts
```typescript
const licenseStatus = await checkLicenseStatus();
const needsLicenseScreen =
  licenseStatus?.state === "trial_expired" ||
  licenseStatus?.state === "expired" ||
  licenseStatus?.state === "tampered";

if (needsLicenseScreen) {
  createLicenseWindow(); // blocking window, IPC opens main window on activation
} else {
  showFirstRunDialog();
  createWindow();
}
```

### IPC flow (license.html → main.ts → renderer)
- `license:activated` — user activates; main.ts closes license window, calls `createWindow()`
- `license:skip` — shown only in trial states (not in expired/tampered); same effect

### Trial banner (layout.tsx)
`TrialBanner` queries `/api/license/status` every 60 seconds (enabled only when `isElectron`). Shows yellow banner for `trial` states (with days remaining), red for `trial_expired`. Both include a link to Settings.

### Settings License card (settings.tsx)
Shown only when `isElectron`. Displays: status badge, days remaining or plan/expiry, machine ID (with one-click copy), and an activation code input form.

### Vendor code generator (tools/gen-license.mjs)
```bash
node tools/gen-license.mjs --mid <machineId> --plan standard --exp 2027-01-01
# Outputs: MAX7-eyJtaWQi...base64....HMAC
```
Run with `LICENSE_HMAC_SECRET=<production-secret>`.

### i18n keys added (all 4 locales — top-level `"license"` object, NOT inside `"settings"`)
`title`, `machineId`, `machineIdDesc`, `copy`, `copied`, `stateTrial`, `stateActive`, `stateExpired`, `stateTrialExpired`, `stateTampered`, `trialDaysLeft_one/_other`, `trialExpiredMsg`, `activeMsg`, `activePlan`, `activeExpires`, `activeLifetime`, `tamperedMsg`, `expiredMsg`, `activateTitle`, `activateDesc`, `codeLabel`, `codePlaceholder`, `activateBtn`, `activating`, `activateSuccess`, `activateSuccessDesc`, `activateError`, `loadError`, `bannerTrial_one/_other`, `bannerExpired`, `bannerActivate`

### Notes for Max7 agent
- The `IS_SQLITE` flag (`ELECTRON_MODE === "true"`) gates all license routes — they are no-ops in the PostgreSQL/web deployment.
- `LICENSE_HMAC_SECRET` must be baked into the production build via an env var injected in `build-full.mjs`; fallback is `"max7-dev-fallback-secret-CHANGEME"`.
- Register `licenseRouter` BEFORE `requireAuth` in the API routes so unauthenticated Electron startup can still call `/api/license/status`.
- The blocking `license.html` is a standalone HTML file (no React); it calls the API directly via `fetch("http://127.0.0.1:<port>/api/license/...`)` and uses `window.electronAPI.license.activated()` / `license.skip()` IPC.

---

## FEAT-011 — Gallery Tag Filtering, Presentation Creation & Export (ZIP / PDF / PPTX)

**Status:** ✅ Confirmed working in Vista (e2e tested)
**Date:** 2026-07-02
**Vista files:**
- `artifacts/api-server/src/routes/images.ts` — `tagIds` query filter, relaxed `/:id/file` auth for library assets, `POST /images/export-zip`
- `artifacts/api-server/src/routes/presentations.ts` — tenant-scoped CRUD
- `lib/db/src/schema/presentations.ts` — added `tenantId` column
- `artifacts/patient-images/src/pages/gallery.tsx` — tag pills, selection mode, Create Presentation dialog, Export dropdown, preview dialog
- `artifacts/patient-images/src/pages/presentations.tsx` — per-card export dropdown (PDF/PPTX)
- `artifacts/patient-images/src/lib/imageExport.ts`, `presentationExport.ts` — ZIP/PDF/PPTX generation

### What it does
1. Gallery can filter the merged patient-image + library-asset grid by one or many tags (union match: an image matching ANY selected tag is shown). Default is "Show All" (no filter).
2. A selection mode lets the user multi-select tiles (patient images and/or library assets together) and either:
   - **Create a presentation** from the selection (dialog: pick existing presentation or create new, optional patient scoping), or
   - **Export**: download a ZIP of the selected images, or download them individually.
3. Presentations can be exported as **PDF** (jsPDF) or **PowerPoint** (PptxGenJS) from a dropdown on each presentation card (not from the gallery — exporting a *presentation* happens on the Presentations page; exporting *raw images* happens on the Gallery page).

### Critical pre-existing bug found & fixed: presentations had no tenant scoping
`presentationsTable` had **no `tenantId` column**. The GET/PUT/DELETE `/presentations/:id` routes enforced tenant isolation via an `INNER JOIN` to `patientsTable` on `patientId`. This meant **any presentation with `patientId = null` (i.e. a cross-patient / gallery-wide presentation) could never be fetched, updated, or deleted** — the join had nothing to match, so every such lookup silently 404'd. This is a strong general anti-pattern: **never enforce tenant scoping via a join through an optional/nullable foreign key** — a null FK means the row is permanently invisible.

**Fix:** added a direct non-null `tenantId` column (FK to tenants) on `presentationsTable`. All routes (`POST`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET` list) now filter by `eq(presentationsTable.tenantId, tenantId)` directly instead of joining through `patientsTable`. `patientsTable` join is now only used to *validate* an optional `patientId` belongs to the tenant on create, not for auth scoping.

### Notes for Max7 agent
- If Max7's presentations/collections table has an optional `patientId` (or any optional owner-scoping FK), check whether tenant/user scoping is enforced via a join through that same nullable column — if so it has the identical bug and null-FK rows are unreachable. Add a direct non-null `tenantId`/`userId` column instead.
- Tag filter union-match: build the `tagIds` query filter as `IN` semantics (any selected tag matches), not `AND` (all tags must match) — this was the deliberately chosen UX for "show me anything with tag A or B".
- Export split by page is intentional UX: Gallery = raw image export (ZIP/individual); Presentations page = formatted document export (PDF/PPTX). Don't collapse these into one control.

---

## FEAT-021 — Manual Drag-and-Drop Reordering of Patient Images

**Status:** ✅ Confirmed working in Vista (e2e tested with real drag gestures)
**Date:** 2026-07-02
**Vista files:**
- `lib/db/src/schema/images.ts`, `lib/db/src/schema-sqlite/images.ts` — nullable `sortOrder` integer column added to `images`
- `artifacts/api-server/src/routes/images.ts` — `POST /images/reorder` endpoint; `GET /images` and `GET /patients/:id/images` order by `sortOrder IS NULL, sortOrder, capturedAt`
- `lib/api-spec/openapi.yaml` — `ReorderImagesInput` schema + `/images/reorder` path (regenerates `useReorderImages` hook via orval codegen)
- `artifacts/patient-images/src/components/image-grid.tsx` — drag-and-drop UI (only active on the single-patient gallery, not the cross-patient library gallery)
- `artifacts/patient-images/src/pages/patient-detail.tsx` — passes `reorderablePatientId={patient.id}` to opt in

### What it does
On a patient's own image grid (patient-detail page only — NOT the cross-patient library/gallery view), each image card shows a small grip/drag-handle icon (top-left). Dragging a card to a new position reorders the grid; the new order is optimistically applied client-side and persisted server-side via `POST /images/reorder` (body: `{ patientId, orderedIds: number[] }`), which writes a 0-based `sortOrder` to every image in the list. Rows with `sortOrder = NULL` (never explicitly ordered) sort after ordered rows, by `capturedAt`, preserving the old chronological default until a user actively reorders.

### Non-obvious bug found and fixed: drag-drop triggered stray navigation
The whole card is a `<Link>` to the image editor (`/editor/:id`) so a normal click opens it. The drag handle itself guarded its own `onClick` with `preventDefault`/`stopPropagation`, but that only protects clicks landing back on the handle. **The mouseup/click that ends a drag actually fires on whichever card is under the cursor at drop time — the drop-target card, not the card the drag started on** — so dropping card A onto card B's slot fired a real click on card B's own `<Link>` and navigated to B's editor page instead of completing the reorder.

**Fix pattern (generalizable to any drag-and-drop-over-clickable-cards UI):** use a single shared ref (`suppressClickRef`), not a per-card flag. Set it `true` in the drag library's `onDragEnd` (or `onDragStart`, whichever fires first) and clear it via `setTimeout(fn, 0)` (a macrotask, so it runs after the synchronous click has already been dispatched and swallowed). Every card wraps its clickable region with `onClickCapture` that checks the shared ref and calls `preventDefault`/`stopPropagation` if a drag just ended — this covers the drop-target card too, since the ref is shared across all cards, not scoped to the one being dragged. Also set `draggable={false}` on `<img>` tags inside draggable cards to stop the browser's native image-drag ghost from interfering with the drag library's own pointer tracking.

### Testing caveat
Automated Playwright-driven drag simulations that jump directly from source to target coordinates in one step can cause the collision-detection algorithm (e.g. dnd-kit's `closestCenter`) to resolve to the wrong drop index, because the algorithm needs intermediate pointermove events to track which card is currently under the cursor. Real user drags (continuous mouse movement) are unaffected. When e2e-testing this pattern, use many small incremental mouse-move steps, not one large jump.

### Notes for Max7 agent
- If Max7's image grid already opens the editor on click, this stray-navigation bug will reproduce identically — apply the shared-ref `onClickCapture` guard, not a per-handle guard.
- Only enable reordering on the single-patient grid; the cross-patient/library gallery view should stay in its existing (non-reorderable) order to avoid ambiguous cross-patient sort semantics.
- Keep the sort column nullable and order `NULL`-first-by-recency so existing unordered images don't visually jump around the first time this ships — only images a user has explicitly touched get a `sortOrder`.

---

<!-- Add new entries below as features are confirmed in Vista -->
