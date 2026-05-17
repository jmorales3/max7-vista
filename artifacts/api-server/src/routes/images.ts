import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";
import multer from "multer";
import { db, imagesTable, patientsTable } from "@workspace/db";
import {
  ListImagesQueryParams,
  GetImageParams,
  UpdateImageParams,
  UpdateImageBody,
  DeleteImageParams,
  GetImageFileParams,
  ListPatientImagesParams,
} from "@workspace/api-zod";
import { getStorageDirectory } from "../lib/storage";

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
  capturedAt: Date;
  isUnassigned: boolean;
  createdAt: Date;
  patientName?: string | null;
  patientCode?: string | null;
}) {
  return {
    id: row.id,
    patientId: row.patientId,
    patientName: row.patientName ?? null,
    patientCode: row.patientCode ?? null,
    filePath: row.filePath,
    fileName: row.fileName,
    notes: row.notes,
    annotation: row.annotation,
    capturedAt: row.capturedAt.toISOString(),
    isUnassigned: row.isUnassigned,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/images/stats", async (_req, res): Promise<void> => {
  const [totalImagesRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(imagesTable);

  const [totalPatientsRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(patientsTable);

  const [unassignedRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(imagesTable)
    .where(eq(imagesTable.isUnassigned, true));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(imagesTable)
    .where(gte(imagesTable.createdAt, thirtyDaysAgo));

  res.json({
    totalImages: totalImagesRow?.count ?? 0,
    totalPatients: totalPatientsRow?.count ?? 0,
    unassignedImages: unassignedRow?.count ?? 0,
    recentUploads: recentRow?.count ?? 0,
  });
});

router.get("/images", async (req, res): Promise<void> => {
  const parsed = ListImagesQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  const query = db
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
    .leftJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId));

  const conditions = [];
  if (params.patientId) {
    conditions.push(eq(imagesTable.patientId, params.patientId));
  }
  if (params.dateFrom) {
    conditions.push(gte(imagesTable.capturedAt, new Date(params.dateFrom)));
  }
  if (params.dateTo) {
    conditions.push(lte(imagesTable.capturedAt, new Date(params.dateTo)));
  }

  const rows =
    conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(imagesTable.capturedAt)
      : await query.orderBy(imagesTable.capturedAt);

  res.json(rows.map(buildImageRow));
});

router.post("/images", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const patientId = req.body.patientId ? parseInt(req.body.patientId, 10) : null;
  const notes = req.body.notes ?? null;
  const capturedAt = req.body.capturedAt ? new Date(req.body.capturedAt) : new Date();

  // Build subfolder: {storageDir}/{patientId}/{YYYY-MM-DD}/
  const storageDir = await getStorageDirectory();
  const dateStr = capturedAt.toISOString().split("T")[0]; // YYYY-MM-DD
  const subFolder = patientId
    ? path.join(storageDir, String(patientId), dateStr)
    : path.join(storageDir, "unassigned", dateStr);

  fs.mkdirSync(subFolder, { recursive: true });

  const ext = path.extname(req.file.originalname) || ".jpg";
  const filename = `${Date.now()}${ext}`;
  const filePath = path.join(subFolder, filename);

  fs.writeFileSync(filePath, req.file.buffer);

  const [image] = await db
    .insert(imagesTable)
    .values({
      patientId,
      filePath,
      fileName: req.file.originalname,
      notes,
      capturedAt,
      isUnassigned: patientId === null,
    })
    .returning();

  let patientName: string | null = null;
  let patientCode: string | null = null;
  if (patientId) {
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId));
    patientName = patient?.name ?? null;
    patientCode = patient?.patientCode ?? null;
  }

  res.status(201).json(buildImageRow({ ...image, patientName, patientCode }));
});

router.get("/images/:id/file", async (req, res): Promise<void> => {
  const params = GetImageFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [image] = await db
    .select()
    .from(imagesTable)
    .where(eq(imagesTable.id, params.data.id));

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  if (!fs.existsSync(image.filePath)) {
    res.status(404).json({ error: "Image file not found on disk" });
    return;
  }

  res.sendFile(path.resolve(image.filePath));
});

router.get("/patients/:id/images", async (req, res): Promise<void> => {
  const params = ListPatientImagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

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
    .leftJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId))
    .where(eq(imagesTable.patientId, params.data.id))
    .orderBy(imagesTable.capturedAt);

  res.json(rows.map(buildImageRow));
});

router.get("/images/:id", async (req, res): Promise<void> => {
  const params = GetImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

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
    .leftJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId))
    .where(eq(imagesTable.id, params.data.id));

  if (!rows[0]) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.json(buildImageRow(rows[0]));
});

router.patch("/images/:id", async (req, res): Promise<void> => {
  const params = UpdateImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.annotation !== undefined) updateData.annotation = parsed.data.annotation;
  if (parsed.data.patientId !== undefined) {
    updateData.patientId = parsed.data.patientId;
    updateData.isUnassigned = parsed.data.patientId === null;
  }
  if (parsed.data.capturedAt !== undefined) {
    updateData.capturedAt = new Date(parsed.data.capturedAt);
  }

  const [image] = await db
    .update(imagesTable)
    .set(updateData)
    .where(eq(imagesTable.id, params.data.id))
    .returning();

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

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
    .leftJoin(patientsTable, eq(patientsTable.id, imagesTable.patientId))
    .where(eq(imagesTable.id, params.data.id));

  res.json(buildImageRow(rows[0] ?? { ...image, patientName: null, patientCode: null }));
});

router.delete("/images/:id", async (req, res): Promise<void> => {
  const params = DeleteImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [image] = await db
    .delete(imagesTable)
    .where(eq(imagesTable.id, params.data.id))
    .returning();

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  if (fs.existsSync(image.filePath)) {
    fs.unlinkSync(image.filePath);
  }

  res.sendStatus(204);
});

export default router;
