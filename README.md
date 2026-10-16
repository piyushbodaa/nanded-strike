# Counter Strike Nanded

**Play:** https://counterstrike.nanded.fun

**Source:** https://github.com/piyushbodaa/nanded-strike

An original multiplayer browser FPS set in **Bhagya Nagar and nearby Nanded neighbourhoods, Maharashtra**. **Play online** enters the shared public room. Create a private room to choose another starting area, then share its invite link. Rooms contain real human players only; no bots fill empty slots. **Explore map** remains a peaceful solo mode.

The approximately 1.96 × 1.45 km map preserves mapped street geometry and 5,887 building footprints. Choose a starting area: Bhagya Nagar, Workshop Corner, Shri Nagar, Anand Nagar, Yashwant College Road, Baba Nagar, ITI Shri Nagar, IIB Parnakuti, RCC Coaching, or Konale NEET Center. Locality labels identify starting sectors, not surveyed neighbourhood boundaries. Building heights, façades, road widths, signs, and other visual details are estimated; this is not a photographic reconstruction. Detailed provenance and limitations are in [public/map-reference.json](public/map-reference.json).

Bhagya Nagar Kaman, the Yeshwant College entrance, IIB Parnakuti, RCC Coaching, and Konale NEET Center have custom models based on inspected photographs or Street View. Select their location (Baba Nagar for the college gate) and choose **Explore map** to face them. RCC and Konale are separate institutes. IIB’s exact facade orientation and RCC’s road-front footprint assignment remain approximate; source notes explain the evidence. Rooftop tanks, shop shutters, awnings and AC units add stylized street detail without moving road lines or footprint outlines. Their dimensions and small details are approximate. Workshop Corner’s water tank, Government ITI’s frontage, and Government Polytechnic still need verified custom models; see [landmark references and remaining gaps](public/landmark-reference.json).

The game uses Next.js, React, Three.js, and a shared TypeScript simulation. Online simulation and room presence use durable Neon Postgres storage across Vercel Function instances. Peaceful exploration runs locally in the browser. No account is required.

## Run locally

Use Node.js 22.x and a browser with WebGL 2 and hardware acceleration.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. For a local production preview:

```sh
npm run build
GAME_ALLOW_LOCAL_SQLITE=1 npm start
```

## Play

**Play online** puts everyone in the shared `NANDED` public match in Bhagya Nagar, up to eight real players. When alone, the game says it is waiting for other players. **Create private room** uses the selected location and gives you a six-character code and invite link. **Join a room** accepts that code; opening an invite pre-fills it and waits for your click.

Online rounds end at 25 eliminations or after five minutes, with three-second respawns. Friendly fire does not deal damage. **Explore map** has no opponents or time limit. The location selector chooses an exploration or private-room starting area; public matchmaking always uses Bhagya Nagar.

Every player starts with an AR30 rifle, P12 handgun and a knife. All three appear in a visible loadout bar on desktop and phones. Use **1 / 2 / 3** or tap the labelled slots. Guns retain separate magazines and reserves; reloading draws from reserve ammunition. The knife has a short 2.2 m reach, no ammunition or reload, and a server-enforced recovery time. Walls, friendly-fire protection and spawn protection apply to melee too. Respawning replenishes both guns.

Use **Screen** in the lobby or during play to choose **Landscape**, **Portrait**, **Auto rotate**, or fullscreen. Supported browsers request fullscreen and lock the native screen orientation. Browsers without that API show instructions to turn the phone and disable the device’s rotation lock. The game uses the actual viewport shape, and changing it preserves the current player and room.

Click **Resume** to capture the mouse when prompted. Escape releases it and opens the menu. Online matches keep running; solo exploration pauses. Browser pointer lock requires a fresh click when resuming.

| Action | Desktop control |
| --- | --- |
| Move | W, A, S, D or arrow keys |
| Look | Mouse |
| Fire | Left mouse button |
| Reload | R |
| Sprint | Left Shift |
| Jump | Space |
| Rifle / handgun / knife | 1 / 2 / 3 |
| Scoreboard | Hold Tab online |
| Pause / release mouse | Escape |

