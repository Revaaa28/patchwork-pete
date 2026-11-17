'use strict';

/* Pete's haunted music-box melody.
   This is an original, deliberately sparse phrase in A natural minor,
   composed for this project as a note table — not a transcription or
   arrangement of any existing tune. The browser turns each entry into a
   short-lived WebAudio music-box voice (a sine fundamental plus two
   harmonics with a fast exponential decay). Small, fixed detune offsets
   make individual notes sound like an old mechanism rather than a clean
   software piano; they are part of the composition table, not random
   tuning errors introduced at playback time.
   Loaded as a classic script in the browser (window.PETE_MELODY) and
   require()-able in Node for the tests. */

const A_MINOR_PITCH_CLASSES = new Set([9, 11, 0, 2, 4, 5, 7]); // A B C D E F G

// startSec is measured from the start of the phrase. The uneven spacing
// is intentional rubato: some notes arrive close together, then the toy
// seems to hesitate before remembering the next one.
const MELODY_NOTES = [
  { name: 'E4', midi: 64, startSec: 0.00, ringSec: 1.55, detuneCents: -4, velocity: 0.88 },
  { name: 'C4', midi: 60, startSec: 0.68, ringSec: 1.45, detuneCents: 0, velocity: 0.76 },
  { name: 'A3', midi: 57, startSec: 1.46, ringSec: 1.75, detuneCents: -7, velocity: 0.82 },
  { name: 'B3', midi: 59, startSec: 2.31, ringSec: 1.35, detuneCents: 3, velocity: 0.70 },
  { name: 'C4', midi: 60, startSec: 3.02, ringSec: 1.65, detuneCents: -2, velocity: 0.80 },
  { name: 'D4', midi: 62, startSec: 4.28, ringSec: 1.45, detuneCents: 0, velocity: 0.74 },
  { name: 'E4', midi: 64, startSec: 5.03, ringSec: 1.55, detuneCents: -5, velocity: 0.86 },
  { name: 'G4', midi: 67, startSec: 5.91, ringSec: 1.85, detuneCents: 2, velocity: 0.78 },
  { name: 'F4', midi: 65, startSec: 7.08, ringSec: 1.45, detuneCents: -3, velocity: 0.72 },
  { name: 'E4', midi: 64, startSec: 7.78, ringSec: 1.70, detuneCents: -9, velocity: 0.84 },
  { name: 'D4', midi: 62, startSec: 8.79, ringSec: 1.40, detuneCents: 0, velocity: 0.70 },
  { name: 'B3', midi: 59, startSec: 9.51, ringSec: 1.80, detuneCents: 4, velocity: 0.76 },
  { name: 'C4', midi: 60, startSec: 10.86, ringSec: 1.55, detuneCents: -2, velocity: 0.74 },
  { name: 'A3', midi: 57, startSec: 11.67, ringSec: 2.85, detuneCents: -6, velocity: 0.88 },
];

const MELODY_PHRASE_END_SEC = MELODY_NOTES.reduce(
  (end, note) => Math.max(end, note.startSec + note.ringSec),
  0,
);
const MELODY_PAUSE_MIN_SEC = 12;
const MELODY_PAUSE_MAX_SEC = 18;

function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

const PETE_MELODY = {
  key: 'A natural minor',
  notes: MELODY_NOTES,
  phraseEndSec: MELODY_PHRASE_END_SEC,
  pauseMinSec: MELODY_PAUSE_MIN_SEC,
  pauseMaxSec: MELODY_PAUSE_MAX_SEC,
  pitchClasses: A_MINOR_PITCH_CLASSES,
  midiToFrequency,
};

if (typeof window !== 'undefined') window.PETE_MELODY = PETE_MELODY;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PETE_MELODY,
    MELODY_NOTES,
    MELODY_PHRASE_END_SEC,
    MELODY_PAUSE_MIN_SEC,
    MELODY_PAUSE_MAX_SEC,
    A_MINOR_PITCH_CLASSES,
    midiToFrequency,
  };
}
