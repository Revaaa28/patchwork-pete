'use strict';

// FACE / MOOD — Open-Meteo (keyless) for the visitor's chosen location.
// WMO weather code -> condition bucket. The state engine turns the bucket
// into Pete's mood; this adapter only reports what the sky actually says
// at those coordinates.
const { fetchJson, makeKeyedCache } = require('../fetchJson');
const { normalizeLocation, locationKey } = require('../location');

const cache = makeKeyedCache(5 * 60 * 1000);

function conditionForCode(code) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

async function getMood({ force = false, fetchFn, location } = {}) {
  const loc = normalizeLocation(location);
  const key = locationKey(loc);
  const cached = cache.get(key, force);
  if (cached) return cached;
  const fetchedAt = new Date().toISOString();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m`;
  try {
    const json = await fetchJson(url, { fetchFn });
    const cur = json && json.current;
    if (!cur || typeof cur.weather_code !== 'number') throw new Error('Unexpected Open-Meteo payload shape');
    return cache.set(key, {
      organ: 'mood',
      source: 'Open-Meteo weather',
      ok: true,
      data: {
        weatherCode: cur.weather_code,
        condition: conditionForCode(cur.weather_code),
        temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
        windKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
        location: loc.place,
        lat: loc.lat,
        lon: loc.lon,
      },
      error: null,
      fetchedAt,
      cached: false,
    });
  } catch (err) {
    return {
      organ: 'mood',
      source: 'Open-Meteo weather',
      ok: false,
      data: null,
      error: String(err && err.message ? err.message : err),
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getMood, conditionForCode };
