'use strict';

// LUNGS — Open-Meteo Air Quality API (keyless) for the visitor's chosen
// location. Pete breathes the real air there: PM2.5, PM10 and US AQI decide
// whether he breathes easy or coughs — peat-fire haze in the tropics,
// winter smog in Delhi, a clear day in Sydney; wherever the visitor
// chooses to house him.
//
// Optional extra: NASA FIRMS fire hotspots around the location are counted
// ONLY when FIRMS_MAP_KEY is set in the environment (FIRMS needs a free
// key). Without a key the organ works fully on Open-Meteo AQ alone, and the
// FIRMS field is reported as null with a note — never faked, never guessed.
const { fetchJson, makeKeyedCache } = require('../fetchJson');
const { normalizeLocation, locationKey } = require('../location');

const cache = makeKeyedCache(10 * 60 * 1000);

// US AQI bands -> Pete's air condition (PM2.5 bands as fallback).
function conditionForAir({ aqiUs, pm25 }) {
  if (typeof aqiUs === 'number') {
    if (aqiUs <= 50) return 'clean';
    if (aqiUs <= 100) return 'moderate';
    if (aqiUs <= 150) return 'unhealthy-sensitive';
    if (aqiUs <= 200) return 'haze';
    return 'severe-haze';
  }
  if (typeof pm25 === 'number') {
    if (pm25 <= 12) return 'clean';
    if (pm25 <= 35.4) return 'moderate';
    if (pm25 <= 55.4) return 'unhealthy-sensitive';
    if (pm25 <= 150.4) return 'haze';
    return 'severe-haze';
  }
  return 'moderate';
}

async function firmsHotspots(fetchFn, key, loc) {
  // VIIRS SNPP near-real-time, last 24h, ~1.5° box around the location.
  // Response is CSV; hotspot count = data lines. Any failure -> null (the
  // lungs reading itself never depends on FIRMS).
  const area = `${(loc.lon - 0.75).toFixed(2)},${(loc.lat - 0.65).toFixed(2)},${(loc.lon + 0.75).toFixed(2)},${(loc.lat + 0.65).toFixed(2)}`;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${area}/1`;
  const doFetch = fetchFn || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await doFetch(url, { signal: controller.signal, headers: { 'User-Agent': 'PatchworkPete/0.1' } });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    return Math.max(0, lines.length - 1); // minus header
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getLungs({ force = false, fetchFn, location, firmsKey, retryDelays, sleep } = {}) {
  const loc = normalizeLocation(location);
  const fetchedAt = new Date().toISOString();
  if (!loc) {
    // No home chosen yet: not dead, not zero — honestly awaiting.
    return {
      organ: 'lungs',
      source: 'Open-Meteo Air Quality',
      ok: false,
      awaiting: true,
      data: null,
      error: null,
      fetchedAt,
      cached: false,
    };
  }
  const key = locationKey(loc);
  const cached = cache.get(key, force);
  if (cached) return cached;
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}&current=pm2_5,pm10,us_aqi,european_aqi&timezone=auto`;
  try {
    const json = await fetchJson(url, { fetchFn, retryDelays, sleep });
    const cur = json && json.current;
    if (!cur || (typeof cur.pm2_5 !== 'number' && typeof cur.us_aqi !== 'number')) {
      throw new Error('Unexpected Open-Meteo AQ payload shape');
    }
    const data = {
      pm25: typeof cur.pm2_5 === 'number' ? cur.pm2_5 : null,
      pm10: typeof cur.pm10 === 'number' ? cur.pm10 : null,
      aqiUs: typeof cur.us_aqi === 'number' ? cur.us_aqi : null,
      aqiEu: typeof cur.european_aqi === 'number' ? cur.european_aqi : null,
      condition: null,
      location: loc.place,
      lat: loc.lat,
      lon: loc.lon,
      timezone: typeof json.timezone === 'string' ? json.timezone : null,
      fireHotspots24h: null,
      fireSource: 'NASA FIRMS fire watch — not stitched into this exhibit yet',
    };
    data.condition = conditionForAir(data);

    const fkey = firmsKey !== undefined ? firmsKey : process.env.FIRMS_MAP_KEY;
    if (fkey) {
      const n = await firmsHotspots(fetchFn, fkey, loc);
      data.fireHotspots24h = n;
      data.fireSource = n === null
        ? 'NASA FIRMS configured but did not answer'
        : 'NASA FIRMS VIIRS — fire hotspots, last 24h around this location';
    }

    return cache.set(key, {
      organ: 'lungs',
      source: 'Open-Meteo Air Quality',
      ok: true,
      data,
      error: null,
      fetchedAt,
      cached: false,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const last = cache.getStale(key);
    if (last && last.ok) {
      // Stale-while-error for THIS place only: the last real air reading,
      // labelled stale with its original fetchedAt — never fresh. (With
      // no last good, the catch below keeps breathing honestly unknown.)
      return { ...last, stale: true, error: msg, cached: false };
    }
    return {
      organ: 'lungs',
      source: 'Open-Meteo Air Quality',
      ok: false,
      data: null,
      error: msg,
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getLungs, conditionForAir };
