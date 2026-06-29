import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import path from "path";
import fs from "fs";
import multer from "multer";
import { db, documentsTable, patientsTable } from "@workspace/db";
import { uploadToGcs, streamFile, deleteFile, getSignedDownloadUrl } from "../lib/gcsStorage";
import { getAccessiblePatientIds, canAccessPatient } from "../lib/patientAccess";

const router: IRouter = Router();

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

function buildDocumentRow(row: {
  id: number;
  patientId: number;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number | bigint;
  notes: string | null;
  uploadedAt: Date | string;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    patientId: row.patientId,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSize: Number(row.fileSize),
    notes: row.notes,
    uploadedAt: new Date(row.uploadedAt as string).toISOString(),
    createdAt: new Date(row.createdAt as string).toISOString(),
  };
}

// GET /api/documents?patientId=:id
router.get("/documents", async (req, res) => {
  const patientIdQ = parseInt(String(req.query.patientId ?? ""), 10);
  if (!patientIdQ || isNaN(patientIdQ)) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const tenantId = tid(req);
  // Verify patient belongs to this tenant
  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientIdQ), eq(patientsTable.tenantId, tenantId)))
    .limit(1);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const accessibleIds = await getAccessiblePatientIds(req);
  if (!canAccessPatient(accessibleIds, patientIdQ)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const rows = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.patientId, patientIdQ))
    .orderBy(documentsTable.uploadedAt);

  res.json(rows.map(buildDocumentRow));
});

// POST /api/documents  (multipart: file, patientId, notes?)
router.post("/documents", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const patientId = parseInt(req.body.patientId, 10);
  if (!patientId || isNaN(patientId)) {
    res.status(400).json({ error: "patientId is required" });
    return;
  }

  const tenantId = tid(req);
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

  const ext = path.extname(req.file.originalname);
  const objectName = `documents/${patientId}/${Date.now()}${ext}`;
  const filePath = await uploadToGcs(req.file.buffer, objectName, req.file.mimetype);

  const notes = req.body.notes || null;

  const [doc] = await db
    .insert(documentsTable)
    .values({
      patientId,
      filePath,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      notes,
      uploadedAt: new Date(),
    })
    .returning();

  res.status(201).json(buildDocumentRow(doc));
});

// GET /api/documents/:id/signed-url  — returns a short-lived public URL for viewing
router.get("/documents/:id/signed-url", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const tenantId = tid(req);
  const rows = await db
    .select({ doc: documentsTable })
    .from(documentsTable)
    .innerJoin(patientsTable, and(eq(patientsTable.id, documentsTable.patientId), eq(patientsTable.tenantId, tenantId)))
    .where(eq(documentsTable.id, id))
    .limit(1);
  const doc = rows[0]?.doc;

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const accessibleIds = await getAccessiblePatientIds(req);
  if (!canAccessPatient(accessibleIds, doc.patientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    // Auto-migrate legacy disk-stored files to GCS on first view
    if (!doc.filePath.startsWith("gcs:")) {
      if (!fs.existsSync(doc.filePath)) {
        res.status(404).json({ error: "File not found on disk and not in cloud storage" });
        return;
      }
      const buffer = await fs.promises.readFile(doc.filePath);
      const ext = path.extname(doc.fileName) || "";
      const objectName = `documents/${doc.patientId}/${Date.now()}${ext}`;
      const newPath = await uploadToGcs(buffer, objectName, doc.fileType);
      await db
        .update(documentsTable)
        .set({ filePath: newPath })
        .where(eq(documentsTable.id, doc.id));
      doc.filePath = newPath;
    }
    const url = await getSignedDownloadUrl(doc.filePath);
    res.json({ url, fileName: doc.fileName, fileType: doc.fileType });
  } catch (err) {
    res.status(422).json({ error: "Cannot generate view URL", detail: String(err) });
  }
});

// GET /api/documents/:id/file  — download
router.get("/documents/:id/file", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const tenantId = tid(req);
  const rows = await db
    .select({ doc: documentsTable })
    .from(documentsTable)
    .innerJoin(patientsTable, and(eq(patientsTable.id, documentsTable.patientId), eq(patientsTable.tenantId, tenantId)))
    .where(eq(documentsTable.id, id))
    .limit(1);
  const doc = rows[0]?.doc;

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const accessibleIds = await getAccessiblePatientIds(req);
  if (!canAccessPatient(accessibleIds, doc.patientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  await streamFile(doc.filePath, doc.fileName, res, true);
});

// PATCH /api/documents/:id
router.patch("/documents/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const tenantId = tid(req);
  // Verify document belongs to this tenant
  const check = await db
    .select({ docId: documentsTable.id, patientId: documentsTable.patientId })
    .from(documentsTable)
    .innerJoin(patientsTable, and(eq(patientsTable.id, documentsTable.patientId), eq(patientsTable.tenantId, tenantId)))
    .where(eq(documentsTable.id, id))
    .limit(1);
  if (!check[0]) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const accessibleIds = await getAccessiblePatientIds(req);
  if (!canAccessPatient(accessibleIds, check[0].patientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const updateData: Partial<typeof documentsTable.$inferInsert> = {};
  if (req.body.notes !== undefined) {
    updateData.notes = req.body.notes ?? null;
  }

  const [doc] = await db
    .update(documentsTable)
    .set(updateData)
    .where(eq(documentsTable.id, id))
    .returning();

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(buildDocumentRow(doc));
});

// DELETE /api/documents/:id
router.delete("/documents/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const tenantId = tid(req);
  const rows = await db
    .select({ doc: documentsTable })
    .from(documentsTable)
    .innerJoin(patientsTable, and(eq(patientsTable.id, documentsTable.patientId), eq(patientsTable.tenantId, tenantId)))
    .where(eq(documentsTable.id, id))
    .limit(1);
  const doc = rows[0]?.doc;

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const accessibleIds = await getAccessiblePatientIds(req);
  if (!canAccessPatient(accessibleIds, doc.patientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  await db.delete(documentsTable).where(eq(documentsTable.id, id));
  await deleteFile(doc.filePath);

  res.status(204).send();
});

export default router;
