import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const imagesTable = sqliteTable("images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  notes: text("notes"),
  annotation: text("annotation"),
  capturedAt: text("captured_at").notNull().default(new Date().toISOString()),
  isUnassigned: integer("is_unassigned", { mode: "boolean" }).notNull().default(false),
  isLibraryAsset: integer("is_library_asset", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order"),
  uploadedBy: integer("uploaded_by"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export const insertImageSchema = createInsertSchema(imagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImage = z.infer<typeof insertImageSchema>;
export type Image = typeof imagesTable.$inferSelect;
