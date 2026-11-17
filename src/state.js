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
// Pete's mood + lungs readings always come from his one benchmark home
// (see src/location.js); visitor locations never reach this function.

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
  const deadOrgans = Object.keys(organs).filter((k) => !organs[k] || !organs[k].ok);
  const limping = deadOrgans.length > 0;

  const energy = energyFromHeart(heart);
  const fed = fedFromStomach(stomach);
  const moodScore = moodFromFace(mood);
  const brainPower = brainScore(brain);
  const breathing = breathingFromLungs(lungs); // null when lungs are dead

  const parts = [
    { key: 'heart', label: 'Heart', part: 'chest', ok: !!heart.ok, score: energy },
    { key: 'mood', label: 'Face / Mood', part: 'face', ok: !!mood.ok, score: moodScore },
    { key: 'brain', label: 'Brain', part: 'head', ok: !!brain.ok, score: brainPower },
    { key: 'stomach', label: 'Stomach', part: 'belly', ok: !!stomach.ok, score: fed },
    { key: 'lungs', label: 'Lungs', part: 'lungs', ok: !!(lungs && lungs.ok), score: breathing },
  ];
  const greyParts = parts.filter((p) => !p.ok).map((p) => p.part);

  const liveScores = [energy, fed, moodScore, brainPower, breathing].filter((n) => typeof n === 'number');
  const mean = liveScores.length ? liveScores.reduce((a, b) => a + b, 0) / liveScores.length : 0;
  const health = clamp(mean - deadOrgans.length * 12);

  const condition = mood.ok && mood.data ? mood.data.condition : null;
  const airCondition = lungs && lungs.ok && lungs.data ? lungs.data.condition : null;
  const smoky = airCondition === 'haze' || airCondition === 'severe-haze';

  let face = mood.ok && mood.data ? MOOD_FACES[condition] || 'neutral' : 'blank';
  if (smoky) face = 'coughing';
  const commitsToday = stomach.ok && stomach.data ? stomach.data.commitsToday || 0 : null;

  // Overall state — priority order is deliberate:
  // dead organ (limping) > smoke (smoky) > storm > hunger > rain > thriving > ok.
  let overall;
  if (limping) overall = 'limping';
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
    mood: moodScore === null ? 0 : moodScore,
    brain: brainPower === null ? 0 : brainPower,
    // Breathing stays null when the lungs organ is dead: unknown, honestly —
    // never replaced with a made-up number.
    breathing,
  };

  return {
    overall,
    scores,
    face,
    moodCondition: condition,
    airCondition,
    smoky,
    limping,
    deadOrgans,
    greyParts,
    parts,
    commitsToday,
    summary: summaryFor(overall, { face, condition, airCondition, commitsToday, deadOrgans }),
  };
}

function summaryFor(overall, { condition, airCondition, commitsToday, deadOrgans }) {
  switch (overall) {
    case 'thriving':
      return 'Pete is thriving — every organ is alive, he is fed, and both the sky and the air at home agree with him.';
    case 'smoky':
      return `Pete is coughing — the air at home is ${airCondition === 'severe-haze' ? 'thick with smoke' : 'hazy with smoke'} and every breath is work.`;
    case 'hungry':
      return 'Pete is hungry — no GitHub commits have landed in his stomach today.';
    case 'gloomy':
      return condition === 'storm'
        ? 'Pete is scared and gloomy — there is a storm over his home.'
        : 'Pete is gloomy — the sky over his home is wet today.';
    case 'limping':
      return `Pete is limping — ${deadOrgans.join(', ')} stopped answering, and he refuses to pretend otherwise.`;
    default:
      return `Pete is okay — ${commitsToday === null ? 'stomach unknown' : commitsToday + ' commit(s) eaten today'}, breathing ${airCondition || 'unknown'} air at home.`;
  }
}

module.exports = { computeState, breathingFromLungs, MOOD_SCORES, MOOD_FACES };
