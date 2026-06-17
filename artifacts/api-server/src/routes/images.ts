import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import { db, imagesTable, patientsTable } from "@workspace/db";
import {
  ListImagesQueryParams,
  GetImageParams,
  UpdateImageParams,
  UpdateImageBody,
  DeleteImageParams,
  GetImageFileParams,
  ListPatientImagesParams,
  ReplaceImageFileParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireRole } from "../middlewares/requireAuth";
import { uploadToGcs, streamFile, deleteFile, isGcsPath, toGcsPath, getSignedUploadUrl, readFileAsBuffer } from "../lib/gcsStorage";
import { getAccessiblePatientIds, canAccessPatient } from "../lib/patientAccess";

const router: IRouter = Router();

// Use memory storage so we can place the file in the correct patient/date subfolder
// after we know the patientId from req.body.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

function buildImageRow(row: {
  id: number;
  patientId: number | null;
  filePath: string;
  fileName: string;
  notes: string | null;
  annotation: string | null;
  capturedAt: Date | string;
  isUnassigned: boolean | number;
  createdAt: Date | string;
  patientName?: string | null;
  patientCode?: string | null;
}) {
  const capturedAt = new Date(row.capturedAt as string);
  const createdAt = new Date(row.createdAt as string);
  return {
    id: row.id,
    patientId: row.patientId,
    patientName: row.patientName ?? null,
    patientCode: row.patientCode ?? null,
    filePath: row.filePath,
    fileName: row.fileName,
    notes: row.notes,
    annotation: row.annotation,
    capturedAt: isNaN(capturedAt.getTime()) ? new Date().toISOString() : capturedAt.toISOString(),
    isUnassigned: Boolean(row.isUnassigned),
    createdAt: isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
  };
}

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

router.get("/images/stats", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);

    const [totalImagesRow] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(imagesTable)
      .innerJoin(patientsTable, and(
        eq(patientsTable.id, imagesTable.patientId),
        eq(patientsTable.tenantId, tenantId),
      ));

    const [totalPatientsRow] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(patientsTable)
      .where(eq(patientsTable.tenantId, tenantId));

    const [unassignedRow] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(imagesTable)
      .innerJoin(patientsTable, and(
        eq(patientsTable.id, imagesTable.patientId),
        eq(patientsTable.tenantId, tenantId),
      ))
      .where(eq(imagesTable.isUnassigned, true));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentRow] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(imagesTable)
      .innerJoin(patientsTable, and(
        eq(patientsTable.id, imagesTable.patientId),
        eq(patientsTable.tenantId, tenantId),
      ))
      .where(gte(imagesTable.createdAt, thirtyDaysAgo));

    res.json({
      totalImages: totalImagesRow?.count ?? 0,
      totalPatients: totalPatientsRow?.count ?? 0,
      unassignedImages: unassignedRow?.count ?? 0,
      recentUploads: recentRow?.count ?? 0,
    });
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/images", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const parsed = ListImagesQueryParams.safeParse(req.query);
    const params = parsed.success ? parsed.data : {};

    const accessibleIds = await getAccessiblePatientIds(req);
    if (accessibleIds !== null && accessibleIds.length === 0) {
      res.json([]);
      return;
    }

    // Always inner-join patients so we get tenant isolation for free
    const conditions: ReturnType<typeof eq>[] = [eq(patientsTable.tenantId, tenantId)];
    if (params.patientId) conditions.push(eq(imagesTable.patientId, params.patientId));
    if (params.dateFrom) conditions.push(gte(imagesTable.capturedAt, new Date(params.dateFrom)));
    if (params.dateTo) conditions.push(lte(imagesTable.capturedAt, new Date(params.dateTo)));
    if (accessibleIds !== null) conditions.push(inArray(imagesTable.patientId, accessibleIds) as any);

    const rows = await db
      .select({
        id: imagesTable.id,
        patientId: imagesTable.patientId,
        filePath: imagesTable.filePath,
        fileName: imagesTable.fileName,
        notes: imagesTable.notes,
        annotation: imagesTable.annotation,
        capturedAt: imagesTable.capturedAt,
        isUnassigned: imagesTable.isUnassigned,
        createdAt: imagesTable.createdAt,
        patientName: patientsTable.name,
        patientCode: patientsTable.patientCode,
      })
      .from(imagesTable)
      .innerJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId))
      .where(and(...conditions))
      .orderBy(imagesTable.capturedAt);

    res.json(rows.map(buildImageRow));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    console.error("GET /images error:", err);
    res.status(500).json({ error: "Failed to load images", detail: String(err) });
  }
});

