import { Router, type IRouter } from "express";
import { eq, ilike, sql, and } from "drizzle-orm";
import { db, patientsTable, imagesTable } from "@workspace/db";
import {
  ListPatientsQueryParams,
  CreatePatientBody,
  GetPatientParams,
  UpdatePatientParams,
  UpdatePatientBody,
  DeletePatientParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

router.get("/patients", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const parsed = ListPatientsQueryParams.safeParse(req.query);
    const search = parsed.success ? parsed.data.search : undefined;

    const baseWhere = eq(patientsTable.tenantId, tenantId);
    const searchWhere = search
      ? sql`(${ilike(patientsTable.name, `%${search}%`)} OR ${ilike(patientsTable.patientCode, `%${search}%`)})`
      : undefined;

    const patients = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        patientCode: patientsTable.patientCode,
        dateOfBirth: patientsTable.dateOfBirth,
        notes: patientsTable.notes,
        profileImageId: patientsTable.profileImageId,
        createdAt: patientsTable.createdAt,
        imageCount: sql<number>`cast(count(${imagesTable.id}) as integer)`,
      })
      .from(patientsTable)
      .leftJoin(imagesTable, eq(imagesTable.patientId, patientsTable.id))
      .where(searchWhere ? and(baseWhere, searchWhere) : baseWhere)
      .groupBy(patientsTable.id)
      .orderBy(patientsTable.name);

    res.json(patients);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[patients] GET /patients:", msg);
    res.status(500).json({ error: msg });
  }
});

router.post("/patients", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const parsed = CreatePatientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [patient] = await db
      .insert(patientsTable)
      .values({ ...parsed.data, tenantId })
      .returning();

    const result = { ...patient, imageCount: 0 };
    await logAudit(req, "create", "patient", patient.id, JSON.stringify({ name: patient.name, patientCode: patient.patientCode }));
    res.status(201).json(result);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[patients] POST /patients:", msg);
    res.status(500).json({ error: msg });
  }
});

router.get("/patients/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = GetPatientParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const rows = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        patientCode: patientsTable.patientCode,
        dateOfBirth: patientsTable.dateOfBirth,
        notes: patientsTable.notes,
        profileImageId: patientsTable.profileImageId,
        createdAt: patientsTable.createdAt,
        imageCount: sql<number>`cast(count(${imagesTable.id}) as integer)`,
      })
      .from(patientsTable)
      .leftJoin(imagesTable, eq(imagesTable.patientId, patientsTable.id))
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .groupBy(patientsTable.id);

    if (!rows[0]) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    res.json(rows[0]);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[patients] GET /patients/:id:", msg);
    res.status(500).json({ error: msg });
  }
});

router.patch("/patients/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = UpdatePatientParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdatePatientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [patient] = await db
      .update(patientsTable)
      .set(parsed.data)
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .returning();

    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const rows = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        patientCode: patientsTable.patientCode,
        dateOfBirth: patientsTable.dateOfBirth,
        notes: patientsTable.notes,
        profileImageId: patientsTable.profileImageId,
        createdAt: patientsTable.createdAt,
        imageCount: sql<number>`cast(count(${imagesTable.id}) as integer)`,
      })
      .from(patientsTable)
      .leftJoin(imagesTable, eq(imagesTable.patientId, patientsTable.id))
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .groupBy(patientsTable.id);

    await logAudit(req, "edit", "patient", params.data.id, JSON.stringify(parsed.data));
    res.json(rows[0] ?? { ...patient, imageCount: 0 });
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[patients] PATCH /patients/:id:", msg);
    res.status(500).json({ error: msg });
  }
});

router.delete("/patients/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = DeletePatientParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(patientsTable)
      .where(and(eq(patientsTable.id, params.data.id), eq(patientsTable.tenantId, tenantId)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    await logAudit(req, "delete", "patient", params.data.id, JSON.stringify({ name: deleted.name, patientCode: deleted.patientCode }));
    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[patients] DELETE /patients/:id:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
