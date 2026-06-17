import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const patientAccessTable = sqliteTable(
  "patient_access",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patientsTable.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  },
  (t) => ({
    uniq: unique().on(t.tenantId, t.userId, t.patientId),
  }),
);

export type PatientAccess = typeof patientAccessTable.$inferSelect;
