'use strict';

// HEART — CoinGecko public API (keyless).
// BTC price + 24h change. Cached 90s (CoinGecko keyless rate limits are tight;
// the locked concept requires a 60s+ cache). Never fabricates: on any failure
// it returns { ok:false, data:null, error } and Pete's chest goes grey.
const { fetchJson, makeCache } = require('../fetchJson');

const URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true';
const cache = makeCache(90 * 1000);

async function getHeart({ force = false, fetchFn } = {}) {
  const cached = cache.get(force);
  if (cached) return cached;
  const fetchedAt = new Date().toISOString();
  try {
    const json = await fetchJson(URL, { fetchFn });
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
    return {
      organ: 'heart',
      source: 'CoinGecko public API — BTC/USD',
      ok: false,
      data: null,
      error: String(err && err.message ? err.message : err),
      fetchedAt,
      cached: false,
    };
  }
}

module.exports = { getHeart };
