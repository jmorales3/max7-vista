import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, presentationsTable, patientsTable } from "@workspace/db";
import {
  GetPresentationParams,
  DeletePresentationParams,
  UpdatePresentationParams,
  UpdatePresentationBody,
  CreatePresentationBody,
  ListPresentationsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/presentations", async (req, res): Promise<void> => {
  const query = ListPresentationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const rows = query.data.patientId !== undefined
    ? await db
        .select()
        .from(presentationsTable)
        .where(eq(presentationsTable.patientId, query.data.patientId))
        .orderBy(presentationsTable.updatedAt)
    : await db
        .select()
        .from(presentationsTable)
        .orderBy(presentationsTable.updatedAt);

  res.json(rows);
});

router.post("/presentations", async (req, res): Promise<void> => {
  const body = CreatePresentationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  if (body.data.patientId !== undefined) {
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.id, body.data.patientId))
      .limit(1);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }
  }

  const [created] = await db
    .insert(presentationsTable)
    .values({
      title: body.data.title,
      slides: body.data.slides as unknown[],
      patientId: body.data.patientId ?? null,
    })
    .returning();

  res.status(201).json(created);
});

router.get("/presentations/:id", async (req, res): Promise<void> => {
  const params = GetPresentationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select()
    .from(presentationsTable)
    .where(eq(presentationsTable.id, params.data.id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Presentation not found" });
    return;
  }

  res.json(row);
});

router.put("/presentations/:id", async (req, res): Promise<void> => {
  const params = UpdatePresentationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = UpdatePresentationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const updates: Partial<typeof presentationsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.slides !== undefined) updates.slides = body.data.slides as unknown[];

  const [updated] = await db
    .update(presentationsTable)
    .set(updates)
    .where(eq(presentationsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Presentation not found" });
    return;
  }

  res.json(updated);
});

router.delete("/presentations/:id", async (req, res): Promise<void> => {
  const params = DeletePresentationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(presentationsTable)
    .where(eq(presentationsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Presentation not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
