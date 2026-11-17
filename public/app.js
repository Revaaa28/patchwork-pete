'use strict';

/* Patchwork Pete — browser side.
   Pete is drawn pixel by pixel on a canvas. Every body part takes its colour
   from its organ's LIVE state: a dead organ's part is drawn grey, and a
   limping Pete visibly tilts and drags one leg. Voice is the Web Speech API. */

const canvas = document.getElementById('peteCanvas');
const ctx = canvas.getContext('2d');
const P = 12; // pixel size
let current = null; // last /api/state payload
let t0 = performance.now();

const GREY = '#5b6373';
const GREY_D = '#454b58';

/* ── Living atmosphere ─────────────────────────────────────
   Every effect below is DRIVEN BY PETE'S REAL READINGS, set in
   render() from the payload. Nothing here invents data: the smoke
   is the measured AQI of the place Pete lives, the ECG rate is
   derived from the real BTC 24h move, the breathing rate/depth
   from the breathing score, the scene light from the real weather
   condition where he lives. */
const ATMO = {
  bpm: 60,            // heartbeats per minute (from BTC move + energy)
  heartAlive: false,
  heartText: '',
  breathHz: 0.28,     // breaths per second (from breathing score)
  breathDepth: 1,     // 1 = deep & easy, ~0.4 = shallow & laboured
  smoke: 0.04,        // 0..1 smoke density (from home US AQI)
  sky: 'partly-cloudy', // home weather condition bucket
};
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * P, y * P, w * P, h * P);
}
function stitch(x, y, w, h) {
  // Gold thread: a dark underlay pass, then the brass stitch on top —
  // Pete is sewn with the manor's finest gold, like everything here.
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? 'rgba(10,8,2,.9)' : '#d8b45a';
    const off = pass === 0 ? 1 : 0;
    for (let i = 0; i < Math.max(w, h); i++) {
      if (i % 2 === 0) ctx.fillRect((x + (w >= h ? i : 0)) * P + 4 + off, (y + (h > w ? i : 0)) * P + 4 + off, 4, 4);
    }
  }
}

