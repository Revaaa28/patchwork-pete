'use strict';

// Small fetch helper: JSON only, hard timeout per attempt, never throws a
// bare string.
//
// RESILIENCE (added 2026-11-17 after the Render deploy): the free APIs Pete
// depends on rate-limit shared egress IPs (CoinGecko / Open-Meteo answered
// HTTP 429 from Render's shared IP while the same calls succeeded locally).
// So fetchJson RETRIES transient failures — HTTP 429 and 5xx, plus network /
// abort errors — with exponential backoff (1s, 3s, 8s), honouring a
// Retry-After header when the API sends one (capped at 8s), and giving up
// once ~15s of backoff has been spent so a web request never hangs forever.
// Non-transient statuses (other 4xx) fail immediately. Retrying changes
// WHEN a reading arrives, never WHAT it says — a response is still only
// accepted when it is a real, validated 2xx payload.

const DEFAULT_RETRY_DELAYS = [1000, 3000, 8000];
const MAX_BACKOFF_MS = 15000;
const MAX_RETRY_AFTER_MS = 8000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(res) {
  try {
    const headers = res && res.headers;
    if (!headers) return null;
    const raw = typeof headers.get === 'function'
      ? headers.get('retry-after')
      : (headers['retry-after'] !== undefined ? headers['retry-after'] : headers['Retry-After']);
    if (raw === null || raw === undefined || raw === '') return null;
    const secs = Number(raw);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const when = Date.parse(raw); // HTTP-date form
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  } catch { /* a malformed header must never break the request */ }
  return null;
}

function isRetryable(err) {
  const status = err && err.status;
  if (typeof status === 'number') return status === 429 || (status >= 500 && status <= 599);
  return true; // no status: network failure / abort / DNS — transient by nature
}

async function fetchJson(url, { timeoutMs = 9000, headers = {}, fetchFn, retryDelays = DEFAULT_RETRY_DELAYS, sleep = defaultSleep } = {}) {
  const doFetch = fetchFn || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('No fetch implementation available');
  let backoffSpent = 0;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'PatchworkPete/0.1 (Kiroween 2026 hackathon pet)', ...headers },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
        err.status = res.status;
        err.retryAfterMs = retryAfterMs(res);
        throw err;
      }
      return await res.json();
    } catch (err) {
      if (!isRetryable(err) || attempt >= retryDelays.length) throw err;
      let delay = retryDelays[attempt];
      if (typeof err.retryAfterMs === 'number') {
        delay = Math.max(delay, Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS));
      }
      if (backoffSpent + delay > MAX_BACKOFF_MS) throw err;
      backoffSpent += delay;
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
}

// Minimal TTL cache. force=true bypasses (used by the action buttons).
// getStale() returns the last stored value regardless of TTL — the raw
// material for stale-while-error serving. A stale value is NEVER returned
// by get(); only an adapter's failure path may serve it, and only with
// `stale:true` and its original fetchedAt attached (see the adapters).
function makeCache(ttlMs) {
  let entry = null;
  return {
    get(force = false) {
      if (!entry) return null;
      if (force) return null;
      if (Date.now() - entry.at > ttlMs) return null;
      return entry.value;
    },
    getStale() {
      return entry ? entry.value : null;
    },
    set(value) {
      entry = { at: Date.now(), value };
      return value;
    },
    clear() { entry = null; },
  };
}

// TTL cache keyed by an arbitrary string (used per rounded coordinate pair,
// so Pete can breathe the air of many places without mixing readings up).
// Expired entries are KEPT (not deleted) so getStale(key) can serve the
// last good reading for that exact place while the API is unreachable.
function makeKeyedCache(ttlMs) {
  const map = new Map();
  return {
    get(key, force = false) {
      if (force) return null;
      const entry = map.get(key);
      if (!entry) return null;
      if (Date.now() - entry.at > ttlMs) return null;
      return entry.value;
    },
    getStale(key) {
      const entry = map.get(key);
      return entry ? entry.value : null;
    },
    set(key, value) {
      map.set(key, { at: Date.now(), value });
      return value;
    },
    clear() { map.clear(); },
  };
}

module.exports = { fetchJson, makeCache, makeKeyedCache, DEFAULT_RETRY_DELAYS };
