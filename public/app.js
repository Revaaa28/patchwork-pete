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
   is Borneo's measured AQI, the ECG rate is derived from the real
   BTC 24h move, the breathing rate/depth from the breathing
   score, the scene light from the real home weather condition. */
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
  const limping = s ? s.limping : false;
  const smoky = s ? s.smoky : false;
  const bob = limping ? Math.round(Math.sin(t * 3) * 0.6) : Math.round(Math.sin(t * 1.6) * 1);
  const lean = limping ? Math.sin(t * 3) * 0.05 : 0;
  // Breathing: the whole chest swells at the rate/depth the real
  // breathing score dictates — slow & deep when Borneo's air is clean,
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
  // clean, sliding to grey-brown as smoke thickens, plain grey when dead ----
  const breathing = s ? s.scores.breathing : null;
  const lungC = dead('lungs') ? GREY
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
  if (dead('mood')) {
    px(11, 10, 2, 2, GREY_D); px(18, 10, 2, 2, GREY_D);
    px(13, 14, 5, 1, GREY_D);
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

/* ── Atmosphere canvas: gold dust, embers, and Borneo smoke ──
   One transparent canvas over the chamber. Dust & embers are the
   manor's air; the SMOKE is data — its density is ATMO.smoke,
   derived from Pete's real home US AQI. Clean air: you can barely
   see it. Haze: thick drifts roll across the glass and Pete coughs
   behind them (his cough lives in drawPete). */
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
    case 'lungs': return `Air: <b>${d.condition}</b> · PM2.5 <b>${d.pm25}</b> µg/m³ · PM10 ${d.pm10} · US AQI <b>${d.aqiUs}</b>${typeof d.fireHotspots24h === 'number' ? `<br>🔥 ${d.fireHotspots24h} fire hotspot(s) near home in 24h (NASA FIRMS)` : `<br><span style="color:var(--dim)">🔥 ${escapeHtml(d.fireSource || '')}</span>`}`;
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
  ['mood', '🌦️ Face / Mood', 'Open-Meteo weather — Pete\'s home'],
  ['lungs', '🫁 Lungs', 'Open-Meteo Air Quality — Pete\'s home'],
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
    $('homeLabel').innerHTML = `🏠 Pete lives in <b>${escapeHtml(payload.home.name)}</b> — Borneo, the lungs of the world. His mood and his stitched lungs always read that one benchmark place, so every visitor sees the same Pete.`;
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
    const silent = organKey && payload.organs[organKey] && !payload.organs[organKey].ok;
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
    const deadCls = o.ok ? '' : ' dead';
    const body = o.ok
      ? `<div class="organ-reading">${key === 'voice' ? 'Lives in your browser — press “Make Pete speak”.' : readingText(key, o)}</div>`
      : `<div class="organ-error">✖ ${escapeHtml(o.error || 'no answer')}<br>This part is grey. Pete will not fake it.</div>`;
    return `<div class="organ${deadCls}" style="animation-delay:${(i * 80).toFixed(0)}ms"><div class="organ-head"><span class="organ-name">${name}</span><span class="jewel${o.ok ? '' : ' dead'}"></span></div>` +
      `<div class="organ-source">${source}</div>${body}` +
      `<div class="organ-meta">${o.ok ? 'last reading' : 'last attempt'} ${fmtTime(o.fetchedAt)}${o.cached ? ' · cached' : ''}</div></div>`;
  }).join('');

  $('diaryList').innerHTML = payload.diary && payload.diary.length
    ? payload.diary.map((e, i) => `<div class="diary-entry ${e.source === 'template' ? 'template' : ''}" style="animation-delay:${(i * 90).toFixed(0)}ms">${escapeHtml(e.text)}<div class="diary-meta">${fmtTime(e.at)} · state: ${escapeHtml(e.overall)} · <span class="src-tag ${e.source === 'gemini' ? 'src-gemini' : 'src-template'}">${e.source === 'gemini' ? 'written by Gemini' : 'template (no Gemini)'}</span></div></div>`).join('')
    : '<div class="diary-empty">No entries yet.</div>';
}

