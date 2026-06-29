import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { tagsTable } from "./tags";

export const patientTagsTable = pgTable(
  "patient_tags",
  {
    patientId: integer("patient_id")
      .notNull()
      .references(() => patientsTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.tagId] })],
);

export type PatientTag = typeof patientTagsTable.$inferSelect;
