import { Router, type IRouter } from "express";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import {
  db,
  cephTemplatesTable,
  cephLandmarksTable,
  cephMeasurementsTable,
  cephTracingsTable,
  cephTracingPointsTable,
  cephTracingResultsTable,
  patientsTable,
  imagesTable,
} from "@workspace/db";
import { getAccessiblePatientIds, canAccessPatient } from "../lib/patientAccess";

const router: IRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

function isAdmin(req: any): boolean {
  const role = req.session?.role as string | undefined;
  return role === "admin" || role === "superadmin";
}

function errRes(res: any, err: any): void {
  if (err?.status === 403) { res.status(403).json({ error: err.message }); return; }
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[ceph]", msg);
  res.status(500).json({ error: msg });
}

// ─── Geometry ────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

function lineLengthMm(p1: Pt, p2: Pt, pxPerMm: number): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y) / pxPerMm;
}

function angleDeg(vertex: Pt, arm1: Pt, arm2: Pt): number {
  const v1 = { x: arm1.x - vertex.x, y: arm1.y - vertex.y };
  const v2 = { x: arm2.x - vertex.x, y: arm2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

function lineAngleDeg(a: Pt, b: Pt, c: Pt, d: Pt, quadrant: string | null): number {
  const v1 = { x: b.x - a.x, y: b.y - a.y };
  const v2 = { x: d.x - c.x, y: d.y - c.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  const acuteAngle = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot) / mag))) * (180 / Math.PI);
  if (!quadrant) return acuteAngle;
  // Compute which quadrant the acute-angle bisector falls in (screen coords: y increases downward).
  // Flip u2 when dot < 0 so the bisector always points toward the interior of the acute angle.
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  const u1 = { x: v1.x / m1, y: v1.y / m1 };
  const flip = dot < 0;
  const u2 = { x: flip ? -v2.x / m2 : v2.x / m2, y: flip ? -v2.y / m2 : v2.y / m2 };
  const bis = { x: u1.x + u2.x, y: u1.y + u2.y };
  const bisIsUpper = bis.y <= 0;
  const bisIsRight = bis.x >= 0;
  const wantUpper = quadrant.startsWith("upper");
  const wantRight = quadrant.endsWith("right");
  return (bisIsUpper === wantUpper && bisIsRight === wantRight) ? acuteAngle : 180 - acuteAngle;
}

function perpendicularMm(p: Pt, a: Pt, b: Pt, pxPerMm: number): number {
  const lineLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (lineLen === 0) return 0;
  const area = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y));
  return area / lineLen / pxPerMm;
}

// Witts Appraisal (Jacobson 1975): signed distance between the vertical-projection
// feet of Point A (p1) and Point B (p2) on the occlusal plane defined by lineP→lineQ.
// lineP should be the ANTERIOR occlusal point (incisal/premolar region),
// lineQ the POSTERIOR occlusal point (molar region).
//
// Projection method: vertical (x-coordinate) projection — the same method used by
// clinical software (Dolphin, WinCeph) and manual tracing.  True geometric
// perpendiculars amplify the result when A/B are far from the plane on opposite
// sides, because the vertical distance between A and B gets dot-producted onto the
// slight plane tilt.  Vertical projection isolates the pure anterior-posterior
// relationship without that distortion.
//
// Sign convention (Jacobson 1975):
//   negative = BO anterior to AO = Class II tendency
//   positive = AO anterior to BO = Class III tendency
function wittsMm(a: Pt, b: Pt, lineP: Pt, lineQ: Pt, pxPerMm: number): number {
  const dx = lineQ.x - lineP.x;
  const dy = lineQ.y - lineP.y;
  if (Math.abs(dx) < 1e-9) return 0; // degenerate vertical plane
  const lineLen = Math.sqrt(dx * dx + dy * dy);
  // t-parameters using only the x-coordinate (vertical projection onto the plane)
  const tA = (a.x - lineP.x) / dx;
  const tB = (b.x - lineP.x) / dx;
  // (tB - tA) > 0 when B's foot is more posterior (Class II), < 0 when more anterior (Class III)
  return (tB - tA) * lineLen / pxPerMm;
}

