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

<!-- Add new entries below as features are confirmed in Vista -->
