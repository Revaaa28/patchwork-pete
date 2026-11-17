# Tasks — Organ Adapters

Feature: `organ-adapters`

- [x] 1. Shared `fetchJson` + TTL cache helper with 9s timeout
- [x] 2. Heart adapter (CoinGecko, 90s cache)
- [x] 3. Mood adapter (Open-Meteo at Pete's home, WMO code → condition)
- [x] 4. Brain adapter (Wikipedia random summary, 5-fact memory, Teach = force)
- [x] 5. Stomach adapter (GitHub events, home-day commit counting, optional token)
- [x] 6. Diary (Gemini when `GEMINI_API_KEY` present; honest template fallback)
- [x] 7. Adapter contract tests with injected fake fetch (`test/organs.test.js`)
- [x] 8. Live-verify all HTTP APIs from the build VM (2026-11-17)
- [x] 9. Lungs adapter (Open-Meteo Air Quality at home; FIRMS hotspots only with `FIRMS_MAP_KEY`)
- [x] 10. Benchmark-home design: `src/location.js` single config (env `PETE_HOME_*`, default Borneo); location-parameterised mood/lungs with per-coordinate caches
- [x] 11. Comparison-only visitor location: `/api/compare` + `/api/geocode`, presets, browser geolocation — never feeds Pete's state
- [ ] 12. Re-run this spec through a live Kiro CLI session (scheduled Dec 1–2, after the monthly request-limit reset) and reconcile any drift Kiro proposes
