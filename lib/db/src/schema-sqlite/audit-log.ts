import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const auditLogTable = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  username: text("username"),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  resourceId: text("resource_id"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
