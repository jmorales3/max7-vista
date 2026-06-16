import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tagsTable, patientTagsTable, patientsTable } from "@workspace/db";
import {
  ListPatientTagsParams,
  AddPatientTagParams,
  AddPatientTagBody,
  RemovePatientTagParams,
  CreateTagBody,
  DeleteTagParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

function isAdmin(req: any): boolean {
  const role = req.session?.role as string | undefined;
  return role === "superadmin" || role === "admin";
}

router.get("/tags", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const tags = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.tenantId, tenantId))
      .orderBy(tagsTable.name);
    res.json(tags);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/tags", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden: admin access required" });
      return;
    }

    const parsed = CreateTagBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const existing = await db
      .select()
      .from(tagsTable)
      .where(and(eq(tagsTable.name, parsed.data.name), eq(tagsTable.tenantId, tenantId)))
      .limit(1);
    if (existing[0]) {
      res.status(409).json({ error: "Tag name already exists" });
      return;
    }

    const [tag] = await db
      .insert(tagsTable)
      .values({ name: parsed.data.name, tenantId })
      .returning();

    res.status(201).json(tag);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/tags/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden: admin access required" });
      return;
    }

    const params = DeleteTagParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(tagsTable)
      .where(and(eq(tagsTable.id, params.data.id), eq(tagsTable.tenantId, tenantId)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/patients/:id/tags", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = ListPatientTagsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Verify patient belongs to this tenant
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .limit(1);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const tags = await db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        createdAt: tagsTable.createdAt,
      })
      .from(patientTagsTable)
      .innerJoin(tagsTable, eq(tagsTable.id, patientTagsTable.tagId))
      .where(eq(patientTagsTable.patientId, params.data.id))
      .orderBy(tagsTable.name);

    res.json(tags);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/patients/:id/tags", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = AddPatientTagParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = AddPatientTagBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .limit(1);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const [tag] = await db
      .select()
      .from(tagsTable)
      .where(and(eq(tagsTable.id, body.data.tagId), eq(tagsTable.tenantId, tenantId)))
      .limit(1);
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    const dup = await db
      .select()
      .from(patientTagsTable)
      .where(and(
        eq(patientTagsTable.patientId, params.data.id),
        eq(patientTagsTable.tagId, body.data.tagId),
      ))
      .limit(1);
    if (dup[0]) {
      res.status(409).json({ error: "Tag already assigned to patient" });
      return;
    }

    await db.insert(patientTagsTable).values({ patientId: params.data.id, tagId: body.data.tagId });
    res.status(201).json(tag);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/patients/:id/tags/:tagId", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = RemovePatientTagParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Verify patient belongs to tenant
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .limit(1);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const [deleted] = await db
      .delete(patientTagsTable)
      .where(and(
        eq(patientTagsTable.patientId, params.data.id),
        eq(patientTagsTable.tagId, params.data.tagId),
      ))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Tag assignment not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

export default router;
