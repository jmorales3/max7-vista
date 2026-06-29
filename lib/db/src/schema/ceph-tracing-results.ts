import { pgTable, serial, integer, text, numeric } from "drizzle-orm/pg-core";
import { cephTracingsTable } from "./ceph-tracings";

export const cephTracingResultsTable = pgTable("ceph_tracing_results", {
  id: serial("id").primaryKey(),
  tracingId: integer("tracing_id").notNull().references(() => cephTracingsTable.id, { onDelete: "cascade" }),
  measurementName: text("measurement_name").notNull(),
  value: numeric("value"),
  unit: text("unit").notNull(),
});

export type CephTracingResult = typeof cephTracingResultsTable.$inferSelect;
export type InsertCephTracingResult = typeof cephTracingResultsTable.$inferInsert;
