'use strict';

// HEART — CoinGecko public API (keyless).
// BTC price + 24h change. Cached 2 min (CoinGecko keyless rate limits are
// tight; the locked concept requires a 60s+ cache). Never fabricates: on
// failure it serves the last good reading ONLY as an explicitly stale one
// (stale:true, original fetchedAt — see fetchJson.js), and when no last
// good exists it returns { ok:false, data:null, error } and Pete's chest
// goes grey.
const { fetchJson, makeCache } = require('../fetchJson');

const URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true';
const cache = makeCache(2 * 60 * 1000);

async function getHeart({ force = false, fetchFn, retryDelays, sleep } = {}) {
  const cached = cache.get(force);
  if (cached) return cached;
  const fetchedAt = new Date().toISOString();
  try {
    const json = await fetchJson(URL, { fetchFn, retryDelays, sleep });
    const btc = json && json.bitcoin;
    if (!btc || typeof btc.usd !== 'number') throw new Error('Unexpected CoinGecko payload shape');
    return cache.set({
      organ: 'heart',
      source: 'CoinGecko public API — BTC/USD',
      ok: true,
      data: {
        priceUsd: btc.usd,
        change24hPct: typeof btc.usd_24h_change === 'number' ? btc.usd_24h_change : null,
      },
      error: null,
      fetchedAt,
      cached: false,
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const last = cache.getStale();
    if (last && last.ok) {
      // Stale-while-error: a real past reading, labelled stale, carrying
      // its ORIGINAL fetchedAt. Never presented as fresh.
      return { ...last, stale: true, error: msg, cached: false };
    }
    return {
      organ: 'heart',
      source: 'CoinGecko public API — BTC/USD',
      ok: false,
      data: null,
      error: msg,
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getHeart };
