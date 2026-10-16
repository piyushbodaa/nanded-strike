import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { SqliteRoomStore, type RoomRow } from "../lib/room-store";

const row = (code = "ABC234"): RoomRow => ({ code, state: '{"players":[]}', sessions: "[]", revision: 0, updated_at: 1000 });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "nanded-rooms-"));
  const path = join(directory, "rooms.sqlite");
  const store = new SqliteRoomStore(path);
  return { store, path, cleanup() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("local rooms persist across distinct SQLite connections and process-style restarts", async () => {
  const f = fixture();
  try {
    assert.equal(await f.store.create(row()), true);
    assert.equal(await f.store.create(row()), false);
    const other = new SqliteRoomStore(f.path);
    try { assert.deepEqual({ ...await other.get("ABC234") }, row()); } finally { other.close(); }
  } finally { f.cleanup(); }
});

test("competing revisions have exactly one winner and preserve the winning update", async () => {
  const f = fixture(), other = new SqliteRoomStore(f.path);
  try {
    await f.store.create(row());
    const [a, b] = await Promise.all([f.store.get("ABC234"), other.get("ABC234")]);
    const results = await Promise.all([
      f.store.compareAndSwap({ ...a!, revision: 1, state: "first writer" }, 0),
      other.compareAndSwap({ ...b!, revision: 1, state: "second writer" }, 0),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await f.store.get("ABC234"))!.state, results[0] ? "first writer" : "second writer");
    assert.equal((await f.store.get("ABC234"))!.revision, 1);
    assert.equal(await f.store.compareAndSwap({ ...row("MISSING"), revision: 1 }, 0), false);
  } finally { other.close(); f.cleanup(); }
});

test("expiry prunes old rooms while keeping active rooms", async () => {
  const f = fixture();
  try {
    await f.store.create(row());
    await f.store.create({ ...row("DEF456"), updated_at: 3000 });
    await f.store.prune(2000);
    assert.equal(await f.store.get("ABC234"), null);
    assert.ok(await f.store.get("DEF456"));
  } finally { f.cleanup(); }
});

test("store rejects skipped revisions and treats query-shaped codes as literal data", async () => {
  const f = fixture();
  try {
    await f.store.create(row());
    assert.equal(await f.store.get("ABC234' OR 1=1 --"), null);
    await assert.rejects(f.store.compareAndSwap({ ...row(), revision: 4 }, 0), /exactly one/);
    assert.equal((await f.store.get("ABC234"))!.revision, 0);
  } finally { f.cleanup(); }
});

test("storage configuration fails closed on Vercel without durable credentials", () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, VERCEL: "1", NODE_ENV: "production", GAME_ALLOW_LOCAL_SQLITE: "1" };
  delete environment.DATABASE_URL;
  const source = `import { getRoomStore } from './lib/room-store.ts'; try { getRoomStore(); process.exitCode = 1; } catch(error) { if (!error.message.includes('not configured')) throw error; console.log('correctly refused'); }`;
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { cwd: process.cwd(), env: environment, encoding: "utf8" });
  assert.match(output, /correctly refused/);
});
