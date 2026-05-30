import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, templatesTable, templateDocumentsTable, patientsTable } from "@workspace/db";
import type { TemplateFrame, DocumentFrame } from "@workspace/db";
import {
  ListTemplatesQueryParams,
  CreateTemplateBody,
  GetTemplateParams,
  UpdateTemplateParams,
  UpdateTemplateBody,
  DeleteTemplateParams,
  ListTemplateDocumentsQueryParams,
  CreateTemplateDocumentBody,
  GetTemplateDocumentParams,
  UpdateTemplateDocumentParams,
  UpdateTemplateDocumentBody,
  DeleteTemplateDocumentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/templates", async (req, res): Promise<void> => {
  const query = ListTemplatesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }
  const rows = await db
    .select()
    .from(templatesTable)
    .orderBy(templatesTable.updatedAt);
  res.json(rows);
});

router.post("/templates", async (req, res): Promise<void> => {
  const body = CreateTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.flatten() });
    return;
  }
  const [created] = await db
    .insert(templatesTable)
    .values({
      title: body.data.title,
      description: body.data.description ?? null,
      officeName: body.data.officeName ?? null,
      officeInfo: body.data.officeInfo ?? null,
      pageWidth: body.data.pageWidth,
      pageHeight: body.data.pageHeight,
      frames: body.data.frames as TemplateFrame[],
    })
    .returning();
  res.status(201).json(created);
});

router.get("/templates/:id", async (req, res): Promise<void> => {
  const params = GetTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(row);
});

router.put("/templates/:id", async (req, res): Promise<void> => {
  const params = UpdateTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = UpdateTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.flatten() });
    return;
  }
  const updates: Partial<typeof templatesTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.officeName !== undefined) updates.officeName = body.data.officeName;
  if (body.data.officeInfo !== undefined) updates.officeInfo = body.data.officeInfo;
  if (body.data.pageWidth !== undefined) updates.pageWidth = body.data.pageWidth;
  if (body.data.pageHeight !== undefined) updates.pageHeight = body.data.pageHeight;
  if (body.data.frames !== undefined) updates.frames = body.data.frames as TemplateFrame[];
  const [updated] = await db
    .update(templatesTable)
    .set(updates)
    .where(eq(templatesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(updated);
});

router.delete("/templates/:id", async (req, res): Promise<void> => {
  const params = DeleteTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(templatesTable)
    .where(eq(templatesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/template-documents", async (req, res): Promise<void> => {
  const query = ListTemplateDocumentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }
  const conditions = [];
  if (query.data.patientId !== undefined)
    conditions.push(eq(templateDocumentsTable.patientId, query.data.patientId));
  if (query.data.templateId !== undefined)
    conditions.push(eq(templateDocumentsTable.templateId, query.data.templateId));
  const rows = conditions.length > 0
    ? await db.select().from(templateDocumentsTable).where(and(...conditions)).orderBy(templateDocumentsTable.updatedAt)
    : await db.select().from(templateDocumentsTable).orderBy(templateDocumentsTable.updatedAt);
  res.json(rows);
});

router.post("/template-documents", async (req, res): Promise<void> => {
  const body = CreateTemplateDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.flatten() });
    return;
  }
  const [template] = await db
    .select({ id: templatesTable.id })
    .from(templatesTable)
    .where(eq(templatesTable.id, body.data.templateId))
    .limit(1);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
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
    .insert(templateDocumentsTable)
    .values({
      templateId: body.data.templateId,
      patientId: body.data.patientId ?? null,
      title: body.data.title,
      frames: body.data.frames as DocumentFrame[],
    })
    .returning();
  res.status(201).json(created);
});

router.get("/template-documents/:id", async (req, res): Promise<void> => {
  const params = GetTemplateDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(templateDocumentsTable)
    .where(eq(templateDocumentsTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Template document not found" });
    return;
  }
  res.json(row);
});

router.put("/template-documents/:id", async (req, res): Promise<void> => {
  const params = UpdateTemplateDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = UpdateTemplateDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body", details: body.error.flatten() });
    return;
  }
  const updates: Partial<typeof templateDocumentsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.title !== undefined) updates.title = body.data.title;
  if (body.data.patientId !== undefined) updates.patientId = body.data.patientId;
  if (body.data.frames !== undefined) updates.frames = body.data.frames as DocumentFrame[];
  if (body.data.printedAt !== undefined)
    updates.printedAt = body.data.printedAt ? new Date(body.data.printedAt) : null;
  const [updated] = await db
    .update(templateDocumentsTable)
    .set(updates)
    .where(eq(templateDocumentsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Template document not found" });
    return;
  }
  res.json(updated);
});

router.delete("/template-documents/:id", async (req, res): Promise<void> => {
  const params = DeleteTemplateDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(templateDocumentsTable)
    .where(eq(templateDocumentsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Template document not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
