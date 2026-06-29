import { pgTable, text, serial, integer, numeric } from "drizzle-orm/pg-core";
import { cephTemplatesTable } from "./ceph-templates";

// type: "line" → p1Label, p2Label (distance in mm)
// type: "angle" → p1Label (vertex), p2Label, p3Label (angle in degrees)
// type: "perpendicular" → p1Label (point), p2Label, p3Label (line endpoints) (distance in mm)
// type: "line_angle" → p1Label, p2Label (line 1) and p3Label, p4Label (line 2) (angle in degrees)
// angleQuadrant applies to "angle" and "line_angle" types

export const cephMeasurementsTable = pgTable("ceph_measurements", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => cephTemplatesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // "line" | "angle" | "perpendicular" | "line_angle"
  p1Label: text("p1_label").notNull(),
  p2Label: text("p2_label").notNull(),
  p3Label: text("p3_label"),
  p4Label: text("p4_label"),
  angleQuadrant: text("angle_quadrant"), // "upper-right" | "upper-left" | "lower-right" | "lower-left" | null
  unit: text("unit").notNull(), // "mm" | "degrees"
  idealMin: numeric("ideal_min"),
  idealMax: numeric("ideal_max"),
  displayOrder: integer("display_order").notNull().default(0),
});

export type CephMeasurement = typeof cephMeasurementsTable.$inferSelect;
export type InsertCephMeasurement = typeof cephMeasurementsTable.$inferInsert;
