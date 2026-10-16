import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

/** Authentication sessions are separate from the match sent to browsers. */
export const gameRooms = sqliteTable("game_rooms", {
  code: text("code").primaryKey(),
  state: text("state").notNull(),
  sessions: text("sessions").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("game_rooms_updated_at_idx").on(table.updatedAt)]);
