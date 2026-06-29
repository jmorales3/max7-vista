import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cephTracingsTable } from "./ceph-tracings";

export const cephTracingResultsTable = sqliteTable("ceph_tracing_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tracingId: integer("tracing_id").notNull().references(() => cephTracingsTable.id, { onDelete: "cascade" }),
  measurementName: text("measurement_name").notNull(),
  value: real("value"),
  unit: text("unit").notNull(),
});

export type CephTracingResult = typeof cephTracingResultsTable.$inferSelect;
export type InsertCephTracingResult = typeof cephTracingResultsTable.$inferInsert;
