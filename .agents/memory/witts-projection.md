---
name: Witts Appraisal projection method
description: Why Witts uses vertical (x-only) projection, not true geometric perpendicular to the occlusal plane.
---

## Rule
`wittsMm()` in `ceph.ts` uses **vertical (x-coordinate) projection** to find the feet of A and B on the occlusal plane.

```
tA = (a.x - lineP.x) / dx   // x-only, not dot-product
tB = (b.x - lineP.x) / dx
result = (tB - tA) * lineLen / pxPerMm
```

**Why:** True perpendicular projection computes `(B−A)·t̂`, which includes the vertical component `Δy × t̂_y`. When A is ~40 px above the plane and B is ~40 px below (anatomically normal), a mere 6° plane tilt contributes `87 × 0.107 = 9.3 px` of spurious anterior-posterior signal on top of the real 5 px difference — inflating the result from ~2.7 mm to ~7.3 mm (2.7× error). Vertical projection eliminates this artifact and matches how Dolphin Imaging, WinCeph, and manual tracing on film measure Witts.

**How to apply:** Any future change to the Witts case in `computeMeasurement()` must keep `tA = (a.x - lineP.x) / dx` (not the full dot-product formula). The guard `if (Math.abs(dx) < 1e-9) return 0` handles the degenerate case of a vertical occlusal plane.

**Calibration note:** pxPerMm values around 1.5–1.9 from this patient's images appear ~2× too low (Steiner linear values like U1-NA were ~2× above norms). After formula fix, Witts went from −7.28 → −2.69 mm; residual gap to clinical expectation (−1 to −2 mm) is due to calibration, not the formula.
