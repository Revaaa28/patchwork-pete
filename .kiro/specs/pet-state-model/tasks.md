# Tasks — Pet State Model

Feature: `pet-state-model`

- [x] 1. Implement `computeState(readings)` as a pure function in `src/state.js`
  - [x] 1.1 Score derivations for energy / fed / hunger / mood / brain / health
  - [x] 1.2 Overall-state priority chain (limping > storm > hungry > rain > thriving > ok)
  - [x] 1.3 `greyParts`, `deadOrgans`, `parts[]`, human `summary`
- [x] 2. Unit tests in `test/state.test.js`
  - [x] 2.1 All healthy → thriving
  - [x] 2.2 One dead organ → grey + limping
  - [x] 2.3 Zero commits → hungry
  - [x] 2.4 Storm → scared / gloomy
  - [x] 2.5 Determinism check
- [x] 3. Breathing score + `smoky` state + lungs body part (AQI bands; dead lungs → breathing `null`)
  - [x] 3.1 Tests: clean air, haze → coughing/smoky, lungs dead → grey + null breathing
- [ ] 4. Re-run this spec through a live Kiro CLI session (scheduled Dec 1–2, after the monthly request-limit reset) and reconcile any drift Kiro proposes
