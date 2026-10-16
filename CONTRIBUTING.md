# Contributing to Nanded Strike

Play the current build at https://nanded-strike.vercel.app. This is an original browser FPS around Bhagya Nagar, Nanded. Real people play multiplayer; there are no bots. Solo exploration is available for inspecting the city.

## Make a change

1. Fork this repository and clone your fork.
2. Install Node.js 22 and run `npm ci`.
3. Run `npm run dev`, then open http://localhost:5173.
4. Create a branch, make a focused change, and run the checks below.
5. Open a pull request against `main`. Describe the problem, the change, and how you tested it. Include before/after screenshots or a short recording for visual changes.

Local development uses SQLite for multiplayer when `DATABASE_URL` is absent. You do not need production credentials. Open two browser sessions to test separate real players. Never commit `.env` files, room credentials, database copies, or Vercel authentication files.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For interactive browser checks, start the app and run `HEADED=1 npm run test:browser`. The script defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` if your browser is elsewhere. Headed hardware rendering is more representative than slow software-rendered headless WebGL. Do not mistake browser emulation for testing on physical phones.

## Where to work

| Area | Main files |
| --- | --- |
| Browser menus and touch controls | `app/page.tsx`, `app/globals.css` |
| Rendering and browser input | `lib/client.ts`, `lib/world.ts` |
| Characters and weapon animation | `lib/actors.ts`, `lib/weapon-view.ts` |
| Geography and spawn positions | `lib/map.ts`, `lib/locations.ts`, `lib/geodata.json`, `lib/spawn-layouts.json` |
| Authoritative movement and combat | `lib/simulation.ts` |
| Multiplayer API and persistence | `lib/game-api.ts`, `app/api/game/route.ts`, `lib/room-store.ts` |
| Source provenance | `public/map-reference.json`, `public/textures/sources.json`, asset license files |

## Map and landmark changes

Keep real street geometry and footprint coordinates. Do not substitute a generic town, add a familiar landmark in the wrong neighbourhood, or use an AI-generated image as evidence of a real building. Include the source URL, location, reference date where available, and what remains approximate. Keep reference-only photos out of distributed assets unless redistribution is allowed.

Run `python scripts/build-geodata.py` to regenerate geography from the bundled source data. Recompute spawn layouts with `npx tsx scripts/generate-spawns.ts` when collision geometry changes. Teams must start apart, with buildings blocking their initial sightline, and each spawn needs an unobstructed exit. Preserve all seven areas and their source attribution.

## Multiplayer and mobile changes

Do not add bots or fake player counts. Keep room state durable across Vercel Function instances. Client input must never directly set authoritative player positions, health or scores. Test simultaneous movement, aiming and firing, touch release/cancel, reload, weapon switching, pause, and reconnect behaviour.

## Review and deployment

GitHub Actions runs lint, TypeScript, tests, and a production build on pull requests. Vercel builds the connected repository and supplies preview deployments for review. External fork previews may require a maintainer's approval in Vercel. Do not provide contributors with production database or deployment credentials. Changes merged to `main` deploy to production.

Original game source is MIT-licensed. Map datasets, fonts, models, textures, and vendored code retain their own licenses and attribution requirements; see the README and the license files beside those assets. No Valve or Counter-Strike game assets are included.
