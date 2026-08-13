import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apiKeysTable = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  createdByUserId: integer("created_by_user_id"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
  useCount: integer("use_count").notNull().default(0),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