function computeMeasurement(
  m: { type: string; p1Label: string; p2Label: string; p3Label: string | null; p4Label: string | null; angleQuadrant: string | null; unit: string },
  pts: Map<string, Pt>,
  pxPerMm: number,
): number | null {
  const p1 = pts.get(m.p1Label) ?? null;
  const p2 = pts.get(m.p2Label) ?? null;
  const p3 = m.p3Label ? pts.get(m.p3Label) ?? null : null;
  const p4 = m.p4Label ? pts.get(m.p4Label) ?? null : null;
  if (!p1 || !p2) return null;
  switch (m.type) {
    case "line":
      return lineLengthMm(p1, p2, pxPerMm);
    case "angle":
      return p3 ? angleDeg(p1, p2, p3) : null;
    case "perpendicular":
      return p3 ? perpendicularMm(p1, p2, p3, pxPerMm) : null;
    case "line_angle":
      return p3 && p4 ? lineAngleDeg(p1, p2, p3, p4, m.angleQuadrant) : null;
    case "witts":
      return p3 && p4 ? wittsMm(p1, p2, p3, p4, pxPerMm) : null;
    default:
      return null;
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

router.get("/ceph/templates", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const templates = await db
      .select()
      .from(cephTemplatesTable)
      .where(or(isNull(cephTemplatesTable.tenantId), eq(cephTemplatesTable.tenantId, tenantId)))
      .orderBy(cephTemplatesTable.name);

    // Attach landmark and measurement counts efficiently
    const ids = templates.map((t) => t.id);
    let landmarkCounts: Record<number, number> = {};
    let measurementCounts: Record<number, number> = {};
    if (ids.length > 0) {
      const lmRows = await db
        .select({ templateId: cephLandmarksTable.templateId })
        .from(cephLandmarksTable)
        .where(inArray(cephLandmarksTable.templateId, ids));
      const mRows = await db
        .select({ templateId: cephMeasurementsTable.templateId })
        .from(cephMeasurementsTable)
        .where(inArray(cephMeasurementsTable.templateId, ids));
      for (const row of lmRows) {
        landmarkCounts[row.templateId] = (landmarkCounts[row.templateId] ?? 0) + 1;
      }
      for (const row of mRows) {
        measurementCounts[row.templateId] = (measurementCounts[row.templateId] ?? 0) + 1;
      }
    }

    res.json(
      templates.map((t) => ({
        ...t,
        landmarkCount: landmarkCounts[t.id] ?? 0,
        measurementCount: measurementCounts[t.id] ?? 0,
      }))
    );
  } catch (err: any) { errRes(res, err); }
});

router.get("/ceph/templates/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [template] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, id));
    if (!template || (template.tenantId !== null && template.tenantId !== tenantId)) {
      res.status(404).json({ error: "Template not found" }); return;
    }
    const landmarks = await db.select().from(cephLandmarksTable)
      .where(eq(cephLandmarksTable.templateId, id))
      .orderBy(cephLandmarksTable.displayOrder);
    const measurements = await db.select().from(cephMeasurementsTable)
      .where(eq(cephMeasurementsTable.templateId, id))
      .orderBy(cephMeasurementsTable.displayOrder);
    res.json({ ...template, landmarks, measurements });
  } catch (err: any) { errRes(res, err); }
});

router.post("/ceph/templates", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
    const [template] = await db.insert(cephTemplatesTable)
      .values({ tenantId, name: name.trim(), description: description?.trim() ?? null, locked: false })
      .returning();
    res.status(201).json(template);
  } catch (err: any) { errRes(res, err); }
});

