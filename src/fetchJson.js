'use strict';

// Small fetch helper: JSON only, hard timeout, never throws a bare string.
async function fetchJson(url, { timeoutMs = 9000, headers = {}, fetchFn } = {}) {
  const doFetch = fetchFn || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('No fetch implementation available');
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
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Minimal TTL cache. force=true bypasses (used by the action buttons).
function makeCache(ttlMs) {
  let entry = null;
  return {
    get(force = false) {
      if (!entry) return null;
      if (force) return null;
      if (Date.now() - entry.at > ttlMs) return null;
      return entry.value;
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
function makeKeyedCache(ttlMs) {
  const map = new Map();
  return {
    get(key, force = false) {
      if (force) return null;
      const entry = map.get(key);
      if (!entry) return null;
      if (Date.now() - entry.at > ttlMs) { map.delete(key); return null; }
      return entry.value;
    },
    set(key, value) {
      map.set(key, { at: Date.now(), value });
      return value;
    },
    clear() { map.clear(); },
  };
}

module.exports = { fetchJson, makeCache, makeKeyedCache };
