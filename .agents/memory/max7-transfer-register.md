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

<!-- Add new entries below as features are confirmed in Vista -->