function drawPete(now) {
  const t = (now - t0) / 1000;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // The chamber itself (arch window, spotlight, floor) is the CSS scene
  // behind this transparent canvas; Pete only casts a soft shadow here.
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, 402, 92, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, 402, 58, 7, 0, 0, Math.PI * 2); ctx.fill();

  const s = current && current.state;
  const organs = current && current.organs;
  const dead = (k) => !organs || !organs[k] || !organs[k].ok;
  const awaiting = (k) => !!(organs && organs[k] && organs[k].awaiting);
  const limping = s ? s.limping : false;
  const smoky = s ? s.smoky : false;
  const bob = limping ? Math.round(Math.sin(t * 3) * 0.6) : Math.round(Math.sin(t * 1.6) * 1);
  const lean = limping ? Math.sin(t * 3) * 0.05 : 0;
  // Breathing: the whole chest swells at the rate/depth the real
  // breathing score dictates — slow & deep when the home air is clean,
  // fast & shallow when it is not.
  const breathPhase = Math.sin(2 * Math.PI * ATMO.breathHz * t);
  // Cough: short violent bursts, only while the home air is hazy.
  const cough = smoky && Math.sin(t * 0.9) > 0.55 ? Math.round(Math.sin(t * 30) * 1) : 0;

  ctx.save();
  ctx.translate(canvas.width / 2, 0);
  ctx.rotate(lean);
  ctx.translate(-canvas.width / 2 + cough * 3, bob * P * 0.4 + breathPhase * 2.4 * ATMO.breathDepth);

  // palette per organ
  const brainC = dead('brain') ? GREY : '#ff9ec6';
  const headL = dead('brain') ? GREY : '#f2c094';
  const headR = dead('brain') ? GREY_D : '#a8dcb4';
  const heartAlive = !dead('heart');
  const fed = s ? s.scores.fed : 50;
  const bellyC = dead('stomach') ? GREY : fed >= 60 ? '#ffb84f' : fed >= 30 ? '#c98f3d' : '#6e5636';
  const torsoL = '#7a5fd0';
  const torsoR = '#2f9e8f';

  // ---- legs (one drags when limping) ----
  const drag = limping ? 1 : 0;
  px(11, 30, 3, 4 - drag, '#3d5a99'); px(10, 34 - drag, 4, 1, '#22242c'); // left leg + shoe
  px(17, 30, 3, 4, '#7a4a3a'); px(17, 34, 4, 1, '#22242c');               // right leg + shoe

  // ---- arms (mismatched on purpose) ----
  px(6, 19, 3, 8, '#57b06a'); px(6, 27, 3, 2, '#f2c094');   // long green left arm
  px(22, 19, 3, 6, '#e08a5a'); px(22, 25, 3, 2, '#a8dcb4'); // short orange right arm

  // ---- torso: two fabrics stitched down the middle ----
  px(9, 18, 7, 12, torsoL);
  px(16, 18, 6, 12, torsoR);
  stitch(15.6, 18, 1, 12);
  // belly panel
  px(12, 24, 7, 5, bellyC);
  stitch(12, 24, 7, 1);

  // ---- lungs: two panels flanking the heart; pink when the home air is
  // clean, sliding to grey-brown as smoke thickens, plain grey when dead,
  // dim brass while Pete still awaits a home (unlit, not broken) ----
  const breathing = s ? s.scores.breathing : null;
  const lungC = awaiting('lungs') ? '#8a7a52'
    : dead('lungs') ? GREY
    : breathing === null ? GREY
    : breathing >= 75 ? '#ff8fa8'
    : breathing >= 55 ? '#e58aa0'
    : breathing >= 35 ? '#b0826e'
    : '#6e5a4e';
  const breathePulse = dead('lungs') ? 0 : Math.round(breathPhase * 0.9 * ATMO.breathDepth);
  px(10, 20 + breathePulse, 2, 5, lungC); px(19, 20 + breathePulse, 2, 5, lungC);
  px(10, 25 + breathePulse, 1, 1, lungC); px(20, 25 + breathePulse, 1, 1, lungC);
  if (smoky) { // drifting smoke wisps around Pete
    ctx.fillStyle = 'rgba(160,150,140,.35)';
    const w1 = (t * 14) % 90, w2 = (t * 9 + 40) % 90;
    ctx.fillRect(20 + w1, 120 + Math.sin(t * 2) * 6, 26, 7);
    ctx.fillRect(250 - w2, 190 + Math.cos(t * 1.6) * 6, 32, 8);
  }

  // ---- heart on the chest (pulses at Pete's real derived BPM — the same
  // rate the gold ECG line below the stage is drawn at; grey if dead) ----
  const beatPhase = (t * ATMO.bpm / 60) % 1;
  const beat = heartAlive ? 1 + Math.pow(Math.max(0, Math.sin(beatPhase * Math.PI)), 3) * 0.22 : 1;
  ctx.save();
  ctx.translate(13.5 * P, 20.5 * P);
  ctx.scale(beat, beat);
  ctx.translate(-13.5 * P, -20.5 * P);
  const hc = heartAlive ? '#ff4757' : GREY_D;
  px(12, 20, 2, 2, hc); px(15, 20, 2, 2, hc);
  px(11, 21, 7, 2, hc); px(12, 23, 5, 1, hc); px(13, 24, 3, 1, hc); px(14, 25, 1, 1, hc);
  ctx.restore();

  // ---- neck bolts ----
  px(8, 16, 2, 2, '#c7cede'); px(21, 16, 2, 2, '#c7cede');

  // ---- head: two halves, stitched ----
  px(9, 5, 7, 12, headL);
  px(16, 5, 6, 12, headR);
  stitch(15.6, 5, 1, 12);
  // brain patch showing through the top
  px(11, 2, 8, 3, brainC);
  px(12, 1, 6, 1, brainC);
  ctx.fillStyle = 'rgba(120,20,60,.5)';
  ctx.fillRect(13 * P + 3, 2 * P + 2, 3, 8); ctx.fillRect(16 * P + 2, 3 * P + 3, 8, 3);

  // ---- face (driven by the mood organ) ----
  const face = s ? s.face : 'neutral';
  const eye = '#14161c';
  if (dead('mood') && !awaiting('mood')) {
    px(11, 10, 2, 2, GREY_D); px(18, 10, 2, 2, GREY_D);
    px(13, 14, 5, 1, GREY_D);
  } else if (face === 'waiting') {
    // No home yet: calm dot eyes, a flat patient mouth, and a small
    // floating question mark — he is waiting to be housed, not broken.
    px(12, 10, 2, 2, eye); px(18, 10, 2, 2, eye);
    px(13, 14, 5, 1, eye);
    px(24, 2, 2, 1, '#d8b45a'); px(26, 3, 1, 1, '#d8b45a');
    px(25, 4, 1, 1, '#d8b45a'); px(25, 6, 1, 1, '#d8b45a');
  } else if (face === 'scared') {
    px(11, 9, 3, 4, '#ffffff'); px(18, 9, 3, 4, '#ffffff');
    px(12, 10, 1, 2, eye); px(19, 10, 1, 2, eye);
    px(14, 14, 3, 2, eye); // open O mouth
  } else if (face === 'coughing') {
    px(11, 11, 3, 1, eye); px(18, 11, 3, 1, eye); // squinting eyes
    px(11, 10, 3, 1, eye); px(18, 10, 3, 1, eye);
    px(13, 14, 5, 2, eye); // wide coughing mouth
    ctx.fillStyle = 'rgba(190,185,175,.8)'; // cough puffs
    ctx.fillRect(19 * P + 6, 14 * P, 7, 7); ctx.fillRect(21 * P, 13 * P + 4, 5, 5);
  } else if (face === 'cheerful' || face === 'content') {
    px(11, 10, 3, 1, eye); px(11, 9, 1, 1, eye); px(13, 9, 1, 1, eye); // ^ eye
    px(18, 10, 3, 1, eye); px(18, 9, 1, 1, eye); px(20, 9, 1, 1, eye); // ^ eye
    px(13, 13, 5, 1, eye); px(13, 14, 1, 1, eye); px(17, 14, 1, 1, eye); // smile
  } else if (face === 'gloomy' || face === 'soggy') {
    px(11, 11, 3, 1, eye); px(18, 11, 3, 1, eye); // droopy eyes
    px(13, 15, 5, 1, eye); px(13, 14, 1, 1, eye); px(17, 14, 1, 1, eye); // frown
  } else {
    px(12, 10, 2, 2, eye); px(18, 10, 2, 2, eye);
    px(13, 14, 5, 1, eye);
  }
  ctx.restore();
  requestAnimationFrame(drawPete);
}
requestAnimationFrame(drawPete);

