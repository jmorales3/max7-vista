import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patientsTable } from "./patients";

export const cephTracingsTable = sqliteTable("ceph_tracings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  imageId: integer("image_id"),
  templateId: integer("template_id"),
  templateName: text("template_name"),
  pxPerMm: real("px_per_mm"),
  name: text("name"),
  recordPhase: text("record_phase").default("initial"),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type CephTracing = typeof cephTracingsTable.$inferSelect;
export type InsertCephTracing = typeof cephTracingsTable.$inferInsert;
