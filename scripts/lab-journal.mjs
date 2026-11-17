// Lab Journal generator — run by Pete's keeper (elle) from outside the
// server. It reads Pete's LIVE public state for a round of preset cities,
// appends a timestamped entry to journal/<YYYY-MM-DD>.md, and leaves the
// git commit/push to the caller.
//
// Why this exists: Pete's stomach eats the @Revaaa28 GitHub commits of the
// day. His keeper commits his journal back into his own repo several times
// a day — real readings taken at commit time, never padded or invented.
// If a reading fails, the entry says so; a failed round is still a true
// entry about that moment.

const BASE = process.env.PETE_BASE_URL || 'https://patchwork-pete.onrender.com';

const ROUND = [
  { place: 'New Delhi, India', lat: 28.61, lon: 77.21 },
  { place: 'Tokyo, Japan', lat: 35.68, lon: 139.69 },
  { place: 'London, United Kingdom', lat: 51.51, lon: -0.13 },
  { place: 'New York, United States', lat: 40.71, lon: -74.01 },
  { place: 'Sydney, Australia', lat: -33.87, lon: 151.21 },
  { place: 'Jakarta, Indonesia', lat: -6.21, lon: 106.85 },
];

async function getState(stop) {
  const q = new URLSearchParams({ lat: stop.lat, lon: stop.lon, place: stop.place });
  const res = await fetch(`${BASE}/api/state?${q}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function organLine(name, organ) {
  if (!organ) return `- **${name}:** no reading`;
  if (!organ.ok) return `- **${name}:** unavailable — ${organ.error || 'the API did not answer'}`;
  const stale = organ.stale ? ' _(stale — last good reading)_' : '';
  return { organ, stale };
}

const now = new Date();
const iso = now.toISOString();
const day = iso.slice(0, 10);
const lines = [];
lines.push(`## ${iso} — keeper's round`);
lines.push('');

let heartLine = '- **Heart:** no reading';
for (const stop of ROUND) {
  let s;
  try {
    s = await getState(stop);
  } catch (err) {
    lines.push(`### ${stop.place}`);
    lines.push(`- Pete could not be read here this round (${err.message}).`);
    lines.push('');
    continue;
  }
  const o = s.organs || {};
  if (heartLine.includes('no reading') && o.heart && o.heart.ok && o.heart.data) {
    heartLine = `- **Heart:** BTC $${Number(o.heart.data.priceUsd).toLocaleString('en-US')} (${o.heart.data.change24hPct >= 0 ? '+' : ''}${Number(o.heart.data.change24hPct).toFixed(2)}% / 24h) via ${o.heart.data.source}${o.heart.stale ? ' _(stale)_' : ''}`;
  }
  const mood = o.mood && o.mood.ok && o.mood.data
    ? `${o.mood.data.condition}, ${o.mood.data.tempC ?? o.mood.data.temperatureC ?? '—'}°C via ${o.mood.data.source}${o.mood.stale ? ' _(stale)_' : ''}`
    : `unavailable${o.mood && o.mood.error ? ` — ${o.mood.error}` : ''}`;
  const lungs = o.lungs && o.lungs.ok && o.lungs.data
    ? `US AQI ${o.lungs.data.aqiUs}, PM2.5 ${o.lungs.data.pm25} µg/m³${o.lungs.stale ? ' _(stale)_' : ''}`
    : `unavailable${o.lungs && o.lungs.error ? ` — ${o.lungs.error}` : ''}`;
  lines.push(`### ${stop.place}`);
  lines.push(`- **Face / mood:** ${mood}`);
  lines.push(`- **Lungs:** ${lungs}`);
  lines.push(`- **Pete there:** ${s.state ? s.state.overall : 'unknown'}`);
  lines.push('');
}
lines.splice(2, 0, heartLine, '');

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
await mkdir('journal', { recursive: true });
const file = `journal/${day}.md`;
const header = `# Lab Journal — ${day}\n\nReal readings from [Patchwork Pete](https://patchwork-pete.onrender.com), committed by his keeper. Pete's stomach eats this repo's commits — this journal is his food, and it is never padded: every number below was read live at the time shown.\n\n`;
const entry = lines.join('\n') + '\n';
if (existsSync(file)) {
  const prev = await readFile(file, 'utf8');
  await writeFile(file, prev.trimEnd() + '\n\n' + entry);
} else {
  await writeFile(file, header + entry);
}
console.log(`journal entry appended to ${file}`);
