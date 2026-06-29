import { pgTable, serial, text, real, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export interface TemplateFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export const templatesTable = pgTable("templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Template"),
  description: text("description"),
  officeName: text("office_name"),
  officeInfo: text("office_info"),
  pageWidth: real("page_width").notNull().default(215.9),
  pageHeight: real("page_height").notNull().default(279.4),
  frames: jsonb("frames").notNull().$type<TemplateFrame[]>().default([]),
  logoData: text("logo_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Template = typeof templatesTable.$inferSelect;
