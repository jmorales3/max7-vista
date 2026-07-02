import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { tenantsTable } from "./tenants";

export const presentationsTable = pgTable("presentations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled"),
  slides: jsonb("slides").notNull().$type<unknown[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Presentation = typeof presentationsTable.$inferSelect;
