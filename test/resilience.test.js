'use strict';

// Resilience contract (2026-11-17): the free APIs rate-limit shared
// egress IPs (HTTP 429 from Render while local calls succeed), so Pete
// retries transient failures with backoff — and when a refresh still
// fails, serves the last good reading ONLY as an explicitly stale one
// (stale:true, ORIGINAL fetchedAt). With no last good, the organ stays
// dead. These tests are deterministic and offline: every fetch is a
// fake, and retry delays are zeroed via the retryDelays option.
// NOTE: this file runs in its own process, so the adapters' module
// caches start empty — test order below is deliberate (dead cases use
// pristine organs/locations, stale cases seed their own last-good).

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchJson } = require('../src/fetchJson');
const { getHeart } = require('../src/organs/heart');
const { getMood } = require('../src/organs/mood');
const { computeState } = require('../src/state');

const noSleep = async () => {};
const FAST = { retryDelays: [0, 0, 0], sleep: noSleep };
const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

/* ── fetchJson retry behaviour ─────────────────────────── */

test('fetchJson retries a 429 and then succeeds', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return calls === 1 ? res(429, {}) : res(200, { hello: 'world' }); };
  const json = await fetchJson('https://example.test/x', { fetchFn, ...FAST });
  assert.deepEqual(json, { hello: 'world' });
  assert.equal(calls, 2);
});

test('fetchJson retries a 503 and then succeeds', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return calls < 3 ? res(503, {}) : res(200, { ok: 1 }); };
  const json = await fetchJson('https://example.test/x', { fetchFn, ...FAST });
  assert.deepEqual(json, { ok: 1 });
  assert.equal(calls, 3);
});

test('fetchJson does NOT retry a non-transient 404', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return res(404, {}); };
  await assert.rejects(() => fetchJson('https://example.test/x', { fetchFn, ...FAST }), /404/);
  assert.equal(calls, 1);
});

test('fetchJson exhausts retries and throws the last status', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return res(429, {}); };
  await assert.rejects(() => fetchJson('https://example.test/x', { fetchFn, ...FAST }), /429/);
  assert.equal(calls, 4); // 1 initial + 3 retries
});

test('fetchJson honours Retry-After over the default backoff', async () => {
  const slept = [];
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 429, headers: { get: (h) => (h === 'retry-after' ? '2' : null) }, json: async () => ({}) };
    }
    return res(200, { done: true });
  };
  const json = await fetchJson('https://example.test/x', {
    fetchFn,
    retryDelays: [10, 10, 10],
    sleep: async (ms) => { slept.push(ms); },
  });
  assert.deepEqual(json, { done: true });
  assert.deepEqual(slept, [2000]); // Retry-After: 2 (seconds) beats the 10ms default
});

/* ── no last good -> stays dead (pristine organs) ──────── */

test('heart with NO last good stays dead after exhausted retries', async () => {
  const fetchFn = async () => res(429, {});
  const r = await getHeart({ force: true, fetchFn, ...FAST });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.equal(r.stale, undefined);
  assert.match(r.error, /429/);
});

test('mood with NO last good for a place stays dead', async () => {
  const fetchFn = async () => { throw new Error('network down'); };
  const r = await getMood({ force: true, fetchFn, ...FAST, location: { lat: -45.0, lon: -75.0, place: 'Pristine Nowhere' } });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.equal(r.stale, undefined);
});

/* ── stale-while-error (seed, then fail) ───────────────── */

test('heart serves last good as stale with ORIGINAL fetchedAt after failure', async () => {
  const good = async () => res(200, { bitcoin: { usd: 61234, usd_24h_change: -1.5 } });
  const first = await getHeart({ force: true, fetchFn: good, ...FAST });
  assert.equal(first.ok, true);
  assert.equal(first.stale, undefined);

  const bad = async () => res(503, {});
  const second = await getHeart({ force: true, fetchFn: bad, ...FAST });
  assert.equal(second.ok, true);
  assert.equal(second.stale, true);
  assert.equal(second.fetchedAt, first.fetchedAt); // original timestamp preserved
  assert.equal(second.data.priceUsd, 61234);
  assert.match(second.error, /503/); // the real failure is still reported
});

test('mood serves last good for THAT place as stale; another place stays dead', async () => {
  const loc = { lat: 64.1, lon: -21.9, place: 'Stale Test City' };
  const good = async () => res(200, { current: { weather_code: 0, temperature_2m: 4, wind_speed_10m: 12 } });
  const first = await getMood({ force: true, fetchFn: good, ...FAST, location: loc });
  assert.equal(first.ok, true);
  assert.equal(first.data.condition, 'clear');

  const bad = async () => res(429, {});
  const second = await getMood({ force: true, fetchFn: bad, ...FAST, location: loc });
  assert.equal(second.ok, true);
  assert.equal(second.stale, true);
  assert.equal(second.fetchedAt, first.fetchedAt);
  assert.equal(second.data.location, 'Stale Test City');

  const other = await getMood({ force: true, fetchFn: bad, ...FAST, location: { lat: 35.0, lon: 135.0, place: 'Unseen City' } });
  assert.equal(other.ok, false); // staleness never leaks across places
});

/* ── state engine: stale is not dead ───────────────────── */

const ok = (organ, data, extra = {}) => ({ organ, source: 'test', ok: true, data, error: null, fetchedAt: new Date().toISOString(), ...extra });
const healthy = () => ({
  heart: ok('heart', { priceUsd: 65000, change24hPct: 4.2 }),
  mood: ok('mood', { weatherCode: 0, condition: 'clear', temperatureC: 31, windKmh: 6, location: 'New Delhi, India' }),
  brain: ok('brain', { currentFact: { title: 'Octopus' }, memory: [{ title: 'Octopus' }] }),
  stomach: ok('stomach', { commitsToday: 4, pushesToday: 2, lastPushAt: new Date().toISOString(), user: 'Revaaa28' }),
  lungs: ok('lungs', { pm25: 8.2, pm10: 12, aqiUs: 30, aqiEu: 18, condition: 'clean', location: 'New Delhi, India' }),
});

test('a stale organ scores normally, does NOT grey or limp, and is named in the summary', () => {
  const r = healthy();
  r.mood = ok('mood', { weatherCode: 0, condition: 'clear', temperatureC: 31, windKmh: 6, location: 'New Delhi, India' }, { stale: true, error: 'HTTP 429 from api.open-meteo.com' });
  const s = computeState(r);
  assert.equal(s.limping, false);
  assert.deepEqual(s.deadOrgans, []);
  assert.deepEqual(s.greyParts, []);
  assert.deepEqual(s.staleOrgans, ['mood']);
  assert.ok(s.scores.mood > 0);
  assert.equal(s.parts.find((p) => p.key === 'mood').stale, true);
  assert.match(s.summary, /stale/i);
  assert.notEqual(s.overall, 'limping');
});
