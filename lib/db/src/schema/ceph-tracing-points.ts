import { pgTable, serial, integer, text, numeric } from "drizzle-orm/pg-core";
import { cephTracingsTable } from "./ceph-tracings";

export const cephTracingPointsTable = pgTable("ceph_tracing_points", {
  id: serial("id").primaryKey(),
  tracingId: integer("tracing_id").notNull().references(() => cephTracingsTable.id, { onDelete: "cascade" }),
  landmarkLabel: text("landmark_label").notNull(),
  x: numeric("x").notNull(),
  y: numeric("y").notNull(),
});

export type CephTracingPoint = typeof cephTracingPointsTable.$inferSelect;
export type InsertCephTracingPoint = typeof cephTracingPointsTable.$inferInsert;
