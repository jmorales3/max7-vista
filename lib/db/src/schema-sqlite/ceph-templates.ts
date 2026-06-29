import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cephTemplatesTable = sqliteTable("ceph_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type CephTemplate = typeof cephTemplatesTable.$inferSelect;
export type InsertCephTemplate = typeof cephTemplatesTable.$inferInsert;
