'use strict';

/* Patchwork Pete — browser side.
   Pete is drawn pixel by pixel on a canvas. Every body part takes its colour
   from its organ's LIVE state: a dead organ's part is drawn grey, and a
   limping Pete visibly tilts and drags one leg. Voice is the Web Speech API. */

const canvas = document.getElementById('peteCanvas');
const ctx = canvas.getContext('2d');
const P = 12; // pixel size
let current = null; // last /api/state payload
let lastBpm = null; // Pete's derived heartbeat from the last live heart reading
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
/* Inline SVG icons (UI UX Pro Max checklist: no emoji as icons) */
const IC = (inner, fill) => `<svg class="ic" viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${inner}</svg>`;
const ICONS = {
  heart: IC('<path d="M12 20.3C6.9 16.4 3.6 13.1 3.6 9.4 3.6 6.5 5.7 4.6 8.1 4.6c1.5 0 3 .8 3.9 2.1.9-1.3 2.4-2.1 3.9-2.1 2.4 0 4.5 1.9 4.5 4.8 0 3.7-3.3 7-8.4 10.9z"/>'),
  weather: IC('<circle cx="7.2" cy="6.8" r="2.4"/><path d="M7.2 1.8v1.4M2.4 6.8h1.4M4 3.2l1 1M10.4 3.2l-1 1"/><path d="M8 20.2h9.3a3.9 3.9 0 0 0 .8-7.7 5.4 5.4 0 0 0-10.3 1.2A3.1 3.1 0 0 0 8 20.2z"/>'),
  air: IC('<path d="M3 8.2h9.3a2.6 2.6 0 1 0-2.5-3.4"/><path d="M2.6 12.6h13.6a2.6 2.6 0 1 1-2.5 3.4"/><path d="M3 16.8h5.5"/>'),
  brain: IC('<path d="M12 6.2C10.2 4.7 8 4.2 5.4 4.2H4v13.6h1.4c2.6 0 4.8.5 6.6 2 1.8-1.5 4-2 6.6-2H20V4.2h-1.4c-2.6 0-4.8.5-6.6 2z"/><path d="M12 6.2v13.6"/>'),
  stomach: IC('<path d="M4.5 16.8a7.5 7.5 0 0 1 15 0"/><path d="M2.8 16.8h18.4"/><path d="M2.8 20.4h18.4"/><circle cx="12" cy="7.4" r="1.1"/>'),
  voice: IC('<path d="M4 9.5v5h3.5L12 18.6V5.4L7.5 9.5H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.8a7.4 7.4 0 0 1 0 10.4"/>'),
  diary: IC('<path d="M6.5 3.6H18a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.8A1.8 1.8 0 0 1 5 19.2V5.4a1.8 1.8 0 0 1 1.5-1.8z"/><path d="M14.8 3.6v5.6l-2.1-1.5-2.1 1.5V3.6"/>'),
};
const ORGAN_META = [
  ['heart', ICONS.heart + 'Heart', 'CoinGecko public API — BTC/USD'],
  ['mood', ICONS.weather + 'Face / Mood', 'Open-Meteo weather — where Pete lives'],
  ['lungs', ICONS.air + 'Lungs', 'Open-Meteo Air Quality — where Pete lives'],
  ['brain', ICONS.brain + 'Brain', 'Wikipedia — random article'],
  ['stomach', ICONS.stomach + 'Stomach', 'GitHub commits — @Revaaa28'],
  ['voice', ICONS.voice + 'Voice', 'Web Speech API — your browser'],
];

/* ── "IT'S ALIVE!" — fires once per visit, the first time every data
   organ reads alive at once (e.g. right after Pete gets a home and his
   face + lungs wake). Pure theatre on top of real state; nothing faked. ── */
let aliveCelebrated = false;
function maybeCelebrateAlive(payload) {
  if (aliveCelebrated) return;
  const keys = ['heart', 'mood', 'lungs', 'brain', 'stomach'];
  const organs = payload.organs || {};
  if (!keys.every((k) => organs[k] && organs[k].ok)) return;
  aliveCelebrated = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setTimeout(() => {
    document.body.classList.add('alive-strike');
    setTimeout(() => document.body.classList.remove('alive-strike'), 3000);
  }, 1100);
}

