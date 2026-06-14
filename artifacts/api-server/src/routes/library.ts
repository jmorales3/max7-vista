import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import path from "path";
import { db, imagesTable } from "@workspace/db";
import { streamFile, deleteFile, isGcsPath, toGcsPath, getSignedUploadUrl } from "../lib/gcsStorage";

const router: IRouter = Router();

function buildLibraryRow(row: typeof imagesTable.$inferSelect) {
  return {
    id: row.id,
    title: row.notes ?? "",
    filePath: row.filePath,
    fileName: row.fileName,
    uploadedAt: new Date(row.capturedAt as unknown as string).toISOString(),
    createdAt: new Date(row.createdAt as unknown as string).toISOString(),
  };
}

router.get("/library-assets", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(imagesTable)
    .where(eq(imagesTable.isLibraryAsset, true))
    .orderBy(imagesTable.createdAt);
  res.json(rows.map(buildLibraryRow));
});

router.post("/library-assets/upload-url", async (req, res): Promise<void> => {
  const { fileName, mimeType } = req.body ?? {};
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
    res.status(400).json({ error: "mimeType must be an image/ type" });
    return;
  }
  const dateStr = new Date().toISOString().split("T")[0];
  const ext = path.extname(fileName) || ".jpg";
  const objectName = `library/${dateStr}/${Date.now()}${ext}`;
  try {
    const signedUrl = await getSignedUploadUrl(objectName);
    res.json({ signedUrl, objectName });
  } catch (err) {
    console.error("Library upload-url error:", err);
    res.status(503).json({ error: "Could not prepare upload — please try again" });
  }
});

router.post("/library-assets/register", async (req, res): Promise<void> => {
  const { objectName, fileName, mimeType, title } = req.body ?? {};
  if (!objectName || typeof objectName !== "string") {
    res.status(400).json({ error: "objectName is required" });
    return;
  }
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  const filePath = toGcsPath(objectName);
  const [row] = await db
    .insert(imagesTable)
    .values({
      patientId: null,
      filePath,
      fileName,
      notes: title ?? null,
      capturedAt: new Date(),
      isUnassigned: false,
      isLibraryAsset: true,
    })
    .returning();
  res.status(201).json(buildLibraryRow(row));
});

router.patch("/library-assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { title } = req.body ?? {};
  const [row] = await db
    .update(imagesTable)
    .set({ notes: title ?? null })
    .where(eq(imagesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(buildLibraryRow(row));
});

router.delete("/library-assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db
    .select()
    .from(imagesTable)
    .where(eq(imagesTable.id, id));
  if (!row || !row.isLibraryAsset) {
    res.status(404).json({ error: "Library asset not found" });
    return;
  }
  if (isGcsPath(row.filePath)) {
    try {
      await deleteFile(row.filePath);
    } catch (e) {
      console.warn("Could not delete GCS object:", e);
    }
  }
  await db.delete(imagesTable).where(eq(imagesTable.id, id));
  res.status(204).send();
});

router.get("/library-assets/:id/file", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db
    .select()
    .from(imagesTable)
    .where(eq(imagesTable.id, id));
  if (!row || !row.isLibraryAsset) {
    res.status(404).json({ error: "Library asset not found" });
    return;
  }
  await streamFile(row.filePath, row.fileName, res);
});

export default router;