router.patch("/ceph/templates/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, id));
    if (!existing || existing.tenantId !== tenantId) { res.status(404).json({ error: "Template not found" }); return; }
    if (existing.locked) { res.status(403).json({ error: "System templates are read-only. Use copy." }); return; }
    const { name, description } = req.body as { name?: string; description?: string };
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name.trim();
    if (description !== undefined) patch.description = description;
    const [updated] = await db.update(cephTemplatesTable).set(patch).where(eq(cephTemplatesTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) { errRes(res, err); }
});

router.delete("/ceph/templates/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, id));
    if (!existing || existing.tenantId !== tenantId) { res.status(404).json({ error: "Template not found" }); return; }
    if (existing.locked) { res.status(403).json({ error: "System templates cannot be deleted" }); return; }
    await db.delete(cephTemplatesTable).where(eq(cephTemplatesTable.id, id));
    res.sendStatus(204);
  } catch (err: any) { errRes(res, err); }
});

// POST /api/ceph/templates/:id/copy — duplicate a template (including landmarks + measurements) for the tenant
router.post("/ceph/templates/:id/copy", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const sourceId = parseInt(req.params.id, 10);
    if (isNaN(sourceId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [source] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, sourceId));
    if (!source || (source.tenantId !== null && source.tenantId !== tenantId)) {
      res.status(404).json({ error: "Template not found" }); return;
    }
    const newName = req.body?.name?.trim() || `${source.name} (copy)`;
    const [newTemplate] = await db.insert(cephTemplatesTable)
      .values({ tenantId, name: newName, description: source.description, locked: false })
      .returning();
    const landmarks = await db.select().from(cephLandmarksTable).where(eq(cephLandmarksTable.templateId, sourceId));
    if (landmarks.length > 0) {
      await db.insert(cephLandmarksTable).values(landmarks.map((l) => ({
        templateId: newTemplate.id, label: l.label, name: l.name, description: l.description, displayOrder: l.displayOrder,
      })));
    }
    const measurements = await db.select().from(cephMeasurementsTable).where(eq(cephMeasurementsTable.templateId, sourceId));
    if (measurements.length > 0) {
      await db.insert(cephMeasurementsTable).values(measurements.map((m) => ({
        templateId: newTemplate.id, name: m.name, type: m.type,
        p1Label: m.p1Label, p2Label: m.p2Label, p3Label: m.p3Label, p4Label: m.p4Label,
        angleQuadrant: m.angleQuadrant, unit: m.unit, displayOrder: m.displayOrder,
        idealMin: m.idealMin ?? null, idealMax: m.idealMax ?? null,
      })));
    }
    const [full] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, newTemplate.id));
    const newLandmarks = await db.select().from(cephLandmarksTable).where(eq(cephLandmarksTable.templateId, newTemplate.id)).orderBy(cephLandmarksTable.displayOrder);
    const newMeasurements = await db.select().from(cephMeasurementsTable).where(eq(cephMeasurementsTable.templateId, newTemplate.id)).orderBy(cephMeasurementsTable.displayOrder);
    res.status(201).json({ ...full, landmarks: newLandmarks, measurements: newMeasurements });
  } catch (err: any) { errRes(res, err); }
});

// ─── Landmarks ───────────────────────────────────────────────────────────────

router.get("/ceph/templates/:id/landmarks", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || (tmpl.tenantId !== null && tmpl.tenantId !== tenantId)) { res.status(404).json({ error: "Template not found" }); return; }
    const landmarks = await db.select().from(cephLandmarksTable).where(eq(cephLandmarksTable.templateId, templateId)).orderBy(cephLandmarksTable.displayOrder);
    res.json(landmarks);
  } catch (err: any) { errRes(res, err); }
});