function render(payload) {
  current = payload;
  const s = payload.state;
  const badge = $('overallBadge');
  badge.textContent = '● ' + s.overall.toUpperCase();
  badge.className = 'badge badge-' + s.overall;
  $('petSummary').textContent = s.summary;
  document.body.classList.add('revealed');
  maybeCelebrateAlive(payload);

  /* ── feed the living atmosphere with the REAL readings ── */
  const heart = payload.organs.heart;
  ATMO.heartAlive = !!(heart && heart.ok);
  if (ATMO.heartAlive) {
    const chg = Number(heart.data.change24hPct) || 0;
    ATMO.bpm = Math.max(42, Math.min(126, Math.round(50 + Math.abs(chg) * 9 + (s.scores.energy - 50) * 0.18)));
    lastBpm = ATMO.bpm;
    ATMO.heartText = `BTC $${Number(heart.data.priceUsd).toLocaleString('en-US')} · 24h ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
  } else {
    lastBpm = null;
    ATMO.heartText = '';
  }
  $('ecgLabel').innerHTML = ATMO.heartAlive
    ? `${ICONS.heart}<b>${ATMO.bpm} BPM</b> — Pete's heartbeat, set by the market · ${escapeHtml(ATMO.heartText)}`
    : ICONS.heart + 'flatline — the heart organ is silent. Pete will not fake a pulse.';

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
    // The ledger names the source that ACTUALLY produced the reading —
    // the payload's own `source` wins over the static label, so a
    // labelled fallback (Coinbase, MET Norway, …) shows as itself.
    const srcLabel = (o && o.source) || source;
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
      `<div class="organ-source">${escapeHtml(srcLabel)}</div>${body}` +
      `<div class="organ-meta">${meta}</div></div>`;
  }).join('');

  renderMenu();
}

/* ── THE DATA MENU ─────────────────────────────────────────
   Six tabs, one per organ, each opening the organ's REAL
   reading — the fields the serving API actually returned,
   the source that served them, the read time, and a stale
   badge when the reading is a last-good on loan. A field a
   source did not return is simply absent from the panel:
   the menu never fills a gap with a plausible number. */
let activeMenu = 'weather';
document.querySelectorAll('.menu-tab').forEach((b) => b.addEventListener('click', () => {
  activeMenu = b.dataset.menu;
  document.querySelectorAll('.menu-tab').forEach((x) => x.classList.toggle('active', x === b));
  renderMenu();
}));

const prettyCondition = (c) => String(c || '').replace(/-/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
const AQI_BANDS = {
  clean: ['Good', 'Clean air — Pete breathes deep and easy. This is the air lungs are made for.'],
  moderate: ['Moderate', 'Acceptable air — Pete breathes on without trouble, though the air is not pristine.'],
  'unhealthy-sensitive': ['Unhealthy for sensitive groups', 'Most people breathe on, but sensitive lungs feel this air — Pete\'s breaths get shorter and shallower.'],
  haze: ['Unhealthy', 'Hazy air — every breath is work. Pete coughs, and his stitched lungs turn grey-brown.'],
  'severe-haze': ['Very unhealthy', 'Thick, dangerous haze — breathing hurts. Pete coughs hard and stays wrapped in smoke.'],
};

function menuMeta(o, fallbackSource) {
  if (!o) return '';
  const staleNote = o.stale
    ? `<div class="menu-stale-note">This is the last real reading — the live API did not answer just now${o.error ? `: ${escapeHtml(o.error)}` : ''}</div>`
    : '';
  return `<div class="menu-meta"><span>Source · <b>${escapeHtml(o.source || fallbackSource || '')}</b></span>` +
    `<span>${o.stale ? '<span class="stale-tag">stale</span> ' : ''}${o.ok ? 'read' : 'attempted'} at ${fmtTime(o.fetchedAt)}${o.cached ? ' · cached' : ''}</span></div>${staleNote}`;
}
function fieldGrid(rows) {
  const kept = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!kept.length) return '';
  return `<div class="field-grid">${kept.map(([label, v]) =>
    `<div class="field"><div class="field-label">${label}</div><div class="field-value">${v}</div></div>`).join('')}</div>`;
}
function organProblem(o, awaitingText) {
  if (!o) return '<div class="diary-empty">This organ has not reported yet.</div>';
  if (o.awaiting) return `<div class="organ-awaiting">⌂ ${awaitingText}</div>`;
  if (!o.ok) return `<div class="organ-error">✖ ${escapeHtml(o.error || 'no answer')}<br>This organ is grey right now. Pete will not fake its reading — try again in a little while.</div>`;
  return null;
}

