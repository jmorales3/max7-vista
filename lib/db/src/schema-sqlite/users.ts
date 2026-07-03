import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const usersTable = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  role: text("role").$type<"user" | "admin" | "superadmin">().notNull().default("user"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaBackupCodes: text("mfa_backup_codes"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