router.post("/ceph/templates/:id/landmarks", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId) { res.status(404).json({ error: "Template not found" }); return; }
    if (tmpl.locked) { res.status(403).json({ error: "System templates are read-only" }); return; }
    const { label, name, description, displayOrder } = req.body as { label?: string; name?: string; description?: string; displayOrder?: number };
    if (!label?.trim() || !name?.trim()) { res.status(400).json({ error: "label and name are required" }); return; }
    const [lm] = await db.insert(cephLandmarksTable)
      .values({ templateId, label: label.trim(), name: name.trim(), description: description ?? null, displayOrder: displayOrder ?? 0 })
      .returning();
    res.status(201).json(lm);
  } catch (err: any) { errRes(res, err); }
});

router.patch("/ceph/templates/:id/landmarks/:lmId", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    const lmId = parseInt(req.params.lmId, 10);
    if (isNaN(templateId) || isNaN(lmId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId || tmpl.locked) { res.status(403).json({ error: "Forbidden" }); return; }
    const { label, name, description, displayOrder } = req.body as Record<string, any>;
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch.label = label.trim();
    if (name !== undefined) patch.name = name.trim();
    if (description !== undefined) patch.description = description;
    if (displayOrder !== undefined) patch.displayOrder = displayOrder;
    const [updated] = await db.update(cephLandmarksTable).set(patch)
      .where(and(eq(cephLandmarksTable.id, lmId), eq(cephLandmarksTable.templateId, templateId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Landmark not found" }); return; }
    res.json(updated);
  } catch (err: any) { errRes(res, err); }
});

router.delete("/ceph/templates/:id/landmarks/:lmId", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    const lmId = parseInt(req.params.lmId, 10);
    if (isNaN(templateId) || isNaN(lmId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId || tmpl.locked) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(cephLandmarksTable).where(and(eq(cephLandmarksTable.id, lmId), eq(cephLandmarksTable.templateId, templateId)));
    res.sendStatus(204);
  } catch (err: any) { errRes(res, err); }
});

// PUT /api/ceph/templates/:id/landmarks/reorder — reorder landmarks
router.put("/ceph/templates/:id/landmarks/reorder", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId || tmpl.locked) { res.status(403).json({ error: "Forbidden" }); return; }
    const { order } = req.body as { order?: number[] };
    if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array of ids" }); return; }
    for (let i = 0; i < order.length; i++) {
      await db.update(cephLandmarksTable).set({ displayOrder: i })
        .where(and(eq(cephLandmarksTable.id, order[i]), eq(cephLandmarksTable.templateId, templateId)));
    }
    res.sendStatus(204);
  } catch (err: any) { errRes(res, err); }
});

// ─── Measurements ────────────────────────────────────────────────────────────

router.get("/ceph/templates/:id/measurements", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || (tmpl.tenantId !== null && tmpl.tenantId !== tenantId)) { res.status(404).json({ error: "Template not found" }); return; }
    const measurements = await db.select().from(cephMeasurementsTable).where(eq(cephMeasurementsTable.templateId, templateId)).orderBy(cephMeasurementsTable.displayOrder);
    res.json(measurements);
  } catch (err: any) { errRes(res, err); }
});