On phones and tablets, use the left thumb joystick to move; push to its outer edge to sprint. Drag the open view to aim while holding **Fire**. Labelled buttons reload, jump, and select Rifle, Handgun or Knife. Landscape provides a wider view; portrait remains supported. Touch actions support simultaneous input, pointer capture, and cancellation.

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

The browser script defaults to `http://127.0.0.1:5173` and `/usr/bin/chromium`. Override `TEST_URL` (or `BASE_URL`) and `CHROMIUM_PATH` when needed. Use `HEADED=1` for hardware-rendered interaction checks: a slow software renderer can exceed the 650 ms stale-input deadline. `TEST_SCOPE=screen` runs the private-room rotation and phone-loadout checks on their own. Screenshots are written to `test-results/multiplayer/`.

Browser coverage joins the public match from separate desktop and touch-phone contexts, verifies the same room and human-only player list, separated spawns, authoritative movement in both directions, firing, reload, scoreboard, real simultaneous touch movement/aim/fire, release handling, and reconnect feedback. It also creates a private room at a selected area, joins through an invite in another browser, checks invite copying, and exercises peaceful portrait exploration. Sharp phone canvas resolution and touch-target bounds are checked. Use `HEADED=1` on a desktop with a display for faster native-browser testing; software-rendered headless Chromium can be much slower and is not evidence of real-phone frame rate.

Simulation tests cover movement, polygon collision, mapped navigation, spawns, damage, respawns, rounds, and removal of legacy bots. Storage and API tests exercise durable persistence, competing room updates, public joining, human-only rooms, and spawn separation.

## Multiplayer architecture

The `/api/game` endpoint uses authoritative simulation and durable Neon Postgres storage on Vercel. Each participant receives a random session credential; only its hash is stored separately from the shared match state. Revision comparison prevents concurrent updates from overwriting one another. It must not be replaced with process-local room memory.

For backend development, local development mode automatically uses `.data/rooms.sqlite`. Set `GAME_ALLOW_LOCAL_SQLITE=1` explicitly to test that adapter with `npm start`. If `DATABASE_URL` is present, the Neon adapter is used instead. Vercel always requires durable storage.

Set the dedicated Neon connection string as server-only `DATABASE_URL`; never prefix it with `NEXT_PUBLIC_`. Initialize its schema once:

```sh
npm run db:setup
```

The schema operation is idempotent. The HTTP snapshot transport has a requested maximum input rate of eight updates per second and is a prototype, not competitive low-latency netcode.

## Contribute

The original application code is available under the [MIT License](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, changes, and pull requests. The protected `main` branch requires a pull request and passing lint, type checking, tests, and a production build in GitHub Actions. Vercel provides PR previews using an isolated test database; merged changes deploy to the live game. External fork previews may need maintainer approval in Vercel. Map datasets, character models, textures, and fonts retain their own licenses listed below.

## Sources and licenses

[Map source notes](public/map-reference.json) preserve the geographic projection, bounds, source URLs, retrieval dates, locality evidence, and accuracy limits. [Road source data](public/map-roads.geojson) and [building source data](public/map-source.json) are included for inspection.

- Streets: **© OpenStreetMap contributors**, [ODbL](https://www.openstreetmap.org/copyright).
- Building footprints: [Overture Maps](https://docs.overturemaps.org/attribution/), including OpenStreetMap and [Google Open Buildings](https://sites.research.google/gr/open-buildings/) sources. Most outlines derive from imagery and can be missing, displaced, or outdated.
- Animated character: Quaternius **Ultimate Modular Men / SWAT**, CC0. Provenance and original license are in [public/assets/characters/LICENSE.txt](public/assets/characters/LICENSE.txt). The model includes 24 authored animation clips; movement, aim, firing, and death are blended. Reload uses the Interact animation and procedural handling because the asset has no dedicated reload clip.
- Surface textures: Poly Haven asphalt, plaster, and concrete, CC0. Exact source pages and files are recorded in [public/textures/sources.json](public/textures/sources.json).
- Barlow Condensed: SIL Open Font License, [public/fonts/OFL.txt](public/fonts/OFL.txt).
- Noto Sans Devanagari: SIL Open Font License, [public/fonts/NOTO-OFL.txt](public/fonts/NOTO-OFL.txt).

Weapon models and game code are original. No Valve game assets, maps, or sounds are included. Counter Strike Nanded is an independent project and is not affiliated with Valve.
