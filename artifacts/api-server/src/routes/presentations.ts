import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, presentationsTable, patientsTable } from "@workspace/db";
import {
  GetPresentationParams,
  DeletePresentationParams,
  UpdatePresentationParams,
  UpdatePresentationBody,
  CreatePresentationBody,
  ListPresentationsQueryParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

router.get("/presentations", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const query = ListPresentationsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }

    // Presentations belong directly to a tenant (patientId is optional/nullable for cross-patient decks)
    const rows = query.data.patientId !== undefined
      ? await db
          .select()
          .from(presentationsTable)
          .where(and(
            eq(presentationsTable.tenantId, tenantId),
            eq(presentationsTable.patientId, query.data.patientId),
          ))
          .orderBy(presentationsTable.updatedAt)
      : await db
          .select()
          .from(presentationsTable)
          .where(eq(presentationsTable.tenantId, tenantId))
          .orderBy(presentationsTable.updatedAt);

    res.json(rows);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/presentations", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const body = CreatePresentationBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    if (body.data.patientId !== undefined) {
      const [patient] = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(and(eq(patientsTable.id, body.data.patientId), eq(patientsTable.tenantId, tenantId)))
        .limit(1);
      if (!patient) {
        res.status(404).json({ error: "Patient not found" });
        return;
      }
    }

    const [created] = await db
      .insert(presentationsTable)
      .values({
        tenantId,
        title: body.data.title,
        slides: body.data.slides as unknown[],
        patientId: body.data.patientId ?? null,
      })
      .returning();

    res.status(201).json(created);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/presentations/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = GetPresentationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select()
      .from(presentationsTable)
      .where(and(
        eq(presentationsTable.id, params.data.id),
        eq(presentationsTable.tenantId, tenantId),
      ))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Presentation not found" });
      return;
    }

    res.json(row);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.put("/presentations/:id", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
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

    // Verify tenant owns this presentation
    const [existing] = await db
      .select()
      .from(presentationsTable)
      .where(and(
        eq(presentationsTable.id, params.data.id),
        eq(presentationsTable.tenantId, tenantId),
      ))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Presentation not found" });
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
      .where(and(
        eq(presentationsTable.id, params.data.id),
        eq(presentationsTable.tenantId, tenantId),
      ))
      .returning();

    res.json(updated);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/presentations/:id", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = DeletePresentationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    // Verify tenant owns this presentation before deleting
    const [existing] = await db
      .select()
      .from(presentationsTable)
      .where(and(
        eq(presentationsTable.id, params.data.id),
        eq(presentationsTable.tenantId, tenantId),
      ))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Presentation not found" });
      return;
    }

    await db.delete(presentationsTable).where(and(
      eq(presentationsTable.id, params.data.id),
      eq(presentationsTable.tenantId, tenantId),
    ));
    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

export default router;
