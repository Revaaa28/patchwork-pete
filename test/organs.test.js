'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getHeart } = require('../src/organs/heart');
const { getMood, conditionForCode } = require('../src/organs/mood');
const { getLungs, conditionForAir } = require('../src/organs/lungs');
const { normalizeLocation } = require('../src/location');
const { countCommitsToday } = require('../src/organs/stomach');
const { templateLine } = require('../src/organs/diary');
const { computeState } = require('../src/state');

const jsonRes = (body, okRes = true, status = 200) => async () => ({
  ok: okRes,
  status,
  json: async () => body,
});
const failing = async () => { throw new Error('network down'); };

let firstHeartFetchedAt = null;
test('heart adapter maps CoinGecko payload', async () => {
  const r = await getHeart({ force: true, fetchFn: jsonRes({ bitcoin: { usd: 65000, usd_24h_change: 2.5 } }) });
  assert.equal(r.ok, true);
  assert.equal(r.data.priceUsd, 65000);
  assert.equal(r.data.change24hPct, 2.5);
  assert.ok(r.fetchedAt);
  firstHeartFetchedAt = r.fetchedAt;
});

test('heart adapter never fabricates on failure — last good comes back STALE, not fresh', async () => {
  // The success above seeded the heart's last-good cache, so a failed
  // refresh must serve THAT reading labelled stale with its original
  // timestamp — never a fresh-looking invention. (The no-last-good ->
  // dead case lives in test/resilience.test.js, in a pristine process.)
  const r = await getHeart({ force: true, fetchFn: failing, retryDelays: [0, 0, 0] });
  assert.equal(r.ok, true);
  assert.equal(r.stale, true);
  assert.equal(r.data.priceUsd, 65000);
  assert.equal(r.fetchedAt, firstHeartFetchedAt);
  assert.match(r.error, /network down/);
});

test('mood adapter maps WMO codes', () => {
  assert.equal(conditionForCode(0), 'clear');
  assert.equal(conditionForCode(63), 'rain');
  assert.equal(conditionForCode(80), 'rain');
  assert.equal(conditionForCode(95), 'storm');
});

test('mood adapter reports failure honestly', async () => {
  // A fresh location (no last-good anywhere) + exhausted retries -> dead,
  // exactly as before stale-while-error existed.
  const r = await getMood({ force: true, fetchFn: jsonRes({}, false, 503), retryDelays: [0, 0, 0], location: { lat: 12.34, lon: 56.78, place: 'Nowhere Test' } });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.match(r.error, /503/);
});

test('stomach counts only today\'s push commits (home-local day)', () => {
  const now = new Date('2026-11-17T04:30:00.000Z'); // 11:30 in Asia/Pontianak (UTC+7)
  const events = [
    { type: 'PushEvent', created_at: '2026-11-17T02:00:00Z', payload: { commits: [{}, {}] } },
    { type: 'PushEvent', created_at: '2026-11-16T10:00:00Z', payload: { commits: [{}] } }, // Nov 16 17:00 in Pontianak
    { type: 'CreateEvent', created_at: '2026-11-17T02:00:00Z', payload: {} },
  ];
  const c = countCommitsToday(events, now, 'Asia/Pontianak');
  assert.equal(c.commitsToday, 2);
  assert.equal(c.pushesToday, 1);
});

test('stomach "today" follows the chosen home timezone', () => {
  const now = new Date('2026-11-17T20:00:00.000Z'); // already Nov 18, 01:30 in Kolkata
  const events = [
    { type: 'PushEvent', created_at: '2026-11-17T10:00:00Z', payload: { commits: [{}] } }, // Nov 17 in both UTC and Kolkata
  ];
  assert.equal(countCommitsToday(events, now, 'UTC').commitsToday, 1); // still "today" in UTC
  assert.equal(countCommitsToday(events, now, 'Asia/Kolkata').commitsToday, 0); // already yesterday in Kolkata
  assert.equal(countCommitsToday(events, now, 'Not/AZone').commitsToday, 1); // invalid tz -> UTC fallback
});

test('air condition bands follow US AQI', () => {
  assert.equal(conditionForAir({ aqiUs: 30 }), 'clean');
  assert.equal(conditionForAir({ aqiUs: 80 }), 'moderate');
  assert.equal(conditionForAir({ aqiUs: 178 }), 'haze');
  assert.equal(conditionForAir({ aqiUs: 260 }), 'severe-haze');
  assert.equal(conditionForAir({ pm25: 130 }), 'haze'); // PM2.5 fallback
});

