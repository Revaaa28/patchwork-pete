'use strict';

const path = require('path');
const express = require('express');

const { getHeart } = require('./src/organs/heart');
const { getMood } = require('./src/organs/mood');
const { getBrain } = require('./src/organs/brain');
const { getStomach } = require('./src/organs/stomach');
const { getLungs } = require('./src/organs/lungs');
const { getDiary } = require('./src/organs/diary');
const { computeState } = require('./src/state');
const { normalizeLocation, locationKey } = require('./src/location');
const { fetchJson } = require('./src/fetchJson');

const app = express();
const PORT = process.env.PORT || 4177;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pete has NO fixed home (concept change, Rev 2026-11-17): he moves in
// with each visitor. The visitor's browser remembers the chosen place
// (localStorage) and sends it as ?lat&lon&place on every state request.
// No coordinates -> no home -> mood and lungs honestly await a choice.
function locationFromRequest(req) {
  const q = req.query || {};
  return normalizeLocation({ lat: q.lat, lon: q.lon, place: q.place });
}

// Recent homes, for the background refresher below: the last few places
// visitors actually asked about (most recent last), capped so a burst
// of one-off geocodes cannot turn the refresher into a fetch storm.
// In-memory only — a restart forgets them, and Pete simply re-learns
// where his visitors live from their next visit.
const RECENT_LOCATION_LIMIT = 5;
const recentLocations = new Map(); // locationKey -> loc
function trackLocation(loc) {
  if (!loc) return;
  const key = locationKey(loc);
  recentLocations.delete(key); // re-insert: now the most recent
  recentLocations.set(key, loc);
  while (recentLocations.size > RECENT_LOCATION_LIMIT) {
    recentLocations.delete(recentLocations.keys().next().value);
  }
}

// The timezone the stomach most recently counted "today" in — the
// refresher re-counts under the same sky the last visitor used.
let lastStomachTimezone = 'UTC';

async function collectReadings(force = {}, loc = null) {
  const [heart, mood, brain, lungs] = await Promise.all([
    getHeart({ force: !!force.heart }),
    getMood({ force: !!force.mood, location: loc }),
    getBrain({ force: !!force.brain }),
    getLungs({ force: !!force.lungs, location: loc }),
  ]);
  // The stomach counts "today" in the chosen home's timezone (reported
  // by Open-Meteo with its readings). When a weather FALLBACK served the
  // face (MET Norway / wttr.in provide no IANA timezone), mood's tz is
  // null and the lungs' timezone — or UTC — carries the day boundary.
  const tz = (mood.data && mood.data.timezone) || (lungs.data && lungs.data.timezone) || 'UTC';
  lastStomachTimezone = tz;
  const stomach = await getStomach({ force: !!force.stomach, timezone: tz });
  return { heart, mood, brain, stomach, lungs };
}

async function fullState(force = {}, loc = null) {
  const readings = await collectReadings(force, loc);
  const state = computeState(readings);
  const diary = await getDiary(state, readings, { force: !!force.diary });
  return {
    pet: 'Patchwork Pete',
    generatedAt: new Date().toISOString(),
    home: loc ? { name: loc.place, lat: loc.lat, lon: loc.lon } : null,
    awaitingHome: !loc,
    organs: readings,
    voice: {
      organ: 'voice',
      source: 'Web Speech API — runs in your browser',
      ok: true,
      data: { type: 'browser-tts', note: 'Pete speaks client-side; there is no server voice organ to fail.' },
      error: null,
      fetchedAt: new Date().toISOString(),
    },
    state,
    diary: diary.entries,
  };
}

// PAYLOAD CACHE (stale-while-revalidate) — added 2026-11-17 after Rev's
// "waking Pete up takes forever": a home-carrying /api/state used to cost
// 15–19s EVERY time, because the mood fallback chain (Open-Meteo 429 from
// Render's shared IP → fetchJson retries with ~12s of backoff → MET
// Norway) ran before a single byte was served, even when the same home
// had been read a minute earlier. Now the last full payload per home is
// served instantly (its organs carry their own fetchedAt / last-reading
// times, so the age of every reading stays visible — nothing is dressed
// up as fresher than it is) and a single background rebuild refreshes
// it. Only a home's first-ever request pays the full chain.
const STATE_CACHE_TTL_MS = 15 * 60 * 1000;
const STATE_REFRESH_AFTER_MS = 45 * 1000;
const stateCache = new Map(); // key -> { payload, at }
const stateRefreshing = new Set(); // keys with a rebuild in flight
function stateCacheKey(loc) {
  return loc ? locationKey(loc) : '__homeless__';
}
function refreshStateInBackground(loc) {
  const key = stateCacheKey(loc);
  if (stateRefreshing.has(key)) return;
  stateRefreshing.add(key);
  fullState({}, loc)
    .then((payload) => stateCache.set(key, { payload, at: Date.now() }))
    .catch(() => { /* a failed rebuild keeps the last good payload */ })
    .finally(() => stateRefreshing.delete(key));
}

