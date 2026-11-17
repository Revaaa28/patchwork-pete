# Requirements — Organ Adapters

Feature: `organ-adapters`
Status: authored 2026-11-17 (Kiro CLI working sessions scheduled Dec 1–2, after the account's monthly request limit resets).

## Introduction
Every organ of Patchwork Pete is one isolated adapter behind a single interface. An adapter talks to exactly one external API, translates its payload into Pete's reading shape, and — above all — never fabricates a reading.

## The one interface
Every adapter resolves (never rejects) to:
```
{ organ, source, ok, data, error, fetchedAt, cached, stale? }
```
- `ok:true` only when a real response was received and validated.
- `ok:false` ⇒ `data:null` (brain may attach its last good memory, clearly still Pete's own past learning, never a fresh invention) and `error` carries the real failure message.
- `stale:true` ⇒ the one honest exception to freshness: a previous real reading served after a failed refresh (see Requirement 6). It keeps its ORIGINAL `fetchedAt`, carries the refresh failure in `error`, scores normally, and is labelled stale in the UI, the state summary, and the diary. It is never served silently and never within its TTL path (that is `cached`).

## Organs
| Organ | API | Key | Cache | Reading |
|---|---|---|---|---|
| heart | CoinGecko `simple/price` BTC/USD + 24h change | none | 2 min (≥60s required) | `{ priceUsd, change24hPct }` |
| mood | Open-Meteo forecast at Pete's home | none | 10 min, keyed by coords | `{ weatherCode, condition, temperatureC, windKmh, location }` |
| lungs | Open-Meteo Air Quality at Pete's home (+ optional NASA FIRMS hotspots) | none (`FIRMS_MAP_KEY` optional) | 10 min, keyed by coords | `{ pm25, pm10, aqiUs, aqiEu, condition, location, fireHotspots24h }` |
| brain | Wikipedia REST random summary | none | n/a — Pete's memory (last 5) | `{ currentFact, memory[] }` |
| stomach | GitHub events + commits API for `Revaaa28` | optional `GITHUB_TOKEN` | 60s | `{ commitsToday, pushesToday, lastPushAt, method }` (home-timezone day) |
| voice | Web Speech API | none (browser) | n/a | client-side only |
| diary | Gemini `generateContent` | `GEMINI_API_KEY` | per state-change | narration only; template fallback labelled `source:'template'` |

## Location law (Pete moves in with the visitor — concept change, Rev 2026-11-17)
- Pete has NO fixed home and there is NO default place anywhere: `src/location.js` only validates a visitor-supplied location (`normalizeLocation` returns `null` when no coordinates are given) and builds cache keys.
- The visitor chooses where Pete lives — geocoding search (`/api/geocode`), browser geolocation, or preset capitals — the choice persists in the browser's localStorage and rides along as `?lat&lon&place` on `/api/state` and `/api/refresh/:organ`. The mood and lungs adapters read THAT place; caches are keyed by rounded coordinates so readings never mix.
- With no place chosen, mood and lungs SHALL return `awaiting:true` readings (not dead, no data, no error) and Pete's state is `awaiting-home` (pet-state-model Requirement 7).
- The old comparison endpoint (`/api/compare`) and the benchmark home are REMOVED; there is exactly one Pete per visitor, living where that visitor put him.

## Requirements

### Requirement 1: Isolation
1. Each adapter SHALL live in its own module under `src/organs/` and SHALL NOT import another adapter.
2. A failure in one adapter SHALL NOT prevent the others from returning readings (the server collects them with independent promises).

### Requirement 2: No fabrication
1. WHEN an API returns a non-2xx status, times out (9s), or returns an unexpected payload shape THEN the adapter SHALL return `ok:false` with the real error.
2. An adapter SHALL NOT substitute sample data, stale data presented as fresh, or a previous organ's reading. (Cache hits within TTL are labelled `cached:true` / carry their original fetch time via the server response. Stale-while-error servings under Requirement 6 are a separate, explicitly labelled path — `stale:true` + original `fetchedAt` + the real error — and are the ONLY way an out-of-TTL reading may be served.)

### Requirement 3: Rate-limit respect
1. The heart adapter SHALL cache for at least 60 seconds.
2. The stomach adapter SHOULD use `GITHUB_TOKEN` when present; without it, a GitHub rate-limit response SHALL surface as `ok:false`, not as "zero commits".

### Requirement 4: Lungs breathe the home air
1. The lungs adapter SHALL report PM2.5, PM10 and US AQI for the place Pete currently lives and bucket them on the standard US AQI bands (`clean / moderate / unhealthy-sensitive / haze / severe-haze`).
2. NASA FIRMS hotspots SHALL be counted only when `FIRMS_MAP_KEY` is configured; otherwise `fireHotspots24h` SHALL be `null` with a note — never estimated.
3. WHEN the air-quality API fails AND no last good reading exists for that place THEN the lungs SHALL return `ok:false` and Pete's breathing SHALL be reported as unknown, not zero-ish. WHEN a last good exists THEN the lungs SHALL serve it under Requirement 6 (`stale:true`, original `fetchedAt`) and breathing SHALL be computed from that labelled-stale reading.

### Requirement 5: The diary never decides
1. The diary module SHALL receive the already-computed deterministic state and SHALL only narrate it.
2. WHEN Gemini is unavailable THEN the diary SHALL fall back to deterministic template lines labelled `source:'template'`; a template line SHALL NEVER be labelled `gemini`.

### Requirement 6: Resilience — retry, then honestly stale (added 2026-11-17)
Motivation, verified live: from the Render deployment's shared egress IP, CoinGecko and Open-Meteo answered HTTP 429 while the same calls succeeded from the build VM. Pete shall be hard to kill by rate limits — without ever lying about freshness.
1. Every adapter fetch SHALL retry transient failures (HTTP 429, 5xx, network/abort) with exponential backoff (1s, 3s, 8s), SHALL honour a `Retry-After` header (capped at 8s), and SHALL stop after ~15s of total backoff. Non-transient statuses (other 4xx) SHALL fail immediately.
2. WHEN a refresh ultimately fails AND a last successful reading exists for that organ (and, for location-bound organs, for that exact place) THEN the adapter SHALL serve it with `stale:true`, its ORIGINAL `fetchedAt`, and the real refresh error in `error`. The state engine SHALL score it normally, SHALL NOT grey the part or count the organ dead, and SHALL name it in `staleOrgans`, the summary, and the diary.
3. WHEN no last good exists THEN the organ SHALL return `ok:false` exactly as before — staleness never invents a first reading, and never leaks across locations.
4. On server start, the server SHALL warm up all home organs once (fire-and-forget) so caches and last-goods seed before the first visitor.
5. TTLs: heart 2 min, mood 10 min, lungs 10 min (stomach 60s, unchanged).
