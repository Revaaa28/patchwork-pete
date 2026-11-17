'use strict';

// STOMACH — GitHub is Pete's food. Commits pushed "today" — where "today"
// is the local day of the place Pete currently lives (the visitor-chosen
// home's timezone, which Open-Meteo reports alongside its readings).
// No home chosen -> UTC, honestly.
//
// Reality check (verified live 2026-11-17): the GitHub events feed no longer
// includes the commits array in PushEvent payloads (only push_id/ref/head/
// before). So this adapter uses the events feed to find WHICH repos were
// pushed today, then counts real commits via the commits API per repo
// (author = the user, since = home midnight). If the commits API fails
// for a repo, that repo falls back to counting each push as one serving and
// the reading says so in `method` — it never silently invents a number.
//
// Unauthenticated GitHub allows ~60 req/hr per IP and shared IPs get limited
// fast; set GITHUB_TOKEN to raise the limit. On total failure the organ
// returns ok:false — it never invents a meal Pete did not eat.
const { fetchJson, makeKeyedCache } = require('../fetchJson');

const USER = 'Revaaa28';
const EVENTS_URL = `https://api.github.com/users/${USER}/events/public?per_page=100`;
// Keyed by timezone: "today" is the chosen home's local day, so a reading
// counted under one home's midnight must never be served under another's.
const cache = makeKeyedCache(60 * 1000);

function safeTz(tz) {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

// YYYY-MM-DD of `now` in timezone `tz` (falls back to UTC).
function todayInTz(now = new Date(), tz = 'UTC') {
  const zone = safeTz(tz);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// The UTC instant of local midnight (start of todayInTz) in `tz`.
function localMidnightUtcIso(now = new Date(), tz = 'UTC') {
  const zone = safeTz(tz);
  const today = todayInTz(now, zone);
  let guess = new Date(`${today}T00:00:00Z`).getTime();
  for (let i = 0; i < 3; i++) {
    let localMs;
    try {
      localMs = new Date(new Date(guess).toLocaleString('en-US', { timeZone: zone })).getTime();
    } catch {
      localMs = guess;
    }
    const offset = localMs - guess; // how far the zone's clock sits ahead of UTC at `guess`
    const target = new Date(`${today}T00:00:00Z`).getTime() - offset;
    if (target === guess) break;
    guess = target;
  }
  return new Date(guess).toISOString();
}

function todaysPushes(events, now = new Date(), tz = 'UTC') {
  const today = todayInTz(now, tz);
  const pushes = [];
  for (const ev of events || []) {
    if (!ev || ev.type !== 'PushEvent' || !ev.created_at) continue;
    if (todayInTz(new Date(ev.created_at), tz) !== today) continue;
    pushes.push(ev);
  }
  return pushes;
}

// Legacy/test helper: count commits from events payloads when the commits
// array is present; a push without a commits array counts as one serving.
function countCommitsToday(events, now = new Date(), tz = 'UTC') {
  const pushes = todaysPushes(events, now, tz);
  let commits = 0;
  let lastPushAt = null;
  for (const ev of pushes) {
    const arr = ev.payload && Array.isArray(ev.payload.commits) ? ev.payload.commits : null;
    commits += arr && arr.length ? arr.length : 1;
    if (!lastPushAt || ev.created_at > lastPushAt) lastPushAt = ev.created_at;
  }
  return { commitsToday: commits, pushesToday: pushes.length, lastPushAt };
}

// Shape one repo's commits-API response into display entries for the
// data menu: first line of the message, the commit's own timestamp, and
// its GitHub URL when the payload carries one. Malformed entries are
// dropped, never repaired with invented text.
function shapeCommitList(repo, commitsJson) {
  if (!Array.isArray(commitsJson)) return [];
  const out = [];
  for (const c of commitsJson) {
    const commit = c && c.commit;
    const message = commit && typeof commit.message === 'string'
      ? commit.message.split('\n')[0].trim()
      : '';
    const at = (commit && commit.author && commit.author.date)
      || (commit && commit.committer && commit.committer.date)
      || null;
    if (!message || !at) continue;
    out.push({
      repo,
      message,
      at,
      url: typeof c.html_url === 'string' ? c.html_url : null,
    });
  }
  return out;
}

async function getStomach({ force = false, fetchFn, token, retryDelays, sleep, timezone } = {}) {
  const tz = safeTz(timezone);
  const cached = cache.get(tz, force);
  if (cached) return cached;
  const fetchedAt = new Date().toISOString();
  const headers = { Accept: 'application/vnd.github+json' };
  const tok = token !== undefined ? token : process.env.GITHUB_TOKEN;
  if (tok) headers.Authorization = `Bearer ${tok}`;
  try {
    const events = await fetchJson(EVENTS_URL, { fetchFn, headers, retryDelays, sleep });
    if (!Array.isArray(events)) throw new Error('Unexpected GitHub payload shape');
    const pushes = todaysPushes(events, new Date(), tz);
    const lastPushAt = pushes.length ? pushes.map((p) => p.created_at).sort().pop() : null;

    let commitsToday = 0;
    let method = 'commits-api';
    const commitEntries = [];
    if (pushes.length) {
      const repos = [...new Set(pushes.map((p) => p.repo && p.repo.name).filter(Boolean))].slice(0, 5);
      const since = encodeURIComponent(localMidnightUtcIso(new Date(), tz));
      for (const repo of repos) {
        try {
          const commits = await fetchJson(
            `https://api.github.com/repos/${repo}/commits?author=${USER}&since=${since}&per_page=100`,
            { fetchFn, headers, retryDelays, sleep }
          );
          if (!Array.isArray(commits)) throw new Error('Unexpected commits payload');
          commitsToday += commits.length;
          commitEntries.push(...shapeCommitList(repo, commits));
        } catch {
          // Honest fallback for this repo: one serving per push. No
          // commit entries for it — the messages were never fetched.
          method = 'push-fallback';
          commitsToday += pushes.filter((p) => p.repo && p.repo.name === repo).length;
        }
      }
    }
    commitEntries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return cache.set(tz, {
      organ: 'stomach',
      source: `GitHub commits — @${USER}`,
      ok: true,
      data: {
        commitsToday,
        pushesToday: pushes.length,
        lastPushAt,
        user: USER,
        method,
        timezone: tz,
        recentCommits: commitEntries.slice(0, 10),
      },
      error: null,
      fetchedAt,
      cached: false,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const last = cache.getStale(tz);
    if (last && last.ok) {
      // Stale-while-error: yesterday's counted meal, labelled stale with
      // its original fetchedAt. With no last good (e.g. a fresh boot with
      // no GITHUB_TOKEN), the dead organ below stays the honest answer.
      return { ...last, stale: true, error: msg, cached: false };
    }
    return {
      organ: 'stomach',
      source: `GitHub commits — @${USER}`,
      ok: false,
      data: null,
      error: msg,
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getStomach, countCommitsToday, todayInTz, todaysPushes, localMidnightUtcIso, safeTz, shapeCommitList };
