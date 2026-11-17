# Hooks

## organ-tests-on-save
File: `organ-tests-on-save.kiro.hook`

Intent: editing any file under `src/organs/`, or `src/state.js` / `src/fetchJson.js`, runs `npm test` — the organ-adapter contract tests and the pet-state tests — before the change settles. A broken adapter must fail loudly in the editor, not silently in production (where Pete would pay for it with a limb).

## Format note (honest uncertainty)
The hook is written in the JSON hook shape documented for Kiro (`.kiro.hook` files with a trigger — here a file-edited event with file patterns — and an action — here running a shell command). The exact schema version supported by the Kiro CLI build in use (v3.2.0) has not yet been verified in a live Kiro session: this project's Kiro account hit its monthly request limit on 2026-11-16, and the working Kiro sessions are scheduled for Dec 1–2 after the reset. At that point this hook will be opened in Kiro, validated, and adjusted to whatever schema the installed build expects; the trigger and the command (`npm test`) are the substance and will not change.
