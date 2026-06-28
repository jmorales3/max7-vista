import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cephTracingsTable } from "./ceph-tracings";

export const cephTracingPointsTable = sqliteTable("ceph_tracing_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tracingId: integer("tracing_id").notNull().references(() => cephTracingsTable.id, { onDelete: "cascade" }),
  landmarkLabel: text("landmark_label").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
});

export type CephTracingPoint = typeof cephTracingPointsTable.$inferSelect;
export type InsertCephTracingPoint = typeof cephTracingPointsTable.$inferInsert;
