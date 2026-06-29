import { pgTable, integer, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

export const patientAccessTable = pgTable(
  "patient_access",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patientsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.tenantId, t.userId, t.patientId),
  }),
);

export type PatientAccess = typeof patientAccessTable.$inferSelect;