router.post("/ceph/templates/:id/measurements", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId) { res.status(404).json({ error: "Template not found" }); return; }
    if (tmpl.locked) { res.status(403).json({ error: "System templates are read-only" }); return; }
    const { name, type, p1Label, p2Label, p3Label, p4Label, angleQuadrant, unit, idealMin, idealMax, displayOrder } = req.body as Record<string, any>;
    if (!name?.trim() || !type || !p1Label || !p2Label || !unit) {
      res.status(400).json({ error: "name, type, p1Label, p2Label, unit are required" }); return;
    }
    const validTypes = ["line", "angle", "perpendicular", "line_angle"];
    if (!validTypes.includes(type)) { res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` }); return; }
    const [m] = await db.insert(cephMeasurementsTable).values({
      templateId, name: name.trim(), type, p1Label, p2Label,
      p3Label: p3Label ?? null, p4Label: p4Label ?? null,
      angleQuadrant: angleQuadrant ?? null, unit,
      idealMin: idealMin != null ? String(idealMin) : null,
      idealMax: idealMax != null ? String(idealMax) : null,
      displayOrder: displayOrder ?? 0,
    }).returning();
    res.status(201).json(m);
  } catch (err: any) { errRes(res, err); }
});

router.patch("/ceph/templates/:id/measurements/:mId", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    const mId = parseInt(req.params.mId, 10);
    if (isNaN(templateId) || isNaN(mId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId || tmpl.locked) { res.status(403).json({ error: "Forbidden" }); return; }
    const patch: Record<string, unknown> = {};
    const allowed = ["name", "type", "p1Label", "p2Label", "p3Label", "p4Label", "angleQuadrant", "unit", "idealMin", "idealMax", "displayOrder"];
    for (const key of allowed) {
      if (key in req.body) patch[key] = req.body[key];
    }
    const [updated] = await db.update(cephMeasurementsTable).set(patch)
      .where(and(eq(cephMeasurementsTable.id, mId), eq(cephMeasurementsTable.templateId, templateId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Measurement not found" }); return; }
    res.json(updated);
  } catch (err: any) { errRes(res, err); }
});

router.delete("/ceph/templates/:id/measurements/:mId", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    const mId = parseInt(req.params.mId, 10);
    if (isNaN(templateId) || isNaN(mId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId || tmpl.locked) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(cephMeasurementsTable).where(and(eq(cephMeasurementsTable.id, mId), eq(cephMeasurementsTable.templateId, templateId)));
    res.sendStatus(204);
  } catch (err: any) { errRes(res, err); }
});

router.put("/ceph/templates/:id/measurements/reorder", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) { res.status(403).json({ error: "Admin role required" }); return; }
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tmpl] = await db.select().from(cephTemplatesTable).where(eq(cephTemplatesTable.id, templateId));
    if (!tmpl || tmpl.tenantId !== tenantId || tmpl.locked) { res.status(403).json({ error: "Forbidden" }); return; }
    const { order } = req.body as { order?: number[] };
    if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array of ids" }); return; }
    for (let i = 0; i < order.length; i++) {
      await db.update(cephMeasurementsTable).set({ displayOrder: i })
        .where(and(eq(cephMeasurementsTable.id, order[i]), eq(cephMeasurementsTable.templateId, templateId)));
    }
    res.sendStatus(204);
  } catch (err: any) { errRes(res, err); }
});

// ─── Tracings ─────────────────────────────────────────────────────────────────

// GET /api/ceph/tracings?patientId=N
router.get("/ceph/tracings", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const accessibleIds = await getAccessiblePatientIds(req);
    const patientId = req.query.patientId ? parseInt(req.query.patientId as string, 10) : null;
    const conditions: any[] = [eq(cephTracingsTable.tenantId, tenantId)];
    if (patientId !== null && !isNaN(patientId)) {
      if (!canAccessPatient(accessibleIds, patientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }
      conditions.push(eq(cephTracingsTable.patientId, patientId));
    } else if (accessibleIds !== null) {
      if (accessibleIds.length === 0) { res.json([]); return; }
      conditions.push(inArray(cephTracingsTable.patientId, accessibleIds));
    }
    const tracings = await db.select().from(cephTracingsTable).where(and(...conditions)).orderBy(cephTracingsTable.createdAt);
    res.json(tracings);
  } catch (err: any) { errRes(res, err); }
});

// GET /api/ceph/tracings/:id — tracing with points and results
router.get("/ceph/tracings/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tracing] = await db.select().from(cephTracingsTable).where(and(eq(cephTracingsTable.id, id), eq(cephTracingsTable.tenantId, tenantId)));
    if (!tracing) { res.status(404).json({ error: "Tracing not found" }); return; }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, tracing.patientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }
    const points = await db.select().from(cephTracingPointsTable).where(eq(cephTracingPointsTable.tracingId, id));
    const results = await db.select().from(cephTracingResultsTable).where(eq(cephTracingResultsTable.tracingId, id));
    const [patient] = await db.select({ name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.id, tracing.patientId));
    res.json({ ...tracing, points, results, patientName: patient?.name ?? null });
  } catch (err: any) { errRes(res, err); }
});

// POST /api/ceph/tracings — create a new tracing
router.post("/ceph/tracings", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const userId = req.session?.userId as number | undefined;
    const { patientId, imageId, templateId, templateName, pxPerMm, name, recordPhase } = req.body as Record<string, any>;
    if (!patientId) { res.status(400).json({ error: "patientId is required" }); return; }
    const parsedPatientId = parseInt(patientId, 10);
    const parsedImageId = imageId ? parseInt(imageId, 10) : null;
    const parsedTemplateId = templateId ? parseInt(templateId, 10) : null;
    if (isNaN(parsedPatientId)) { res.status(400).json({ error: "Invalid patientId" }); return; }

    // Verify patient belongs to caller's tenant and is accessible to this user
    const [patient] = await db.select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, parsedPatientId), eq(patientsTable.tenantId, tenantId)));
    if (!patient) { res.status(403).json({ error: "Patient not found in your organization" }); return; }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, parsedPatientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }

    // Verify image belongs to this patient (if provided)
    if (parsedImageId !== null) {
      const [img] = await db.select({ id: imagesTable.id })
        .from(imagesTable)
        .where(and(eq(imagesTable.id, parsedImageId), eq(imagesTable.patientId, parsedPatientId)));
      if (!img) { res.status(403).json({ error: "Image does not belong to this patient" }); return; }
    }

    // Verify template is accessible: system (tenantId IS NULL) or owned by caller's tenant
    if (parsedTemplateId !== null) {
      const [tmpl] = await db.select({ id: cephTemplatesTable.id })
        .from(cephTemplatesTable)
        .where(and(
          eq(cephTemplatesTable.id, parsedTemplateId),
          or(isNull(cephTemplatesTable.tenantId), eq(cephTemplatesTable.tenantId, tenantId))
        ));
      if (!tmpl) { res.status(403).json({ error: "Template not accessible" }); return; }
    }

    const validPhases = ["initial", "progress", "final", "retention"];
    const [tracing] = await db.insert(cephTracingsTable).values({
      tenantId,
      patientId: parsedPatientId,
      imageId: parsedImageId,
      templateId: parsedTemplateId,
      templateName: templateName ?? null,
      pxPerMm: pxPerMm ? String(pxPerMm) : null,
      name: name ?? null,
      recordPhase: (recordPhase && validPhases.includes(recordPhase)) ? recordPhase : "initial",
      createdBy: userId ?? null,
    }).returning();
    res.status(201).json(tracing);
  } catch (err: any) { errRes(res, err); }
});

// PATCH /api/ceph/tracings/:id — update tracing metadata
router.patch("/ceph/tracings/:id", async (req, res): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: "You cannot modify an existing tracing" }); return; }
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(cephTracingsTable).where(and(eq(cephTracingsTable.id, id), eq(cephTracingsTable.tenantId, tenantId)));
    if (!existing) { res.status(404).json({ error: "Tracing not found" }); return; }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, existing.patientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }
    const { pxPerMm, name, recordPhase } = req.body as Record<string, any>;
    const patch: Record<string, unknown> = {};
    if (pxPerMm !== undefined) patch.pxPerMm = String(pxPerMm);
    if (name !== undefined) patch.name = name;
    const validPhases = ["initial", "progress", "final", "retention"];
    if (recordPhase !== undefined && validPhases.includes(recordPhase)) patch.recordPhase = recordPhase;
    const [updated] = await db.update(cephTracingsTable).set(patch).where(eq(cephTracingsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) { errRes(res, err); }
});

// DELETE /api/ceph/tracings/:id
router.delete("/ceph/tracings/:id", async (req, res): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: "You cannot delete an existing tracing" }); return; }
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(cephTracingsTable).where(and(eq(cephTracingsTable.id, id), eq(cephTracingsTable.tenantId, tenantId)));
    if (!existing) { res.status(404).json({ error: "Tracing not found" }); return; }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, existing.patientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }
    await db.delete(cephTracingsTable).where(eq(cephTracingsTable.id, id));
    res.sendStatus(204);
  } catch (err: any) { errRes(res, err); }
});

// ─── Tracing Points ───────────────────────────────────────────────────────────

// PUT /api/ceph/tracings/:id/points — replace all points for a tracing (upsert)
router.put("/ceph/tracings/:id/points", async (req, res): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: "You cannot modify an existing tracing" }); return; }
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(cephTracingsTable).where(and(eq(cephTracingsTable.id, id), eq(cephTracingsTable.tenantId, tenantId)));
    if (!existing) { res.status(404).json({ error: "Tracing not found" }); return; }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, existing.patientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }
    const { points } = req.body as { points?: { landmarkLabel: string; x: number; y: number }[] };
    if (!Array.isArray(points)) { res.status(400).json({ error: "points must be an array" }); return; }
    // Replace all points
    await db.delete(cephTracingPointsTable).where(eq(cephTracingPointsTable.tracingId, id));
    if (points.length > 0) {
      await db.insert(cephTracingPointsTable).values(points.map((p) => ({
        tracingId: id, landmarkLabel: p.landmarkLabel, x: String(p.x), y: String(p.y),
      })));
    }
    const saved = await db.select().from(cephTracingPointsTable).where(eq(cephTracingPointsTable.tracingId, id));
    res.json(saved);
  } catch (err: any) { errRes(res, err); }
});

// ─── Compute ─────────────────────────────────────────────────────────────────

// POST /api/ceph/tracings/:id/compute — compute all measurements from stored points
router.post("/ceph/tracings/:id/compute", async (req, res): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: "You cannot modify an existing tracing" }); return; }
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [tracing] = await db.select().from(cephTracingsTable).where(and(eq(cephTracingsTable.id, id), eq(cephTracingsTable.tenantId, tenantId)));
    if (!tracing) { res.status(404).json({ error: "Tracing not found" }); return; }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, tracing.patientId)) { res.status(403).json({ error: "Access denied to this patient" }); return; }

    const pxPerMm = tracing.pxPerMm ? parseFloat(String(tracing.pxPerMm)) : null;
    if (!pxPerMm || pxPerMm <= 0) { res.status(400).json({ error: "pxPerMm must be set and positive" }); return; }

    const storedPoints = await db.select().from(cephTracingPointsTable).where(eq(cephTracingPointsTable.tracingId, id));
    const pts = new Map<string, Pt>(storedPoints.map((p) => [p.landmarkLabel, { x: parseFloat(String(p.x)), y: parseFloat(String(p.y)) }]));

    let measurements: typeof cephMeasurementsTable.$inferSelect[] = [];
    if (tracing.templateId) {
      measurements = await db.select().from(cephMeasurementsTable).where(eq(cephMeasurementsTable.templateId, tracing.templateId));
    }

    // Clear existing results
    await db.delete(cephTracingResultsTable).where(eq(cephTracingResultsTable.tracingId, id));

    const results: { measurementName: string; value: number | null; unit: string }[] = [];
    for (const m of measurements) {
      const value = computeMeasurement(m, pts, pxPerMm);
      results.push({ measurementName: m.name, value, unit: m.unit });
    }

    if (results.length > 0) {
      await db.insert(cephTracingResultsTable).values(results.map((r) => ({
        tracingId: id, measurementName: r.measurementName, value: r.value !== null ? String(r.value) : null, unit: r.unit,
      })));
    }

    const saved = await db.select().from(cephTracingResultsTable).where(eq(cephTracingResultsTable.tracingId, id));
    res.json(saved);
  } catch (err: any) { errRes(res, err); }
});

export default router;
