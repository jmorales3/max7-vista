import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cephTemplatesTable } from "./ceph-templates";

export const cephMeasurementsTable = sqliteTable("ceph_measurements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id").notNull().references(() => cephTemplatesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  p1Label: text("p1_label").notNull(),
  p2Label: text("p2_label").notNull(),
  p3Label: text("p3_label"),
  p4Label: text("p4_label"),
  angleQuadrant: text("angle_quadrant"),
  unit: text("unit").notNull(),
  idealMin: real("ideal_min"),
  idealMax: real("ideal_max"),
  displayOrder: integer("display_order").notNull().default(0),
});

export type CephMeasurement = typeof cephMeasurementsTable.$inferSelect;
export type InsertCephMeasurement = typeof cephMeasurementsTable.$inferInsert;
