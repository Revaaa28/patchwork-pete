# Design — Organ Adapters

Feature: `organ-adapters`

## Layout
```
src/fetchJson.js        fetch + timeout + TTL caches (single + per-location keyed)
src/location.js         the ONE home config (env PETE_HOME_*) + visitor location validation
src/organs/heart.js     CoinGecko
src/organs/mood.js      Open-Meteo weather, location-parameterised (+ conditionForCode)
src/organs/lungs.js     Open-Meteo Air Quality, location-parameterised (+ conditionForAir, optional FIRMS)
src/organs/brain.js     Wikipedia (+ in-memory fact memory, last 5)
src/organs/stomach.js   GitHub events + commits (+ countCommitsToday, exported for tests)
src/organs/diary.js     Gemini narration / template fallback
server.js               official state: home readings -> computeState -> diary
                        /api/compare: visitor readings beside home readings (never feeds state)
```

## Design decisions
- **Adapters resolve, never reject.** The server can `Promise.all` without one organ's outage taking the whole pet down; failure is data (`ok:false`), not control flow.
- **Dependency injection for tests.** Each getter accepts `{ force, fetchFn }`; tests pass fake fetch functions to prove both the mapping and the honest-failure path without touching the network.
- **Brain memory semantics.** A plain read returns Pete's current fact (learning is an event, not a poll). `force` ("Teach Pete") fetches a new article, unshifts it into the 5-fact memory, and de-dupes consecutive repeats.
- **Home day boundary.** GitHub timestamps are UTC; "today" for feeding is Pete's home day (Borneo home: UTC+7, no DST) — Pete eats on home time (`todayAtHome` in stomach.js, covered by tests).
- **Stomach counts real commits, not vibes.** Verified live 2026-11-17: the events feed's PushEvent payloads no longer carry a commits array. The adapter therefore uses events only to find today's pushed repos, then counts commits via `GET /repos/{repo}/commits?author=…&since=<home midnight>`. If that call fails for a repo, it falls back to one serving per push and reports `method:'push-fallback'` in the reading.
- **Diary caching.** A new diary entry is generated only when the state signature (overall|face|dead organs|commits) changes, or on Teach — the Gemini free tier is never burned per pageview.
- **Timeouts.** Every outbound call aborts at 9s; a slow API becomes a dead organ, not a hung page.

## Error taxonomy (all become `ok:false`)
HTTP non-2xx · network/abort · payload-shape mismatch (validated field-by-field) · GitHub rate limit (HTTP 403).
