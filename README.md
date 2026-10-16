# Nanded Strike

**Play:** https://nanded-strike.vercel.app

An original multiplayer browser FPS set in **Bhagya Nagar, Nanded, Maharashtra**. The playable area covers approximately 120 × 120 metres around 19.177350° N, 77.309500° E. Streets follow public OpenStreetMap road centerlines; homes, shopfronts, compound walls, road widths, gardens, vehicles, and combat cover are stylized gameplay adaptations. This is not a surveyed or photorealistic reconstruction.

The game uses Next.js, React, Three.js, and a shared TypeScript simulation. Solo practice runs locally in the browser. Multiplayer uses an authoritative server simulation with durable room storage in Neon Postgres on Vercel. Local development uses an on-disk SQLite database automatically.

## Run locally

Use Node.js 22.x and a browser with WebGL 2. Desktop keyboard and mouse provide the full control set; touch screens have movement, aiming, firing, jumping, and reload buttons.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The development server listens on loopback. Local room data is created automatically in `.data/rooms.sqlite`; no local migration is needed.

For a local production preview:

```sh
npm run build
GAME_ALLOW_LOCAL_SQLITE=1 npm start
```

The explicit SQLite option is for a local production preview. Vercel always requires the durable database. If `DATABASE_URL` is set locally, the application uses that Neon database instead of SQLite.

Friends cannot connect to your `localhost`; share the deployed Vercel URL and a room code when playing from separate computers.

## Play

Solo practice fills the arena with bots. Choose **Play with friends** to create a room and share its six-character code, or join an existing room. Phones, tablets, and laptops join the same match using the shared code or an invite link such as `/?room=ABC234`; the link opens a prefilled join form. Rooms support up to eight human players. Bots fill the first six player slots and are replaced as people join. Teams allow up to four human players each.

Team deathmatch ends at 25 eliminations or after five minutes. Players respawn after three seconds, and a new round begins automatically after seven seconds. Friendly fire does not deal damage. A short spawn shield ends early when its player fires.

The original AR30 rifle and P12 pistol have separate magazines and ammunition reserves. Reloading draws from the reserve; a respawn replenishes both weapons.

## Controls

Click into the arena to capture the mouse. Press Escape to release it and open the pause menu. Resuming requires another click because browsers require a [user gesture for pointer lock](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock). Solo pause freezes the match; an online room continues while its menu is open.

| Action | Control |
| --- | --- |
| Move | W, A, S, D or arrow keys |
| Look | Mouse |
| Fire | Left mouse button |
| Reload | R |
| Sprint | Left Shift |
| Jump | Space |
| Rifle / pistol | 1 / 2 |
| Scoreboard | Hold Tab |
| Pause / release mouse | Escape |

On touch screens, hold the directional buttons to move, drag the arena to aim, hold the crosshair button to fire, and tap R or the up-arrow action to reload or jump. Tap the 1/2 weapon button to switch between rifle and pistol, and use the pause button to open the menu. Touch devices default to lower graphics quality for smoother play; this can be changed in Settings.

## Vercel and database setup

The project uses Vercel's native Next.js build. Configure a dedicated Neon Postgres database and set its connection string as the server-only `DATABASE_URL` environment variable in each Vercel environment that should support multiplayer. Do not expose it using a `NEXT_PUBLIC_` prefix.

Initialize that database once with the idempotent schema in [db/schema.sql](db/schema.sql), using the project's database setup script after `DATABASE_URL` is available:

```sh
npm run db:setup
```

Build and deploy through the project's Vercel workflow. Verify the deployed `/api/game` flow by creating and joining a room; a successful page load or solo match alone does not establish that production multiplayer storage is configured. If durable storage is missing, production room creation returns an unavailable response while solo practice remains playable.

## Technical limits

This is a playable prototype. Multiplayer sends inputs and receives authoritative snapshots over HTTP up to eight times per second. Local movement prediction makes controls more immediate, but network latency and concurrent database updates can still produce visible corrections. This is not a competitive low-latency networking implementation.

The server controls movement limits, collision, hit detection, damage, ammunition, respawns, and scoring. Database updates compare room revisions to prevent competing requests from overwriting each other. Each participant receives a random session credential; only its hash is stored with the room, separately from the shared match state.

Inactive participants expire after 45 seconds. Rooms become unavailable after two hours of inactivity, and expired records are pruned when another room is created. Leaving removes the participant and allows a bot to fill an open arena slot.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

With a local or deployed server running, run the browser checks using an installed Chromium:

```sh
npm run test:browser
```

The script defaults to `http://127.0.0.1:5173` and `/usr/bin/chromium`. Override `TEST_URL` (or `BASE_URL`) and `CHROMIUM_PATH` when needed. Set `HEADED=1` to watch the browser run. Screenshots are written to `test-results/browser/`.

Browser coverage includes WebGL rendering, saved settings, movement, firing, reloads, weapon switching, scoreboard, pause/resume, credentials, concurrent joins, and a desktop plus an emulated touch phone sharing an actual online room through an invite link. Both directions of movement and quick taps are checked against authoritative snapshots. A separate 1024px touch-tablet check exercises movement, firing, reloads, and pause. Simulation and storage tests cover collision, spawn routes, damage, respawns, rounds, bots, persistence, and competing room updates.

## Map sources and licenses

Road geometry was retrieved from OpenStreetMap on 16 October 2026. The local [map reference](public/map-reference.json) preserves source coordinates, source URLs, retrieval date, and the distinction between mapped streets and illustrative scenery. The same reference is served at `/map-reference.json` in the game.

Map data: **© OpenStreetMap contributors**, available under the [Open Database License](https://www.openstreetmap.org/copyright). [View the map area](https://www.openstreetmap.org/#map=18/19.177350/77.309500).

The procedural arena and weapon artwork are original. The project does not include Counter-Strike assets, maps, sounds, or branding.

Barlow Condensed is bundled in `public/fonts/barlow-condensed-bold.ttf` under the SIL Open Font License; see [public/fonts/OFL.txt](public/fonts/OFL.txt). Noto Sans Devanagari is bundled in `public/fonts/noto-devanagari.ttf` under the same license; see [public/fonts/NOTO-OFL.txt](public/fonts/NOTO-OFL.txt).
