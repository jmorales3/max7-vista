import { eq } from "drizzle-orm";
import { db, presentationsTable } from "@workspace/db";

const SLIDE_IMAGE_FIELDS = ["imageId", "beforeId", "afterId", "baseId", "overlayId"] as const;

function slideReferencesAnyImage(slide: unknown, imageIds: Set<number>): boolean {
  if (!slide || typeof slide !== "object") return false;
  const s = slide as Record<string, unknown>;
  return SLIDE_IMAGE_FIELDS.some((field) => {
    const value = s[field];
    return typeof value === "number" && imageIds.has(value);
  });
}

/**
 * Finds saved presentations (for a tenant) whose slides reference any of the
 * given image ids. Presentations store raw image ids in a JSONB `slides`
 * column with no foreign key, so this has to scan slide contents in app code.
 */
export async function findPresentationsReferencingImages(
  tenantId: number,
  imageIds: number[],
): Promise<{ id: number; title: string }[]> {
  if (imageIds.length === 0) return [];
  const idSet = new Set(imageIds);

  const rows = await db
    .select({ id: presentationsTable.id, title: presentationsTable.title, slides: presentationsTable.slides })
    .from(presentationsTable)
    .where(eq(presentationsTable.tenantId, tenantId));

  const matches: { id: number; title: string }[] = [];
  for (const row of rows) {
    const slides = Array.isArray(row.slides) ? row.slides : [];
    if (slides.some((slide) => slideReferencesAnyImage(slide, idSet))) {
      matches.push({ id: row.id, title: row.title });
    }
  }
  return matches;
}

/**
 * Removes any slide referencing one of the given image ids from every
 * presentation in the tenant. Used as best-effort cleanup when a user
 * force-deletes an image/patient that is still referenced by a presentation,
 * so the presentation doesn't keep a dangling reference.
 */
export async function removeImagesFromPresentations(tenantId: number, imageIds: number[]): Promise<void> {
  if (imageIds.length === 0) return;
  const idSet = new Set(imageIds);

  const rows = await db
    .select({ id: presentationsTable.id, slides: presentationsTable.slides })
    .from(presentationsTable)
    .where(eq(presentationsTable.tenantId, tenantId));

  for (const row of rows) {
    const slides = Array.isArray(row.slides) ? row.slides : [];
    const filtered = slides.filter((slide) => !slideReferencesAnyImage(slide, idSet));
    if (filtered.length !== slides.length) {
      await db
        .update(presentationsTable)
        .set({ slides: filtered, updatedAt: new Date() })
        .where(eq(presentationsTable.id, row.id));
    }
  }
}
