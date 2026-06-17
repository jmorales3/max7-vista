import { pgTable, text, serial, timestamp, integer, varchar, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  username: text("username"),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
