import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { cephTemplatesTable } from "./ceph-templates";

export const cephLandmarksTable = pgTable("ceph_landmarks", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => cephTemplatesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
});

export type CephLandmark = typeof cephLandmarksTable.$inferSelect;
export type InsertCephLandmark = typeof cephLandmarksTable.$inferInsert;
