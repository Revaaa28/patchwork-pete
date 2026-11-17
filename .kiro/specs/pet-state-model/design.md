# Design — Pet State Model

Feature: `pet-state-model`

## Overview
`src/state.js` exports one pure function, `computeState(readings)`, plus the mood lookup tables. It has no I/O and no dependencies, which is what makes the whole pet auditable: given the four readings shown in the stitch map, anyone can recompute Pete's state by hand.

## Score derivation
| Score | Source | Rule |
|---|---|---|
| energy | heart | `clamp(55 + change24hPct * 6)` |
| fed | stomach | 0 commits → 12; 1 → 45; 2 → 62; 3–4 → 78; ≥5 → 95 |
| hunger | stomach | `100 - fed` (dead stomach → 100) |
| mood | mood organ | WMO-condition table: clear 95 … storm 15 |
| brain | brain organ | `clamp(65 + rememberedFacts * 7)` |
| breathing | lungs organ | US AQI: `clamp(105 − aqiUs × 0.55)`; PM2.5 band table as fallback; dead lungs → `null` (unknown) |
| health | all | mean of live scores − 12 per dead organ, clamped |

## Overall state (priority order)
1. `limping` — any organ dead.
2. `smoky` — home air is `haze` / `severe-haze` (face `coughing`).
3. `gloomy` — storm (face `scared`).
4. `hungry` — zero commits today.
5. `gloomy` — rain/drizzle.
6. `thriving` — health ≥ 78.
7. `ok` — otherwise.

Priority is deliberate: a dead organ is a stronger truth about Pete than the weather, and the weather is a stronger truth than an empty stomach.

## Body-part mapping
heart→chest, mood→face, brain→head, stomach→belly, lungs→lungs. `greyParts` is what the renderer greys out; `parts[]` carries each part's ok/score for the UI.

## Testing
`test/state.test.js` covers: all-healthy → thriving; one dead organ → grey part + limping; zero commits → hungry; storm → scared/gloomy; determinism (same input → deep-equal output); rain → gloomy; BTC crash → low energy.
