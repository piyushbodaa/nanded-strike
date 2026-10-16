# Nanded Strike

**Play:** https://nanded-strike.vercel.app

An original browser FPS set in **Bhagya Nagar and nearby Nanded neighbourhoods, Maharashtra**. The current milestone is a **single-player prototype** for refining the map, movement, aiming, and character animation. Multiplayer remains the intended next stage; its durable server architecture is retained, but room creation, joining, and invite links are not exposed in this version.

The approximately 1.96 × 1.45 km map preserves mapped street geometry and 5,887 building footprints. Choose a starting area: Bhagya Nagar, Workshop Corner, Shri Nagar, Anand Nagar, Yashwant College Road, Baba Nagar, or ITI Shri Nagar. Locality labels identify starting sectors, not surveyed neighbourhood boundaries. Building heights, façades, road widths, signs, and other visual details are estimated; this is not a photographic reconstruction. Detailed provenance and limitations are in [public/map-reference.json](public/map-reference.json).

The game uses Next.js, React, Three.js, and a shared TypeScript simulation. Single-player simulation runs entirely in the browser and requires no account or database.

## Run locally

Use Node.js 22.x and a browser with WebGL 2 and hardware acceleration.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. For a local production preview:

```sh
npm run build
npm start
```

## Play

Choose **Start at**, then **Start practice** to play against bots or **Explore map** to walk without enemies or a time limit. Practice ends at 25 eliminations or after five minutes. Players respawn after three seconds, and another round starts automatically. Friendly fire does not deal damage.

The original AR30 rifle and P12 pistol have separate magazines and ammunition reserves. Reloading draws from reserve ammunition; respawning replenishes both weapons.

Click **Resume** to capture the mouse when prompted. Escape releases it and pauses the game. Browser pointer lock requires a fresh click when resuming.

| Action | Desktop control |
| --- | --- |
| Move | W, A, S, D or arrow keys |
| Look | Mouse |
| Fire | Left mouse button |
| Reload | R |
| Sprint | Left Shift |
| Jump | Space |
| Rifle / pistol | 1 / 2 |
| Scoreboard | Hold Tab in practice |
| Pause / release mouse | Escape |

On phones and tablets, use the left thumb joystick to move; push to its outer edge to sprint. Drag the open view to aim while holding **Fire**. Labelled buttons reload, jump, and swap weapons. Landscape provides a wider view; portrait remains supported. Touch actions support simultaneous input, pointer capture, and cancellation.

**Sharp** graphics is the default, including on phones. It uses up to 2× display density within a four-million-pixel budget. **Performance** reduces resolution and disables shadows. Settings are saved on the device. No full-screen grain or blur is applied during play.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

With a local or deployed server running:

```sh
npm run test:browser
```

The browser script defaults to `http://127.0.0.1:5173` and `/usr/bin/chromium`. Override `TEST_URL` (or `BASE_URL`) and `CHROMIUM_PATH` when needed. Use `HEADED=1` to watch. Screenshots are written to `test-results/browser/`.

Browser coverage includes map loading, saved settings, all seven starting areas, peaceful exploration, bot practice, keyboard movement/fire/reload/weapon switching, scoreboard, pause/resume, sharp phone canvas resolution, and real simultaneous touch movement/aim/fire in portrait and landscape. Touch release/cancellation, target size, overlap, and tablet layout are checked. Software-rendered headless Chromium is useful for correctness checks; it is not evidence of real-phone frame rate.

Simulation tests cover movement, polygon collision, mapped navigation, spawns, damage, respawns, rounds, and bots. Storage tests continue to exercise durable persistence and competing room updates for the later multiplayer stage.

## Retained multiplayer architecture

The dormant `/api/game` endpoint uses authoritative simulation and durable Neon Postgres storage on Vercel. Each participant receives a random session credential; only its hash is stored separately from the shared match state. Revision comparison prevents concurrent updates from overwriting one another. It must not be replaced with process-local room memory.

For backend development, local development mode automatically uses `.data/rooms.sqlite`. Set `GAME_ALLOW_LOCAL_SQLITE=1` explicitly to test that adapter with `npm start`. If `DATABASE_URL` is present, the Neon adapter is used instead. Vercel always requires durable storage.

Set the dedicated Neon connection string as server-only `DATABASE_URL`; never prefix it with `NEXT_PUBLIC_`. Initialize its schema once:

```sh
npm run db:setup
```

The schema operation is idempotent. The current public single-player journey does not call this API. The retained HTTP snapshot transport has a requested maximum input rate of eight updates per second and is a prototype, not competitive low-latency netcode.

## Sources and licenses

[Map source notes](public/map-reference.json) preserve the geographic projection, bounds, source URLs, retrieval dates, locality evidence, and accuracy limits. [Road source data](public/map-roads.geojson) and [building source data](public/map-source.json) are included for inspection.

- Streets: **© OpenStreetMap contributors**, [ODbL](https://www.openstreetmap.org/copyright).
- Building footprints: [Overture Maps](https://docs.overturemaps.org/attribution/), including OpenStreetMap and [Google Open Buildings](https://sites.research.google/gr/open-buildings/) sources. Most outlines derive from imagery and can be missing, displaced, or outdated.
- Animated character: Quaternius **Ultimate Modular Men / SWAT**, CC0. Provenance and original license are in [public/assets/characters/LICENSE.txt](public/assets/characters/LICENSE.txt). The model includes 24 authored animation clips; movement, aim, firing, and death are blended. Reload uses the Interact animation and procedural handling because the asset has no dedicated reload clip.
- Surface textures: Poly Haven asphalt, plaster, and concrete, CC0. Exact source pages and files are recorded in [public/textures/sources.json](public/textures/sources.json).
- Barlow Condensed: SIL Open Font License, [public/fonts/OFL.txt](public/fonts/OFL.txt).
- Noto Sans Devanagari: SIL Open Font License, [public/fonts/NOTO-OFL.txt](public/fonts/NOTO-OFL.txt).

Weapon models and game code are original. No Counter-Strike assets, maps, sounds, or branding are included.
