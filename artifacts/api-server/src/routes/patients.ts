import { Router, type IRouter } from "express";
import { eq, like, sql } from "drizzle-orm";
import { db, patientsTable, imagesTable } from "@workspace/db";
import {
  ListPatientsQueryParams,
  CreatePatientBody,
  GetPatientParams,
  UpdatePatientParams,
  UpdatePatientBody,
  DeletePatientParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/patients", async (req, res): Promise<void> => {
  const parsed = ListPatientsQueryParams.safeParse(req.query);
  const search = parsed.success ? parsed.data.search : undefined;

  const patients = await db
    .select({
      id: patientsTable.id,
      name: patientsTable.name,
      patientCode: patientsTable.patientCode,
      dateOfBirth: patientsTable.dateOfBirth,
      notes: patientsTable.notes,
      createdAt: patientsTable.createdAt,
      imageCount: sql<number>`cast(count(${imagesTable.id}) as integer)`,
    })
    .from(patientsTable)
    .leftJoin(imagesTable, eq(imagesTable.patientId, patientsTable.id))
    .where(
      search
        ? sql`(${like(patientsTable.name, `%${search}%`)} OR ${like(patientsTable.patientCode, `%${search}%`)})`
        : undefined
    )
    .groupBy(patientsTable.id)
    .orderBy(patientsTable.name);

  res.json(patients);
});

router.post("/patients", async (req, res): Promise<void> => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [patient] = await db
    .insert(patientsTable)
    .values(parsed.data)
    .returning();

  const result = { ...patient, imageCount: 0 };
  res.status(201).json(result);
});

router.get("/patients/:id", async (req, res): Promise<void> => {
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
      createdAt: patientsTable.createdAt,
      imageCount: sql<number>`cast(count(${imagesTable.id}) as integer)`,
    })
    .from(patientsTable)
    .leftJoin(imagesTable, eq(imagesTable.patientId, patientsTable.id))
    .where(eq(patientsTable.id, params.data.id))
    .groupBy(patientsTable.id);

  if (!rows[0]) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json(rows[0]);
});

router.patch("/patients/:id", async (req, res): Promise<void> => {
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
    .where(eq(patientsTable.id, params.data.id))
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
      createdAt: patientsTable.createdAt,
      imageCount: sql<number>`cast(count(${imagesTable.id}) as integer)`,
    })
    .from(patientsTable)
    .leftJoin(imagesTable, eq(imagesTable.patientId, patientsTable.id))
    .where(eq(patientsTable.id, params.data.id))
    .groupBy(patientsTable.id);

  res.json(rows[0] ?? { ...patient, imageCount: 0 });
});

router.delete("/patients/:id", async (req, res): Promise<void> => {
  const params = DeletePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(patientsTable)
    .where(eq(patientsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
