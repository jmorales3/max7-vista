import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const ROLES = ["user", "admin", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

export const userRolesTable = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  role: text("role").$type<Role>().notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserRoleSchema = createInsertSchema(userRolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRolesTable.$inferSelect;
