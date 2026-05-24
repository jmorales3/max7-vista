import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import multer from "multer";
import { db, documentsTable, patientsTable } from "@workspace/db";
import { getStorageDirectory } from "../lib/storage";

const router: IRouter = Router();

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

  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId));
  if (!patient) {
    res.status(404).json({ error: `Patient ${patientId} not found` });
    return;
  }

  const storageDir = await getStorageDirectory();
  const docsDir = path.join(storageDir, "documents", String(patientId));
  fs.mkdirSync(docsDir, { recursive: true });

  const ext = path.extname(req.file.originalname);
  const destFileName = `${Date.now()}${ext}`;
  const filePath = path.join(docsDir, destFileName);
  fs.writeFileSync(filePath, req.file.buffer);

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

// GET /api/documents/:id/file  — download
router.get("/documents/:id/file", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, id));

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!fs.existsSync(doc.filePath)) {
    res.status(404).json({ error: "File not found on disk" });
    return;
  }

  res.download(doc.filePath, doc.fileName);
});

// PATCH /api/documents/:id
router.patch("/documents/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
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

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, id));

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  await db.delete(documentsTable).where(eq(documentsTable.id, id));

  try {
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }
  } catch {
    // ignore fs errors — DB record is already gone
  }

  res.status(204).send();
});

export default router;
