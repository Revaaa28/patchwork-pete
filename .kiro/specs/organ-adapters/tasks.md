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
- [x] 10. Fixed-home design (superseded by task 16): single home config in `src/location.js`; location-parameterised mood/lungs with per-coordinate caches
- [x] 11. Visitor location plumbing (repurposed by task 16): `/api/geocode`, presets, browser geolocation
- [ ] 12. Re-run this spec through a live Kiro CLI session (scheduled Dec 1–2, after the monthly request-limit reset) and reconcile any drift Kiro proposes
- [x] 13. Resilience (2026-11-17): fetchJson retry/backoff on 429/5xx/network with Retry-After; stale-while-error with original timestamps (Requirement 6); TTLs heart 2 min / mood 10 min; boot warm-up; `test/resilience.test.js`
- [x] 14. Social card (2026-11-17): `public/og-image.jpg` (1200×630, composed from the real luxury UI) + full Open Graph / Twitter meta in `public/index.html`
- [x] 15. Haunted voice (2026-11-17): spooky speechSynthesis delivery (deepest EN voice, pitch 0.4, rate 0.86, phrase-split with pauses; `public/phrases.js`, tested in `test/phrases.test.js`) + "Haunt the Lab" WebAudio synthesized ambience toggle (wind / minor bell / creaks, off by default, single reused AudioContext)
- [x] 16. Pete moves in with the visitor (2026-11-17, Rev: "Full pindah: hapus rumah tetap"): fixed home deleted; visitor-chosen home (search / geolocation / preset capitals, localStorage, Move Pete); `awaiting-home` state before a choice; `/api/compare` removed; stomach "today" follows the home timezone; copy/README/specs rewritten