// Step 1 of the direct-to-GCS upload flow.
// Accepts only small metadata (no file body), returns a short-lived signed PUT
// URL so the browser can PUT the file directly to GCS — bypassing the Replit
// proxy entirely and avoiding the body-size stall that plagued the old approach.
router.post("/images/upload-url", async (req, res): Promise<void> => {
  try {
  const tenantId = tid(req);
  const { fileName, mimeType, patientId: rawPatientId } = req.body ?? {};

  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
    res.status(400).json({ error: "mimeType must be an image/ type" });
    return;
  }

  const patientId = rawPatientId != null ? parseInt(String(rawPatientId), 10) : null;

  if (patientId !== null) {
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)));
    if (!patient) {
      res.status(404).json({ error: `Patient ${patientId} not found` });
      return;
    }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const ext = path.extname(fileName) || ".jpg";
  const filename = `${Date.now()}${ext}`;
  const objectName = patientId
    ? `images/${patientId}/${dateStr}/${filename}`
    : `images/unassigned/${dateStr}/${filename}`;

  try {
    const signedUrl = await getSignedUploadUrl(objectName);
    res.json({ signedUrl, objectName });
  } catch (err) {
    console.error("Failed to get signed upload URL:", err);
    res.status(503).json({ error: "Could not prepare upload — please try again", detail: String(err) });
  }
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

// Step 3 of the direct-to-GCS upload flow.
// Called by the browser AFTER it has successfully PUT the file to GCS via the
// signed URL. Creates the database record and returns the image row.
router.post("/images/register", async (req, res): Promise<void> => {
  try {
  const tenantId = tid(req);
  const { objectName, fileName, mimeType, patientId: rawPatientId, notes, capturedAt: rawCapturedAt, sha256: rawSha256 } = req.body ?? {};

  if (!objectName || typeof objectName !== "string") {
    res.status(400).json({ error: "objectName is required" });
    return;
  }
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }

  const patientId = rawPatientId != null ? parseInt(String(rawPatientId), 10) : null;
  const capturedAt = rawCapturedAt ? new Date(rawCapturedAt) : new Date();
  const filePath = toGcsPath(objectName);
  const sha256 = typeof rawSha256 === "string" && rawSha256.length === 64 ? rawSha256 : null;

  // Verify patient belongs to this tenant
  let patientName: string | null = null;
  let patientCode: string | null = null;
  if (patientId) {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)));
    if (!patient) {
      res.status(404).json({ error: `Patient ${patientId} not found` });
      return;
    }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    patientName = patient.name;
    patientCode = patient.patientCode;
  }

  const [image] = await db
    .insert(imagesTable)
    .values({
      patientId,
      filePath,
      fileName,
      notes: notes ?? null,
      capturedAt,
      isUnassigned: patientId === null,
      sha256,
    })
    .returning();

  logAudit(req, "image_upload", "image", image.id, { fileName, patientId }, { patientId: patientId ?? null });
  res.status(201).json(buildImageRow({ ...image, patientName, patientCode }));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