async function load(action) {
  const buttons = document.querySelectorAll('button[data-action]');
  buttons.forEach((b) => (b.disabled = true));
  try {
    const res = action
      ? await fetch(`/api/refresh/${action}`, { method: 'POST' })
      : await fetch('/api/state');
    render(await res.json());
  } catch (err) {
    $('petSummary').textContent = 'The lab itself is unreachable — the server did not answer. Pete cannot fake that either.';
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
document.querySelectorAll('button[data-action]').forEach((b) =>
  b.addEventListener('click', () => load(b.dataset.action)));

$('speakBtn').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) {
    $('petSummary').textContent = 'This browser has no Web Speech voice — Pete stays silent here, honestly.';
    return;
  }
  if (!current) return;
  const s = current.state;
  const fact = current.organs.brain.ok && current.organs.brain.data.currentFact
    ? ` Today I learned about ${current.organs.brain.data.currentFact.title}.` : '';
  const breath = s.scores.breathing === null ? ' I do not know how my breathing is — my lungs are silent.' : ` My breathing score is ${s.scores.breathing} out of 100.`;
  const text = `${s.summary}${fact}${breath} My health is ${s.scores.health} out of 100.`;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
});

/* ---------- comparison panel: your air vs Pete's Borneo air ---------- */
const PRESETS = [
  ['Jakarta', -6.2088, 106.8456],
  ['New Delhi, India', 28.6139, 77.209],
  ['Beijing, China', 39.9042, 116.4074],
  ['Los Angeles, USA', 34.0522, -118.2437],
  ['London, UK', 51.5074, -0.1278],
  ['Sydney, Australia', -33.8688, 151.2093],
];
$('presets').innerHTML = PRESETS.map(([name, la, lo]) =>
  `<button class="preset" data-place="${name}" data-lat="${la}" data-lon="${lo}">${name.split(',')[0]}</button>`).join('');
document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () =>
  compare({ lat: b.dataset.lat, lon: b.dataset.lon, place: b.dataset.place })));

$('geoBtn').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    $('compareResult').innerHTML = '<div class="diary-empty">This browser cannot share its location — try a city search or a preset instead.</div>';
    return;
  }
  $('compareResult').innerHTML = '<div class="diary-empty">Asking your browser for your location…</div>';
  navigator.geolocation.getCurrentPosition(
    (pos) => compare({ lat: pos.coords.latitude, lon: pos.coords.longitude, place: 'Your location' }),
    () => { $('compareResult').innerHTML = '<div class="diary-empty">Location was not shared — no hard feelings. A preset works too.</div>'; },
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
        compare({ lat: d.dataset.lat, lon: d.dataset.lon, place: d.dataset.place });
      }));
    } catch { box.style.display = 'none'; }
  }, 300);
});

async function compare({ lat, lon, place }) {
  const box = $('compareResult');
  box.innerHTML = '<div class="diary-empty">Reading your sky and air…</div>';
  try {
    const res = await fetch(`/api/compare?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&place=${encodeURIComponent(place)}`);
    const j = await res.json();
    const yL = j.you.lungs.data, pL = j.pete.lungs.data;
    const yM = j.you.mood.data, pM = j.pete.mood.data;
    const fmt = (v) => (v === null || v === undefined ? '—' : `${v}`);
    const dAqi = j.difference.aqiUs;
    const medalCls = dAqi === null || dAqi === 0 ? '' : dAqi > 0 ? 'diff-up' : 'diff-down';
    const verdict = dAqi === null ? 'no verdict — a reading is missing'
      : dAqi === 0 ? 'dead even — twin skies'
      : dAqi > 0 ? 'your air hangs heavier than Pete\'s'
      : 'your air is cleaner than Pete\'s';
    const portrait = (place, L, M, cls) => `
      <div class="duelist ${cls}">
        <div class="duelist-place">${escapeHtml(place)}</div>
        <div class="duel-aqi">${fmt(L && L.aqiUs)}</div>
        <div class="duel-unit">US AQI</div>
        <div class="duel-cond">${L ? escapeHtml(L.condition) + ' air' : 'no air reading'}</div>
        <div class="duel-rows">PM2.5 ${fmt(L && L.pm25)} µg/m³ · PM10 ${fmt(L && L.pm10)} µg/m³<br>${M ? `${escapeHtml(M.condition)}, ${M.temperatureC}°C · wind ${M.windKmh} km/h` : 'no weather reading'}</div>
      </div>`;
    box.innerHTML = `<div class="duel">
      ${portrait(j.place + ' — you', yL, yM, '')}
      <div class="duel-medal"><span>Δ AQI</span><b class="${medalCls}">${dAqi === null ? '—' : (dAqi > 0 ? '+' : '') + dAqi}</b><small>${verdict}</small></div>
      ${portrait('Pete — ' + j.home.name, pL, pM, 'pete')}
    </div>
    <div class="hint duel-note">${escapeHtml(j.note)}</div>`;
  } catch {
    box.innerHTML = '<div class="diary-empty">The comparison could not be read right now — the sky APIs did not answer.</div>';
  }
}

load();
setInterval(() => load(), 120000);
// The veil must never trap the page: lift it even if the first reading is slow.
setTimeout(() => document.body.classList.add('revealed'), 2600);
