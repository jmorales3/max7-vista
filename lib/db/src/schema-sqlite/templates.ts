import { integer, sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { patientsTable } from "./patients";

export interface TemplateFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export const templatesTable = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default("Untitled Template"),
  description: text("description"),
  officeName: text("office_name"),
  officeInfo: text("office_info"),
  pageWidth: real("page_width").notNull().default(215.9),
  pageHeight: real("page_height").notNull().default(279.4),
  frames: text("frames", { mode: "json" }).notNull().$type<TemplateFrame[]>().default([]),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type Template = typeof templatesTable.$inferSelect;
