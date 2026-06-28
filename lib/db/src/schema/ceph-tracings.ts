import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { tenantsTable } from "./tenants";

export const cephTracingsTable = pgTable("ceph_tracings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  imageId: integer("image_id"),
  templateId: integer("template_id"),
  templateName: text("template_name"),
  pxPerMm: numeric("px_per_mm"),
  name: text("name"),
  recordPhase: text("record_phase").$default(() => "initial"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CephTracing = typeof cephTracingsTable.$inferSelect;
export type InsertCephTracing = typeof cephTracingsTable.$inferInsert;
