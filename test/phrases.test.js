'use strict';

// Pete's spooky voice splits his line into short phrases (public/phrases.js).
// The words never change — only the delivery. Decimals must survive:
// "PM2.5" and "+2.50%" are facts, not sentence ends.

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitPhrases, splitSentences } = require('../public/phrases');

test('empty input -> no phrases', () => {
  assert.deepEqual(splitPhrases(''), []);
  assert.deepEqual(splitPhrases('   '), []);
  assert.deepEqual(splitPhrases(null), []);
});

test('sentences split on . ! ?', () => {
  assert.deepEqual(splitPhrases('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
});

test('decimals are not sentence ends', () => {
  const phrases = splitPhrases('The air carries PM2.5 at 8.2 today. Pete breathes easily. His heart moved +2.50% today.');
  assert.equal(phrases.length, 3);
  assert.match(phrases[0], /PM2\.5 at 8\.2 today\./);
  assert.match(phrases[2], /\+2\.50% today\./);
});

test('a short line stays one phrase', () => {
  assert.deepEqual(splitPhrases('Pete is hungry.'), ['Pete is hungry.']);
});

test('long sentences split at clause boundaries under the cap', () => {
  const long = 'Pete wandered through the manor, past the brass instruments, under the cold chandeliers, and into the garden where the garden air was waiting for him.';
  const phrases = splitPhrases(long, 50);
  assert.ok(phrases.length >= 3, `got ${phrases.length}`);
  for (const p of phrases) assert.ok(p.length <= 50, `phrase too long (${p.length}): ${p}`);
  assert.equal(phrases.join(' '), long); // no words lost or reordered
});

test('splitSentences keeps a trailing fragment without punctuation', () => {
  assert.deepEqual(splitSentences('Done. Almost there'), ['Done.', 'Almost there']);
});
