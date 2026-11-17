'use strict';

// The Haunt the Lab music box uses an original note table
// (public/melody.js). These tests keep the composition inside its
// declared A-natural-minor scale and preserve the haunted shape:
// one sparse phrase, then a long pause before it may return.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MELODY_NOTES,
  MELODY_PHRASE_END_SEC,
  MELODY_PAUSE_MIN_SEC,
  MELODY_PAUSE_MAX_SEC,
  A_MINOR_PITCH_CLASSES,
  midiToFrequency,
} = require('../public/melody');

test('the phrase has a sane music-box length', () => {
  assert.ok(MELODY_NOTES.length >= 12 && MELODY_NOTES.length <= 16,
    `expected 12-16 notes, got ${MELODY_NOTES.length}`);
  assert.ok(MELODY_PHRASE_END_SEC >= 12 && MELODY_PHRASE_END_SEC <= 18,
    `phrase should last 12-18 seconds, got ${MELODY_PHRASE_END_SEC}`);
});

test('every melody note belongs to A natural minor', () => {
  for (const note of MELODY_NOTES) {
    assert.ok(A_MINOR_PITCH_CLASSES.has(note.midi % 12),
      `${note.name} (MIDI ${note.midi}) is outside A natural minor`);
    assert.equal(midiToFrequency(note.midi), 440 * (2 ** ((note.midi - 69) / 12)));
  }
});

test('notes are ordered, ring briefly, and only lean a few cents worn', () => {
  let previousStart = -Infinity;
  for (const note of MELODY_NOTES) {
    assert.ok(note.startSec > previousStart, 'note starts must increase through the phrase');
    previousStart = note.startSec;
    assert.ok(note.ringSec >= 1 && note.ringSec <= 3, `${note.name} ring is not music-box-like`);
    assert.ok(Math.abs(note.detuneCents) <= 12, `${note.name} is too far out of tune`);
    assert.ok(note.velocity >= 0.65 && note.velocity <= 0.9, `${note.name} velocity is not restrained`);
  }
});

test('the haunted pause stays between ten and twenty seconds', () => {
  assert.ok(MELODY_PAUSE_MIN_SEC >= 10);
  assert.ok(MELODY_PAUSE_MAX_SEC <= 20);
  assert.ok(MELODY_PAUSE_MAX_SEC > MELODY_PAUSE_MIN_SEC);
});
