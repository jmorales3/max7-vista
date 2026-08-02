import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patientsTable = sqliteTable("patients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  patientCode: text("patient_code").notNull().unique(),
  dateOfBirth: text("date_of_birth"),
  notes: text("notes"),
  phone: text("phone"),
  legalHold: integer("legal_hold", { mode: "boolean" }).notNull().default(false),
  legalHoldReason: text("legal_hold_reason"),
  legalHoldSetAt: text("legal_hold_set_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