function renderMenu() {
  const box = $('menuPanel');
  if (!box) return;
  if (!current) { box.innerHTML = '<div class="diary-empty">Waking Pete…</div>'; return; }
  const organs = current.organs;
  const awaitingWeather = 'No home yet — choose where Pete lives in the picker above, and his face will read that place\'s weather. Nothing is faked in the meantime.';
  const awaitingAir = 'No home yet — choose where Pete lives in the picker above, and his lungs will breathe that place\'s air. Nothing is faked in the meantime.';

  if (activeMenu === 'weather') {
    const o = organs.mood;
    const problem = organProblem(o, awaitingWeather);
    if (problem) { box.innerHTML = problem; return; }
    const d = o.data || {};
    box.innerHTML = menuMeta(o) + fieldGrid([
      ['Condition', `<b>${escapeHtml(prettyCondition(d.condition))}</b>`],
      ['Temperature', d.temperatureC != null ? `${d.temperatureC} °C` : null],
      ['Feels like', d.feelsLikeC != null ? `${d.feelsLikeC} °C` : null],
      ['Humidity', d.humidityPct != null ? `${d.humidityPct}%` : null],
      ['Pressure', d.pressureHpa != null ? `${d.pressureHpa} hPa` : null],
      ['Wind', d.windKmh != null ? `${d.windKmh} km/h` : null],
      ['Where', d.location ? escapeHtml(d.location) : null],
    ]) + '<p class="menu-note">This is the sky over the place Pete currently lives — his face wears it, and the light in his chamber follows it.</p>';
    return;
  }

  if (activeMenu === 'air') {
    const o = organs.lungs;
    const problem = organProblem(o, awaitingAir);
    if (problem) { box.innerHTML = problem; return; }
    const d = o.data || {};
    const band = AQI_BANDS[d.condition] || null;
    box.innerHTML = menuMeta(o) + fieldGrid([
      ['PM2.5', d.pm25 != null ? `${d.pm25} µg/m³` : null],
      ['PM10', d.pm10 != null ? `${d.pm10} µg/m³` : null],
      ['US AQI', d.aqiUs != null ? String(d.aqiUs) : null],
      ['EU AQI', d.aqiEu != null ? String(d.aqiEu) : null],
      ['Fire hotspots · 24h', typeof d.fireHotspots24h === 'number' ? String(d.fireHotspots24h) : null],
    ]) + (band ? `<p class="menu-note"><b>${band[0]}.</b> ${band[1]}</p>` : '')
      + (typeof d.fireHotspots24h !== 'number' && d.fireSource
        ? `<p class="menu-note dim-note">🔥 ${escapeHtml(d.fireSource)}</p>` : '');
    return;
  }

  if (activeMenu === 'heart') {
    const o = organs.heart;
    const problem = organProblem(o, '');
    if (problem) { box.innerHTML = problem; return; }
    const d = o.data || {};
    box.innerHTML = menuMeta(o) + fieldGrid([
      ['Bitcoin', d.priceUsd != null ? `$${Number(d.priceUsd).toLocaleString('en-US')}` : null],
      ['24h change', d.change24hPct != null ? `${d.change24hPct >= 0 ? '+' : ''}${Number(d.change24hPct).toFixed(2)}%` : null],
      ['Pete\'s heartbeat', lastBpm ? `${lastBpm} BPM` : null],
      ['Served by', d.source ? escapeHtml(d.source) : null],
    ]) + '<p class="menu-note">The market sets the tempo of Pete\'s chest — watch the gold ECG line under the stage beat at exactly this rate.</p>';
    return;
  }

  if (activeMenu === 'brain') {
    const o = organs.brain;
    if (!o || (!o.ok && !(o.data && o.data.currentFact))) {
      box.innerHTML = organProblem(o, '') ||
        `<div class="organ-error">✖ ${escapeHtml((o && o.error) || 'no answer')}</div>`;
      return;
    }
    const d = o.data || {};
    const fact = d.currentFact;
    const memory = Array.isArray(d.memory) ? d.memory : [];
    box.innerHTML = menuMeta(o)
      + (o.ok ? '' : `<div class="menu-stale-note">Wikipedia did not answer just now — Pete is reciting what he already knows${o.error ? `: ${escapeHtml(o.error)}` : ''}</div>`)
      + (fact ? `<div class="fact-now"><div class="field-label">Pete is thinking about</div>
          <a href="${fact.url || '#'}" target="_blank" rel="noopener">${escapeHtml(fact.title)}</a>
          <p>${escapeHtml(fact.extract || '')}</p></div>` : '<div class="diary-empty">His head is empty — press “Teach Pete”.</div>')
      + (memory.length > 1 ? `<div class="field-label list-label">Everything Pete has learned this visit</div><div class="menu-list">${
          memory.map((f) => `<div class="menu-list-item"><a href="${f.url || '#'}" target="_blank" rel="noopener">${escapeHtml(f.title)}</a><span class="item-meta">learned ${fmtTime(f.learnedAt)}</span></div>`).join('')
        }</div>` : '')
      + '<p class="menu-note">Press “Teach Pete” on the stage and a new fact is stitched in — he remembers the last five.</p>';
    return;
  }

  if (activeMenu === 'stomach') {
    const o = organs.stomach;
    const problem = organProblem(o, '');
    if (problem) { box.innerHTML = problem; return; }
    const d = o.data || {};
    const commits = Array.isArray(d.recentCommits) ? d.recentCommits : [];
    box.innerHTML = menuMeta(o) + fieldGrid([
      ['Commits eaten today', String(d.commitsToday)],
      ['Pushes today', String(d.pushesToday)],
      ['Counting in', d.timezone ? escapeHtml(d.timezone) : null],
      ['Last bite', d.lastPushAt ? fmtTime(d.lastPushAt) : null],
    ])
      + (d.method === 'push-fallback'
        ? '<p class="menu-note">GitHub\'s commits API did not answer for every repo today, so part of this count falls back to one serving per push — the messages below are only the commits that were really fetched.</p>'
        : '')
      + (commits.length
        ? `<div class="field-label list-label">Today's commits — his actual meals</div><div class="menu-list">${
            commits.map((c) => `<div class="menu-list-item">${c.url
              ? `<a href="${c.url}" target="_blank" rel="noopener">${escapeHtml(c.message)}</a>`
              : escapeHtml(c.message)}<span class="item-meta">${escapeHtml(String(c.repo || '').split('/').pop() || '')} · ${fmtTime(c.at)}</span></div>`).join('')
          }</div>`
        : (d.commitsToday > 0
          ? '<p class="menu-note">The count above is real, but no commit messages were fetched for it.</p>'
          : '<p class="menu-note">No commits yet today — Pete is hungry. His belly lightens with every fresh commit.</p>'));
    return;
  }

  // diary
  const entries = current.diary || [];
  box.innerHTML = entries.length
    ? `<div class="diary-list">${entries.map((e, i) => `<div class="diary-entry ${e.source === 'template' ? 'template' : ''}" style="animation-delay:${(i * 90).toFixed(0)}ms">${escapeHtml(e.text)}<div class="diary-meta">${fmtTime(e.at)} · state: ${escapeHtml(e.overall)} · <span class="src-tag ${e.source === 'gemini' ? 'src-gemini' : 'src-template'}">${e.source === 'gemini' ? 'written by Gemini' : 'template (no Gemini)'}</span></div></div>`).join('')}</div>`
    : '<div class="diary-empty">No entries yet — Pete is still waking up.</div>';
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
  const hadHome = !!peteHome;
  peteHome = { lat: +h.lat, lon: +h.lon, place: String(h.place) };
  try { localStorage.setItem(HOME_KEY, JSON.stringify(peteHome)); } catch { /* private mode: he still moves in for this visit */ }
  load().then(() => {
    // First home ever: the guided flow lands the visitor on the data
    // menu, now fully unlocked. Later moves stay where the visitor is.
    if (!hadHome) $('dataMenu').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
   minor-key bell, the old-house creaks and the original
   music-box phrase are all synthesized live with WebAudio
   when — and only when — a visitor presses the toggle (it is
   OFF by default; browsers demand the click anyway). One
   AudioContext exists for the page's whole life and is reused
   across toggles, so nothing leaks; stopping fades the master
   out, halts every source and timer, and suspends the context.
   Labelled honestly wherever it appears: this is generated
   atmosphere, not a field recording. */
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

  // — an original music-box phrase, played by a haunted toy —
  // The note table lives in melody.js and is deliberately sparse:
  // fourteen A-minor notes with uneven, hesitant spacing, then
  // 12-18 seconds in which only the wind remains. Each note is a
  // sine fundamental with two decaying harmonics; the table's
  // few-cents detune offsets make the mechanism sound old and
  // worn without turning the phrase into a parody of bad tuning.
  const melody = window.PETE_MELODY;
  if (melody) {
    const melodyBus = ctx.createGain();
    melodyBus.gain.value = 0.9;
    melodyBus.connect(master);
    nodes.melodyBus = melodyBus;

    const playMusicBoxNote = (note, phraseStart) => {
      const t = phraseStart + note.startSec;
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.exponentialRampToValueAtTime(0.075 * note.velocity, t + 0.008);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t + note.ringSec);
      noteGain.connect(melodyBus);
      [[1, 1], [2, 0.28], [3, 0.1]].forEach(([harmonic, level]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = melody.midiToFrequency(note.midi) * harmonic;
        osc.detune.value = note.detuneCents;
        const partialGain = ctx.createGain();
        partialGain.gain.value = level;
        osc.connect(partialGain); partialGain.connect(noteGain);
        osc.start(t); osc.stop(t + note.ringSec + 0.05);
        nodes.oscs.push(osc);
      });
    };

    const scheduleMelody = () => {
      if (haunt !== nodes) return; // a stopped or replaced session stays silent
      const phraseStart = ctx.currentTime + 0.05;
      melody.notes.forEach((note) => playMusicBoxNote(note, phraseStart));
      const pauseSec = melody.pauseMinSec +
        Math.random() * (melody.pauseMaxSec - melody.pauseMinSec);
      nodes.timers.push(setTimeout(
        scheduleMelody,
        (melody.phraseEndSec + pauseSec) * 1000,
      ));
    };
    // Let the wind establish itself before the toy first wakes.
    nodes.timers.push(setTimeout(scheduleMelody, 2100));
  }

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
    // If a new haunt has already started, it owns the shared context now.
    if (!haunt && hauntCtx && hauntCtx.state === 'running') hauntCtx.suspend();
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

/* ── THE GUIDE: a four-step welcome (tutorial v2) ─────────
   First visit only: an elegant little tour — meet Pete, learn
   that his organs are real data sources, choose his home, then
   open the Data Menu. The v2 key means visitors who finished
   the old 3-step tour are offered this clearer one once; after
   that it is remembered in localStorage ('seen' is per
   browser, like Pete's home), never shown uninvited again, and
   the GUIDE button in the header reopens it on demand. Steps
   carry real action buttons: the tour does not just describe
   the picker and the menu, it takes the visitor to them. */
const GUIDE_KEY = 'patchwork-pete-guide-v2-seen';
const GUIDE_STEPS = [
  {
    title: 'Meet Pete',
    body: `<p>Pete is <b>one shared pet, sewn — not born — from live, incompatible APIs</b>. He is not a picture of a pet: every part of his body is a real data source, breathing real numbers, right now.</p><p>And he has no home of his own. <b>He moves in with you</b> — you choose where he lives, and he lives there.</p>`,
  },
  {
    title: 'His Organs Are Data',
    body: `<p>Each stitch is a living feed:</p><ul class="guide-organs">
      <li>${ICONS.heart}<b>Heart</b> — the Bitcoin market</li>
      <li>${ICONS.weather}<b>Face</b> — the weather where he lives</li>
      <li>${ICONS.air}<b>Lungs</b> — the air quality where he lives</li>
      <li>${ICONS.brain}<b>Brain</b> — Wikipedia, one fact at a time</li>
      <li>${ICONS.stomach}<b>Stomach</b> — GitHub commits are his food</li>
      <li>${ICONS.voice}<b>Voice</b> — your own browser, deep and haunted</li>
      <li>${ICONS.diary}<b>Diary</b> — written from his real state, never invented</li></ul>
      <p>If an API dies, that organ goes grey and Pete limps. <b>He never fakes a reading.</b></p>`,
  },
  {
    title: 'Choose His Home',
    body: `<p>Pete wakes up <b>where you house him</b>. Search any country or city, tap “Use My Location”, or pick a capital — his face wears that sky and his lungs breathe that air, and the choice is remembered in your browser.</p><p>Try it right now, or keep walking the tour first:</p><p><button type="button" class="guide-action" data-guide-action="home">Open the home picker</button></p>`,
  },
  {
    title: 'Read Him in the Data Menu',
    body: `<p>Below the stage, the <b>Data Menu</b> opens each organ's real reading — not just a score: the actual temperature and wind, the actual PM2.5 and AQI with what that band means for breathing, the actual Bitcoin price beating in his chest, today's commits in his stomach, and his diary.</p><p>Then play: <b>Feed Pete</b>, <b>Teach Pete</b>, make him <b>Speak</b>, or <b>Haunt the Lab</b> and listen for the music box.</p><p><button type="button" class="guide-action" data-guide-action="menu:air">Try the Air menu</button> <button type="button" class="guide-action" data-guide-action="menu:heart">Try the Heart menu</button></p>`,
  },
];
let guideStep = 0;
function renderGuideStep() {
  const step = GUIDE_STEPS[guideStep];
  $('guideStepLabel').textContent = `Step ${guideStep + 1} of ${GUIDE_STEPS.length}`;
  $('guideTitle').textContent = step.title;
  $('guideBody').innerHTML = step.body;
  $('guideDots').innerHTML = GUIDE_STEPS.map((_, i) => `<span class="${i === guideStep ? 'on' : ''}"></span>`).join('');
  $('guideBack').disabled = guideStep === 0;
  $('guideNext').textContent = guideStep === GUIDE_STEPS.length - 1
    ? (peteHome ? 'Open the Data Menu' : 'Choose Pete\'s Home')
    : 'Next';
}
function showGuide() {
  guideStep = 0;
  renderGuideStep();
  $('guideOverlay').hidden = false;
}
function closeGuide(dest) {
  $('guideOverlay').hidden = true;
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* private mode: the tour simply returns next visit */ }
  if (dest === 'menu') {
    $('dataMenu').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (dest === 'home' || !peteHome) {
    $('homePicker').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (dest === 'home') setTimeout(() => { const s = $('citySearch'); if (s) s.focus({ preventScroll: true }); }, 650);
  } else {
    $('dataMenu').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
// The tour's own action buttons: they end the tour by DOING the
// step — opening the picker, or opening the Data Menu on a tab.
$('guideBody').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-guide-action]');
  if (!btn) return;
  const action = btn.dataset.guideAction;
  if (action === 'home') { closeGuide('home'); return; }
  if (action.startsWith('menu:')) {
    const tab = action.slice(5);
    const tabBtn = document.querySelector(`.menu-tab[data-menu="${tab}"]`);
    if (tabBtn) tabBtn.click();
    closeGuide('menu');
  }
});
$('guideNext').addEventListener('click', () => {
  if (guideStep < GUIDE_STEPS.length - 1) { guideStep += 1; renderGuideStep(); }
  else closeGuide();
});
$('guideBack').addEventListener('click', () => {
  if (guideStep > 0) { guideStep -= 1; renderGuideStep(); }
});
$('guideSkip').addEventListener('click', closeGuide);
$('guideBtn').addEventListener('click', showGuide);

load();
setInterval(() => load(), 120000);
// First visit: offer the tour once the veil has had its moment.
try {
  if (!localStorage.getItem(GUIDE_KEY)) setTimeout(showGuide, 1400);
} catch { /* storage unavailable: no tour, no trap */ }
// The veil must never trap the page: lift it even if the first reading is slow.
setTimeout(() => document.body.classList.add('revealed'), 2600);
