'use strict';

// STOMACH — GitHub is Pete's food. Commits pushed "today" (Pete's home day, Asia/Pontianak).
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
const { fetchJson, makeCache } = require('../fetchJson');

const USER = 'Revaaa28';
const EVENTS_URL = `https://api.github.com/users/${USER}/events/public?per_page=100`;
const cache = makeCache(60 * 1000);

function todayAtHome(now = new Date()) {
  // Pete's home, Palangka Raya, keeps Asia/Pontianak time: UTC+7, no DST.
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function homeMidnightUtcIso(now = new Date()) {
  const today = todayAtHome(now); // YYYY-MM-DD at Pete's home
  return new Date(`${today}T00:00:00+07:00`).toISOString();
}

function todaysPushes(events, now = new Date()) {
  const today = todayAtHome(now);
  const pushes = [];
  for (const ev of events || []) {
    if (!ev || ev.type !== 'PushEvent' || !ev.created_at) continue;
    if (todayAtHome(new Date(ev.created_at)) !== today) continue;
    pushes.push(ev);
  }
  return pushes;
}

// Legacy/test helper: count commits from events payloads when the commits
// array is present; a push without a commits array counts as one serving.
function countCommitsToday(events, now = new Date()) {
  const pushes = todaysPushes(events, now);
  let commits = 0;
  let lastPushAt = null;
  for (const ev of pushes) {
    const arr = ev.payload && Array.isArray(ev.payload.commits) ? ev.payload.commits : null;
    commits += arr && arr.length ? arr.length : 1;
    if (!lastPushAt || ev.created_at > lastPushAt) lastPushAt = ev.created_at;
  }
  return { commitsToday: commits, pushesToday: pushes.length, lastPushAt };
}

async function getStomach({ force = false, fetchFn, token } = {}) {
  const cached = cache.get(force);
  if (cached) return cached;
  const fetchedAt = new Date().toISOString();
  const headers = { Accept: 'application/vnd.github+json' };
  const tok = token !== undefined ? token : process.env.GITHUB_TOKEN;
  if (tok) headers.Authorization = `Bearer ${tok}`;
  try {
    const events = await fetchJson(EVENTS_URL, { fetchFn, headers });
    if (!Array.isArray(events)) throw new Error('Unexpected GitHub payload shape');
    const pushes = todaysPushes(events);
    const lastPushAt = pushes.length ? pushes.map((p) => p.created_at).sort().pop() : null;

    let commitsToday = 0;
    let method = 'commits-api';
    if (pushes.length) {
      const repos = [...new Set(pushes.map((p) => p.repo && p.repo.name).filter(Boolean))].slice(0, 5);
      const since = encodeURIComponent(homeMidnightUtcIso());
      for (const repo of repos) {
        try {
          const commits = await fetchJson(
            `https://api.github.com/repos/${repo}/commits?author=${USER}&since=${since}&per_page=100`,
            { fetchFn, headers }
          );
          if (!Array.isArray(commits)) throw new Error('Unexpected commits payload');
          commitsToday += commits.length;
        } catch {
          // Honest fallback for this repo: one serving per push.
          method = 'push-fallback';
          commitsToday += pushes.filter((p) => p.repo && p.repo.name === repo).length;
        }
      }
    }
    return cache.set({
      organ: 'stomach',
      source: `GitHub commits — @${USER}`,
      ok: true,
      data: { commitsToday, pushesToday: pushes.length, lastPushAt, user: USER, method },
      error: null,
      fetchedAt,
      cached: false,
    });
  } catch (err) {
    return {
      organ: 'stomach',
      source: `GitHub commits — @${USER}`,
      ok: false,
      data: null,
      error: String(err && err.message ? err.message : err),
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getStomach, countCommitsToday, todayAtHome, todaysPushes, homeMidnightUtcIso };
