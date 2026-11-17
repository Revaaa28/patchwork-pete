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
const { normalizeLocation } = require('./src/location');
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

async function collectReadings(force = {}, loc = null) {
  const [heart, mood, brain, lungs] = await Promise.all([
    getHeart({ force: !!force.heart }),
    getMood({ force: !!force.mood, location: loc }),
    getBrain({ force: !!force.brain }),
    getLungs({ force: !!force.lungs, location: loc }),
  ]);
  // The stomach counts "today" in the chosen home's timezone (reported by
  // Open-Meteo with its readings); no home yet -> UTC.
  const tz = (mood.data && mood.data.timezone) || (lungs.data && lungs.data.timezone) || 'UTC';
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

app.get('/api/state', async (req, res) => {
  try {
    res.json(await fullState({}, locationFromRequest(req)));
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// Action buttons: feed (stomach), teach (brain), weather (mood), heart, air (lungs).
// The visitor's chosen home rides along as query params, same as /api/state.
const ORGANS = ['heart', 'mood', 'brain', 'stomach', 'lungs'];
app.post('/api/refresh/:organ', async (req, res) => {
  const organ = req.params.organ;
  if (!ORGANS.includes(organ)) return res.status(404).json({ error: `Unknown organ: ${organ}` });
  try {
    res.json(await fullState({ [organ]: true, diary: organ === 'brain' }, locationFromRequest(req)));
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
  });
}

module.exports = { app, fullState, computeState, parseGeocodeResults };
