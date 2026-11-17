# Requirements — Organ Adapters

Feature: `organ-adapters`
Status: authored 2026-11-17 (Kiro CLI working sessions scheduled Dec 1–2, after the account's monthly request limit resets).

## Introduction
Every organ of Patchwork Pete is one isolated adapter behind a single interface. An adapter talks to exactly one external API, translates its payload into Pete's reading shape, and — above all — never fabricates a reading.

## The one interface
Every adapter resolves (never rejects) to:
```
{ organ, source, ok, data, error, fetchedAt, cached }
```
- `ok:true` only when a real response was received and validated.
- `ok:false` ⇒ `data:null` (brain may attach its last good memory, clearly still Pete's own past learning, never a fresh invention) and `error` carries the real failure message.

## Organs
| Organ | API | Key | Cache | Reading |
|---|---|---|---|---|
| heart | CoinGecko `simple/price` BTC/USD + 24h change | none | 90s (≥60s required) | `{ priceUsd, change24hPct }` |
| mood | Open-Meteo forecast at Pete's home | none | 5 min, keyed by coords | `{ weatherCode, condition, temperatureC, windKmh, location }` |
| lungs | Open-Meteo Air Quality at Pete's home (+ optional NASA FIRMS hotspots) | none (`FIRMS_MAP_KEY` optional) | 10 min, keyed by coords | `{ pm25, pm10, aqiUs, aqiEu, condition, location, fireHotspots24h }` |
| brain | Wikipedia REST random summary | none | n/a — Pete's memory (last 5) | `{ currentFact, memory[] }` |
| stomach | GitHub events + commits API for `Revaaa28` | optional `GITHUB_TOKEN` | 60s | `{ commitsToday, pushesToday, lastPushAt, method }` (home-timezone day) |
| voice | Web Speech API | none (browser) | n/a | client-side only |
| diary | Gemini `generateContent` | `GEMINI_API_KEY` | per state-change | narration only; template fallback labelled `source:'template'` |

## Location law (benchmark + comparison)
- Pete is ONE shared creature with ONE benchmark home, configured in exactly one place (`src/location.js`, env `PETE_HOME_NAME` / `PETE_HOME_LAT` / `PETE_HOME_LON`; default Palangka Raya, Borneo, Indonesia · −2.21, 113.92).
- The mood and lungs adapters accept a location parameter, but the server's official state path SHALL always pass Pete's home. Caches are keyed by rounded coordinates so readings never mix.
- Visitor locations (geolocation / geocoding search / presets) SHALL be served only by the comparison endpoint (`/api/compare`) and SHALL NOT influence Pete's state, scores, or diary.

## Requirements

### Requirement 1: Isolation
1. Each adapter SHALL live in its own module under `src/organs/` and SHALL NOT import another adapter.
2. A failure in one adapter SHALL NOT prevent the others from returning readings (the server collects them with independent promises).

### Requirement 2: No fabrication
1. WHEN an API returns a non-2xx status, times out (9s), or returns an unexpected payload shape THEN the adapter SHALL return `ok:false` with the real error.
2. An adapter SHALL NOT substitute sample data, stale data presented as fresh, or a previous organ's reading. (Cache hits within TTL are labelled `cached:true` / carry their original fetch time via the server response.)

### Requirement 3: Rate-limit respect
1. The heart adapter SHALL cache for at least 60 seconds.
2. The stomach adapter SHOULD use `GITHUB_TOKEN` when present; without it, a GitHub rate-limit response SHALL surface as `ok:false`, not as "zero commits".

### Requirement 4: Lungs breathe the benchmark air
1. The lungs adapter SHALL report PM2.5, PM10 and US AQI for Pete's home and bucket them on the standard US AQI bands (`clean / moderate / unhealthy-sensitive / haze / severe-haze`).
2. NASA FIRMS hotspots SHALL be counted only when `FIRMS_MAP_KEY` is configured; otherwise `fireHotspots24h` SHALL be `null` with a note — never estimated.
3. WHEN the air-quality API fails THEN the lungs SHALL return `ok:false` and Pete's breathing SHALL be reported as unknown, not zero-ish or stale.

### Requirement 5: The diary never decides
1. The diary module SHALL receive the already-computed deterministic state and SHALL only narrate it.
2. WHEN Gemini is unavailable THEN the diary SHALL fall back to deterministic template lines labelled `source:'template'`; a template line SHALL NEVER be labelled `gemini`.
