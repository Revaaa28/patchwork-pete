'use strict';

// Labelled-fallback contract (round 2, 2026-11-17): from Render's shared
// egress IP, CoinGecko and the Open-Meteo forecast API answered 429 on
// EVERY check — permanently rate-limited, not bursty — so retry+stale
// had no last good to serve. The heart and face therefore fall back to
// other keyless sources, and the reading NAMES the source that actually
// produced it (data.source + the reading-level source string). A
// fallback is a real reading from a real API, never passed off as the
// primary; fields it cannot supply stay null.
//
// Deterministic and offline: every fetch is a URL-routing fake, retry
// delays are zeroed. This file runs in its own process; the heart's
// module cache starts empty, so test ORDER is deliberate — the
// all-sources-dead case runs first, while no last good exists.

const test = require('node:test');
const assert = require('node:assert/strict');
const { getHeart } = require('../src/organs/heart');
const { getMood, conditionForMetSymbol } = require('../src/organs/mood');

const noSleep = async () => {};
const FAST = { retryDelays: [0, 0, 0], sleep: noSleep };
const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});
const fail = (status) => async () => res(status, {});

/* ── heart: all sources fail -> dead, no fake data ─────── */

test('heart: CoinGecko + Coinbase + Kraken all fail -> dead, data null', async () => {
  const r = await getHeart({ force: true, fetchFn: fail(503), ...FAST });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.equal(r.stale, undefined);
  assert.match(r.error, /CoinGecko/);
  assert.match(r.error, /Coinbase \(fallback\)/);
  assert.match(r.error, /Kraken \(fallback\)/);
});

/* ── heart: CoinGecko down -> Coinbase serves, labelled ── */