// JSON + base64 upload — kept as fallback for non-browser callers (e.g. mobile,
// migration import). The deployment proxy stalls large bodies so this path is
// no longer used by the web app; web uploads go through /images/upload-url instead.
router.post("/images/upload", async (req, res): Promise<void> => {
  try {
  const tenantId = tid(req);
  const { fileBase64, fileName, mimeType, patientId: rawPatientId, notes, capturedAt: rawCapturedAt } = req.body ?? {};

  if (!fileBase64 || typeof fileBase64 !== "string") {
    res.status(400).json({ error: "fileBase64 is required" });
    return;
  }
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
    res.status(400).json({ error: "mimeType must be an image/ type" });
    return;
  }

  // Accept both raw base64 and data-URL ("data:image/jpeg;base64,...") format
  const base64Data = fileBase64.includes(",") ? fileBase64.split(",")[1] : fileBase64;
  const buffer = Buffer.from(base64Data, "base64");
  const { createHash } = await import("crypto");
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  if (buffer.length > 50 * 1024 * 1024) {
    res.status(413).json({ error: "File too large (max 50 MB)" });
    return;
  }

  const patientId = rawPatientId != null ? parseInt(String(rawPatientId), 10) : null;
  const capturedAt = rawCapturedAt ? new Date(rawCapturedAt) : new Date();

  if (patientId !== null) {
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)));
    if (!patient) {
      res.status(404).json({ error: `Patient ${patientId} not found` });
      return;
    }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const dateStr = capturedAt.toISOString().split("T")[0];
  const ext = path.extname(fileName) || ".jpg";
  const filename = `${Date.now()}${ext}`;
  const objectName = patientId
    ? `images/${patientId}/${dateStr}/${filename}`
    : `images/unassigned/${dateStr}/${filename}`;

  let filePath: string;
  try {
    filePath = await uploadToGcs(buffer, objectName, mimeType);
  } catch (err) {
    console.error("GCS upload failed:", err);
    res.status(503).json({ error: "Storage upload failed — please try again", detail: String(err) });
    return;
  }

  const [image] = await db
    .insert(imagesTable)
    .values({
      patientId,
      filePath,
      fileName,
      notes: notes ?? null,
      capturedAt,
      isUnassigned: patientId === null,
      sha256,
    })
    .returning();

  let patientName2: string | null = null;
  let patientCode2: string | null = null;
  if (patientId) {
    const [patient] = await db.select().from(patientsTable).where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)));
    patientName2 = patient?.name ?? null;
    patientCode2 = patient?.patientCode ?? null;
  }

  logAudit(req, "image_upload", "image", image.id, { fileName, patientId }, { patientId: patientId ?? null });
  res.status(201).json(buildImageRow({ ...image, patientName: patientName2, patientCode: patientCode2 }));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/images", upload.single("file"), async (req, res): Promise<void> => {
  try {
  const tenantId = tid(req);
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const patientId = req.body.patientId ? parseInt(req.body.patientId, 10) : null;
  const notes = req.body.notes ?? null;
  const capturedAt = req.body.capturedAt ? new Date(req.body.capturedAt) : new Date();

  // Validate patientId existence to return a clean 404 instead of a DB FK error
  if (patientId !== null) {
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)));
    if (!patient) {
      res.status(404).json({ error: `Patient ${patientId} not found` });
      return;
    }
    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const dateStr = capturedAt.toISOString().split("T")[0]; // YYYY-MM-DD
  const ext = path.extname(req.file.originalname) || ".jpg";
  const filename = `${Date.now()}${ext}`;
  const objectName = patientId
    ? `images/${patientId}/${dateStr}/${filename}`
    : `images/unassigned/${dateStr}/${filename}`;

  const { createHash: createHashMultipart } = await import("crypto");
  const sha256Multipart = createHashMultipart("sha256").update(req.file.buffer).digest("hex");

  let filePath: string;
  try {
    filePath = await uploadToGcs(req.file.buffer, objectName, req.file.mimetype);
  } catch (err) {
    console.error("GCS upload failed:", err);
    res.status(503).json({ error: "Storage upload failed — please try again", detail: String(err) });
    return;
  }

  const [image] = await db
    .insert(imagesTable)
    .values({
      patientId,
      filePath,
      fileName: req.file.originalname,
      notes,
      capturedAt: capturedAt,
      isUnassigned: patientId === null,
      sha256: sha256Multipart,
    })
    .returning();

  let patientName: string | null = null;
  let patientCode: string | null = null;
  if (patientId) {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)));
    patientName = patient?.name ?? null;
    patientCode = patient?.patientCode ?? null;
  }

  logAudit(req, "image_upload", "image", image.id, { fileName: req.file.originalname, patientId }, { patientId: patientId ?? null });
  res.status(201).json(buildImageRow({ ...image, patientName, patientCode }));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.put("/images/:id/file", upload.single("file"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = ReplaceImageFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

    const [existingImage] = await db
      .select({ img: imagesTable })
      .from(imagesTable)
      .innerJoin(patientsTable, and(eq(patientsTable.id, imagesTable.patientId), eq(patientsTable.tenantId, tenantId)))
      .where(eq(imagesTable.id, params.data.id))
      .then(r => r.map(x => x.img));

    if (!existingImage) { res.status(404).json({ error: "Image not found" }); return; }

    const ext = path.extname(req.file.originalname) || ".jpg";
    const filename = `${Date.now()}${ext}`;
    const objectName = isGcsPath(existingImage.filePath)
      ? existingImage.filePath.slice(4)
      : `images/replaced/${filename}`;
    await uploadToGcs(req.file.buffer, objectName, req.file.mimetype);

    const rows = await db
      .select({
        id: imagesTable.id, patientId: imagesTable.patientId, filePath: imagesTable.filePath,
        fileName: imagesTable.fileName, notes: imagesTable.notes, annotation: imagesTable.annotation,
        capturedAt: imagesTable.capturedAt, isUnassigned: imagesTable.isUnassigned, createdAt: imagesTable.createdAt,
        patientName: patientsTable.name, patientCode: patientsTable.patientCode,
      })
      .from(imagesTable)
      .leftJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId))
      .where(eq(imagesTable.id, params.data.id));

    logAudit(req, "image_replace", "image", params.data.id, { fileName: req.file.originalname });
    res.json(buildImageRow(rows[0] ?? { ...existingImage, patientName: null, patientCode: null }));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/images/:id/file", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = GetImageFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const [image] = await db
      .select({ img: imagesTable })
      .from(imagesTable)
      .innerJoin(patientsTable, and(eq(patientsTable.id, imagesTable.patientId), eq(patientsTable.tenantId, tenantId)))
      .where(eq(imagesTable.id, params.data.id))
      .then(r => r.map(x => x.img));

    if (!image) { res.status(404).json({ error: "Image not found" }); return; }

    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, image.patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    logAudit(req, "image_view", "image", params.data.id, undefined, { patientId: image.patientId ?? undefined });
    await streamFile(image.filePath, image.fileName, res);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/patients/:id/images", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = ListPatientImagesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, params.data.id)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const rows = await db
      .select({
        id: imagesTable.id, patientId: imagesTable.patientId, filePath: imagesTable.filePath,
        fileName: imagesTable.fileName, notes: imagesTable.notes, annotation: imagesTable.annotation,
        capturedAt: imagesTable.capturedAt, isUnassigned: imagesTable.isUnassigned, createdAt: imagesTable.createdAt,
        patientName: patientsTable.name, patientCode: patientsTable.patientCode,
      })
      .from(imagesTable)
      .innerJoin(patientsTable, and(eq(patientsTable.id, imagesTable.patientId), eq(patientsTable.tenantId, tenantId)))
      .where(eq(imagesTable.patientId, params.data.id))
      .orderBy(imagesTable.capturedAt);

    res.json(rows.map(buildImageRow));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    console.error("GET /patients/:id/images error:", err);
    res.status(500).json({ error: "Failed to load images", detail: String(err) });
  }
});

