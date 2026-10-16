# Counter Strike Nanded

**Play:** https://counterstrike.nanded.fun

**Source:** https://github.com/piyushbodaa/nanded-strike

An original multiplayer browser FPS set in **Bhagya Nagar and nearby Nanded neighbourhoods, Maharashtra**. Choose **Bomb Defusal** or **Deathmatch**, then **Play online** to enter that mode's shared public room. Create a private room to choose another starting area, then share its invite link. Rooms contain real human players only; no bots fill empty slots. **Explore map** remains a peaceful solo mode.

The approximately 1.96 × 1.45 km map preserves mapped street geometry and 5,887 source building outlines. Two obsolete forecourt pieces at Amrut are omitted from the displayed map after comparison with newer photographs; all original outlines remain in the source dataset. Choose a starting area: Bhagya Nagar, Workshop Corner, Shri Nagar, Anand Nagar, Yashwant College Road, Baba Nagar, ITI Shri Nagar, IIB Parnakuti, RCC Coaching, or Konale NEET Center. Locality labels identify starting sectors, not surveyed neighbourhood boundaries. Building heights, façades, road widths, signs, and other visual details are estimated; this is not a photographic reconstruction. Detailed provenance and limitations are in [public/map-reference.json](public/map-reference.json).

Use **Places** to search **575 named locations** across Bhagya Nagar, Workshop Corner, Anand Nagar, Shri Nagar and Yashwant College Road. Filter shops, food, hotels, education, health, landmarks and services, view the surrounding street map, then choose **Visit in solo** for a walkable approach. The directory remains available during matches, with solo visits disabled. Nearby places also appear on the minimap. Listings come from the complete reconciled source extract, not a door-to-door survey; 169 low-confidence listings and 45 shared-coordinate listings are flagged. Current opening status is not established. [Place coverage and audit](public/place-reference.json) record every included, merged and excluded candidate.

Ten landmarks have custom exteriors based on inspected photographs or Street View: Bhagya Nagar Kaman, Yeshwant College entrance, IIB Parnakuti, RCC Coaching, Konale NEET Center, Nanded Pharmacy College, Hotel Grand Tulsi, Amrut Cafe, Panasonic Living Store and Tekisky. Find each through **Places** and choose **Visit in solo**. Heights, frontage alignment and architectural detail remain estimates. [Original landmark references](public/landmark-reference.json) and [additional photo references](public/district-landmark-reference.json) distinguish observations from reconstruction choices. Workshop Corner’s water tank, Government ITI’s frontage and Government Polytechnic still need verified custom models.

Nearby windows and doors now cover the whole mapped area rather than only the starting sectors. Source-matched names appear on illustrative frontage signs; shared, uncertain and unmatched pins stay in the directory/map rather than being assigned to guessed buildings. Rooftop tanks, shutters, awnings and AC units are stylized fittings. Detail is instanced and culled by distance to control rendering cost; this has not been benchmarked on a physical handset.

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

**Play online** joins the selected mode's public match in Bhagya Nagar, up to eight real players: `CLASSC` for Bomb Defusal and `NANDED` for Deathmatch. **Create private room** uses the selected mode and location and gives you a six-character code and invite link. **Join a room** follows the existing room's mode; opening an invite pre-fills its code and waits for your click.

**Bomb Defusal** is the default. A human on each team starts a 15-second freeze/buy phase, followed by a 115-second round. Attackers carry the bomb to Site A or B and hold **E / Interact** for three seconds to plant. Defenders hold the same control near the planted bomb for ten seconds, or five with a defuse kit. The planted bomb has a 40-second timer. Moving, shooting, releasing the control, or losing your connection interrupts the action. Elimination, defusal, explosion, or the unplanted round timer decides the winner. Each player has one life per round; players joining an ongoing round wait until the next round. First to seven rounds wins, with a side switch after six rounds. These are this project's compact browser-game rules, not an exact implementation of Valve matchmaking.

Classic players start with **$800, a P12 handgun and a knife**. Press **B / Buy** while alive at your team's spawn during freeze time. Buy a primary weapon, armor and helmet, grenades, or a defender's defuse kit. The server checks the price, ownership, team, buy phase, and spawn distance. Round results, eliminations and objectives award money; the maximum balance is $16,000. Surviving players keep equipment into the next round, and dead players restart with the handgun and knife. The side switch resets money and equipment.

**Deathmatch** ends at 25 eliminations or after five minutes, with three-second respawns and all six weapon types available. **Explore map** has no opponents or time limit. Friendly fire does not deal damage. The location selector chooses an exploration or private-room starting area; public matchmaking always uses Bhagya Nagar.

The original weapon set consists of the **AR30 scoped rifle, P12 handgun, SM30 SMG, SR5 sniper, SG8 shotgun and knife**. The loadout bar shows owned weapons. Right-click cycles the rifle/sniper scope through two zoom levels and back out; other guns use a sight-alignment view. Zoom also reduces look sensitivity. The knife uses a fast primary slash and a slower, shorter-range secondary stab. Reloading, switching weapons and opening menus reset aiming. Guns retain their own magazines and reserves. These weapons and their balance are original to this game.

Classic utility includes **HE grenades, flashbangs and smoke grenades**. Select a grenade, then throw it with **G / Throw**. Grenades consume owned inventory; HE damage, flash duration, smoke placement and expiration are shared through the authoritative simulation. Smoke obscures vision without stopping bullets. Bomb sites are fictional gameplay areas on walkable parts of the sourced street map.

