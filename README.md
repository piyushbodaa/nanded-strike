# Nanded Strike

An original browser-based first-person team shooter set in a fictional Godavari riverfront precinct inspired by Nanded, Maharashtra. The map uses Marathi shop signs, a bazaar, courtyards, roadside cover, and a riverside lane. It is a stylized game environment, not a street-accurate recreation.

The game is built with React, Three.js, and a shared TypeScript simulation. Multiplayer uses a server-authoritative room state stored in Cloudflare D1. Solo practice runs the same simulation locally.

## Run locally

Requires Node.js 22.13 or newer and a browser with WebGL 2. A desktop keyboard and mouse give the full control set; touch screens have movement, aiming, firing, jumping, and reload controls.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_superb_roughhouse.sql
npm run dev
```

Apply the database migration once for a fresh local database. Existing local databases that already contain `game_rooms` do not need it reapplied. The build creates the Worker configuration used by the migration command. Online room creation needs this database setup.

Open the local URL printed by the server (normally `http://localhost:5173`). The local development server runs on loopback. Your friends cannot connect to your `localhost`; use a hosted instance to play from separate computers.

## Play

Solo practice immediately fills the arena with bots. Create a multiplayer room and share its six-character room code, or join an existing room. Rooms support up to eight human players. Bots fill the first six player slots and are replaced as people join.

Team deathmatch ends when a team reaches 25 eliminations or the five-minute timer ends. Players respawn after three seconds. A new round starts automatically after seven seconds. Friendly fire does not deal damage. A short spawn shield ends early when its player fires.

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

On touch screens, hold the directional buttons to move, drag the arena to aim, hold the crosshair button to fire, and tap R or the up-arrow action to reload or jump. The pause button releases controls.

## Technical limits

This is a playable prototype. Multiplayer sends input and receives authoritative snapshots over HTTP about eight times per second. Local movement prediction makes controls more immediate, but latency and concurrent database updates can still produce visible corrections. This is not a competitive low-latency networking implementation.

The server controls movement limits, collision, hit detection, damage, ammunition, respawns, and scoring. Each room participant receives a random session credential. Inactive participants expire after 45 seconds, and inactive rooms expire after two hours. Leaving a room removes the participant, allowing a bot to fill an open slot.

The arena and weapon models are original procedural artwork. The project does not include Counter-Strike assets, maps, sounds, or branding.

## Checks

```sh
npx tsc --noEmit
npm test
npm run build
```

With a development or built preview server running, run browser checks using a locally installed Chromium:

```sh
npm run test:browser
```

The browser script defaults to `http://127.0.0.1:5173` and `/usr/bin/chromium`. Override `TEST_URL` or `CHROMIUM_PATH` when needed. Set `HEADED=1` to watch the browser run. Screenshots are written to `test-results/browser/`. The script checks WebGL rendering, controls, weapons, pause/resume, room credentials, simultaneous joins, and movement shared between two independent browser contexts.

## Hosting

The project retains the Sites/Vinext build pipeline and uses a `DB` D1 binding declared in `.openai/hosting.json`. Build through the Sites workflow when publishing on Sites, or use `npm run build` for a standalone build. `npm start` previews the built Cloudflare Worker locally; it does not deploy it.

Development state is stored in the ignored `.wrangler/` directory. Runtime profile settings live in the ignored `.sites-runtime/` directory. Both are local operational state, not source assets.

## Font licenses

Barlow Condensed is bundled in `public/fonts/barlow-condensed-bold.ttf` under the SIL Open Font License; see [public/fonts/OFL.txt](public/fonts/OFL.txt). Noto Sans Devanagari is bundled in `public/fonts/noto-devanagari.ttf` under the same license; see [public/fonts/NOTO-OFL.txt](public/fonts/NOTO-OFL.txt).
