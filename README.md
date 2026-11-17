# 🧟 Patchwork Pete

**A virtual pet sewn together from live, incompatible APIs.**
Kiroween 2026 — **Frankenstein** category.

Pete has no insides of his own. Each of his organs *is* a real third-party API, and his visible state — his face, his heartbeat, his hunger, how easily he breathes, whether he stands tall or limps — is computed, moment by moment, from what those APIs actually return. If an organ's API dies, that body part goes grey and Pete limps. He never fakes a reading.

## Pete moves in with you 🏠

Pete has **no fixed home** — he moves in with each visitor. **One shared pet, sewn from live APIs — who moves in with you. His face wears your weather. His stitched lungs breathe your air.**

The first thing a visitor does is answer *“Where shall Pete live?”* — by searching a country or city (Open-Meteo Geocoding), tapping **Use My Location**, or picking a preset capital (New Delhi, Tokyo, London, New York, Sydney, Jakarta). From that moment, Pete's mood *is* that place's real weather and his lungs breathe that place's real air: clean air and he breathes easy; haze and smoke and he coughs — visibly, in the pixel art, in his scores, and in his diary. The choice persists in the visitor's browser (localStorage), and a **Move Pete** control rehomes him any time.

**Before anyone chooses, Pete waits — honestly.** His heart, brain and stomach are already alive, but his face wears no weather and his lungs breathe no air: mood and breathing are *unknown* (never zero, never faked), his expression is the patient “waiting” face, and his overall state is `awaiting-home`. There is no default city quietly standing in for a home.

## The organs