/* ── Atmosphere canvas: gold dust, embers, and home smoke ──
   One transparent canvas over the chamber. Dust & embers are the
   manor's air; the SMOKE is data — its density is ATMO.smoke,
   derived from the real US AQI where Pete lives. Clean air: you
   can barely see it. Haze: thick drifts roll across the glass and
   Pete coughs behind them (his cough lives in drawPete). */
const fx = document.getElementById('fxCanvas');
const fctx = fx.getContext('2d');
const scene = document.getElementById('scene');
let FW = 0, FH = 0;
function sizeFx() {
  const r = scene.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  FW = Math.max(300, Math.round(r.width)); FH = Math.max(300, Math.round(r.height));
  fx.width = Math.round(FW * dpr); fx.height = Math.round(FH * dpr);
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeFx();
window.addEventListener('resize', sizeFx);

const dust = Array.from({ length: 42 }, () => ({
  x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.5,
  vy: 0.004 + Math.random() * 0.010, vx: (Math.random() - 0.5) * 0.004, tw: Math.random() * Math.PI * 2,
}));
const embers = Array.from({ length: 9 }, () => ({
  x: Math.random(), y: 0.55 + Math.random() * 0.45, r: 1 + Math.random() * 1.8,
  vy: 0.02 + Math.random() * 0.03, vx: (Math.random() - 0.5) * 0.01,
}));
const puffs = Array.from({ length: 26 }, (_, i) => ({
  x: Math.random(), y: 0.35 + Math.random() * 0.65, r: 46 + Math.random() * 90,
  vx: 0.006 + Math.random() * 0.014, wob: Math.random() * Math.PI * 2, seed: i * 1.7,
}));

function drawFx(now) {
  const t = now / 1000;
  fctx.clearRect(0, 0, FW, FH);
  // drifting smoke — alpha & count scale with the real AQI-derived density
  const density = ATMO.smoke;
  if (density > 0.02) {
    const active = Math.max(2, Math.round(puffs.length * density));
    for (let i = 0; i < active; i++) {
      const p = puffs[i];
      const x = ((p.x + t * p.vx) % 1.25 - 0.12) * FW;
      const y = p.y * FH + Math.sin(t * 0.35 + p.wob) * 14;
      const a = density * 0.16 * (0.7 + 0.3 * Math.sin(t * 0.5 + p.seed));
      const g = fctx.createRadialGradient(x, y, 0, x, y, p.r);
      g.addColorStop(0, `rgba(168,158,146,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(168,158,146,0)');
      fctx.fillStyle = g;
      fctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
    }
  }
  // gold dust motes in the spotlight
  for (const d of dust) {
    d.y -= d.vy / 60; d.x += d.vx / 60 + Math.sin(t * 0.6 + d.tw) * 0.00012;
    if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9 + d.tw));
    fctx.fillStyle = `rgba(238,214,136,${(0.5 * tw).toFixed(3)})`;
    fctx.beginPath(); fctx.arc(d.x * FW, d.y * FH, d.r, 0, Math.PI * 2); fctx.fill();
  }
  // a few embers rising from below the floor grate
  for (const e of embers) {
    e.y -= e.vy / 60; e.x += e.vx / 60;
    if (e.y < 0.45) { e.y = 0.98; e.x = Math.random(); }
    fctx.fillStyle = 'rgba(255,150,60,.55)';
    fctx.shadowColor = 'rgba(255,120,40,.9)'; fctx.shadowBlur = 7;
    fctx.beginPath(); fctx.arc(e.x * FW, e.y * FH, e.r, 0, Math.PI * 2); fctx.fill();
    fctx.shadowBlur = 0;
  }
  if (!REDUCED) requestAnimationFrame(drawFx);
}
requestAnimationFrame(drawFx);

/* ── Gold ECG: a scrolling cardiogram under the stage ──
   The waveform is a stylised QRS complex repeating at ATMO.bpm —
   the rate derived from the real BTC 24h move. When the heart
   organ is dead the line falls flat and grey. Honest to the end. */
const ecg = document.getElementById('ecgCanvas');
const ectx = ecg.getContext('2d');
function ecgY(p) {
  if (p < 0.12) return Math.sin(p / 0.12 * Math.PI) * 0.14;
  if (p < 0.20) return -Math.sin((p - 0.12) / 0.08 * Math.PI) * 0.10;
  if (p < 0.27) return Math.sin((p - 0.20) / 0.07 * Math.PI) * 1.0;
  if (p < 0.36) return -Math.sin((p - 0.27) / 0.09 * Math.PI) * 0.28;
  if (p < 0.60) return Math.sin((p - 0.36) / 0.24 * Math.PI) * 0.20;
  return 0;
}
function drawEcg(now) {
  const t = now / 1000;
  const W = ecg.width, H = ecg.height, mid = H * 0.58, amp = H * 0.36;
  ectx.clearRect(0, 0, W, H);
  // faint ruled paper
  ectx.strokeStyle = 'rgba(201,162,39,.07)'; ectx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 22) { ectx.beginPath(); ectx.moveTo(gx, 0); ectx.lineTo(gx, H); ectx.stroke(); }
  ectx.beginPath(); ectx.moveTo(0, mid); ectx.lineTo(W, mid); ectx.stroke();
  const pxPerSec = 130;
  ectx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const tt = t - (W - x) / pxPerSec;
    const v = ATMO.heartAlive ? ecgY((tt * ATMO.bpm / 60) % 1) : 0;
    const y = mid - v * amp;
    if (x === 0) ectx.moveTo(x, y); else ectx.lineTo(x, y);
  }
  ectx.strokeStyle = ATMO.heartAlive ? '#e9c860' : '#5b6373';
  ectx.lineWidth = 2.2;
  ectx.shadowColor = ATMO.heartAlive ? 'rgba(238,214,136,.85)' : 'transparent';
  ectx.shadowBlur = ATMO.heartAlive ? 9 : 0;
  ectx.stroke();
  ectx.shadowBlur = 0;
  // leading dot
  if (ATMO.heartAlive) {
    const v = ecgY((t * ATMO.bpm / 60) % 1);
    ectx.fillStyle = '#fdf3c4';
    ectx.beginPath(); ectx.arc(W - 2, mid - v * amp, 3.2, 0, Math.PI * 2); ectx.fill();
  }
  if (!REDUCED) requestAnimationFrame(drawEcg);
}
requestAnimationFrame(drawEcg);

/* ---------- data rendering ---------- */
const $ = (id) => document.getElementById(id);

function fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
}
function readingText(key, o) {
  if (!o.ok) return null;
  const d = o.data || {};
  switch (key) {
    case 'heart': return `BTC <b>$${Number(d.priceUsd).toLocaleString('en-US')}</b> · 24h ${d.change24hPct >= 0 ? '+' : ''}${Number(d.change24hPct).toFixed(2)}%`;
    case 'mood': return `<b>${d.condition}</b> over ${escapeHtml(d.location)} · ${d.temperatureC}°C · wind ${d.windKmh} km/h`;
    case 'lungs': return `Air: <b>${d.condition}</b> · PM2.5 <b>${d.pm25}</b> µg/m³ · PM10 ${d.pm10} · US AQI <b>${d.aqiUs}</b>${typeof d.fireHotspots24h === 'number' ? `<br>🔥 ${d.fireHotspots24h} fire hotspot(s) near his home in 24h (NASA FIRMS)` : `<br><span style="color:var(--dim)">🔥 ${escapeHtml(d.fireSource || '')}</span>`}`;
    case 'brain': return d.currentFact ? `Knows: <a href="${d.currentFact.url || '#'}" target="_blank" rel="noopener">${escapeHtml(d.currentFact.title)}</a><br><span style="color:var(--dim)">${escapeHtml((d.currentFact.extract || '').slice(0, 150))}…</span>` : 'Brain is empty.';
    case 'stomach': return `<b>${d.commitsToday}</b> commit(s) eaten today in ${d.pushesToday} push(es)${d.lastPushAt ? ' · last bite ' + fmtTime(d.lastPushAt) : ''}`;
    default: return '';
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const ORGAN_META = [
  ['heart', '❤️ Heart', 'CoinGecko public API — BTC/USD'],
  ['mood', '🌦️ Face / Mood', 'Open-Meteo weather — where Pete lives'],
  ['lungs', '🫁 Lungs', 'Open-Meteo Air Quality — where Pete lives'],
  ['brain', '🧠 Brain', 'Wikipedia — random article'],
  ['stomach', '🍽️ Stomach', 'GitHub commits — @Revaaa28'],
  ['voice', '🔊 Voice', 'Web Speech API — your browser'],
];

function render(payload) {
  current = payload;
  const s = payload.state;
  const badge = $('overallBadge');
  badge.textContent = '● ' + s.overall.toUpperCase();
  badge.className = 'badge badge-' + s.overall;
  $('petSummary').textContent = s.summary;
  document.body.classList.add('revealed');

  /* ── feed the living atmosphere with the REAL readings ── */
  const heart = payload.organs.heart;
  ATMO.heartAlive = !!(heart && heart.ok);
  if (ATMO.heartAlive) {
    const chg = Number(heart.data.change24hPct) || 0;
    ATMO.bpm = Math.max(42, Math.min(126, Math.round(50 + Math.abs(chg) * 9 + (s.scores.energy - 50) * 0.18)));
    ATMO.heartText = `BTC $${Number(heart.data.priceUsd).toLocaleString('en-US')} · 24h ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
  } else {
    ATMO.heartText = '';
  }
  $('ecgLabel').innerHTML = ATMO.heartAlive
    ? `♥ <b>${ATMO.bpm} BPM</b> — Pete's heartbeat, set by the market · ${escapeHtml(ATMO.heartText)}`
    : '♥ flatline — the heart organ is silent. Pete will not fake a pulse.';

  const b = s.scores.breathing;
  if (typeof b === 'number') {
    ATMO.breathHz = b >= 75 ? 0.21 : b >= 55 ? 0.29 : b >= 35 ? 0.44 : 0.62;
    ATMO.breathDepth = b >= 75 ? 1 : b >= 55 ? 0.8 : b >= 35 ? 0.55 : 0.38;
  }
  const lungs = payload.organs.lungs;
  if (lungs && lungs.ok && typeof lungs.data.aqiUs === 'number') {
    const aqi = lungs.data.aqiUs;
    ATMO.smoke = aqi <= 50 ? 0.05 : aqi <= 100 ? 0.17 : aqi <= 150 ? 0.36 : aqi <= 200 ? 0.58 : 0.85;
  } else if (lungs && lungs.ok && typeof lungs.data.pm25 === 'number') {
    const pm = lungs.data.pm25;
    ATMO.smoke = pm <= 12 ? 0.05 : pm <= 35.4 ? 0.17 : pm <= 55.4 ? 0.36 : pm <= 150.4 ? 0.58 : 0.85;
  } else {
    ATMO.smoke = 0.03; // lungs silent: no invented smoke either
  }
  document.getElementById('scene').style.setProperty('--haze', ATMO.smoke.toFixed(2));
  if (s.moodCondition) {
    ATMO.sky = s.moodCondition;
    document.body.dataset.sky = s.moodCondition;
  }

  if (payload.home) {
    $('homeLabel').innerHTML = `🏠 Pete lives in <b>${escapeHtml(payload.home.name)}</b> — his face wears its weather and his stitched lungs breathe its air.`;
    $('homeStatus').innerHTML = `Pete currently lives in <b>${escapeHtml(payload.home.name)}</b>. Pick another place any time — he will pack his stitches and move in there instead.`;
  } else {
    $('homeLabel').textContent = 'Pete has no home yet — choose where he lives, and his face and lungs will wake up there.';
    $('homeStatus').textContent = 'Pete has no home yet. Pick a place below and he moves in: his mood becomes that place\'s weather and his stitched lungs breathe that place\'s air. The choice is remembered in this browser — Pete will be living there when you return.';
  }
  const scoreDefs = [
    ['Health', s.scores.health, '#3ddc97', null],
    ['Energy', s.scores.energy, '#ffc46b', 'heart'],
    ['Mood', s.scores.mood, '#b78cff', 'mood'],
    ['Breathing', s.scores.breathing, '#ff8fa8', 'lungs'],
    ['Brain', s.scores.brain, '#ff9ec6', 'brain'],
    ['Fed', s.scores.fed, '#4fd8c8', 'stomach'],
    ['Hunger', s.scores.hunger, '#e0657a', 'stomach'],
  ];
  const CIRC = 2 * Math.PI * 26; // gauge ring circumference
  $('scores').innerHTML = scoreDefs.map(([label, v, c, organKey]) => {
    // A gauge goes silent only for a DEAD organ — an organ awaiting a
    // home shows "—" but keeps its colour: unknown, not broken.
    const organ = organKey && payload.organs[organKey];
    const silent = organ && !organ.ok && !organ.awaiting;
    const shown = v === null ? '—' : String(v);
    return `<figure class="gauge${silent ? ' silent' : ''}">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="g-track" cx="32" cy="32" r="26"></circle>
        <circle class="g-fill" cx="32" cy="32" r="26" style="color:${c};stroke:${c}" stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${CIRC.toFixed(1)}" data-target="${v === null ? CIRC.toFixed(1) : (CIRC * (1 - v / 100)).toFixed(1)}"></circle>
        <text class="g-num" x="32" y="38" text-anchor="middle">${shown}</text>
      </svg><figcaption>${label}</figcaption></figure>`;
  }).join('');
  // sweep the rings to their values on the next frame (CSS transition does the rest)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.g-fill').forEach((el) => { el.style.strokeDashoffset = el.dataset.target; });
  }));

  $('organGrid').innerHTML = ORGAN_META.map(([key, name, source], i) => {
    const o = key === 'voice' ? payload.voice : payload.organs[key];
    const deadCls = o.ok ? '' : o.awaiting ? ' awaiting' : ' dead';
    const staleTag = o.stale ? '<span class="stale-tag">stale</span>' : '';
    const body = o.ok
      ? `<div class="organ-reading">${key === 'voice' ? 'Lives in your browser — press “Make Pete speak”.' : readingText(key, o)}</div>`
      : o.awaiting
        ? `<div class="organ-awaiting">⌂ No home yet — choose where Pete lives below and this organ wakes up. Nothing is faked in the meantime.</div>`
        : `<div class="organ-error">✖ ${escapeHtml(o.error || 'no answer')}<br>This part is grey. Pete will not fake it.</div>`;
    // A stale reading keeps its ORIGINAL read time and says so — it is a
    // real past reading on loan, never a fresh one in disguise.
    const meta = o.awaiting
      ? 'waiting for a home'
      : o.stale
        ? `stale · read at ${fmtTime(o.fetchedAt)} · the live API did not answer just now`
        : `${o.ok ? 'last reading' : 'last attempt'} ${fmtTime(o.fetchedAt)}${o.cached ? ' · cached' : ''}`;
    return `<div class="organ${deadCls}${o.stale ? ' stale' : ''}" style="animation-delay:${(i * 80).toFixed(0)}ms"><div class="organ-head"><span class="organ-name">${name} ${staleTag}</span><span class="jewel${o.ok ? '' : o.awaiting ? ' awaiting' : ' dead'}${o.stale ? ' stale' : ''}"></span></div>` +
      `<div class="organ-source">${source}</div>${body}` +
      `<div class="organ-meta">${meta}</div></div>`;
  }).join('');

  $('diaryList').innerHTML = payload.diary && payload.diary.length
    ? payload.diary.map((e, i) => `<div class="diary-entry ${e.source === 'template' ? 'template' : ''}" style="animation-delay:${(i * 90).toFixed(0)}ms">${escapeHtml(e.text)}<div class="diary-meta">${fmtTime(e.at)} · state: ${escapeHtml(e.overall)} · <span class="src-tag ${e.source === 'gemini' ? 'src-gemini' : 'src-template'}">${e.source === 'gemini' ? 'written by Gemini' : 'template (no Gemini)'}</span></div></div>`).join('')
    : '<div class="diary-empty">No entries yet.</div>';
}