router.get("/images/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = GetImageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const rows = await db
      .select({
        id: imagesTable.id, patientId: imagesTable.patientId, filePath: imagesTable.filePath,
        fileName: imagesTable.fileName, notes: imagesTable.notes, annotation: imagesTable.annotation,
        capturedAt: imagesTable.capturedAt, isUnassigned: imagesTable.isUnassigned, createdAt: imagesTable.createdAt,
        patientName: patientsTable.name, patientCode: patientsTable.patientCode,
      })
      .from(imagesTable)
      .innerJoin(patientsTable, and(eq(patientsTable.id, imagesTable.patientId), eq(patientsTable.tenantId, tenantId)))
      .where(eq(imagesTable.id, params.data.id));

    if (!rows[0]) { res.status(404).json({ error: "Image not found" }); return; }

    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, rows[0].patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(buildImageRow(rows[0]));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/images/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = UpdateImageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const parsed = UpdateImageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.annotation !== undefined) updateData.annotation = parsed.data.annotation;
    if (parsed.data.patientId !== undefined) {
      if (parsed.data.patientId !== null) {
        const [patient] = await db
          .select({ id: patientsTable.id })
          .from(patientsTable)
          .where(and(eq(patientsTable.id, parsed.data.patientId), eq(patientsTable.tenantId, tenantId)));
        if (!patient) { res.status(404).json({ error: `Patient ${parsed.data.patientId} not found` }); return; }
      }
      updateData.patientId = parsed.data.patientId;
      updateData.isUnassigned = parsed.data.patientId === null;
    }
    if (parsed.data.capturedAt !== undefined) updateData.capturedAt = new Date(parsed.data.capturedAt);

    // Only update images that belong to this tenant (via patient join)
    const [existingCheck] = await db
      .select({ id: imagesTable.id, patientId: imagesTable.patientId })
      .from(imagesTable)
      .innerJoin(patientsTable, and(eq(patientsTable.id, imagesTable.patientId), eq(patientsTable.tenantId, tenantId)))
      .where(eq(imagesTable.id, params.data.id));
    if (!existingCheck) { res.status(404).json({ error: "Image not found" }); return; }

    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, existingCheck.patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [image] = await db
      .update(imagesTable)
      .set(updateData)
      .where(eq(imagesTable.id, params.data.id))
      .returning();

    if (!image) { res.status(404).json({ error: "Image not found" }); return; }

    const rows = await db
      .select({
        id: imagesTable.id, patientId: imagesTable.patientId, filePath: imagesTable.filePath,
        fileName: imagesTable.fileName, notes: imagesTable.notes, annotation: imagesTable.annotation,
        capturedAt: imagesTable.capturedAt, isUnassigned: imagesTable.isUnassigned, createdAt: imagesTable.createdAt,
        patientName: patientsTable.name, patientCode: patientsTable.patientCode,
      })
      .from(imagesTable)
      .leftJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId))
      .where(eq(imagesTable.id, params.data.id));

    logAudit(req, "image_edit", "image", params.data.id, parsed.data as Record<string, unknown>);
    res.json(buildImageRow(rows[0] ?? { ...image, patientName: null, patientCode: null }));
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/images/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = DeleteImageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    // Verify tenant owns this image before deleting
    const [check] = await db
      .select({ id: imagesTable.id, patientId: imagesTable.patientId })
      .from(imagesTable)
      .innerJoin(patientsTable, and(eq(patientsTable.id, imagesTable.patientId), eq(patientsTable.tenantId, tenantId)))
      .where(eq(imagesTable.id, params.data.id));
    if (!check) { res.status(404).json({ error: "Image not found" }); return; }

    const accessibleIds = await getAccessiblePatientIds(req);
    if (!canAccessPatient(accessibleIds, check.patientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [image] = await db
      .delete(imagesTable)
      .where(eq(imagesTable.id, params.data.id))
      .returning();

    if (!image) { res.status(404).json({ error: "Image not found" }); return; }

    await deleteFile(image.filePath);
    logAudit(req, "image_delete", "image", params.data.id, { fileName: image.fileName, patientId: image.patientId }, { patientId: image.patientId ?? null });
    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/patients/:id/export-images — admin/superadmin only
// Body: { imageIds?: number[] }  (omit or send [] to export all patient images)
// Returns: application/zip
router.post(
  "/patients/:id/export-images",
  requireRole("admin", "superadmin"),
  async (req, res): Promise<void> => {
    const patientId = parseInt(String(req.params.id), 10);
    if (isNaN(patientId)) {
      res.status(400).json({ error: "Invalid patient ID" });
      return;
    }

    const tenantId = tid(req);
    const [patient] = await db
      .select({ id: patientsTable.id, name: patientsTable.name, patientCode: patientsTable.patientCode })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)))
      .limit(1);

    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

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

    if (rows.length === 0) {
      res.status(404).json({ error: "No images found for export" });
      return;
    }

    const zip = new AdmZip();
    let added = 0;

    for (const image of rows) {
      const buffer = await readFileAsBuffer(image.filePath);
      if (!buffer) continue;
      const ext = path.extname(image.fileName) || ".jpg";
      const dateStr = new Date(image.capturedAt).toISOString().slice(0, 10);
      const baseName = path.basename(image.fileName, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
      const entryName = `${image.id}_${dateStr}_${baseName}${ext}`;
      zip.addFile(entryName, buffer);
      added++;
    }

    if (added === 0) {
      res.status(404).json({ error: "No image files could be retrieved" });
      return;
    }

    const zipBuffer = zip.toBuffer();
    const safeCode = patient.patientCode.replace(/[^a-zA-Z0-9_-]/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `patient_${safeCode}_images_${today}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.end(zipBuffer);

    logAudit(
      req,
      "image_export",
      "patient",
      patientId,
      { imageCount: added, imageIds: rows.map((r) => r.id) },
      { patientId: patientId ?? null }
    );
  }
);

export default router;
