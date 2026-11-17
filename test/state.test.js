'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeState } = require('../src/state');

const ok = (organ, data) => ({ organ, source: 'test', ok: true, data, error: null, fetchedAt: new Date().toISOString() });
const dead = (organ) => ({ organ, source: 'test', ok: false, data: null, error: 'boom', fetchedAt: new Date().toISOString() });

const healthy = () => ({
  heart: ok('heart', { priceUsd: 65000, change24hPct: 4.2 }),
  mood: ok('mood', { weatherCode: 0, condition: 'clear', temperatureC: 31, windKmh: 6, location: 'Borneo' }),
  brain: ok('brain', { currentFact: { title: 'Octopus' }, memory: [{ title: 'Octopus' }, { title: 'Moon' }, { title: 'Tea' }] }),
  stomach: ok('stomach', { commitsToday: 4, pushesToday: 2, lastPushAt: new Date().toISOString(), user: 'Revaaa28' }),
  lungs: ok('lungs', { pm25: 8.2, pm10: 12, aqiUs: 30, aqiEu: 18, condition: 'clean', location: 'Borneo' }),
});

test('all organs healthy -> thriving, no grey parts, not limping', () => {
  const s = computeState(healthy());
  assert.equal(s.overall, 'thriving');
  assert.equal(s.limping, false);
  assert.deepEqual(s.greyParts, []);
  assert.deepEqual(s.deadOrgans, []);
  assert.equal(s.face, 'cheerful');
  assert.ok(s.scores.health >= 78, `health ${s.scores.health}`);
  assert.ok(s.scores.energy > 70);
  assert.equal(s.scores.hunger, 100 - s.scores.fed);
});

test('one organ dead -> that part greys out and Pete limps', () => {
  const r = healthy();
  r.heart = dead('heart');
  const s = computeState(r);
  assert.equal(s.overall, 'limping');
  assert.equal(s.limping, true);
  assert.deepEqual(s.deadOrgans, ['heart']);
  assert.deepEqual(s.greyParts, ['chest']);
  assert.equal(s.scores.energy, 0);
  assert.ok(s.summary.includes('limping'));
});

test('GitHub zero commits today -> hungry', () => {
  const r = healthy();
  r.stomach = ok('stomach', { commitsToday: 0, pushesToday: 0, lastPushAt: null, user: 'Revaaa28' });
  const s = computeState(r);
  assert.equal(s.overall, 'hungry');
  assert.ok(s.scores.hunger >= 80, `hunger ${s.scores.hunger}`);
  assert.equal(s.commitsToday, 0);
});

test('storm weather -> scared face and gloomy state', () => {
  const r = healthy();
  r.mood = ok('mood', { weatherCode: 95, condition: 'storm', temperatureC: 26, windKmh: 40, location: 'Borneo' });
  const s = computeState(r);
  assert.equal(s.face, 'scared');
  assert.equal(s.overall, 'gloomy');
  assert.ok(s.scores.mood <= 20);
});

test('deterministic: same readings in, same state out', () => {
  const a = computeState(healthy());
  const b = computeState(healthy());
  assert.deepEqual(a, b);
});

test('rain -> gloomy even when fed', () => {
  const r = healthy();
  r.mood = ok('mood', { weatherCode: 63, condition: 'rain', temperatureC: 27, windKmh: 9, location: 'Borneo' });
  const s = computeState(r);
  assert.equal(s.overall, 'gloomy');
  assert.equal(s.face, 'gloomy');
});

test('clean Borneo air -> breathing easy, no smoke', () => {
  const s = computeState(healthy());
  assert.ok(s.scores.breathing >= 85, `breathing ${s.scores.breathing}`);
  assert.equal(s.smoky, false);
  assert.equal(s.airCondition, 'clean');
});

test('haze-level PM2.5 -> Pete coughs, overall smoky', () => {
  const r = healthy();
  r.lungs = ok('lungs', { pm25: 132, pm10: 190, aqiUs: 178, aqiEu: 150, condition: 'haze', location: 'Borneo' });
  const s = computeState(r);
  assert.equal(s.overall, 'smoky');
  assert.equal(s.smoky, true);
  assert.equal(s.face, 'coughing');
  assert.ok(s.scores.breathing <= 30, `breathing ${s.scores.breathing}`);
});

test('lungs organ dead -> lungs grey, breathing honestly unknown (null)', () => {
  const r = healthy();
  r.lungs = dead('lungs');
  const s = computeState(r);
  assert.equal(s.overall, 'limping');
  assert.ok(s.deadOrgans.includes('lungs'));
  assert.ok(s.greyParts.includes('lungs'));
  assert.equal(s.scores.breathing, null);
  assert.equal(s.airCondition, null);
});

test('BTC crash -> low energy', () => {
  const r = healthy();
  r.heart = ok('heart', { priceUsd: 40000, change24hPct: -9 });
  const s = computeState(r);
  assert.ok(s.scores.energy <= 10, `energy ${s.scores.energy}`);
});
