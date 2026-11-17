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

function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * P, y * P, w * P, h * P);
}
function stitch(x, y, w, h) {
  ctx.fillStyle = 'rgba(10,10,14,.85)';
  for (let i = 0; i < Math.max(w, h); i++) {
    if (i % 2 === 0) ctx.fillRect((x + (w >= h ? i : 0)) * P + 4, (y + (h > w ? i : 0)) * P + 4, 4, 4);
  }
}

function drawPete(now) {
  const t = (now - t0) / 1000;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // lab backdrop: moon window + floor
  ctx.fillStyle = '#0d1120'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a2340'; ctx.fillRect(0, 384, canvas.width, 36);
  ctx.fillStyle = '#e8ecf6'; ctx.beginPath(); ctx.arc(316, 44, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d1120'; ctx.beginPath(); ctx.arc(308, 38, 15, 0, Math.PI * 2); ctx.fill();

  const s = current && current.state;
  const organs = current && current.organs;
  const dead = (k) => !organs || !organs[k] || !organs[k].ok;
  const limping = s ? s.limping : false;
  const smoky = s ? s.smoky : false;
  const bob = limping ? Math.round(Math.sin(t * 3) * 0.6) : Math.round(Math.sin(t * 1.6) * 1);
  const lean = limping ? Math.sin(t * 3) * 0.05 : 0;
  // Cough: short violent bursts, only while the home air is hazy.
  const cough = smoky && Math.sin(t * 0.9) > 0.55 ? Math.round(Math.sin(t * 30) * 1) : 0;

  ctx.save();
  ctx.translate(canvas.width / 2, 0);
  ctx.rotate(lean);
  ctx.translate(-canvas.width / 2 + cough * 3, bob * P * 0.4);

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
  const breathePulse = dead('lungs') ? 0 : Math.round(Math.sin(t * 2.2) * 0.4);
  px(10, 20 + breathePulse, 2, 5, lungC); px(19, 20 + breathePulse, 2, 5, lungC);
  px(10, 25 + breathePulse, 1, 1, lungC); px(20, 25 + breathePulse, 1, 1, lungC);
  if (smoky) { // drifting smoke wisps around Pete
    ctx.fillStyle = 'rgba(160,150,140,.35)';
    const w1 = (t * 14) % 90, w2 = (t * 9 + 40) % 90;
    ctx.fillRect(20 + w1, 120 + Math.sin(t * 2) * 6, 26, 7);
    ctx.fillRect(250 - w2, 190 + Math.cos(t * 1.6) * 6, 32, 8);
  }

  // ---- heart on the chest (pulses; grey if the heart organ is dead) ----
  const beat = heartAlive ? 1 + Math.max(0, Math.sin(t * (2 + (s ? s.scores.energy : 50) / 25))) * 0.18 : 1;
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

  if (payload.home) {
    $('homeLabel').innerHTML = `🏠 Pete lives in <b>${escapeHtml(payload.home.name)}</b> — Borneo, the lungs of the world. His mood and his stitched lungs always read that one benchmark place, so every visitor sees the same Pete.`;
  }
  const scoreDefs = [
    ['Health', s.scores.health, 'var(--green)'],
    ['Energy', s.scores.energy, 'var(--amber)'],
    ['Mood', s.scores.mood, 'var(--purple)'],
    ['Breathing', s.scores.breathing, '#ff8fa8'],
    ['Brain', s.scores.brain, '#ff9ec6'],
    ['Fed', s.scores.fed, 'var(--teal)'],
    ['Hunger', s.scores.hunger, 'var(--red)'],
  ];
  $('scores').innerHTML = scoreDefs.map(([label, v, c]) =>
    v === null
      ? `<div class="score-row"><span>${label}</span><div class="score-bar"></div><b>—</b></div>`
      : `<div class="score-row"><span>${label}</span><div class="score-bar"><div class="score-fill" style="width:${v}%;background:${c}"></div></div><b>${v}</b></div>`).join('');

  $('organGrid').innerHTML = ORGAN_META.map(([key, name, source]) => {
    const o = key === 'voice' ? payload.voice : payload.organs[key];
    const deadCls = o.ok ? '' : ' dead';
    const body = o.ok
      ? `<div class="organ-reading">${key === 'voice' ? 'Lives in your browser — press “Make Pete speak”.' : readingText(key, o)}</div>`
      : `<div class="organ-error">✖ ${escapeHtml(o.error || 'no answer')}<br>This part is grey. Pete will not fake it.</div>`;
    return `<div class="organ${deadCls}"><div class="organ-head"><span class="organ-name">${name}</span><span class="dot${o.ok ? '' : ' dead'}"></span></div>` +
      `<div class="organ-source">${source}</div>${body}` +
      `<div class="organ-meta">${o.ok ? 'last reading' : 'last attempt'} ${fmtTime(o.fetchedAt)}${o.cached ? ' · cached' : ''}</div></div>`;
  }).join('');

  $('diaryList').innerHTML = payload.diary && payload.diary.length
    ? payload.diary.map((e) => `<div class="diary-entry ${e.source === 'template' ? 'template' : ''}">${escapeHtml(e.text)}<div class="diary-meta">${fmtTime(e.at)} · state: ${escapeHtml(e.overall)} · <span class="src-tag ${e.source === 'gemini' ? 'src-gemini' : 'src-template'}">${e.source === 'gemini' ? 'written by Gemini' : 'template (no Gemini)'}</span></div></div>`).join('')
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
  ['Jakarta, Indonesia', -6.2088, 106.8456],
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
    const fmt = (v, unit) => (v === null || v === undefined ? '—' : `${v}${unit || ''}`);
    const diffCell = (d, invert) => {
      if (d === null) return '—';
      const worse = invert ? d < 0 : d > 0;
      const cls = d === 0 ? '' : worse ? 'diff-up' : 'diff-down';
      return `<span class="${cls}">${d > 0 ? '+' : ''}${d}</span>`;
    };
    box.innerHTML = `<table class="compare-table">
      <tr><th></th><th>${escapeHtml(j.place)} (you)</th><th>Pete — ${escapeHtml(j.home.name)}</th><th>Difference</th></tr>
      <tr><td>US AQI</td><td>${fmt(yL && yL.aqiUs)}</td><td>${fmt(pL && pL.aqiUs)}</td><td>${diffCell(j.difference.aqiUs)}</td></tr>
      <tr><td>PM2.5 µg/m³</td><td>${fmt(yL && yL.pm25)}</td><td>${fmt(pL && pL.pm25)}</td><td>${diffCell(j.difference.pm25)}</td></tr>
      <tr><td>Air condition</td><td>${yL ? escapeHtml(yL.condition) : 'no reading'}</td><td>${pL ? escapeHtml(pL.condition) : 'no reading'}</td><td></td></tr>
      <tr><td>Weather</td><td>${yM ? `${escapeHtml(yM.condition)}, ${yM.temperatureC}°C` : 'no reading'}</td><td>${pM ? `${escapeHtml(pM.condition)}, ${pM.temperatureC}°C` : 'no reading'}</td><td>${diffCell(j.difference.temperatureC, true)}</td></tr>
    </table>
    <div class="hint">${escapeHtml(j.note)}</div>`;
  } catch {
    box.innerHTML = '<div class="diary-empty">The comparison could not be read right now — the sky APIs did not answer.</div>';
  }
}

load();
setInterval(() => load(), 120000);
