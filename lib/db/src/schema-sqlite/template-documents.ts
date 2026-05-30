import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { templatesTable } from "./templates";
import { patientsTable } from "./patients";

export interface DocumentFrame {
  frameId: string;
  imageId?: number;
  panX: number;
  panY: number;
}

export const templateDocumentsTable = sqliteTable("template_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id").notNull().references(() => templatesTable.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  title: text("title").notNull().default("Untitled Document"),
  frames: text("frames", { mode: "json" }).notNull().$type<DocumentFrame[]>().default([]),
  printedAt: text("printed_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type TemplateDocument = typeof templateDocumentsTable.$inferSelect;
