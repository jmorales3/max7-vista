import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { usersTable } from "./users";

export const auditLogTable = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  username: text("username"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
