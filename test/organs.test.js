'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getHeart } = require('../src/organs/heart');
const { getMood, conditionForCode } = require('../src/organs/mood');
const { getLungs, conditionForAir } = require('../src/organs/lungs');
const { normalizeLocation, HOME } = require('../src/location');
const { countCommitsToday } = require('../src/organs/stomach');
const { templateLine } = require('../src/organs/diary');
const { computeState } = require('../src/state');

const jsonRes = (body, okRes = true, status = 200) => async () => ({
  ok: okRes,
  status,
  json: async () => body,
});
const failing = async () => { throw new Error('network down'); };

test('heart adapter maps CoinGecko payload', async () => {
  const r = await getHeart({ force: true, fetchFn: jsonRes({ bitcoin: { usd: 65000, usd_24h_change: 2.5 } }) });
  assert.equal(r.ok, true);
  assert.equal(r.data.priceUsd, 65000);
  assert.equal(r.data.change24hPct, 2.5);
  assert.ok(r.fetchedAt);
});

test('heart adapter never fabricates on failure', async () => {
  const r = await getHeart({ force: true, fetchFn: failing });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.match(r.error, /network down/);
});

test('mood adapter maps WMO codes', () => {
  assert.equal(conditionForCode(0), 'clear');
  assert.equal(conditionForCode(63), 'rain');
  assert.equal(conditionForCode(80), 'rain');
  assert.equal(conditionForCode(95), 'storm');
});

test('mood adapter reports failure honestly', async () => {
  const r = await getMood({ force: true, fetchFn: jsonRes({}, false, 503) });
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.match(r.error, /503/);
});

test('stomach counts only today\'s push commits (Home day)', () => {
  const now = new Date('2026-11-17T04:30:00.000Z'); // 11:30 at Pete's home (UTC+7)
  const events = [
    { type: 'PushEvent', created_at: '2026-11-17T02:00:00Z', payload: { commits: [{}, {}] } },
    { type: 'PushEvent', created_at: '2026-11-16T10:00:00Z', payload: { commits: [{}] } }, // Nov 16 18:00 WITA
    { type: 'CreateEvent', created_at: '2026-11-17T02:00:00Z', payload: {} },
  ];
  const c = countCommitsToday(events, now);
  assert.equal(c.commitsToday, 2);
  assert.equal(c.pushesToday, 1);
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
  const a = await getLungs({ force: true, fetchFn: aqFetch, firmsKey: '', location: { lat: -2.21, lon: 113.92, place: 'Palangka Raya, Borneo, Indonesia' } });
  const b = await getLungs({ force: true, fetchFn: aqFetch, firmsKey: '', location: { lat: -33.8688, lon: 151.2093, place: 'Sydney, Australia' } });
  assert.equal(a.ok, true);
  assert.equal(a.data.location, 'Palangka Raya, Borneo, Indonesia');
  assert.equal(b.data.location, 'Sydney, Australia');
  assert.equal(a.data.condition, 'clean');
  assert.equal(a.data.fireHotspots24h, null); // no FIRMS key -> honestly null
  assert.ok(seen[0].includes('latitude=-2.21'));
  assert.ok(seen[1].includes('latitude=-33.8688'));
});

test('lungs adapter never fabricates on failure', async () => {
  const r = await getLungs({ force: true, fetchFn: failing, firmsKey: '', location: { lat: 0, lon: 0, place: 'Null Island' } });
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

test('location config: Pete\'s home is one configurable benchmark', () => {
  assert.equal(typeof HOME.name, 'string');
  assert.ok(HOME.name.length > 0);
  assert.ok(Number.isFinite(HOME.lat) && Number.isFinite(HOME.lon));
  const clamped = normalizeLocation({ lat: 999, lon: -999, place: 'Beyond the map' });
  assert.equal(clamped.lat, 90);
  assert.equal(clamped.lon, -180);
  const fallback = normalizeLocation({});
  assert.equal(fallback.isHome, true);
  assert.equal(fallback.place, HOME.name);
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