| Organ | Body part | Source API | What it does |
|---|---|---|---|
| ❤️ Heart | chest | CoinGecko public API (keyless) | BTC price + 24h change → heartbeat & energy (cached 2 min) |
| 🌦️ Face / Mood | face | Open-Meteo weather (keyless) where Pete lives | WMO weather code → Pete's mood: sun = cheerful, rain = gloomy, storm = scared (cached 10 min). No home chosen yet → honestly `awaiting`, no weather invented |
| 🫁 Lungs | lungs | Open-Meteo Air Quality (keyless) where Pete lives | PM2.5 / PM10 / US AQI → breathing score on the standard AQI bands: clean = easy, haze = coughing, grey-brown lungs (cached 10 min). Optional: NASA FIRMS fire hotspots when `FIRMS_MAP_KEY` is set — otherwise reported as not configured, never faked. No home chosen yet → honestly `awaiting` |
| 🧠 Brain | head | Wikipedia random article | Facts Pete has learned; he remembers the last 5 |
| 🍽️ Stomach | belly | GitHub API for [@Revaaa28](https://github.com/Revaaa28) | Events feed finds today's pushed repos, commits API counts the real commits — where "today" is the local day of the place Pete currently lives (its timezone comes with the Open-Meteo readings; UTC until he has a home); zero commits = hungry Pete |
| 🔊 Voice | mouth | Web Speech API + WebAudio | Runs entirely in the visitor's browser — Pete speaks his own status aloud in a deep, slow, haunted delivery (deepest available English voice, pitch 0.4, rate 0.86, short phrases with held breaths). The separate **Haunt the Lab** toggle synthesizes the room's ambience live — WebAudio wind, a rare minor-key bell, an occasional creak — no audio files, off by default, and labelled as synthesized wherever it appears |
| 📓 Nervous system | diary | Gemini (optional) | Writes diary lines *from* the computed state. No key / failure → deterministic template lines, honestly labelled |

## The presentation

Pete is presented as a museum piece in a **gothic-luxury manor laboratory**: obsidian and velvet-black rooms, brass instruments and gold-thread stitches (his seams are literally sewn in gold), emerald jewel organ-lights, a serif specimen ledger, and a grand arched chamber under a spotlight. The luxury is alive, and — like everything about Pete — it is driven only by real readings:

- **The smoke in his chamber is the measured air of Pete's home.** Its density follows the real US AQI where he lives: crystal-clear on clean days, thick drifting haze (and a coughing Pete) when the AQI climbs.
- **A gold ECG line** under the stage beats at a rate derived from the real BTC 24h move; Pete's pixel heart pulses in sync, and falls honestly flat and grey if the heart organ dies.
- **His chest breathes** at the rate and depth his breathing score dictates — slow and deep on clean air, fast and shallow in smoke.
- **The room's light is his home's weather:** warm gold sun, cool rain gloom, and a flickering lamp in a storm.

## The law of the lab

- **Deterministic state.** Scores (health, energy, mood, breathing, brain, fed, hunger) and the overall state (`awaiting-home / thriving / ok / hungry / gloomy / smoky / limping`) are computed by one pure function — `src/state.js`. Same readings in, same Pete out. A dead lungs organ leaves breathing `null` — unknown, shown as "—", never a made-up number. An organ awaiting a home is not dead and not zero: it carries no score, greys nothing, and never makes Pete limp.
- **Models narrate; code decides.** Gemini may write the diary. It never decides how Pete feels.
- **Failure is visible.** Every adapter returns `{ ok, data, error, fetchedAt }` and resolves instead of throwing. `ok:false` means a grey part, a red stitch-map card, the real error message — and a limping pet.
- **Resilience without lies.** The free APIs rate-limit shared hosting IPs (verified live on Render, 2026-11-17: CoinGecko and Open-Meteo answered HTTP 429 from the shared egress IP while the same calls succeeded locally). So every fetch **retries** transient failures (429 / 5xx / network) with exponential backoff (1s, 3s, 8s, honouring `Retry-After`, ~15s of backoff max). When a refresh *still* fails and a previous successful reading exists, Pete serves that reading **stale**: `stale:true`, its **original** `fetchedAt`, an amber "stale · read at HH:MM:SS" label in the ledger, and a note in the summary and diary. A stale organ keeps its colour and scores normally — it is a real reading on loan, not a fresh one in disguise. With **no** last good (e.g. a fresh boot), the organ is dead exactly as before. On boot the server also **warms up** the location-free organs (heart, brain, stomach) once, fire-and-forget, so their caches seed before the first judge arrives; mood and lungs warm up the moment a visitor gives Pete a home.

## Run it

```bash
npm install
npm start          # http://localhost:4177  (PORT env overrides)
npm test           # state-engine + adapter contract tests
```

Optional environment:
- `GEMINI_API_KEY` — enables Gemini-written diary lines (falls back to labelled templates without it).
- `GITHUB_TOKEN` — raises the GitHub API rate limit for the stomach organ. Without it, a rate-limited response shows up honestly as a dead stomach, never as "zero commits".
- `FIRMS_MAP_KEY` — enables NASA FIRMS fire-hotspot counts around Pete's home in the lungs reading. Without it, the lungs work on Open-Meteo air quality alone and the FIRMS field is reported as not configured.

## How Kiro is used

This project is developed spec-first with **Kiro**:

- `.kiro/specs/pet-state-model/` and `.kiro/specs/organ-adapters/` — requirements (EARS-style), design, and task lists that define Pete before code.
- `.kiro/steering/stitch-architecture.md` — the binding rules: one organ = one isolated adapter; no organ may fake a reading; deterministic state; models only narrate.
- `.kiro/hooks/organ-tests-on-save.kiro.hook` — runs `npm test` when an adapter or the state engine is edited.

**Honest timeline:** the specs, steering, and hooks were authored on 2026-11-17. The Kiro account's monthly request limit was exhausted on 2026-11-16 (the 4,000 Kiroween event credits were redeemed 2026-11-17, but the November request limit still applies), so the live Kiro CLI working sessions — walking these specs task-by-task and reconciling the code with them — are scheduled for **Dec 1–2**, right after the quota reset and before the Dec 3 submission target. The `.kiro` folder ships at the repo root and is **not** gitignored.

## Layout

```
server.js            Express service + API (/api/state, /api/refresh/:organ, /api/geocode)
src/state.js         pure deterministic pet-state engine
src/location.js      visitor-chosen home validation + cache keys (no default home exists)
src/fetchJson.js     timeout + retry/backoff + TTL-cache + last-good fetch helper
src/organs/          heart.js · mood.js · lungs.js · brain.js · stomach.js · diary.js
public/              pixel Pete (canvas), stitch map, home picker, diary, spooky voice + synthesized ambience — no build step (phrases.js is shared with the tests)
test/                node:test suites
.kiro/               specs · steering · hooks
```

## License

MIT — see [LICENSE](LICENSE).
