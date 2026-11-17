'use strict';

// STOMACH — GitHub is Pete's food. Commits pushed "today" — where "today"
// is the local day of the place Pete currently lives (the visitor-chosen
// home's timezone, which Open-Meteo reports alongside its readings).
// No home chosen -> UTC, honestly.
//
// Reality check (verified live 2026-11-17): the GitHub events feed no longer
// includes the commits array in PushEvent payloads (only push_id/ref/head/
// before) — and worse, the feed itself lags badly: at 08:53 UTC the public
// feed's newest event was 00:53 UTC, and the repo events feed for a repo
// created that morning was completely empty, while the commits API already
// served the day's real commits. So discovery now works the other way:
// the repos list sorted by pushed_at (fresh, verified against the commits
// API) says WHICH repos were pushed today; the events feed is kept only as
// a secondary source (extra repos + push counts when it has caught up).
// Commits are then counted for real via the commits API per repo
// (since = home midnight, NO author filter: Pete's keeper commits under a
// local git identity that GitHub attributes to no account — verified live
// 2026-11-17, author-login NONE — so an author filter silently dropped
// every meal, including the Lab Journal; these are the owner's own solo
// repos, so commits landing on them today are his ecosystem's work). If the commits API fails
// for a repo, that repo falls back to counting each push as one serving and
// the reading says so in `method` — it never silently invents a number.
//
// Unauthenticated GitHub allows ~60 req/hr per IP and shared IPs get limited
// fast; set GITHUB_TOKEN to raise the limit. On total failure the organ
// returns ok:false — it never invents a meal Pete did not eat.
const { fetchJson, makeKeyedCache } = require('../fetchJson');

const USER = 'Revaaa28';
const EVENTS_URL = `https://api.github.com/users/${USER}/events/public?per_page=100`;
const REPOS_URL = `https://api.github.com/users/${USER}/repos?sort=pushed&direction=desc&per_page=100`;
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

// Repos whose pushed_at falls on "today" in `tz`, freshest first — the
// primary discovery route (the events feed lags; pushed_at does not).
function reposPushedToday(reposJson, now = new Date(), tz = 'UTC') {
  const today = todayInTz(now, tz);
  const out = [];
  for (const r of reposJson || []) {
    if (!r || typeof r.full_name !== 'string' || !r.pushed_at) continue;
    if (todayInTz(new Date(r.pushed_at), tz) !== today) continue;
    out.push({ repo: r.full_name, pushedAt: r.pushed_at });
  }
  out.sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : -1));
  return out;
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
    const now = new Date();
    // Discovery: repos-by-pushed_at (fresh) primary, events feed secondary.
    // Either source may fail or lag on its own; only BOTH failing is fatal.
    let reposJson = null;
    let events = null;
    let firstErr = null;
    try {
      reposJson = await fetchJson(REPOS_URL, { fetchFn, headers, retryDelays, sleep });
      if (!Array.isArray(reposJson)) throw new Error('Unexpected GitHub payload shape');
    } catch (e) { firstErr = e; }
    try {
      events = await fetchJson(EVENTS_URL, { fetchFn, headers, retryDelays, sleep });
      if (!Array.isArray(events)) throw new Error('Unexpected GitHub payload shape');
    } catch (e) { if (!firstErr) firstErr = e; }
    if (!reposJson && !events) throw firstErr || new Error('GitHub did not answer');

    const pushes = events ? todaysPushes(events, now, tz) : [];
    const pushCountByRepo = {};
    for (const p of pushes) {
      const name = p.repo && p.repo.name;
      if (name) pushCountByRepo[name] = (pushCountByRepo[name] || 0) + 1;
    }
    const candidates = reposJson ? reposPushedToday(reposJson, now, tz) : [];
    const seenRepos = new Set(candidates.map((c) => c.repo));
    for (const p of pushes) {
      const name = p.repo && p.repo.name;
      if (name && !seenRepos.has(name)) {
        seenRepos.add(name);
        candidates.push({ repo: name, pushedAt: p.created_at });
      }
    }
    const todaysRepos = candidates.slice(0, 5);
    const lastPushAt = candidates.length
      ? candidates.map((c) => c.pushedAt).filter(Boolean).sort().pop() || null
      : null;

    let commitsToday = 0;
    let method = 'commits-api';
    const commitEntries = [];
    if (todaysRepos.length) {
      const since = encodeURIComponent(localMidnightUtcIso(now, tz));
      for (const { repo } of todaysRepos) {
        try {
          const commits = await fetchJson(
            `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`,
            { fetchFn, headers, retryDelays, sleep }
          );
          if (!Array.isArray(commits)) throw new Error('Unexpected commits payload');
          commitsToday += commits.length;
          commitEntries.push(...shapeCommitList(repo, commits));
        } catch {
          // Honest fallback for this repo: one serving per push the events
          // feed saw, or a single serving when only pushed_at proves the
          // push. No commit entries — the messages were never fetched.
          method = 'push-fallback';
          commitsToday += pushCountByRepo[repo] || 1;
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
        pushesToday: events ? pushes.length : null,
        reposToday: todaysRepos.length,
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

module.exports = { getStomach, countCommitsToday, todayInTz, todaysPushes, reposPushedToday, localMidnightUtcIso, safeTz, shapeCommitList };