/* ── Pete's home: chosen by the visitor, kept in this browser ──
   Pete has no fixed home. The visitor picks where he lives (search,
   geolocation, or a preset capital); the choice persists in
   localStorage and rides along on every state request, so Pete's
   face and lungs always read the place THIS visitor housed him in. */
const HOME_KEY = 'patchwork-pete-home';
let peteHome = null;
try {
  const raw = localStorage.getItem(HOME_KEY);
  if (raw) {
    const h = JSON.parse(raw);
    if (h && Number.isFinite(+h.lat) && Number.isFinite(+h.lon) && typeof h.place === 'string' && h.place) {
      peteHome = { lat: +h.lat, lon: +h.lon, place: h.place };
    }
  }
} catch { peteHome = null; }

function homeQuery() {
  return peteHome
    ? `?lat=${encodeURIComponent(peteHome.lat)}&lon=${encodeURIComponent(peteHome.lon)}&place=${encodeURIComponent(peteHome.place)}`
    : '';
}

function setHome(h) {
  peteHome = { lat: +h.lat, lon: +h.lon, place: String(h.place) };
  try { localStorage.setItem(HOME_KEY, JSON.stringify(peteHome)); } catch { /* private mode: he still moves in for this visit */ }
  load();
}

async function load(action) {
  const buttons = document.querySelectorAll('button[data-action]');
  buttons.forEach((b) => (b.disabled = true));
  try {
    const res = action
      ? await fetch(`/api/refresh/${action}${homeQuery()}`, { method: 'POST' })
      : await fetch(`/api/state${homeQuery()}`);
    render(await res.json());
  } catch (err) {
    $('petSummary').textContent = 'The lab itself is unreachable — the server did not answer. Pete cannot fake that either.';
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
document.querySelectorAll('button[data-action]').forEach((b) =>
  b.addEventListener('click', () => load(b.dataset.action)));

/* ── Pete's voice: a stitched monster's delivery ─────────
   Same words as ever — built from Pete's REAL state — but spoken
   like the creature he is: the deepest English voice the visitor's
   browser offers, pitch dropped to 0.4, slowed to 0.86, and the
   line split into short phrases (phrases.js) with a held breath
   between them. Eerie, never garbled. Client-side only. */
const SPOOKY = { pitch: 0.4, rate: 0.86, pauseMs: 320 };
const DEEP_VOICE_HINTS = [
  'google uk english male', 'microsoft guy', 'microsoft christopher', 'microsoft davis',
  'daniel', 'george', 'arthur', 'brian', 'david', 'fred', 'male',
];
function pickSpookyVoice() {
  let voices = [];
  try { voices = speechSynthesis.getVoices() || []; } catch { voices = []; }
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
  const pool = en.length ? en : voices;
  for (const hint of DEEP_VOICE_HINTS) {
    const hit = pool.find((v) => (v.name || '').toLowerCase().includes(hint));
    if (hit) return hit;
  }
  return pool[0] || null;
}
let speakRun = 0;
$('speakBtn').addEventListener('click', async () => {
  if (!('speechSynthesis' in window)) {
    $('petSummary').textContent = 'This browser has no Web Speech voice — Pete stays silent here, honestly.';
    return;
  }
  if (!current) return;
  const s = current.state;
  const fact = current.organs.brain.ok && current.organs.brain.data.currentFact
    ? ` Today I learned about ${current.organs.brain.data.currentFact.title}.` : '';
  const breath = s.scores.breathing === null
    ? (s.awaitingHome ? ' I do not know how my breathing is — I have no home yet, so I have no air.' : ' I do not know how my breathing is — my lungs are silent.')
    : ` My breathing score is ${s.scores.breathing} out of 100.`;
  const homeLine = current.home ? ` I live in ${current.home.name}.` : ' I have no home yet — choose where I live, and my face and lungs will wake up.';
  const text = `${s.summary}${homeLine}${fact}${breath} My health is ${s.scores.health} out of 100.`;
  const phrases = splitPhrases(text);
  if (!phrases.length) return;
  speechSynthesis.cancel();
  const run = ++speakRun;
  // The voice list often arrives asynchronously; give it one short chance.
  if (!speechSynthesis.getVoices().length) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 350);
      speechSynthesis.onvoiceschanged = () => { clearTimeout(timer); speechSynthesis.onvoiceschanged = null; resolve(); };
    });
    if (run !== speakRun) return;
  }
  const voice = pickSpookyVoice();
  let i = 0;
  const speakNext = () => {
    if (run !== speakRun || i >= phrases.length) return;
    const u = new SpeechSynthesisUtterance(phrases[i]);
    if (voice) u.voice = voice;
    u.pitch = SPOOKY.pitch;
    u.rate = SPOOKY.rate;
    u.volume = 1;
    u.onend = () => { i += 1; if (run === speakRun && i < phrases.length) setTimeout(speakNext, SPOOKY.pauseMs); };
    u.onerror = () => { /* a failed phrase ends the line quietly — no chaining on errors */ };
    speechSynthesis.speak(u);
  };
  speakNext();
});

