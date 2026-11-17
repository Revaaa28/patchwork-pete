# Steering — Stitch Architecture Rules

These rules bind every change to Patchwork Pete, human- or agent-written.

## The stitch pattern
1. **One organ, one adapter, one API.** Every organ is an isolated module behind the single reading interface `{ organ, source, ok, data, error, fetchedAt }`. Adapters never import each other.
2. **No organ may fake a reading.** Failure is a first-class, visible result (`ok:false`, grey body part, limping Pete). Sample data, silent stale data, and "probably fine" defaults are forbidden in production paths. Fixtures live only in tests.
3. **Deterministic state, always.** Pete's scores and overall state come only from the pure function in `src/state.js`. Same readings in → same state out.
4. **Models narrate; code decides.** A language model (Gemini) may write diary lines *from* the computed state. It must never set, adjust, or override a score, a state, or an organ reading. Diary output is always labelled with its true source (`gemini` or `template`).
5. **Failures are shown, not hidden.** The UI must render dead organs as dead (grey part, red stitch-map card, the real error text). Never catch-and-substitute in the UI either.

## Pete moves in with the visitor (home rule — changed by Rev 2026-11-17)
- Pete has NO fixed home and there is NO default place: `src/location.js` only validates visitor-supplied locations and builds cache keys. Each visitor chooses where Pete lives (geocoding search, browser geolocation, or preset capitals; persisted in localStorage), and his mood and breathing come only from THAT place's weather and air (standard US AQI / PM2.5 bands).
- Before a choice, mood and lungs are `awaiting` — not dead, not zero, never silently filled by a default city. Copy must never present a place Pete does not live as his home.
- The stomach's "today" is the chosen home's local day (timezone from the Open-Meteo readings; UTC while homeless).
- The lungs organ breathes home air via Open-Meteo Air Quality; NASA FIRMS hotspots are counted only when `FIRMS_MAP_KEY` is configured — otherwise the field is null and labelled as not configured.

## Engineering rules
- Node + Express, single service, no build step. `npm start` must work on a fresh clone after `npm install`.
- Every outbound HTTP call has a timeout (≤ 10s) and adapters resolve — they never reject.
- Respect free-tier rate limits: CoinGecko cached ≥ 60s; diary generated per state-change, not per pageview.
- Secrets only via environment (`GEMINI_API_KEY`, optional `GITHUB_TOKEN`). Never commit a key; never log one.
- New organ? Add: adapter module, state-engine mapping, stitch-map entry, tests for both the healthy mapping and the honest failure, and a row in the README organs table. Nothing less ships.
- Tests (`npm test`, Node's built-in runner) must pass before any commit. The hook in `.kiro/hooks/` exists to enforce exactly this on save.
