'use strict';

// PET-STATE ENGINE — pure and deterministic.
// Same organ readings in -> same state out. No model, no randomness, no
// hidden state. A language model may later *narrate* this state (the diary);
// it never decides it.
//
// Reading shape (every organ adapter):
//   { organ, source, ok, data, error, fetchedAt }
//
// Organs: heart, mood (face), brain, stomach, lungs.
// Pete's mood + lungs readings come from the place the visitor chose
// for him to live (see src/location.js) — or honestly await a choice.

const MOOD_SCORES = {
  clear: 95,
  'partly-cloudy': 85,
  cloudy: 65,
  fog: 50,
  drizzle: 55,
  rain: 35,
  snow: 45,
  storm: 15,
};

const MOOD_FACES = {
  clear: 'cheerful',
  'partly-cloudy': 'content',
  cloudy: 'neutral',
  fog: 'groggy',
  drizzle: 'soggy',
  rain: 'gloomy',
  snow: 'chilly',
  storm: 'scared',
};

// Breathing score from the standard US AQI scale (PM2.5 bands as fallback).
// Clean air -> easy breathing; haze -> Pete coughs.
function breathingFromLungs(lungs) {
  if (!lungs || !lungs.ok || !lungs.data) return null; // honestly unknown
  const { aqiUs, pm25 } = lungs.data;
  if (typeof aqiUs === 'number') return clamp(105 - aqiUs * 0.55);
  if (typeof pm25 === 'number') {
    if (pm25 <= 12) return 95;
    if (pm25 <= 35.4) return 74;
    if (pm25 <= 55.4) return 52;
    if (pm25 <= 150.4) return 26;
    return 10;
  }
  return null;
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

function energyFromHeart(heart) {
  if (!heart.ok || !heart.data) return null;
  const change = typeof heart.data.change24hPct === 'number' ? heart.data.change24hPct : 0;
  return clamp(55 + change * 6);
}

function fedFromStomach(stomach) {
  if (!stomach.ok || !stomach.data) return null;
  const c = stomach.data.commitsToday || 0;
  if (c === 0) return 12;
  if (c === 1) return 45;
  if (c === 2) return 62;
  if (c <= 4) return 78;
  return 95;
}

function moodFromFace(mood) {
  if (!mood.ok || !mood.data) return null;
  const s = MOOD_SCORES[mood.data.condition];
  return typeof s === 'number' ? s : 60;
}

function brainScore(brain) {
  if (!brain.ok || !brain.data || !brain.data.currentFact) return null;
  const known = Array.isArray(brain.data.memory) ? brain.data.memory.length : 1;
  return clamp(65 + known * 7);
}

function computeState(readings) {
  const { heart, mood, brain, stomach, lungs } = readings;
  const organs = { heart, mood, brain, stomach, lungs };
  // Awaiting organs (no home chosen yet — mood/lungs before a visitor
  // picks where Pete lives) are NOT dead: they carry no score at all,
  // never grey a part, and never make Pete limp.
  const deadOrgans = Object.keys(organs).filter((k) => !organs[k] || (!organs[k].ok && !organs[k].awaiting));
  const awaitingOrgans = Object.keys(organs).filter((k) => organs[k] && organs[k].awaiting);
  const awaitingHome = awaitingOrgans.length > 0;
  const limping = deadOrgans.length > 0;
  // Where Pete lives right now, per his own live readings (null = no home).
  const homeName = (mood.ok && mood.data && mood.data.location) ||
    (lungs && lungs.ok && lungs.data && lungs.data.location) || null;
  // Stale organs are NOT dead: the reading is real, just not fresh. It
  // scores normally and its part keeps its colour — but it is named here
  // and in the summary, and the UI labels it, so nobody mistakes it for a
  // live reading.
  const staleOrgans = Object.keys(organs).filter((k) => organs[k] && organs[k].ok && organs[k].stale);

  const energy = energyFromHeart(heart);
  const fed = fedFromStomach(stomach);
  const moodScore = moodFromFace(mood);
  const brainPower = brainScore(brain);
  const breathing = breathingFromLungs(lungs); // null when lungs are dead

  const parts = [
    { key: 'heart', label: 'Heart', part: 'chest', ok: !!heart.ok, stale: !!heart.stale, awaiting: !!heart.awaiting, score: energy },
    { key: 'mood', label: 'Face / Mood', part: 'face', ok: !!mood.ok, stale: !!mood.stale, awaiting: !!mood.awaiting, score: moodScore },
    { key: 'brain', label: 'Brain', part: 'head', ok: !!brain.ok, stale: !!brain.stale, awaiting: !!brain.awaiting, score: brainPower },
    { key: 'stomach', label: 'Stomach', part: 'belly', ok: !!stomach.ok, stale: !!stomach.stale, awaiting: !!stomach.awaiting, score: fed },
    { key: 'lungs', label: 'Lungs', part: 'lungs', ok: !!(lungs && lungs.ok), stale: !!(lungs && lungs.stale), awaiting: !!(lungs && lungs.awaiting), score: breathing },
  ];
  // Only DEAD parts go grey — an awaiting part is unlit, not broken.
  const greyParts = parts.filter((p) => !p.ok && !p.awaiting).map((p) => p.part);

  const liveScores = [energy, fed, moodScore, brainPower, breathing].filter((n) => typeof n === 'number');
  const mean = liveScores.length ? liveScores.reduce((a, b) => a + b, 0) / liveScores.length : 0;
  const health = clamp(mean - deadOrgans.length * 12);

  const condition = mood.ok && mood.data ? mood.data.condition : null;
  const airCondition = lungs && lungs.ok && lungs.data ? lungs.data.condition : null;
  const smoky = airCondition === 'haze' || airCondition === 'severe-haze';

  let face = mood.ok && mood.data ? MOOD_FACES[condition] || 'neutral' : 'blank';
  if (mood.awaiting) face = 'waiting'; // no home yet — a patient, neutral face
  if (smoky) face = 'coughing';
  const commitsToday = stomach.ok && stomach.data ? stomach.data.commitsToday || 0 : null;

  // Overall state — priority order is deliberate:
  // awaiting a home > dead organ (limping) > smoke (smoky) > storm >
  // hunger > rain > thriving > ok. (The limping FLAG still reports a dead
  // organ honestly even while Pete waits for a home.)
  let overall;
  if (awaitingHome) overall = 'awaiting-home';
  else if (limping) overall = 'limping';
  else if (smoky) overall = 'smoky';
  else if (condition === 'storm') overall = 'gloomy';
  else if (commitsToday === 0) overall = 'hungry';
  else if (condition === 'rain' || condition === 'drizzle') overall = 'gloomy';
  else if (health >= 78) overall = 'thriving';
  else overall = 'ok';

  const scores = {
    health,
    energy: energy === null ? 0 : energy,
    hunger: fed === null ? 100 : 100 - fed,
    fed: fed === null ? 0 : fed,
    // Mood stays null while Pete awaits a home: unknown, never a fake zero.
    mood: moodScore === null ? (mood.awaiting ? null : 0) : moodScore,
    brain: brainPower === null ? 0 : brainPower,
    // Breathing stays null when the lungs organ is dead: unknown, honestly —
    // never replaced with a made-up number.
    breathing,
  };

  const baseSummary = summaryFor(overall, { face, condition, airCondition, commitsToday, deadOrgans, homeName });
  const summary = staleOrgans.length
    ? `${baseSummary} Note: the ${staleOrgans.join(' and ')} reading${staleOrgans.length > 1 ? 's are' : ' is'} stale — served from the last successful read (see its timestamp) because the live API did not answer just now.`
    : baseSummary;

  return {
    overall,
    scores,
    face,
    moodCondition: condition,
    airCondition,
    smoky,
    limping,
    deadOrgans,
    staleOrgans,
    awaitingOrgans,
    awaitingHome,
    homeName,
    greyParts,
    parts,
    commitsToday,
    summary,
  };
}

function summaryFor(overall, { condition, airCondition, commitsToday, deadOrgans, homeName }) {
  const atHome = homeName ? ` in ${homeName}` : ' at home';
  switch (overall) {
    case 'awaiting-home':
      return 'Pete has no home yet — he is waiting for someone to choose where he lives. His heart, brain and stomach are already alive; his face and lungs wake up the moment he has a home.';
    case 'thriving':
      return `Pete is thriving — every organ is alive, he is fed, and both the sky and the air${atHome} agree with him.`;
    case 'smoky':
      return `Pete is coughing — the air${atHome} is ${airCondition === 'severe-haze' ? 'thick with smoke' : 'hazy with smoke'} and every breath is work.`;
    case 'hungry':
      return 'Pete is hungry — no GitHub commits have landed in his stomach today.';
    case 'gloomy':
      return condition === 'storm'
        ? `Pete is scared and gloomy — there is a storm over his home${homeName ? ` in ${homeName}` : ''}.`
        : `Pete is gloomy — the sky over his home${homeName ? ` in ${homeName}` : ''} is wet today.`;
    case 'limping':
      return `Pete is limping — ${deadOrgans.join(', ')} stopped answering, and he refuses to pretend otherwise.`;
    default:
      return `Pete is okay — ${commitsToday === null ? 'stomach unknown' : commitsToday + ' commit(s) eaten today'}, breathing ${airCondition || 'unknown'} air${atHome}.`;
  }
}

module.exports = { computeState, breathingFromLungs, MOOD_SCORES, MOOD_FACES };
