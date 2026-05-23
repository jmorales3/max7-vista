import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patientsTable } from "./patients";

export const presentationsTable = sqliteTable("presentations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled"),
  slides: text("slides", { mode: "json" }).notNull().$type<unknown[]>().default([]),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type Presentation = typeof presentationsTable.$inferSelect;
