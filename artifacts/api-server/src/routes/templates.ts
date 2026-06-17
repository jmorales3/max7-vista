import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, templatesTable, templateDocumentsTable, patientsTable } from "@workspace/db";
import type { TemplateFrame, DocumentFrame } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { getAccessiblePatientIds, canAccessPatient } from "../lib/patientAccess";
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

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

router.get("/templates", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const query = ListTemplatesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }
    const rows = await db
      .select()
      .from(templatesTable)
      .where(eq(templatesTable.tenantId, tenantId))
      .orderBy(templatesTable.updatedAt);
    res.json(rows);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/templates", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const body = CreateTemplateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body", details: body.error.flatten() });
      return;
    }
    const [created] = await db
      .insert(templatesTable)
      .values({
        tenantId,
        title: body.data.title,
        description: body.data.description ?? null,
        officeName: body.data.officeName ?? null,
        officeInfo: body.data.officeInfo ?? null,
        logoData: body.data.logoData ?? null,
        pageWidth: body.data.pageWidth,
        pageHeight: body.data.pageHeight,
        frames: body.data.frames as TemplateFrame[],
      })
      .returning();
    res.status(201).json(created);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/templates/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = GetTemplateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(templatesTable)
      .where(and(eq(templatesTable.id, params.data.id), eq(templatesTable.tenantId, tenantId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json(row);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.put("/templates/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
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
    const updates: Partial<typeof templatesTable.$inferInsert> = { updatedAt: new Date() };
    if (body.data.title !== undefined) updates.title = body.data.title;
    if (body.data.description !== undefined) updates.description = body.data.description;
    if (body.data.officeName !== undefined) updates.officeName = body.data.officeName;
    if (body.data.officeInfo !== undefined) updates.officeInfo = body.data.officeInfo;
    if (body.data.logoData !== undefined) updates.logoData = body.data.logoData;
    if (body.data.pageWidth !== undefined) updates.pageWidth = body.data.pageWidth;
    if (body.data.pageHeight !== undefined) updates.pageHeight = body.data.pageHeight;
    if (body.data.frames !== undefined) updates.frames = body.data.frames as TemplateFrame[];
    const [updated] = await db
      .update(templatesTable)
      .set(updates)
      .where(and(eq(templatesTable.id, params.data.id), eq(templatesTable.tenantId, tenantId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/templates/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = DeleteTemplateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(templatesTable)
      .where(and(eq(templatesTable.id, params.data.id), eq(templatesTable.tenantId, tenantId)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/template-documents", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const query = ListTemplateDocumentsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }
    // template-documents are scoped via patient (patientId on the row)
    const conditions: ReturnType<typeof eq>[] = [eq(templatesTable.tenantId, tenantId)];
    if (query.data.patientId !== undefined) {
      const tdAccessibleIds = await getAccessiblePatientIds(req);
      if (!canAccessPatient(tdAccessibleIds, query.data.patientId)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      conditions.push(eq(templateDocumentsTable.patientId, query.data.patientId));
    }
    if (query.data.templateId !== undefined)
      conditions.push(eq(templateDocumentsTable.templateId, query.data.templateId));
    const rows = await db
      .select({ d: templateDocumentsTable })
      .from(templateDocumentsTable)
      .innerJoin(templatesTable, eq(templatesTable.id, templateDocumentsTable.templateId))
      .where(and(...conditions))
      .orderBy(templateDocumentsTable.updatedAt)
      .then(r => r.map(x => x.d));
    res.json(rows);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/template-documents", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const body = CreateTemplateDocumentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body", details: body.error.flatten() });
      return;
    }
    const [template] = await db
      .select({ id: templatesTable.id })
      .from(templatesTable)
      .where(and(eq(templatesTable.id, body.data.templateId), eq(templatesTable.tenantId, tenantId)))
      .limit(1);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
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
      const tdPostAccessibleIds = await getAccessiblePatientIds(req);
      if (!canAccessPatient(tdPostAccessibleIds, body.data.patientId)) {
        res.status(403).json({ error: "Access denied" });
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
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.get("/template-documents/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = GetTemplateDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select({ d: templateDocumentsTable })
      .from(templateDocumentsTable)
      .innerJoin(templatesTable, and(
        eq(templatesTable.id, templateDocumentsTable.templateId),
        eq(templatesTable.tenantId, tenantId),
      ))
      .where(eq(templateDocumentsTable.id, params.data.id))
      .limit(1)
      .then(r => r.map(x => x.d));
    if (!row) {
      res.status(404).json({ error: "Template document not found" });
      return;
    }
    if (row.patientId != null) {
      const tdGetAccessibleIds = await getAccessiblePatientIds(req);
      if (!canAccessPatient(tdGetAccessibleIds, row.patientId)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
    res.json(row);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.put("/template-documents/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
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
    // Verify tenant ownership before updating
    const [existing] = await db
      .select({ d: templateDocumentsTable })
      .from(templateDocumentsTable)
      .innerJoin(templatesTable, and(
        eq(templatesTable.id, templateDocumentsTable.templateId),
        eq(templatesTable.tenantId, tenantId),
      ))
      .where(eq(templateDocumentsTable.id, params.data.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Template document not found" });
      return;
    }
    const existingPatientId = existing.d.patientId;
    if (existingPatientId != null) {
      const tdPutAccessibleIds = await getAccessiblePatientIds(req);
      if (!canAccessPatient(tdPutAccessibleIds, existingPatientId)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
    const updates: Partial<typeof templateDocumentsTable.$inferInsert> = { updatedAt: new Date() };
    if (body.data.title !== undefined) updates.title = body.data.title;
    if (body.data.patientId !== undefined) updates.patientId = body.data.patientId;
    if (body.data.frames !== undefined) updates.frames = body.data.frames as DocumentFrame[];
    const isPrint = body.data.printedAt !== undefined && body.data.printedAt !== null;
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
    if (isPrint) {
      logAudit(
        req,
        "image_print",
        "template_document",
        params.data.id,
        { templateDocumentId: params.data.id, patientId: updated.patientId ?? null },
        { patientId: updated.patientId ?? null },
      );
    }
    res.json(updated);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/template-documents/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const params = DeleteTemplateDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Verify tenant ownership before deleting
    const [existing] = await db
      .select({ d: templateDocumentsTable })
      .from(templateDocumentsTable)
      .innerJoin(templatesTable, and(
        eq(templatesTable.id, templateDocumentsTable.templateId),
        eq(templatesTable.tenantId, tenantId),
      ))
      .where(eq(templateDocumentsTable.id, params.data.id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Template document not found" });
      return;
    }
    const delPatientId = existing.d.patientId;
    if (delPatientId != null) {
      const tdDelAccessibleIds = await getAccessiblePatientIds(req);
      if (!canAccessPatient(tdDelAccessibleIds, delPatientId)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
    await db.delete(templateDocumentsTable).where(eq(templateDocumentsTable.id, params.data.id));
    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: String(err) });
  }
});

export default router;
