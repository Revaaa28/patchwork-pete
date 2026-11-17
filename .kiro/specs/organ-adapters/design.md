# Design — Organ Adapters

Feature: `organ-adapters`

## Layout
```
src/fetchJson.js        fetch + per-attempt timeout + retry/backoff + TTL caches with last-good (single + per-location keyed)
src/location.js         visitor-chosen home validation + cache keys (no default home exists)
src/organs/heart.js     CoinGecko
src/organs/mood.js      Open-Meteo weather, location-parameterised (+ conditionForCode)
src/organs/lungs.js     Open-Meteo Air Quality, location-parameterised (+ conditionForAir, optional FIRMS)
src/organs/brain.js     Wikipedia (+ in-memory fact memory, last 5)
src/organs/stomach.js   GitHub events + commits (+ countCommitsToday, exported for tests)
src/organs/diary.js     Gemini narration / template fallback
server.js               state for the visitor-chosen home (?lat&lon&place) -> computeState -> diary
                        /api/geocode: city search for the home picker
```

## Design decisions
- **Adapters resolve, never reject.** The server can `Promise.all` without one organ's outage taking the whole pet down; failure is data (`ok:false`), not control flow.
- **Dependency injection for tests.** Each getter accepts `{ force, fetchFn }`; tests pass fake fetch functions to prove both the mapping and the honest-failure path without touching the network.
- **Brain memory semantics.** A plain read returns Pete's current fact (learning is an event, not a poll). `force` ("Teach Pete") fetches a new article, unshifts it into the 5-fact memory, and de-dupes consecutive repeats.
- **Home day boundary.** GitHub timestamps are UTC; "today" for feeding is the local day of the place Pete currently lives — its IANA timezone arrives with the Open-Meteo readings (`todayInTz` / `localMidnightUtcIso` in stomach.js, covered by tests). No home chosen ⇒ UTC. The stomach cache is keyed by timezone so a home move can never serve a count from the old home's day.
- **Stomach counts real commits, not vibes.** Verified live 2026-11-17: the events feed's PushEvent payloads no longer carry a commits array. The adapter therefore uses events only to find today's pushed repos, then counts commits via `GET /repos/{repo}/commits?author=…&since=<home midnight>`. If that call fails for a repo, it falls back to one serving per push and reports `method:'push-fallback'` in the reading.
- **Diary caching.** A new diary entry is generated only when the state signature (overall|face|dead organs|commits) changes, or on Teach — the Gemini free tier is never burned per pageview.
- **Timeouts.** Every outbound call aborts at 9s per attempt; a slow API becomes a dead organ, not a hung page.
- **Retry with backoff (2026-11-17).** `fetchJson` retries transient failures only (429, 5xx, network/abort): delays 1s/3s/8s, `Retry-After` honoured (max 8s), ~15s total backoff budget. Adapters accept `{ retryDelays, sleep }` so tests run the whole matrix deterministically with zeroed delays (`test/resilience.test.js`).
- **Stale-while-error (2026-11-17).** Caches keep their last value past TTL (`getStale()` / `getStale(key)`; keyed cache no longer deletes expired entries). An adapter's failure path serves that value as `{ ...last, stale:true, error:<real error> }` — original `fetchedAt` untouched, and the stale wrapper is never written back into the cache (which would launder its timestamp). The state engine scores stale readings, keeps the part coloured, lists them in `staleOrgans`, and appends a staleness note to the summary; the diary signature includes the stale set so a new entry narrates the change. No last good ⇒ unchanged dead-organ behaviour.
- **Boot warm-up (2026-11-17).** `server.js` fires one `fullState()` (fire-and-forget) when it starts listening, seeding TTL caches and last-goods before the first visitor — a Render cold start should not meet a judge with never-read organs.

## Error taxonomy (all become `ok:false`)
HTTP non-2xx · network/abort · payload-shape mismatch (validated field-by-field) · GitHub rate limit (HTTP 403).
