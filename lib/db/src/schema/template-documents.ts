import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { templatesTable } from "./templates";
import { patientsTable } from "./patients";

export interface DocumentFrame {
  frameId: string;
  imageId?: number;
  panX: number;
  panY: number;
  fitMode?: "fill" | "fit";
}

export const templateDocumentsTable = pgTable("template_documents", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => templatesTable.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  title: text("title").notNull().default("Untitled Document"),
  frames: jsonb("frames").notNull().$type<DocumentFrame[]>().default([]),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TemplateDocument = typeof templateDocumentsTable.$inferSelect;
