'use strict';

// BRAIN — Wikipedia random article summary.
// Pete remembers the last N facts he learned (in-memory; a restart is
// honestly a new Pete with an empty head until he is taught again).
// "Teach Pete" (force) always pulls a NEW article; a plain read reuses the
// most recent fact instead of silently swapping what Pete knows.
const { fetchJson } = require('../fetchJson');

const URL = 'https://en.wikipedia.org/api/rest_v1/page/random/summary';
const MEMORY_SIZE = 5;
const memory = []; // newest first: { title, extract, url, learnedAt }

async function fetchFact(fetchFn, opts = {}) {
  const json = await fetchJson(URL, { fetchFn, retryDelays: opts.retryDelays, sleep: opts.sleep });
  if (!json || !json.title) throw new Error('Unexpected Wikipedia payload shape');
  const extract = typeof json.extract === 'string' ? json.extract : '';
  return {
    title: json.title,
    extract: extract.length > 420 ? extract.slice(0, 417) + '…' : extract,
    url: (json.content_urls && json.content_urls.desktop && json.content_urls.desktop.page) || null,
    learnedAt: new Date().toISOString(),
  };
}

async function getBrain({ force = false, fetchFn, retryDelays, sleep } = {}) {
  const fetchedAt = new Date().toISOString();
  let fetchedFresh = false;
  try {
    if (force || memory.length === 0) {
      const fact = await fetchFact(fetchFn, { retryDelays, sleep });
      fetchedFresh = true;
      // Don't memorise the exact same article twice in a row.
      if (!memory[0] || memory[0].title !== fact.title) {
        memory.unshift(fact);
        while (memory.length > MEMORY_SIZE) memory.pop();
      }
    }
    return {
      organ: 'brain',
      source: 'Wikipedia — random article',
      ok: true,
      data: { currentFact: memory[0], memory: memory.slice() },
      error: null,
      fetchedAt,
      cached: !fetchedFresh,
    };
  } catch (err) {
    // If Pete already knows something, a failed refresh does not erase it —
    // but the organ reports the failure honestly via the last good reading.
    if (memory.length > 0 && !force) {
      return {
        organ: 'brain',
        source: 'Wikipedia — random article',
        ok: true,
        data: { currentFact: memory[0], memory: memory.slice() },
        error: null,
        fetchedAt,
        cached: true,
      };
    }
    return {
      organ: 'brain',
      source: 'Wikipedia — random article',
      ok: false,
      data: memory.length ? { currentFact: memory[0], memory: memory.slice() } : null,
      error: String(err && err.message ? err.message : err),
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getBrain, _memory: memory };