app.get('/api/state', async (req, res) => {
  try {
    const loc = locationFromRequest(req);
    trackLocation(loc);
    const key = stateCacheKey(loc);
    const hit = stateCache.get(key);
    if (hit && Date.now() - hit.at < STATE_CACHE_TTL_MS) {
      if (Date.now() - hit.at > STATE_REFRESH_AFTER_MS) refreshStateInBackground(loc);
      return res.json(hit.payload);
    }
    const payload = await fullState({}, loc);
    stateCache.set(key, { payload, at: Date.now() });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// Action buttons: feed (stomach), teach (brain), weather (mood), heart, air (lungs).
// The visitor's chosen home rides along as query params, same as /api/state.
const ORGANS = ['heart', 'mood', 'brain', 'stomach', 'lungs'];
app.post('/api/refresh/:organ', async (req, res) => {
  const organ = req.params.organ;
  if (!ORGANS.includes(organ)) return res.status(404).json({ error: `Unknown organ: ${organ}` });
  try {
    const loc = locationFromRequest(req);
    trackLocation(loc);
    const payload = await fullState({ [organ]: true, diary: organ === 'brain' }, loc);
    stateCache.set(stateCacheKey(loc), { payload, at: Date.now() });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// City search for the home picker (Open-Meteo Geocoding, keyless).
// Results show "Name, Country" — picking one makes it Pete's home.
function parseGeocodeResults(json) {
  const list = json && Array.isArray(json.results) ? json.results : [];
  return list.map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    place: [r.name, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

app.get('/api/geocode', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json({ results: [] });
  try {
    const json = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    res.json({ results: parseGeocodeResults(json) });
  } catch (err) {
    res.status(502).json({ error: String(err && err.message ? err.message : err), results: [] });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true, service: 'patchwork-pete' }));

// BACKGROUND REFRESHER — every ~3 minutes, quietly re-read the organs so
// the stale-while-error caches stay populated with RECENT last-goods
// instead of whatever a cold boot managed to grab. Gentle by design:
// plain (non-force) reads, so anything still inside its TTL costs no
// request at all; the adapters' own retry policy is the whole budget;
// and a cycle that finds the previous one still running is skipped.
// Location-free organs (heart, brain, stomach) always refresh; mood and
// lungs refresh for the handful of homes visitors recently asked about.
// (Brain note: a plain read only fetches when Pete's memory is empty —
// the refresher keeps his head from being empty, it does not rotate
// what he knows; teaching him something new stays the visitor's button.)
let refreshRunning = false;
async function backgroundRefreshCycle() {
  if (refreshRunning) return;
  refreshRunning = true;
  try {
    await Promise.all([
      getHeart({}),
      getBrain({}),
      getStomach({ timezone: lastStomachTimezone }),
    ]);
    for (const loc of [...recentLocations.values()]) {
      await Promise.all([getMood({ location: loc }), getLungs({ location: loc })]);
    }
  } catch { /* adapters resolve instead of throwing; this is belt-and-braces */ } finally {
    refreshRunning = false;
  }
}

function startBackgroundRefresher(intervalMs = 3 * 60 * 1000) {
  const timer = setInterval(() => { backgroundRefreshCycle().catch(() => {}); }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref(); // never keep a process alive
  return timer;
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Patchwork Pete is alive on http://localhost:${PORT} — he moves in with each visitor; no fixed home`);
    // Warm-up: seed the location-free organs (heart, brain, stomach) and
    // their last-goods — what stale-while-error serves later — as early
    // as possible, so a fresh boot (e.g. a Render cold start) does not
    // meet its first judge with organs that never had a chance to answer.
    // Mood and lungs cannot warm up: they wait for a visitor to choose
    // where Pete lives. Fire-and-forget; a failed warm-up changes
    // nothing (organs stay honestly dead until a read succeeds).
    fullState().catch(() => {});
    // …and keep those last-goods recent while the server lives.
    startBackgroundRefresher();
  });
}

module.exports = { app, fullState, computeState, parseGeocodeResults, trackLocation, recentLocations, backgroundRefreshCycle };
