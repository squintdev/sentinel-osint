# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**SENTINEL** — a full-screen "spy movie" OSINT intelligence dashboard. Standalone Next.js 14 app that aggregates live flights, earthquakes, satellites, GDELT events, news intel, and public IP cameras onto a 3D globe with a CRT/terminal aesthetic.

Build spec lives in `SPEC.md` — it is the source of truth for aesthetic, layout, data flow, and component contracts.

## Commands

```bash
npm run dev      # next dev (defaults to port 3000 — NOT the production port)
npm run build    # next build
npm run start    # next start (defaults to 3000)
npm run lint     # next lint

# Production deployment (port 3201):
pm2 start ecosystem.config.js    # runs `next start -p 3201`
pm2 save
pm2 logs sentinel
pm2 restart sentinel
```

There is no test suite configured. Lint and a successful `next build` are the only automated gates.

## Architecture

### Data flow (single owner pattern)

`app/page.tsx` is a `'use client'` component that owns **all** application state and **all** polling. It:
1. Fetches from each `/api/*` route on an interval (intervals are hardcoded in `page.tsx` — see table below).
2. Passes arrays down as props to `Globe`, `IntelFeed`, `StatusPanel`, `CityMapOverlay`.
3. Deduplicates intel items by `headline` and caps the feed at 20.

| Data source | Route | Refresh interval | External API |
|---|---|---|---|
| Flights | `/api/flights` | 30s | OpenSky Network |
| Earthquakes | `/api/earthquakes` | 60s | USGS GeoJSON feed |
| Satellites | `/api/satellites` | 10s | Celestrak (simulated orbital motion) |
| Intel/News | `/api/intel` | 45s | Local SearXNG |
| GDELT events | `/api/gdelt` | 15min | GDELT zip archives (cached 15min) |
| Cameras | `/api/cameras` | 5min | NYCTMC + Insecam scraping (insecam cached 2h) |

Every API route uses `export const dynamic = 'force-dynamic'` and `revalidate = 0` — Next.js must not cache them, several have their own in-memory caches instead.

### Globe rendering

`app/components/Globe.tsx` uses **vanilla Three.js** (r0.169) with `useEffect` + `useRef`. It is NOT react-three-fiber — do not introduce R3F. Because of this:

- `next.config.mjs` must keep `transpilePackages: ['three']`.
- `Globe` is loaded via `next/dynamic({ ssr: false })` in `page.tsx`.
- `OrbitControls` is imported from `three/examples/jsm/controls/OrbitControls` with a `@ts-expect-error` (the examples aren't typed).
- `latLngToVec3` in Globe.tsx is the canonical lat/lng → 3D mapping for this project. Any new overlay that places points on the sphere must use the same formula so markers stay aligned.
- `@types/three` in `package.json` (`^0.183.1`) is ahead of the runtime `three` (`^0.169.0`) — expect occasional type drift; prefer runtime-correct code over chasing type errors when they conflict.

`Globe` emits camera position via `onCameraMove(lat, lng, distance)`. When `distance < 2.5`, `page.tsx` renders `CityMapOverlay` on top of the globe — this is how zoomed-in city views activate. The callback in `page.tsx` is throttled (150ms + delta thresholds) to avoid render storms.

### Layout lock & mobile route

`app/globals.css` sets `html, body { overflow: hidden }` and the main layout is a fixed full-viewport flex column (header + globe/panels + bottom bar). Do not add scrollable content to the desktop view without coordinating with this lock.

The `/mobile` route (`app/mobile/`) has its own `layout.tsx` that applies a `.mobile-view` class to relax `overflow: hidden`. Desktop and mobile are separate pages sharing the same API routes.

### Visual modes

`activeMode` in `page.tsx` toggles a `mode-{night|crt|flir}` class on the main container. The CSS filter chains live in `globals.css` — CRT mode additionally overrides scanline density and adds a vignette + flicker animation.

## Conventions

- **All UI uses inline styles or the shared `.panel` / `.glow` / `.glow-amber` / `.glow-red` classes** from `globals.css`. Tailwind is installed but rarely used in components — match existing inline-style patterns when editing.
- **Colors are hardcoded hex values** matching the SPEC palette (`#00ff41`, `#ff8c00`, `#ff0000`, `#1a4a1a`, `#0a2a0a`). CSS vars are defined in `:root` but components mostly use the literals.
- **All text is JetBrains Mono** via a universal selector with `!important` — do not override font-family.
- Font sizes in UI chrome are deliberately tiny (8–11px) to match the intel-terminal look.
- API route handlers should swallow upstream failures and return empty arrays rather than propagating 5xx — the client uses `catch {}` on every fetch and expects shaped data.

## Deployment notes

Production runs under PM2 on port **3201** (see `ecosystem.config.js`). Run `pm2 start ecosystem.config.js` from the repo root — PM2 defaults `cwd` to the invocation directory.
