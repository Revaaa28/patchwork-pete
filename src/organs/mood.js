'use strict';

// FACE / MOOD — weather for the visitor's chosen location.
// WMO weather code -> condition bucket. The state engine turns the bucket
// into Pete's mood; this adapter only reports what the sky actually says
// at those coordinates.
//
// SOURCE CHAIN (round 2, 2026-11-17): the Open-Meteo forecast API
// answered HTTP 429 on EVERY check from Render's shared egress IP
// (while its own air-quality API kept working), so the face has
// LABELLED fallbacks, tried in order after the existing retry policy:
//   1. Open-Meteo forecast (primary)
//   2. MET Norway locationforecast/2.0/compact (fallback) — their terms
//      require a descriptive User-Agent, sent below.
//   3. wttr.in ?format=j1 (fallback)
// The winning source is NAMED: `data.source` is exactly "Open-Meteo" |
// "MET Norway (fallback)" | "wttr.in (fallback)", and the reading-level
// `source` says the same for the Specimen Ledger UI. Fields a fallback
// cannot supply stay null, never invented: MET Norway has no WMO code
// (weatherCode:null — its symbol_code is mapped to the condition bucket
// instead) and neither fallback provides an IANA timezone
// (timezone:null — the server then uses the lungs' timezone or UTC for
// the stomach's day boundary, exactly as it does for any missing tz).
const { fetchJson, makeKeyedCache } = require('../fetchJson');
const { normalizeLocation, locationKey } = require('../location');

const cache = makeKeyedCache(10 * 60 * 1000);

const openMeteoBase = () => process.env.PETE_OPEN_METEO_BASE_URL || 'https://api.open-meteo.com';
const metBase = () => process.env.PETE_MET_BASE_URL || 'https://api.met.no';
const wttrBase = () => process.env.PETE_WTTR_BASE_URL || 'https://wttr.in';
// MET Norway's terms: an identifying User-Agent is mandatory.
const MET_USER_AGENT = 'PatchworkPete/1.0 github.com/Revaaa28/patchwork-pete';

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

// MET Norway symbol_code -> the same condition buckets the state engine
// understands. Suffixes (_day/_night/_polartwilight) are presentation,
// not weather. Anything with thunder is a storm; light rain showers map
// to drizzle (light precipitation), the rest of the rain family to rain.
function conditionForMetSymbol(symbol) {
  if (typeof symbol !== 'string' || !symbol) return null;
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return 'storm';
  if (base === 'clearsky') return 'clear';
  if (base === 'fair' || base === 'partlycloudy') return 'partly-cloudy';
  if (base === 'cloudy') return 'cloudy';
  if (base === 'fog') return 'fog';
  if (base.includes('drizzle')) return 'drizzle';
  if (base.includes('snow') || base.includes('sleet')) return 'snow';
  if (base.includes('rain')) return base.startsWith('light') ? 'drizzle' : 'rain';
  return 'cloudy';
}

const numOrNull = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

