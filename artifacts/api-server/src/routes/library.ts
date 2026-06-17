import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import path from "path";
import { db, imagesTable, tagsTable, libraryAssetTagsTable } from "@workspace/db";
import { streamFile, streamFileWithRange, deleteFile, isGcsPath, toGcsPath, getSignedUploadUrl } from "../lib/gcsStorage";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/tiff",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/avi", "video/x-msvideo",
];

function isAllowedMedia(mimeType: string) {
  return ALLOWED_IMAGE_TYPES.includes(mimeType) || ALLOWED_VIDEO_TYPES.includes(mimeType);
}

function detectMediaType(mimeType: string): "image" | "video" {
  return ALLOWED_VIDEO_TYPES.includes(mimeType) ? "video" : "image";
}

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant"), { status: 403 });
  return t;
}

async function getTagsForAssets(assetIds: number[]): Promise<Record<number, { id: number; name: string }[]>> {
  if (!assetIds.length) return {};
  const rows = await db
    .select({
      assetId: libraryAssetTagsTable.assetId,
      tagId: tagsTable.id,
      tagName: tagsTable.name,
    })
    .from(libraryAssetTagsTable)
    .innerJoin(tagsTable, eq(tagsTable.id, libraryAssetTagsTable.tagId))
    .where(inArray(libraryAssetTagsTable.assetId, assetIds));

  const map: Record<number, { id: number; name: string }[]> = {};
  for (const row of rows) {
    if (!map[row.assetId]) map[row.assetId] = [];
    map[row.assetId].push({ id: row.tagId, name: row.tagName });
  }
  return map;
}

function buildLibraryRow(
  row: typeof imagesTable.$inferSelect,
  tags: { id: number; name: string }[] = [],
) {
  return {
    id: row.id,
    title: row.notes ?? "",
    filePath: row.filePath,
    fileName: row.fileName,
    mediaType: row.mediaType ?? "image",
    uploadedAt: new Date(row.capturedAt as unknown as string).toISOString(),
    createdAt: new Date(row.createdAt as unknown as string).toISOString(),
    tags,
  };
}

router.get("/library-assets", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(imagesTable)
    .where(eq(imagesTable.isLibraryAsset, true))
    .orderBy(imagesTable.createdAt);
  const tagMap = await getTagsForAssets(rows.map((r) => r.id));
  res.json(rows.map((row) => buildLibraryRow(row, tagMap[row.id] ?? [])));
});

router.post("/library-assets/upload-url", async (req, res): Promise<void> => {
  const { fileName, mimeType } = req.body ?? {};
  if (!fileName || typeof fileName !== "string") {
    res.status(400).json({ error: "fileName is required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string" || !isAllowedMedia(mimeType)) {
    res.status(400).json({ error: "mimeType must be an image or video type" });
    return;
  }
  const dateStr = new Date().toISOString().split("T")[0];
  const ext = path.extname(fileName) || ".bin";
  const folder = detectMediaType(mimeType) === "video" ? "library-video" : "library";
  const objectName = `${folder}/${dateStr}/${Date.now()}${ext}`;
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
  const mt = detectMediaType(mimeType ?? "image/jpeg");
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
      mediaType: mt,
    })
    .returning();
  logAudit(req, "upload", "library_asset", row.id, JSON.stringify({ fileName, mediaType: mt }));
  res.status(201).json(buildLibraryRow(row, []));
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
  const tagMap = await getTagsForAssets([row.id]);
  res.json(buildLibraryRow(row, tagMap[row.id] ?? []));
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
    try { await deleteFile(row.filePath); } catch (e) { console.warn("Could not delete GCS object:", e); }
  }
  await db.delete(imagesTable).where(eq(imagesTable.id, id));
  logAudit(req, "delete", "library_asset", id, JSON.stringify({ fileName: row.fileName }));
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
  logAudit(req, "view", "library_asset", id);
  if (row.mediaType === "video") {
    await streamFileWithRange(row.filePath, row.fileName, req, res);
  } else {
    await streamFile(row.filePath, row.fileName, res);
  }
});

// --- Tag assignment for library assets ---

router.get("/library-assets/:id/tags", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    const [asset] = await db.select({ id: imagesTable.id })
      .from(imagesTable).where(eq(imagesTable.id, id));
    if (!asset) { res.status(404).json({ error: "Not found" }); return; }
    const tags = await db
      .select({ id: tagsTable.id, name: tagsTable.name })
      .from(libraryAssetTagsTable)
      .innerJoin(tagsTable, eq(tagsTable.id, libraryAssetTagsTable.tagId))
      .where(and(eq(libraryAssetTagsTable.assetId, id), eq(tagsTable.tenantId, tenantId)));
    res.json(tags);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/library-assets/:id/tags", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    const { tagId } = req.body ?? {};
    if (!tagId || typeof tagId !== "number") {
      res.status(400).json({ error: "tagId (number) required" });
      return;
    }
    const [tag] = await db.select().from(tagsTable)
      .where(and(eq(tagsTable.id, tagId), eq(tagsTable.tenantId, tenantId)));
    if (!tag) { res.status(404).json({ error: "Tag not found" }); return; }
    const existing = await db.select().from(libraryAssetTagsTable)
      .where(and(eq(libraryAssetTagsTable.assetId, id), eq(libraryAssetTagsTable.tagId, tagId)));
    if (existing.length) { res.status(409).json({ error: "Already assigned" }); return; }
    await db.insert(libraryAssetTagsTable).values({ assetId: id, tagId });
    res.status(201).json(tag);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/library-assets/:id/tags/:tagId", async (req, res): Promise<void> => {
  try {
    tid(req);
    const id = parseInt(req.params.id, 10);
    const tagId = parseInt(req.params.tagId, 10);
    const [deleted] = await db.delete(libraryAssetTagsTable)
      .where(and(eq(libraryAssetTagsTable.assetId, id), eq(libraryAssetTagsTable.tagId, tagId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Assignment not found" }); return; }
    res.status(204).send();
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

export default router;