/* ── HAUNT THE LAB: synthesized ambience ─────────────────
   No audio files, nothing recorded: the wind, the distant
   minor-key bell and the old-house creaks are all synthesized
   live with WebAudio when — and only when — a visitor presses
   the toggle (it is OFF by default; browsers demand the click
   anyway). One AudioContext exists for the page's whole life
   and is reused across toggles, so nothing leaks; stopping
   fades the master out, halts every source and timer, and
   suspends the context. Labelled honestly wherever it appears:
   this is generated atmosphere, not a field recording. */
let hauntCtx = null;
let haunt = null;
function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
function hauntStart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    $('petSummary').textContent = 'This browser has no WebAudio — the lab stays silent here, honestly.';
    return;
  }
  if (!hauntCtx) hauntCtx = new AC();
  const ctx = hauntCtx;
  ctx.resume();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 1.4);
  master.connect(ctx.destination);
  const nodes = { sources: [], oscs: [], timers: [], master };

  // — wind: looped noise through a wandering lowpass —
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(ctx, 3);
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 320;
  windFilter.Q.value = 0.6;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
  wind.start();
  nodes.sources.push(wind);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 170;
  lfo.connect(lfoDepth); lfoDepth.connect(windFilter.frequency);
  lfo.start();
  nodes.oscs.push(lfo);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.045;
  const lfo2Depth = ctx.createGain();
  lfo2Depth.gain.value = 0.02;
  lfo2.connect(lfo2Depth); lfo2Depth.connect(windGain.gain);
  lfo2.start();
  nodes.oscs.push(lfo2);

  // — a rare, distant bell in A minor —
  const BELL = [110, 130.81, 146.83, 164.81, 196, 220];
  const bell = () => {
    if (!haunt) return;
    const f = BELL[Math.floor(Math.random() * BELL.length)];
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    g.connect(master);
    [1, 2].forEach((mult, idx) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = idx === 0 ? 1 : 0.35;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 4);
      nodes.oscs.push(o);
    });
    nodes.timers.push(setTimeout(bell, 15000 + Math.random() * 18000));
  };
  nodes.timers.push(setTimeout(bell, 4000));

  // — an occasional soft creak, like the manor settling —
  const creak = () => {
    if (!haunt) return;
    if (Math.random() < 0.75) {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.5);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 9;
      bp.frequency.setValueAtTime(750 + Math.random() * 250, t);
      bp.frequency.exponentialRampToValueAtTime(240, t + 0.38);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.09);
      g.gain.linearRampToValueAtTime(0, t + 0.42);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + 0.5);
      nodes.sources.push(src);
    }
    nodes.timers.push(setTimeout(creak, 9000 + Math.random() * 14000));
  };
  nodes.timers.push(setTimeout(creak, 6500));

  haunt = nodes;
  const btn = $('hauntBtn');
  btn.textContent = 'Silence the Lab';
  btn.setAttribute('aria-pressed', 'true');
  btn.classList.add('haunting');
}
function hauntStop() {
  if (!haunt) return;
  const h = haunt;
  haunt = null; // timers check this and die quietly
  h.timers.forEach(clearTimeout);
  const ctx = hauntCtx;
  const t = ctx.currentTime;
  h.master.gain.cancelScheduledValues(t);
  h.master.gain.setValueAtTime(h.master.gain.value, t);
  h.master.gain.linearRampToValueAtTime(0, t + 0.6);
  setTimeout(() => {
    h.sources.forEach((s) => { try { s.stop(); } catch { /* already silent */ } });
    h.oscs.forEach((o) => { try { o.stop(); } catch { /* already silent */ } });
    try { h.master.disconnect(); } catch { /* nothing to undo */ }
    if (hauntCtx && hauntCtx.state === 'running') hauntCtx.suspend();
  }, 700);
  const btn = $('hauntBtn');
  btn.textContent = 'Haunt the Lab';
  btn.setAttribute('aria-pressed', 'false');
  btn.classList.remove('haunting');
}
$('hauntBtn').addEventListener('click', () => { if (haunt) hauntStop(); else hauntStart(); });

