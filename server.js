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
const { HOME, homeLocation, normalizeLocation } = require('./src/location');
const { fetchJson } = require('./src/fetchJson');

const app = express();
const PORT = process.env.PORT || 4177;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ORGAN_GETTERS = {
  heart: (o) => getHeart(o),
  mood: (o) => getMood({ ...o, location: homeLocation() }),
  brain: (o) => getBrain(o),
  stomach: (o) => getStomach(o),
  lungs: (o) => getLungs({ ...o, location: homeLocation() }),
};

// Pete's official readings: location-bound organs ALWAYS read his one
// benchmark home. Nothing a visitor sends can move Pete.
async function collectReadings(force = {}) {
  const home = homeLocation();
  const [heart, mood, brain, stomach, lungs] = await Promise.all([
    getHeart({ force: !!force.heart }),
    getMood({ force: !!force.mood, location: home }),
    getBrain({ force: !!force.brain }),
    getStomach({ force: !!force.stomach }),
    getLungs({ force: !!force.lungs, location: home }),
  ]);
  return { heart, mood, brain, stomach, lungs };
}

async function fullState(force = {}) {
  const readings = await collectReadings(force);
  const state = computeState(readings);
  const diary = await getDiary(state, readings, { force: !!force.diary });
  return {
    pet: 'Patchwork Pete',
    generatedAt: new Date().toISOString(),
    home: { name: HOME.name, lat: HOME.lat, lon: HOME.lon },
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
    res.json(await fullState());
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// Action buttons: feed (stomach), teach (brain), weather (mood), heart, air (lungs).
app.post('/api/refresh/:organ', async (req, res) => {
  const organ = req.params.organ;
  if (!ORGAN_GETTERS[organ]) return res.status(404).json({ error: `Unknown organ: ${organ}` });
  try {
    res.json(await fullState({ [organ]: true, diary: organ === 'brain' }));
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// COMPARISON ONLY — "Your air vs Pete's air".
// Reads weather + air for a visitor-supplied place and sets them beside
// Pete's benchmark readings. This NEVER touches Pete's state or diary.
app.get('/api/compare', async (req, res) => {
  try {
    const loc = normalizeLocation({ lat: req.query.lat, lon: req.query.lon, place: req.query.place });
    const [yourMood, yourLungs, home] = await Promise.all([
      getMood({ location: loc }),
      getLungs({ location: loc }),
      fullState(),
    ]);
    const pete = { mood: home.organs.mood, lungs: home.organs.lungs };
    const num = (v) => (typeof v === 'number' ? v : null);
    const diff = (a, b) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10);
    res.json({
      place: loc.place,
      isHome: loc.isHome,
      home: { name: HOME.name },
      you: { mood: yourMood, lungs: yourLungs },
      pete,
      difference: {
        aqiUs: diff(num(yourLungs.data && yourLungs.data.aqiUs), num(pete.lungs.data && pete.lungs.data.aqiUs)),
        pm25: diff(num(yourLungs.data && yourLungs.data.pm25), num(pete.lungs.data && pete.lungs.data.pm25)),
        temperatureC: diff(num(yourMood.data && yourMood.data.temperatureC), num(pete.mood.data && pete.mood.data.temperatureC)),
      },
      note: 'Comparison only — Pete\'s official state is computed solely from his benchmark home and does not change with your location.',
    });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// City search for the comparison panel (Open-Meteo Geocoding, keyless).
app.get('/api/geocode', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json({ results: [] });
  try {
    const json = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    const results = (json.results || []).map((r) => ({
      name: r.name,
      admin1: r.admin1 || '',
      country: r.country || '',
      place: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: String(err && err.message ? err.message : err), results: [] });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true, service: 'patchwork-pete', home: HOME.name }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Patchwork Pete is alive on http://localhost:${PORT} — home: ${HOME.name}`));
}

module.exports = { app, fullState, computeState };
