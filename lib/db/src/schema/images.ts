import { pgTable, text, serial, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const imagesTable = pgTable("images", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  notes: text("notes"),
  annotation: text("annotation"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  isUnassigned: boolean("is_unassigned").notNull().default(false),
  isLibraryAsset: boolean("is_library_asset").notNull().default(false),
  mediaType: varchar("media_type", { length: 10 }).notNull().default("image"),
  sha256: text("sha256"),
  sortOrder: integer("sort_order"),
  uploadedBy: integer("uploaded_by"),
  derivedFromImageId: integer("derived_from_image_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertImageSchema = createInsertSchema(imagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImage = z.infer<typeof insertImageSchema>;
export type Image = typeof imagesTable.$inferSelect;