/* ---------- the home picker: where shall Pete live? ---------- */
const PRESETS = [
  ['New Delhi, India', 28.6139, 77.209],
  ['Tokyo, Japan', 35.6762, 139.6503],
  ['London, United Kingdom', 51.5074, -0.1278],
  ['New York, United States', 40.7128, -74.006],
  ['Sydney, Australia', -33.8688, 151.2093],
  ['Jakarta, Indonesia', -6.2088, 106.8456],
];
$('presets').innerHTML = PRESETS.map(([name, la, lo]) =>
  `<button class="preset" data-place="${name}" data-lat="${la}" data-lon="${lo}">${name.split(',')[0]}</button>`).join('');
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () =>
  setHome({ lat: b.dataset.lat, lon: b.dataset.lon, place: b.dataset.place })));

$('movePeteBtn').addEventListener('click', () => {
  $('homePicker').scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => $('citySearch').focus({ preventScroll: true }), 450);
});

$('geoBtn').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    $('homeStatus').textContent = 'This browser cannot share its location — try a city search or a preset capital instead.';
    return;
  }
  $('homeStatus').textContent = 'Asking your browser for your location…';
  navigator.geolocation.getCurrentPosition(
    (pos) => setHome({ lat: pos.coords.latitude, lon: pos.coords.longitude, place: 'Your location' }),
    () => { $('homeStatus').textContent = 'Location was not shared — no hard feelings. A preset capital works too.'; },
    { timeout: 10000 }
  );
});

let searchTimer = null;
$('citySearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const box = $('searchResults');
  if (q.length < 2) { box.style.display = 'none'; return; }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!json.results.length) { box.style.display = 'none'; return; }
      box.innerHTML = json.results.map((r) =>
        `<div data-lat="${r.lat}" data-lon="${r.lon}" data-place="${escapeHtml(r.place)}">${escapeHtml(r.place)}</div>`).join('');
      box.style.display = 'block';
      box.querySelectorAll('div').forEach((d) => d.addEventListener('click', () => {
        box.style.display = 'none';
        $('citySearch').value = d.dataset.place;
        setHome({ lat: d.dataset.lat, lon: d.dataset.lon, place: d.dataset.place });
      }));
    } catch { box.style.display = 'none'; }
  }, 300);
});

load();
setInterval(() => load(), 120000);
// The veil must never trap the page: lift it even if the first reading is slow.
setTimeout(() => document.body.classList.add('revealed'), 2600);
