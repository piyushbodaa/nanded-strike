/** Server-only durable room persistence. This module is never imported by the game client. */
import { DatabaseSync } from "node:sqlite";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface RoomRow {
  code: string;
  state: string;
  sessions: string;
  revision: number;
  updated_at: number;
}
export interface RoomStore {
  get(code: string): Promise<RoomRow | null>;
  create(row: RoomRow): Promise<boolean>;
  compareAndSwap(row: RoomRow, expectedRevision: number): Promise<boolean>;
  prune(before: number): Promise<void>;
}
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
/** Postgres revision checks make updates atomic across every Vercel Function instance. */
export class NeonRoomStore implements RoomStore {
  private sql: NeonQueryFunction<false, false>;
  constructor(connectionString: string) {
    try { this.sql = neon(connectionString); }
    catch { throw new Error("The durable room database connection is invalid."); }
  }
  private async query(statement: string, parameters: unknown[] = []) {
    try {
      return await this.sql.query(statement, parameters, { fetchOptions: { signal: AbortSignal.timeout(4500), cache: "no-store" } });
    } catch {
      // Connection strings and provider responses never reach logs or browser errors.
      throw new Error("The durable room database request failed.");
    }
  }
  async get(code: string): Promise<RoomRow | null> {
    const rows = await this.query("SELECT code, state, sessions, revision, updated_at FROM game_rooms WHERE code = $1", [code]);
    const row = rows[0];
    return row ? { ...row, revision: Number(row.revision), updated_at: Number(row.updated_at) } as RoomRow : null;
  }
  async create(row: RoomRow) {
    const rows = await this.query("INSERT INTO game_rooms (code, state, sessions, revision, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING RETURNING code",
      [row.code, row.state, row.sessions, row.revision, row.updated_at]);
    return rows.length === 1;
  }
  async compareAndSwap(row: RoomRow, expectedRevision: number) {
    if (row.revision !== expectedRevision + 1) throw new Error("Room revision must increase by exactly one.");
    const rows = await this.query("UPDATE game_rooms SET state = $1, sessions = $2, revision = $3, updated_at = $4 WHERE code = $5 AND revision = $6 RETURNING code",
      [row.state, row.sessions, row.revision, row.updated_at, row.code, expectedRevision]);
    return rows.length === 1;
  }
  async prune(before: number) { await this.query("DELETE FROM game_rooms WHERE updated_at < $1", [before]); }
}

/** Real on-disk SQLite for local development and tests; never used on Vercel. */
export class SqliteRoomStore implements RoomStore {
  private database: DatabaseSync;
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS game_rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL,
        sessions TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS game_rooms_updated_at_idx ON game_rooms(updated_at);`);
  }
  async get(code: string) {
    return this.database.prepare("SELECT code, state, sessions, revision, updated_at FROM game_rooms WHERE code = ?").get(code) as unknown as RoomRow | undefined ?? null;
  }
  async create(row: RoomRow) {
    return this.database.prepare("INSERT OR IGNORE INTO game_rooms (code, state, sessions, revision, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(row.code, row.state, row.sessions, row.revision, row.updated_at).changes > 0;
  }
  async compareAndSwap(row: RoomRow, expectedRevision: number) {
    if (row.revision !== expectedRevision + 1) throw new Error("Room revision must increase by exactly one.");
    return this.database.prepare("UPDATE game_rooms SET state = ?, sessions = ?, revision = ?, updated_at = ? WHERE code = ? AND revision = ?")
      .run(row.state, row.sessions, row.revision, row.updated_at, row.code, expectedRevision).changes > 0;
  }
  async prune(before: number) { this.database.prepare("DELETE FROM game_rooms WHERE updated_at < ?").run(before); }
  close() { this.database.close(); }
}

let store: RoomStore | undefined;
export function getRoomStore(): RoomStore {
  if (store) return store;
  const connection = process.env.DATABASE_URL;
  if (connection) return store = new NeonRoomStore(connection);
  if (process.env.VERCEL || (process.env.NODE_ENV === "production" && process.env.GAME_ALLOW_LOCAL_SQLITE !== "1")) {
    throw new Error("Durable online room storage is not configured.");
  }
  return store = new SqliteRoomStore(resolve(".data/rooms.sqlite"));
}