async function fetchOpenMeteo(loc, opts) {
  const url = `${openMeteoBase()}/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const json = await fetchJson(url, opts);
  const cur = json && json.current;
  if (!cur || typeof cur.weather_code !== 'number') throw new Error('Unexpected Open-Meteo payload shape');
  return {
    weatherCode: cur.weather_code,
    condition: conditionForCode(cur.weather_code),
    temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
    windKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
    timezone: typeof json.timezone === 'string' ? json.timezone : null,
    source: 'Open-Meteo',
  };
}

async function fetchMet(loc, opts) {
  const url = `${metBase()}/weatherapi/locationforecast/2.0/compact?lat=${loc.lat}&lon=${loc.lon}`;
  const json = await fetchJson(url, { ...opts, headers: { 'User-Agent': MET_USER_AGENT } });
  const series = json && json.properties && Array.isArray(json.properties.timeseries) ? json.properties.timeseries : null;
  const now = series && series[0] && series[0].data;
  const details = now && now.instant && now.instant.details;
  if (!details || typeof details.air_temperature !== 'number') {
    throw new Error('Unexpected MET Norway payload shape');
  }
  const upcoming = now.next_1_hours || now.next_6_hours || now.next_12_hours;
  const symbol = upcoming && upcoming.summary && upcoming.summary.symbol_code;
  const condition = conditionForMetSymbol(symbol);
  if (!condition) throw new Error('MET Norway payload carried no weather symbol');
  const windMs = numOrNull(details.wind_speed);
  return {
    weatherCode: null, // MET Norway speaks symbol_code, not WMO codes — honestly null
    condition,
    temperatureC: details.air_temperature,
    windKmh: windMs === null ? null : Math.round(windMs * 3.6 * 10) / 10, // m/s -> km/h
    timezone: null, // the compact product carries no IANA timezone
    source: 'MET Norway (fallback)',
  };
}

// wttr.in reports WWO (World Weather Online) codes — a DIFFERENT table
// from Open-Meteo's WMO codes (WWO 113 is "sunny"; as a WMO code it
// would mean nothing). They get their own mapping, and the reading's
// weatherCode stays null: that field means a WMO code everywhere else
// in Pete, and a WWO code must never be passed off as one.
const WWO_CONDITIONS = {
  storm: [200, 386, 389, 392, 395],
  clear: [113],
  'partly-cloudy': [116],
  cloudy: [119, 122],
  fog: [143, 248, 260],
  drizzle: [176, 185, 263, 266, 281, 284, 293],
  rain: [296, 299, 302, 305, 308, 311, 314, 353, 356, 359, 374, 377],
  snow: [179, 182, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371],
};
const WWO_LOOKUP = new Map();
for (const [condition, codes] of Object.entries(WWO_CONDITIONS)) {
  for (const code of codes) WWO_LOOKUP.set(code, condition);
}
function conditionForWwoCode(code) {
  if (typeof code !== 'number' || !Number.isFinite(code)) return null;
  return WWO_LOOKUP.get(code) || 'cloudy';
}

async function fetchWttr(loc, opts) {
  const url = `${wttrBase()}/${loc.lat},${loc.lon}?format=j1`;
  const json = await fetchJson(url, opts);
  const cur = json && Array.isArray(json.current_condition) ? json.current_condition[0] : null;
  if (!cur) throw new Error('Unexpected wttr.in payload shape');
  const wwoCode = numOrNull(cur.weatherCode);
  if (wwoCode === null) throw new Error('wttr.in payload carried no weather code');
  return {
    weatherCode: null, // wttr.in speaks WWO codes, not WMO — honestly null (see above)
    condition: conditionForWwoCode(wwoCode),
    temperatureC: numOrNull(cur.temp_C),
    windKmh: numOrNull(cur.windspeedKmph),
    timezone: null, // wttr.in j1 carries no IANA timezone
    source: 'wttr.in (fallback)',
  };
}

// Tried in order; the first success wins and names itself in the reading.
const SOURCES = [
  { label: 'Open-Meteo', readingSource: 'Open-Meteo weather', fetch: fetchOpenMeteo },
  { label: 'MET Norway (fallback)', readingSource: 'MET Norway (fallback) — weather where Pete lives', fetch: fetchMet },
  { label: 'wttr.in (fallback)', readingSource: 'wttr.in (fallback) — weather where Pete lives', fetch: fetchWttr },
];

async function getMood({ force = false, fetchFn, location, retryDelays, sleep } = {}) {
  const loc = normalizeLocation(location);
  const fetchedAt = new Date().toISOString();
  if (!loc) {
    // No home chosen yet: not dead, not zero — honestly awaiting.
    return {
      organ: 'mood',
      source: 'Open-Meteo weather',
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
  const opts = { fetchFn, retryDelays, sleep };
  const failures = [];
  for (const src of SOURCES) {
    try {
      const data = await src.fetch(loc, opts);
      return cache.set(key, {
        organ: 'mood',
        source: src.readingSource,
        ok: true,
        data: { ...data, location: loc.place, lat: loc.lat, lon: loc.lon },
        error: null,
        fetchedAt,
        cached: false,
      });
    } catch (err) {
      failures.push(`${src.label}: ${String(err && err.message ? err.message : err)}`);
    }
  }
  const msg = failures.join(' · ');
  const last = cache.getStale(key);
  if (last && last.ok) {
    // Stale-while-error for THIS place only: the last real reading,
    // labelled stale with its original fetchedAt and original source —
    // never fresh, never leaked across places.
    return { ...last, stale: true, error: msg, cached: false };
  }
  return {
    organ: 'mood',
    source: 'Weather — Open-Meteo · MET Norway (fallback) · wttr.in (fallback)',
    ok: false,
    data: null,
    error: msg,
    fetchedAt,
    cached: false,
  };
}

module.exports = { getMood, conditionForCode, conditionForMetSymbol, conditionForWwoCode, _sources: SOURCES };
