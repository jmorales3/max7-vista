import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { imagesTable } from "./images";
import { tagsTable } from "./tags";

export const libraryAssetTagsTable = pgTable(
  "library_asset_tags",
  {
    assetId: integer("asset_id")
      .notNull()
      .references(() => imagesTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.tagId] })],
);

export type LibraryAssetTag = typeof libraryAssetTagsTable.$inferSelect;
