'use strict';

// NERVOUS SYSTEM / DIARY.
// If GEMINI_API_KEY is set, Gemini writes ONE short diary line from the
// deterministic state (it narrates; it never decides the state).
// If the key is absent or the call fails, Pete falls back to deterministic
// template lines — and the entry is labelled source:'template' honestly.
// A template line is NEVER labelled as Gemini-written.

const entries = []; // newest first
const MAX_ENTRIES = 12;
let lastSignature = null;

function signatureOf(state) {
  return [state.overall, state.face, state.airCondition, state.deadOrgans.join('+'), (state.staleOrgans || []).join('+'), (state.awaitingOrgans || []).join('+'), state.homeName || '', state.commitsToday].join('|');
}

function templateLine(state, readings) {
  const bits = [];
  bits.push(state.summary);
  if (state.homeName) bits.push(`Pete lives in ${state.homeName} — his face wears its weather and his stitched lungs breathe its air.`);
  if (state.awaitingHome) bits.push('Nobody has chosen where Pete lives yet, so his face wears no weather and his lungs breathe no air. He waits, patiently.');
  const h = readings.heart;
  if (h && h.ok && h.data) bits.push(`His heart beats at BTC $${Number(h.data.priceUsd).toLocaleString('en-US')} (${h.data.change24hPct >= 0 ? '+' : ''}${Number(h.data.change24hPct).toFixed(2)}% today).`);
  if (h && !h.ok) bits.push('His heart is silent — CoinGecko did not answer.');
  const l = readings.lungs;
  const where = state.homeName ? ` in ${state.homeName}` : ' at home';
  if (l && l.ok && l.data) {
    if (l.data.condition === 'haze' || l.data.condition === 'severe-haze') {
      bits.push(`The air${where} is thick (PM2.5 ${l.data.pm25} µg/m³, US AQI ${l.data.aqiUs}) and he coughs between sentences.`);
    } else if (l.data.condition === 'clean') {
      bits.push(`The air${where} is clean today (US AQI ${l.data.aqiUs}) and his stitched lungs fill easily.`);
    } else {
      bits.push(`He breathes the ${l.data.condition} air${where} (US AQI ${l.data.aqiUs}, PM2.5 ${l.data.pm25} µg/m³).`);
    }
    if (typeof l.data.fireHotspots24h === 'number') bits.push(`NASA FIRMS counted ${l.data.fireHotspots24h} fire hotspot(s) near his home in the last 24h.`);
  }
  if (l && !l.ok && !l.awaiting) bits.push('His lungs are silent — the air-quality API did not answer, so he does not guess at the air.');
  const b = readings.brain;
  if (b && b.ok && b.data && b.data.currentFact) bits.push(`Today he learned about “${b.data.currentFact.title}”.`);
  const staleNames = Object.keys(readings).filter((k) => readings[k] && readings[k].stale);
  if (staleNames.length) bits.push(`Honesty note: the ${staleNames.join(' and ')} reading${staleNames.length > 1 ? 's are' : ' is'} stale — kept from the last successful read and labelled stale, because the live API did not answer just now.`);
  if (state.limping) bits.push(`He is stitching around the dead ${state.deadOrgans.join(' and ')} and waiting for it to wake up.`);
  return bits.join(' ');
}

async function geminiLine(state, readings, { fetchFn, apiKey } = {}) {
  const key = apiKey !== undefined ? apiKey : process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt =
    'You are the diary voice of Patchwork Pete, a cute Frankenstein virtual pet sewn from live APIs. ' +
    'Write ONE diary sentence (max 35 words), first person, spooky-cute, using ONLY these facts — invent nothing: ' +
    JSON.stringify({
      overall: state.overall,
      face: state.face,
      weather: state.moodCondition,
      commitsEatenToday: state.commitsToday,
      deadOrgans: state.deadOrgans,
      staleOrgans: state.staleOrgans || [],
      home: state.homeName || null,
      awaitingHome: !!state.awaitingHome,
      scores: state.scores,
      learnedFact: readings.brain && readings.brain.ok && readings.brain.data && readings.brain.data.currentFact
        ? readings.brain.data.currentFact.title : null,
      btcChange24hPct: readings.heart && readings.heart.ok && readings.heart.data ? readings.heart.data.change24hPct : null,
      homeAir: readings.lungs && readings.lungs.ok && readings.lungs.data
        ? { condition: readings.lungs.data.condition, aqiUs: readings.lungs.data.aqiUs, pm25: readings.lungs.data.pm25 }
        : (readings.lungs && readings.lungs.awaiting ? 'unknown — Pete has no home yet' : 'unknown — air organ dead'),
      breathingScore: state.scores.breathing,
    });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const doFetch = fetchFn || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await doFetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json && json.candidates && json.candidates[0] && json.candidates[0].content &&
      json.candidates[0].content.parts && json.candidates[0].content.parts[0] &&
      json.candidates[0].content.parts[0].text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Generate a diary entry when the state signature changed (or when forced).
async function getDiary(state, readings, { force = false, fetchFn, apiKey } = {}) {
  const sig = signatureOf(state);
  if (!force && entries.length && sig === lastSignature) {
    return { entries: entries.slice(), generated: false };
  }
  let text = null;
  let source = 'template';
  const fromGemini = await geminiLine(state, readings, { fetchFn, apiKey });
  if (fromGemini) { text = fromGemini; source = 'gemini'; }
  else { text = templateLine(state, readings); }
  const entry = { text, source, at: new Date().toISOString(), overall: state.overall };
  entries.unshift(entry);
  while (entries.length > MAX_ENTRIES) entries.pop();
  lastSignature = sig;
  return { entries: entries.slice(), generated: true };
}

module.exports = { getDiary, templateLine, signatureOf, _entries: entries };
