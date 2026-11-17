# Requirements — Pet State Model

Feature: `pet-state-model`
Status: authored 2026-11-17 (Kiro CLI working sessions scheduled Dec 1–2, after the account's monthly request limit resets).

## Introduction
Patchwork Pete's visible state must be a pure, deterministic function of his organ readings. The same readings always produce the same state. No language model participates in deciding the state; a model may only narrate it afterwards (the diary).

## Glossary
- **Organ reading**: `{ organ, source, ok, data, error, fetchedAt }` produced by an organ adapter.
- **Dead organ**: a reading with `ok:false`.
- **Grey part**: the body part mapped to a dead organ (heart→chest, mood→face, brain→head, stomach→belly, lungs→lungs).

## Requirements

### Requirement 1: Deterministic scores
**User story:** As a judge, I want Pete's scores to be reproducible, so that the pet is a system I can verify, not a demo I have to trust.

#### Acceptance criteria
1. WHEN all four organ readings are healthy THEN the engine SHALL return scores health/energy/mood/brain/fed/hunger in the range 0–100 computed only from the readings.
2. WHEN the same readings are supplied twice THEN the engine SHALL return a deeply equal state.
3. The engine SHALL NOT call any network, clock (beyond reading timestamps already present), randomness, or model.

### Requirement 2: Honest failure
**User story:** As a visitor, I want a dead organ to be visible, so that Pete never pretends to be fine when an API is down.

#### Acceptance criteria
1. WHEN any organ reading has `ok:false` THEN the state SHALL list it in `deadOrgans`, its body part in `greyParts`, set `limping:true`, and the overall state SHALL be `limping`.
2. WHEN an organ is dead THEN its score SHALL be reported as 0 (energy/mood/brain/fed) or 100 (hunger) — never interpolated or carried over from an earlier reading.

### Requirement 3: Hunger from real commits
#### Acceptance criteria
1. WHEN the stomach reading reports `commitsToday: 0` and no organ is dead THEN the overall state SHALL be `hungry` and hunger SHALL be ≥ 80.
2. WHEN `commitsToday >= 3` and the sky is clear THEN the overall state SHALL be `thriving` (given healthy scores).

### Requirement 4: Weather drives the face
#### Acceptance criteria
1. WHEN the mood reading's condition is `storm` THEN face SHALL be `scared` and overall SHALL be `gloomy` (unless limping, which takes priority).
2. WHEN the condition is `clear` THEN face SHALL be `cheerful`.
3. WHEN the mood organ is dead THEN face SHALL be `blank` and the face part SHALL be grey.

### Requirement 5: Energy from the heart
#### Acceptance criteria
1. Energy SHALL increase with BTC's 24h change and decrease when it falls; a −9% day SHALL yield energy ≤ 10 and a +4% day SHALL yield energy > 70.

### Requirement 6: Breathing from the home air
**User story:** As a visitor, I want Pete's breathing to reflect the real air of the place I chose for him to live, so that haze season — wherever he lives — is something I can watch him live through.

#### Acceptance criteria
1. Breathing SHALL be derived from the lungs reading on the standard US AQI scale (PM2.5 bands as fallback): clean home air SHALL yield breathing ≥ 85.
2. WHEN the home air condition is `haze` or `severe-haze` THEN the overall state SHALL be `smoky` (unless limping), the face SHALL be `coughing`, and breathing SHALL be ≤ 30 at AQI ≈ 178.
3. WHEN the lungs organ is dead THEN breathing SHALL be `null` (unknown — displayed as "—"), the lungs part SHALL be grey, and the overall state SHALL be `limping`. Breathing SHALL never be replaced with an invented number.
4. The engine SHALL only ever receive readings for the ONE place the visitor chose as Pete's home (or awaiting readings when none was chosen); there is no default or benchmark place anywhere in the system.

### Requirement 7: Awaiting a home
**User story:** As a first-time visitor, I want Pete to wait honestly for a home instead of secretly living somewhere I never chose.

#### Acceptance criteria
1. WHEN mood and lungs readings carry `awaiting:true` (no home chosen) THEN the overall state SHALL be `awaiting-home`, the face SHALL be `waiting`, and mood and breathing scores SHALL be `null` (excluded from health) — never zero.
2. Awaiting organs SHALL NOT appear in `deadOrgans`, SHALL NOT set `limping`, and their parts SHALL NOT be grey.
3. WHEN a home is chosen THEN `homeName` SHALL carry that place's name and the summary and diary SHALL reference it ("Pete lives in …").
