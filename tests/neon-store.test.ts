import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NeonRoomStore, type RoomRow } from "../lib/room-store";

// Explicit opt-in: this verifies the real deployed database, not a mock of SQL semantics.
test("live Neon shares room state and serializes concurrent revisions across connections", {
  skip: process.env.RUN_NEON_TESTS !== "1",
}, async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for live persistence verification");
  const connection = process.env.DATABASE_URL;
  const sql = neon(connection);
  const stores = Array.from({ length: 4 }, () => new NeonRoomStore(connection));
  const code = `integration-${randomUUID()}`;
  const original: RoomRow = { code, state: '{"count":0}', sessions: "[]", revision: 0, updated_at: Date.now() };
  try {
    const creates = await Promise.all(stores.map(store => store.create(original)));
    assert.equal(creates.filter(Boolean).length, 1, "only one instance may create a room code");
    const copies = await Promise.all(stores.map(store => store.get(code)));
    for (const copy of copies) assert.deepEqual(copy, original, "separate instances must read the same committed room");
    const races = await Promise.all(stores.map((store, index) => store.compareAndSwap({ ...original, state: JSON.stringify({ winner: index }), revision: 1 }, 0)));
    assert.equal(races.filter(Boolean).length, 1, "a stale revision must never overwrite another request");
    assert.equal((await stores[0].get(code))!.revision, 1);
    await Promise.all(stores.map(async store => {
      for (let retry = 0; retry < 8; retry++) {
        const current = await store.get(code);
        assert.ok(current);
        if (await store.compareAndSwap({ ...current, revision: current.revision + 1, updated_at: Date.now() }, current.revision)) return;
      }
      assert.fail("concurrent update could not commit after retries");
    }));
    assert.equal((await stores[0].get(code))!.revision, 5, "every concurrent updater eventually commits once");
  } finally {
    await sql`DELETE FROM game_rooms WHERE code = ${code}`;
  }
});