test('lungs adapter: two locations return location-labelled readings (mock fetch)', async () => {
  const seen = [];
  const aqFetch = async (url) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ current: { pm2_5: 9, pm10: 14, us_aqi: 34, european_aqi: 20 } }) };
  };
  const a = await getLungs({ force: true, fetchFn: aqFetch, firmsKey: '', location: { lat: -2.21, lon: 113.92, place: 'Home Town, Testland' } });
  const b = await getLungs({ force: true, fetchFn: aqFetch, firmsKey: '', location: { lat: -33.8688, lon: 151.2093, place: 'Sydney, Australia' } });
  assert.equal(a.ok, true);
  assert.equal(a.data.location, 'Home Town, Testland');
  assert.equal(b.data.location, 'Sydney, Australia');
  assert.equal(a.data.condition, 'clean');
  assert.equal(a.data.fireHotspots24h, null); // no FIRMS key -> honestly null
  assert.ok(seen[0].includes('latitude=-2.21'));
  assert.ok(seen[1].includes('latitude=-33.8688'));
});

test('lungs adapter never fabricates on failure', async () => {
  const r = await getLungs({ force: true, fetchFn: failing, firmsKey: '', retryDelays: [0, 0, 0], location: { lat: 0, lon: 0, place: 'Null Island' } });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
});

test('mood adapter labels readings with the requested location (mock fetch)', async () => {
  const wxFetch = async () => ({ ok: true, status: 200, json: async () => ({ current: { weather_code: 0, temperature_2m: 29, wind_speed_10m: 5 } }) });
  const r = await getMood({ force: true, fetchFn: wxFetch, location: { lat: 28.6139, lon: 77.209, place: 'New Delhi, India' } });
  assert.equal(r.ok, true);
  assert.equal(r.data.location, 'New Delhi, India');
  assert.equal(r.data.condition, 'clear');
});

test('location: there is NO default home — no coordinates, no place', () => {
  assert.equal(normalizeLocation({}), null);
  assert.equal(normalizeLocation(), null);
  assert.equal(normalizeLocation({ place: 'Somewhere' }), null);
  assert.equal(normalizeLocation({ lat: 'x', lon: 10 }), null);
  const clamped = normalizeLocation({ lat: 999, lon: -999, place: 'Beyond the map' });
  assert.equal(clamped.lat, 90);
  assert.equal(clamped.lon, -180);
  assert.equal(clamped.place, 'Beyond the map');
  const bare = normalizeLocation({ lat: 28.6139, lon: 77.209 });
  assert.equal(bare.place, '28.61, 77.21'); // coordinates label themselves honestly
});

test('mood + lungs await a home instead of inventing one', async () => {
  const m = await getMood({ force: true });
  assert.equal(m.ok, false);
  assert.equal(m.awaiting, true);
  assert.equal(m.data, null);
  assert.equal(m.error, null); // not an error — a wait
  const l = await getLungs({ force: true, firmsKey: '' });
  assert.equal(l.ok, false);
  assert.equal(l.awaiting, true);
  assert.equal(l.data, null);
  assert.equal(l.error, null);
});

test('diary template never claims to be Gemini', () => {
  const readings = {
    heart: { ok: true, data: { priceUsd: 65000, change24hPct: 1 } },
    mood: { ok: true, data: { condition: 'clear' } },
    brain: { ok: true, data: { currentFact: { title: 'Moon' }, memory: [] } },
    stomach: { ok: true, data: { commitsToday: 3 } },
  };
  const s = computeState({
    heart: { organ: 'heart', ok: true, data: readings.heart.data },
    mood: { organ: 'mood', ok: true, data: { condition: 'clear', weatherCode: 0 } },
    brain: { organ: 'brain', ok: true, data: readings.brain.data },
    stomach: { organ: 'stomach', ok: true, data: readings.stomach.data },
  });
  const line = templateLine(s, readings);
  assert.ok(line.length > 10);
  assert.ok(!/gemini/i.test(line));
});

test('geocoding results parse into "Name, Country" home choices', () => {
  const { parseGeocodeResults } = require('../server');
  const out = parseGeocodeResults({
    results: [
      { name: 'New Delhi', admin1: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209 },
      { name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503 },
    ],
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].place, 'New Delhi, India'); // Name, Country — no admin region in the label
  assert.equal(out[0].admin1, 'Delhi'); // still available as its own field
  assert.equal(out[0].lat, 28.6139);
  assert.equal(out[1].place, 'Tokyo, Japan');
  assert.deepEqual(parseGeocodeResults({}), []);
  assert.deepEqual(parseGeocodeResults(null), []);
});
