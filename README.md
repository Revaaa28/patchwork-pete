# 🧟 Patchwork Pete

**A virtual pet sewn together from live, incompatible APIs.**
Kiroween 2026 — **Frankenstein** category.

Pete has no insides of his own. Each of his organs *is* a real third-party API, and his visible state — his face, his heartbeat, his hunger, how easily he breathes, whether he stands tall or limps — is computed, moment by moment, from what those APIs actually return. If an organ's API dies, that body part goes grey and Pete limps. He never fakes a reading.

## Pete lives in Borneo 🌴

Pete is **one shared creature** with **one home**: **Palangka Raya, Central Kalimantan, Borneo** — the peat-haze heart of the island they call *the lungs of the world*. His stitched-on lungs breathe Borneo's real air, and his face wears Borneo's real weather. When the rainforest air is clean, Pete breathes easy. When Borneo burns and the haze rolls in, Pete coughs — visibly, in the pixel art, in his scores, and in his diary.

Because home is a single benchmark, every visitor and judge sees the **same Pete**, and his state is comparable day to day. Home is configured in exactly one place (environment: `PETE_HOME_NAME`, `PETE_HOME_LAT`, `PETE_HOME_LON` — see `src/location.js`); nothing else in the code hard-codes it.

**Visitors don't move Pete.** The "Your Air vs Pete's Borneo Air" panel (browser geolocation, city search via Open-Meteo Geocoding, or preset cities) reads *your* sky and air and sets them beside Pete's — comparison only. It never touches his official state, scores, or diary.

## The organs

| Organ | Body part | Source API | What it does |
|---|---|---|---|
| ❤️ Heart | chest | CoinGecko public API (keyless) | BTC price + 24h change → heartbeat & energy (cached 90s) |
| 🌦️ Face / Mood | face | Open-Meteo weather (keyless) at Pete's home | WMO weather code → Pete's mood: sun = cheerful, rain = gloomy, storm = scared |
| 🫁 Lungs | lungs | Open-Meteo Air Quality (keyless) at Pete's home | PM2.5 / PM10 / US AQI → breathing score on the standard AQI bands: clean = easy, haze = coughing, grey-brown lungs. Optional: NASA FIRMS fire hotspots when `FIRMS_MAP_KEY` is set — otherwise reported as not configured, never faked |
| 🧠 Brain | head | Wikipedia random article | Facts Pete has learned; he remembers the last 5 |
| 🍽️ Stomach | belly | GitHub API for [@Revaaa28](https://github.com/Revaaa28) | Events feed finds today's pushed repos, commits API counts the real commits (home-timezone day); zero commits = hungry Pete |
| 🔊 Voice | mouth | Web Speech API | Runs entirely in the visitor's browser — Pete speaks his own status aloud |
| 📓 Nervous system | diary | Gemini (optional) | Writes diary lines *from* the computed state. No key / failure → deterministic template lines, honestly labelled |

## The law of the lab

- **Deterministic state.** Scores (health, energy, mood, breathing, brain, fed, hunger) and the overall state (`thriving / ok / hungry / gloomy / smoky / limping`) are computed by one pure function — `src/state.js`. Same readings in, same Pete out. A dead lungs organ leaves breathing `null` — unknown, shown as "—", never a made-up number.
- **Models narrate; code decides.** Gemini may write the diary. It never decides how Pete feels.
- **Failure is visible.** Every adapter returns `{ ok, data, error, fetchedAt }` and resolves instead of throwing. `ok:false` means a grey part, a red stitch-map card, the real error message — and a limping pet.

## Run it

```bash
npm install
npm start          # http://localhost:4177  (PORT env overrides)
npm test           # state-engine + adapter contract tests
```

Optional environment:
- `PETE_HOME_NAME`, `PETE_HOME_LAT`, `PETE_HOME_LON` — re-point Pete's benchmark home (default: Palangka Raya, Borneo, Indonesia · −2.21, 113.92).
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
server.js            Express service + API (/api/state, /api/refresh/:organ, /api/compare, /api/geocode)
src/state.js         pure deterministic pet-state engine
src/location.js      the one home config (env) + visitor-location validation
src/fetchJson.js     timeout + TTL-cache fetch helper
src/organs/          heart.js · mood.js · lungs.js · brain.js · stomach.js · diary.js
public/              pixel Pete (canvas), stitch map, comparison panel, diary — no build step
test/                node:test suites
.kiro/               specs · steering · hooks
```

## License

MIT — see [LICENSE](LICENSE).
