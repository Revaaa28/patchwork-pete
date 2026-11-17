'use strict';

// Data-menu payload contract (UX restructure, 2026-11-17): the menu
// panels show REAL fields, so the adapters must carry them — weather
// extras (feels-like / humidity / pressure) only when the serving
// source actually returned them, and the stomach's recent-commit list
// shaped from the commits-API payloads it already fetches. Missing
// fields stay null/absent; nothing is derived or invented.
// Deterministic and offline: every fetch is a fake.

const test = require('node:test');
const assert = require('node:assert/strict');
const { getMood } = require('../src/organs/mood');
const { getStomach, shapeCommitList } = require('../src/organs/stomach');

const noSleep = async () => {};
const FAST = { retryDelays: [0, 0, 0], sleep: noSleep };
const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

/* ── weather extras: present when the source returns them ─ */

test('mood: Open-Meteo extras (feels-like, humidity, pressure) ride along', async () => {
  const fetchFn = async (url) => {
    assert.match(url, /apparent_temperature/);
    assert.match(url, /relative_humidity_2m/);
    assert.match(url, /pressure_msl/);
    return res(200, {
      timezone: 'Europe/Oslo',
      current: {
        temperature_2m: 4.2, apparent_temperature: 1.1, relative_humidity_2m: 81,
        pressure_msl: 1003.5, weather_code: 3, wind_speed_10m: 14,
      },
    });
  };
  const r = await getMood({ force: true, fetchFn, ...FAST, location: { lat: 59.91, lon: 10.75, place: 'Menu Bay, Testland' } });
  assert.equal(r.ok, true);
  assert.equal(r.data.feelsLikeC, 1.1);
  assert.equal(r.data.humidityPct, 81);
  assert.equal(r.data.pressureHpa, 1003.5);
});

test('mood: extras the payload omits stay null, never invented', async () => {
  const fetchFn = async () => res(200, {
    timezone: 'Europe/Oslo',
    current: { temperature_2m: 4.2, weather_code: 3, wind_speed_10m: 14 },
  });
  const r = await getMood({ force: true, fetchFn, ...FAST, location: { lat: 59.92, lon: 10.76, place: 'Null Fields Bay, Testland' } });
  assert.equal(r.ok, true);
  assert.equal(r.data.feelsLikeC, null);
  assert.equal(r.data.humidityPct, null);
  assert.equal(r.data.pressureHpa, null);
});

/* ── stomach commit-list shaping ────────────────────────── */

test('shapeCommitList: first line only, timestamps kept, malformed dropped', () => {
  const shaped = shapeCommitList('Revaaa28/patchwork-pete', [
    {
      commit: { message: 'Add the haunted menu\n\nA longer body that is not a headline.', author: { date: '2026-11-17T05:00:00Z' } },
      html_url: 'https://github.com/Revaaa28/patchwork-pete/commit/abc',
    },
    { commit: { message: '   ', author: { date: '2026-11-17T04:00:00Z' } } }, // empty headline -> dropped
    { commit: { author: { date: '2026-11-17T03:00:00Z' } } }, // no message -> dropped
    { commit: { message: 'No URL on this one', committer: { date: '2026-11-17T02:00:00Z' } } },
    null,
    'garbage',
  ]);
  assert.equal(shaped.length, 2);
  assert.deepEqual(shaped[0], {
    repo: 'Revaaa28/patchwork-pete',
    message: 'Add the haunted menu',
    at: '2026-11-17T05:00:00Z',
    url: 'https://github.com/Revaaa28/patchwork-pete/commit/abc',
  });
  assert.equal(shaped[1].message, 'No URL on this one');
  assert.equal(shaped[1].at, '2026-11-17T02:00:00Z'); // committer date fallback
  assert.equal(shaped[1].url, null);
  assert.deepEqual(shapeCommitList('x/y', null), []);
  assert.deepEqual(shapeCommitList('x/y', {}), []);
});

test('getStomach: recentCommits are carried, newest first, alongside the count', async () => {
  const nowIso = new Date().toISOString();
  const olderIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const fetchFn = async (url) => {
    if (url.includes('/events/public')) {
      return res(200, [{
        type: 'PushEvent',
        created_at: nowIso,
        repo: { name: 'Revaaa28/patchwork-pete' },
        payload: {},
      }]);
    }
    if (url.includes('/commits')) {
      return res(200, [
        { commit: { message: 'Older bite', author: { date: olderIso } }, html_url: 'https://example.invalid/old' },
        { commit: { message: 'Newest bite', author: { date: nowIso } }, html_url: 'https://example.invalid/new' },
      ]);
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };
  const r = await getStomach({ force: true, fetchFn, token: '', timezone: 'UTC', ...FAST });
  assert.equal(r.ok, true);
  assert.equal(r.data.commitsToday, 2);
  assert.equal(r.data.method, 'commits-api');
  assert.equal(r.data.recentCommits.length, 2);
  assert.equal(r.data.recentCommits[0].message, 'Newest bite');
  assert.equal(r.data.recentCommits[1].message, 'Older bite');
  assert.equal(r.data.recentCommits[0].repo, 'Revaaa28/patchwork-pete');
});