test('heart: CoinGecko 429 -> Coinbase (fallback) serves and is labelled', async () => {
  const fetchFn = async (url) => {
    if (url.includes('coingecko')) return res(429, {});
    if (url.includes('coinbase') && url.includes('/stats')) {
      return res(200, { open: '65000.00', last: '67000.12', high: '67500', low: '64000' });
    }
    if (url.includes('coinbase')) return res(200, { price: '67000.12', bid: '67000.00', ask: '67000.20' });
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const r = await getHeart({ force: true, fetchFn, ...FAST });
  assert.equal(r.ok, true);
  assert.equal(r.data.source, 'Coinbase (fallback)');
  assert.match(r.source, /Coinbase \(fallback\)/);
  assert.equal(r.data.priceUsd, 67000.12);
  const expected = ((67000.12 - 65000) / 65000) * 100; // (last - open) / open
  assert.ok(Math.abs(r.data.change24hPct - expected) < 1e-9, `change ${r.data.change24hPct} != ${expected}`);
});

/* ── heart: CoinGecko + Coinbase down -> Kraken serves ─── */

test('heart: CoinGecko and Coinbase down -> Kraken (fallback) serves and is labelled', async () => {
  const fetchFn = async (url) => {
    if (url.includes('coingecko')) return res(429, {});
    if (url.includes('coinbase')) return res(500, {});
    if (url.includes('kraken')) {
      return res(200, { error: [], result: { XXBTZUSD: { c: ['67123.4', '0.001'], o: '65000.0' } } });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const r = await getHeart({ force: true, fetchFn, ...FAST });
  assert.equal(r.ok, true);
  assert.equal(r.data.source, 'Kraken (fallback)');
  assert.match(r.source, /Kraken \(fallback\)/);
  assert.equal(r.data.priceUsd, 67123.4);
  const expected = ((67123.4 - 65000) / 65000) * 100;
  assert.ok(Math.abs(r.data.change24hPct - expected) < 1e-9);
});

/* ── heart: fallback field-null honesty ────────────────── */

test('heart: Coinbase price without its stats endpoint -> change24hPct is null, not invented', async () => {
  const fetchFn = async (url) => {
    if (url.includes('coingecko')) return res(429, {});
    if (url.includes('coinbase') && url.includes('/stats')) return res(500, {});
    if (url.includes('coinbase')) return res(200, { price: '66000.5' });
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const r = await getHeart({ force: true, fetchFn, ...FAST });
  assert.equal(r.ok, true);
  assert.equal(r.data.source, 'Coinbase (fallback)');
  assert.equal(r.data.priceUsd, 66000.5);
  assert.equal(r.data.change24hPct, null); // the fallback could not supply it — null, never copied or guessed
});

/* ── mood: MET symbol mapping ──────────────────────────── */

test('mood: MET Norway symbol_code maps onto Pete\'s condition buckets', () => {
  assert.equal(conditionForMetSymbol('clearsky_day'), 'clear');
  assert.equal(conditionForMetSymbol('fair_night'), 'partly-cloudy');
  assert.equal(conditionForMetSymbol('partlycloudy_day'), 'partly-cloudy');
  assert.equal(conditionForMetSymbol('cloudy'), 'cloudy');
  assert.equal(conditionForMetSymbol('fog'), 'fog');
  assert.equal(conditionForMetSymbol('lightrain'), 'drizzle');
  assert.equal(conditionForMetSymbol('rain'), 'rain');
  assert.equal(conditionForMetSymbol('heavyrainandthunder'), 'storm');
  assert.equal(conditionForMetSymbol('lightsnow'), 'snow');
  assert.equal(conditionForMetSymbol('heavysleet'), 'snow');
  assert.equal(conditionForMetSymbol(null), null);
});

/* ── mood: Open-Meteo down -> MET Norway serves, labelled ─ */

test('mood: Open-Meteo 429 -> MET Norway (fallback) serves, labelled, with honest nulls', async () => {
  let metUserAgent = null;
  const fetchFn = async (url, opts = {}) => {
    if (url.includes('api.open-meteo.com/v1/forecast')) return res(429, {});
    if (url.includes('api.met.no')) {
      metUserAgent = opts.headers && opts.headers['User-Agent'];
      return res(200, {
        properties: {
          timeseries: [{
            time: '2026-11-17T05:00:00Z',
            data: {
              instant: { details: { air_temperature: 18.4, wind_speed: 5 } },
              next_1_hours: { summary: { symbol_code: 'rain' }, details: {} },
            },
          }],
        },
      });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const loc = { lat: 59.91, lon: 10.75, place: 'Fallback Fjord, Testland' };
  const r = await getMood({ force: true, fetchFn, ...FAST, location: loc });
  assert.equal(r.ok, true);
  assert.equal(r.data.source, 'MET Norway (fallback)');
  assert.match(r.source, /MET Norway \(fallback\)/);
  assert.equal(r.data.condition, 'rain'); // from symbol_code
  assert.equal(r.data.temperatureC, 18.4);
  assert.equal(r.data.windKmh, 18); // 5 m/s converted to km/h
  assert.equal(r.data.weatherCode, null); // MET has no WMO code — null, not copied from Open-Meteo's shape
  assert.equal(r.data.timezone, null); // MET compact carries no IANA timezone — null, not invented
  assert.equal(r.data.location, 'Fallback Fjord, Testland');
  // MET Norway's terms: a descriptive User-Agent is mandatory.
  assert.match(metUserAgent || '', /PatchworkPete\/1\.0/);
  assert.match(metUserAgent || '', /github\.com\/Revaaa28\/patchwork-pete/);
});

/* ── mood: Open-Meteo + MET down -> wttr.in serves ─────── */

test('mood: Open-Meteo and MET down -> wttr.in (fallback) serves and is labelled', async () => {
  const fetchFn = async (url) => {
    if (url.includes('api.open-meteo.com/v1/forecast')) return res(429, {});
    if (url.includes('api.met.no')) return res(503, {});
    if (url.includes('wttr.in')) {
      return res(200, {
        current_condition: [{ temp_C: '4', weatherCode: '113', windspeedKmph: '11', weatherDesc: [{ value: 'Sunny' }] }],
      });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const loc = { lat: 64.15, lon: -21.94, place: 'Second Fallback Bay, Testland' };
  const r = await getMood({ force: true, fetchFn, ...FAST, location: loc });
  assert.equal(r.ok, true);
  assert.equal(r.data.source, 'wttr.in (fallback)');
  assert.match(r.source, /wttr\.in \(fallback\)/);
  assert.equal(r.data.condition, 'clear'); // WWO code 113 ("Sunny") via the WWO mapping…
  assert.equal(r.data.weatherCode, null); // …but it is NOT a WMO code, so the field stays honestly null
  assert.equal(r.data.temperatureC, 4);
  assert.equal(r.data.windKmh, 11);
  assert.equal(r.data.timezone, null);
});

test('mood: WWO codes (wttr.in) map on their own table, never as WMO codes', () => {
  const { conditionForWwoCode } = require('../src/organs/mood');
  assert.equal(conditionForWwoCode(113), 'clear'); // WWO "Sunny" — as WMO this code means nothing
  assert.equal(conditionForWwoCode(116), 'partly-cloudy');
  assert.equal(conditionForWwoCode(302), 'rain');
  assert.equal(conditionForWwoCode(386), 'storm');
  assert.equal(conditionForWwoCode(338), 'snow');
  assert.equal(conditionForWwoCode(248), 'fog');
  assert.equal(conditionForWwoCode('113'), null); // strings are not codes
  assert.equal(conditionForWwoCode(null), null);
});

/* ── mood: every source down -> dead for that place ────── */

test('mood: all three weather sources fail -> dead, data null', async () => {
  const fetchFn = fail(429);
  const loc = { lat: -41.28, lon: 174.77, place: 'No Sky Town, Testland' };
  const r = await getMood({ force: true, fetchFn, ...FAST, location: loc });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.equal(r.stale, undefined);
  assert.match(r.error, /Open-Meteo/);
  assert.match(r.error, /MET Norway \(fallback\)/);
  assert.match(r.error, /wttr\.in \(fallback\)/);
});

/* ── background refresher bookkeeping ──────────────────── */

test('refresher tracks at most 5 recent locations, most recent last', () => {
  const { trackLocation, recentLocations } = require('../server');
  recentLocations.clear();
  for (let i = 0; i < 7; i++) {
    trackLocation({ lat: i, lon: i, place: `Place ${i}` });
  }
  assert.equal(recentLocations.size, 5);
  const places = [...recentLocations.values()].map((l) => l.place);
  assert.deepEqual(places, ['Place 2', 'Place 3', 'Place 4', 'Place 5', 'Place 6']);
  // Re-asking about an older place makes it the most recent again.
  trackLocation({ lat: 2, lon: 2, place: 'Place 2' });
  const after = [...recentLocations.values()].map((l) => l.place);
  assert.equal(after[after.length - 1], 'Place 2');
  assert.equal(recentLocations.size, 5);
  trackLocation(null); // no home chosen: nothing to track, no crash
  assert.equal(recentLocations.size, 5);
});