Use **Screen** in the lobby or during play to choose **Landscape**, **Portrait**, **Auto rotate**, or fullscreen. Supported browsers request fullscreen and lock the native screen orientation. Browsers without that API show instructions to turn the phone and disable the device’s rotation lock. The game uses the actual viewport shape, and changing it preserves the current player and room.

Click **Resume** to capture the mouse when prompted. Escape releases it and opens the menu. Online matches keep running; solo exploration pauses. Browser pointer lock requires a fresh click when resuming.

| Action | Desktop control |
| --- | --- |
| Move | W, A, S, D or arrow keys |
| Look | Mouse |
| Fire / knife slash | Left mouse button |
| Scope / sights / knife stab | Right mouse button |
| Reload | R |
| Walk | Shift |
| Crouch | Ctrl |
| Sprint | Alt |
| Jump | Space |
| Primary / handgun / knife | 1 / 2 / 3 |
| Cycle owned weapons / previous weapon | Mouse wheel / Q |
| Buy equipment | B |
| Cycle grenade / throw selected grenade | 4 / G |
| Plant / defuse / collect dropped bomb | Hold E |
| Scoreboard | Hold Tab online |
| Pause / release mouse | Escape |

On phones and tablets, use the left thumb joystick to move; push to its outer edge to sprint. Drag the open view to look while holding **Fire**. Labelled controls aim, crouch, reload, jump, select owned weapons and grenades, throw, buy and interact with the bomb. Landscape provides a wider view; portrait remains supported. Touch actions support simultaneous input, pointer capture, and cancellation.

The implementation does not include every Counter-Strike feature: hostage rescue, the full Valve weapon roster, weapon dropping/pickup, wall penetration, ranked matchmaking, voice chat, cosmetics and replay recording are not implemented. Hit registration, armor, recoil and grenade physics use this project's simplified rules. The city reconstruction and the existing no-bot policy are unchanged.

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
HEADED=1 node tests/places-browser.mjs
HEADED=1 node tests/classic-browser.mjs
HEADED=1 node tests/combat-browser.mjs
node --import tsx tests/classic-objective-browser.mjs
```

The browser script defaults to `http://127.0.0.1:5173` and `/usr/bin/chromium`. Override `TEST_URL` (or `BASE_URL`) and `CHROMIUM_PATH` when needed. Use `HEADED=1` for hardware-rendered interaction checks: a slow software renderer can exceed the 650 ms stale-input deadline. `TEST_SCOPE=screen` runs the private-room rotation and phone-loadout checks on their own. Screenshots are written to `test-results/multiplayer/`.

Browser coverage joins the public match from separate desktop and touch-phone contexts, verifies the same room and human-only player list, separated spawns, authoritative movement in both directions, firing, reload, scoreboard, real simultaneous touch movement/aim/fire, release handling, and reconnect feedback. It also creates a private room at a selected area, joins through an invite in another browser, checks invite copying, and exercises peaceful portrait exploration. Sharp phone canvas resolution and touch-target bounds are checked. Use `HEADED=1` on a desktop with a display for faster native-browser testing; software-rendered headless Chromium can be much slower and is not evidence of real-phone frame rate.

Simulation tests cover movement, polygon collision, mapped navigation, spawns, damage, respawns, rounds, and removal of legacy bots. Classic checks cover purchases, economy, objectives, one-life rounds and utility. Storage and API tests exercise durable persistence, competing room updates, separate public mode pools, room-mode preservation, human-only rooms, and spawn separation. The Classic browser script uses isolated private rooms and separate desktop/phone contexts to check the waiting/buy/live flow, purchases, shared smoke and the free Deathmatch sniper. It also checks that visible phone controls are at least 48 pixels, remain inside both screen orientations and do not overlap. It does not alter database rows or teleport players to manufacture a result.

The live objective script uses two authenticated HTTP clients and the real server clock. Both navigate collision-checked street routes using normal movement inputs, then plant and defuse a bomb and independently verify the round result. It creates and leaves its own private room; it never teleports players or edits database rows.

## Multiplayer architecture

The `/api/game` endpoint uses authoritative simulation and durable Neon Postgres storage on Vercel. Each participant receives a random session credential; only its hash is stored separately from the shared match state. Revision comparison prevents concurrent updates from overwriting one another. It must not be replaced with process-local room memory.

Room mode is persisted inside the match state. API `create` and `quickjoin` accept `mode: "classic" | "deathmatch"`; omitted mode preserves compatibility with older Deathmatch clients. A private `join` or player `input` cannot change the room's mode. Empty-room resets preserve its selected mode.

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
- Places: OpenStreetMap and Overture Maps, with per-record provenance and licensing in [public/place-source.json](public/place-source.json) and [license texts](public/place-licenses).
- Animated character: Quaternius **Ultimate Modular Men / SWAT**, CC0. Provenance and original license are in [public/assets/characters/LICENSE.txt](public/assets/characters/LICENSE.txt). The model includes 24 authored animation clips; movement, aim, firing, and death are blended. Reload uses the Interact animation and procedural handling because the asset has no dedicated reload clip.
- Surface textures: Poly Haven asphalt, plaster, and concrete, CC0. Exact source pages and files are recorded in [public/textures/sources.json](public/textures/sources.json).
- Barlow Condensed: SIL Open Font License, [public/fonts/OFL.txt](public/fonts/OFL.txt).
- Noto Sans Devanagari: SIL Open Font License, [public/fonts/NOTO-OFL.txt](public/fonts/NOTO-OFL.txt).

Weapon models and game code are original. No Valve game assets, maps, or sounds are included. Counter Strike Nanded is an independent project and is not affiliated with Valve.
