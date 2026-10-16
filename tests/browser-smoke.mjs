import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

// Run against an already-started app: npm run dev, then npm run test:browser.
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:5173';
const artifacts = resolve(process.env.TEST_ARTIFACTS || 'test-results/browser');
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: process.env.HEADED !== '1',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const errors = [];
const networkErrors = [];
const contexts = [];

async function createPage(name, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, baseURL });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500 && response.url().startsWith(baseURL)) {
      networkErrors.push(`${name}: ${response.status()} ${response.url()}`);
    }
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  return page;
}

async function screenshot(page, name) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
}

async function debug(page) {
  return page.evaluate(() => {
    const state = window.__NANDED_DEBUG__;
    return typeof state === 'function' ? state() : state;
  });
}

async function waitForDebug(page, predicate, message) {
  await expect.poll(async () => {
    const state = await debug(page);
    return !!state && predicate(state);
  }, {
    message,
    timeout: 20_000,
    intervals: [100, 200, 400],
  }).toBe(true);
}

async function pressFor(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

async function verifyRoomAPI() {
  const context = await browser.newContext({ baseURL });
  const sessions = [];
  const idle = { seq: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, shoot: false, reload: false, sprint: false, jump: false };
  async function request(payload, expected = 200) {
    const response = await context.request.post('/api/game', { data: payload });
    assert.equal(response.status(), expected, `${payload.action}: unexpected HTTP status`);
    return response.json();
  }
  try {
    await request({ action: 'missing' }, 400);
    await request({ action: 'join', room: 'BAD', name: 'INVALID' }, 400);
    const host = await request({ action: 'create', name: 'API HOST' }, 201);
    sessions.push(host);
    assert.match(host.room, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.match(host.token, /^[a-f0-9]{64}$/);
    const guests = await Promise.all([1, 2, 3].map(async (i) => {
      const guest = await request({ action: 'join', room: host.room, name: `API GUEST ${i}` });
      sessions.push(guest);
      return guest;
    }));
    const result = await request({ action: 'input', room: host.room, token: host.token, input: idle });
    const humans = result.state.players.filter((p) => !p.bot);
    assert.equal(humans.length, 4, 'Concurrent joins preserve every participant');
    assert.equal(new Set(humans.map((p) => p.id)).size, 4);
    for (const session of sessions) {
      assert.ok(humans.some((p) => p.id === session.playerId), 'Joined player is in authoritative state');
      assert.ok(!JSON.stringify(result.state).includes(session.token), 'Snapshot does not expose session credentials');
    }
    assert.ok(!JSON.stringify(result.state).includes('tokenHash'), 'Snapshot excludes authentication records');
    await request({ action: 'input', room: host.room, token: '0'.repeat(64), input: idle }, 401);
    await request({ action: 'input', room: host.room, token: host.token, input: {} }, 400);
    const other = await request({ action: 'create', name: 'ISOLATED ROOM' }, 201);
    sessions.push(other);
    await request({ action: 'input', room: other.room, token: host.token, input: idle }, 401);
    const departing = guests[0];
    await request({ action: 'leave', room: host.room, token: departing.token });
    sessions.splice(sessions.indexOf(departing), 1);
    await request({ action: 'input', room: host.room, token: departing.token, input: idle }, 401);
    const after = await request({ action: 'input', room: host.room, token: host.token, input: { ...idle, seq: 1 } });
    assert.ok(!after.state.players.some((p) => p.id === departing.playerId), 'Leaving removes a human player');
    assert.equal(after.state.players.length, 6, 'Bots fill empty arena slots');
    console.log('PASS: room API authentication, concurrent joins, isolation, departure');
  } finally {
    for (const session of sessions) {
      await context.request.post('/api/game', { data: { action: 'leave', room: session.room, token: session.token } }).catch(() => {});
    }
    await context.close();
  }
}

try {
  await verifyRoomAPI();
  const page = await createPage('desktop');
  await expect(page.getByTestId('lobby')).toBeVisible();
  await waitForDebug(page, (state) => state?.renderer?.calls > 0 && state.renderer.triangles > 0, 'WebGL renders map geometry');
  await screenshot(page, 'lobby');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.getByRole('button', { name: 'LOW · FASTER PLAY', exact: true }).click();
  await page.locator('#sensitivity').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nanded-settings')).quality)).toBe('low');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nanded-settings')).sensitivity)).toBe(1.1);
  await page.getByTestId('close-settings').click();
  await expect(page.getByTestId('settings-panel')).toBeHidden();
  await page.getByTestId('start-solo').click();
  await waitForDebug(page, (state) => state?.mode === 'solo', 'Solo match starts');
  if (await page.getByTestId('resume-game').isVisible()) await page.getByTestId('resume-game').click();
  await waitForDebug(page, (state) => state?.phase === 'playing', 'Pointer lock permits solo controls');
  const soloStart = (await debug(page)).localPlayer;
  await pressFor(page, 'KeyW', 500);
  await waitForDebug(page, (state) => distance(state.localPlayer, soloStart) > 0.2, 'W moves the player through the arena');
  await screenshot(page, 'solo');
  const ammo = (await debug(page)).ammo;
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await waitForDebug(page, (state) => state.ammo < ammo, 'Firing consumes ammunition');
  await page.keyboard.press('KeyR');
  await waitForDebug(page, (state) => state.ammo === 30, 'Reload fills the rifle magazine');
  await page.keyboard.press('Digit2');
  await waitForDebug(page, (state) => state.ammo === 12, 'Switching to pistol changes the magazine');
  await page.keyboard.press('Digit1');
  await waitForDebug(page, (state) => state.ammo === 30, 'Switching back preserves rifle magazine');
  await page.keyboard.down('Tab');
  await expect(page.getByTestId('scoreboard')).toBeVisible();
  await page.keyboard.up('Tab');
  await expect(page.getByTestId('scoreboard')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  const pausedPosition = (await debug(page)).localPlayer;
  await page.waitForTimeout(300);
  assert.equal(distance(pausedPosition, (await debug(page)).localPlayer), 0, 'Solo pause freezes the simulation');
  await page.getByTestId('resume-game').click();
  await waitForDebug(page, (state) => state.phase === 'playing', 'Resume restores pointer lock');
  await page.keyboard.press('Escape');
  await page.getByTestId('leave-game').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  console.log('PASS: lobby, WebGL, settings, solo movement/fire/reload/weapons/scoreboard, pause/resume');

  await page.getByRole('button', { name: 'PLAY WITH FRIENDS', exact: true }).click();
  await page.getByTestId('player-name').fill('QA HOST');
  await page.getByTestId('create-room').click();
  await waitForDebug(page, (state) => state?.mode === 'online' && /^[A-HJ-NP-Z2-9]{6}$/.test(state.roomCode), 'Host creates an online room');
  const hostState = await debug(page);
  const guest = await createPage('guest');
  await guest.getByRole('button', { name: 'PLAY WITH FRIENDS', exact: true }).click();
  await guest.getByTestId('player-name').fill('QA GUEST');
  await guest.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await guest.getByTestId('room-code-input').fill(hostState.roomCode);
  await guest.getByTestId('join-room').click();
  await waitForDebug(guest, (state) => state?.mode === 'online' && state.roomCode === hostState.roomCode, 'Independent client joins the host room');
  const guestState = await debug(guest);
  await waitForDebug(page, (state) => state.players.some((p) => p.id === guestState.playerId), 'Host receives joined guest');
  await waitForDebug(guest, (state) => state.players.some((p) => p.id === hostState.playerId), 'Guest receives host');
  await page.bringToFront();
  if (await page.getByTestId('resume-game').isVisible()) await page.getByTestId('resume-game').click();
  await waitForDebug(page, (state) => state.phase === 'playing', 'Host resumes online controls');
  const hostStart = (await debug(page)).localPlayer;
  await pressFor(page, 'KeyW', 500);
  await waitForDebug(page, (state) => distance(state.localPlayer, hostStart) > 0.2, 'Online movement reaches the server');
  await page.waitForTimeout(500);
  const hostEnd = (await debug(page)).localPlayer;
  await waitForDebug(guest, (state) => {
    const remote = state.players.find((p) => p.id === hostState.playerId);
    return remote && distance(remote, hostEnd) < 0.5 && distance(remote, hostStart) > 0.2;
  }, 'Guest receives authoritative host movement');
  const onlineAmmo = (await debug(page)).ammo;
  await page.mouse.down();
  await page.waitForTimeout(20);
  await page.mouse.up();
  await waitForDebug(page, (state) => state.ammo < onlineAmmo, 'A quick online click reaches the server');
  await screenshot(page, 'multiplayer');
  await guest.bringToFront();
  if (!(await guest.getByTestId('pause-menu').isVisible())) await guest.keyboard.press('Escape');
  await guest.getByTestId('leave-game').click();
  await expect(guest.getByTestId('lobby')).toBeVisible();
  await waitForDebug(page, (state) => !state.players.some((p) => p.id === guestState.playerId), 'Host receives guest departure');
  await page.bringToFront();
  if (!(await page.getByTestId('pause-menu').isVisible())) await page.keyboard.press('Escape');
  await page.getByTestId('leave-game').click();
  console.log('PASS: two independent browser contexts create/join, share positions, leave');

  const mobile = await createPage('mobile-layout', { width: 390, height: 844 });
  await expect(mobile.getByTestId('lobby')).toBeVisible();
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile lobby has no horizontal overflow');
  await screenshot(mobile, 'mobile-lobby');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  assert.deepEqual(networkErrors, [], 'No server errors');
  console.log(JSON.stringify({ ok: true, baseURL, artifacts }));
} catch (error) {
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages()[0];
    if (page && !page.isClosed()) await screenshot(page, `failure-${i}`).catch(() => {});
  }
  console.error(JSON.stringify({ errors, networkErrors, artifacts }, null, 2));
  throw error;
} finally {
  await browser.close();
}
