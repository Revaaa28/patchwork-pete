'use strict';

// HEART — BTC/USD price + 24h change, from keyless public APIs.
// BPM/energy logic downstream only ever sees { priceUsd, change24hPct }.
//
// SOURCE CHAIN (round 2, 2026-11-17): from Render's shared egress IP the
// CoinGecko free API answered HTTP 429 on EVERY check — permanently, not
// in bursts — so retry+stale alone left Pete heartless there (no last
// good ever existed to serve). So the heart now has LABELLED fallbacks:
//   1. CoinGecko (primary)
//   2. Coinbase Exchange public API (fallback)
//   3. Kraken public Ticker (fallback)
// Each source is tried only after the previous one has exhausted the
// existing retry policy (see fetchJson.js). The winning source is NAMED
// in the reading — `data.source` is exactly "CoinGecko" |
// "Coinbase (fallback)" | "Kraken (fallback)", and the reading-level
// `source` string spells the same thing out for the Specimen Ledger UI.
// A fallback reading is a REAL reading from a REAL exchange — labelled,
// never passed off as CoinGecko. Fields a source cannot supply stay
// null (e.g. Coinbase price without its stats endpoint -> change null),
// never copied from another source's shape.
//
// Failure law unchanged: when every source fails, serve the last good
// reading ONLY as an explicitly stale one (stale:true, original
// fetchedAt); with no last good, { ok:false, data:null, error } and
// Pete's chest goes grey. Cached 2 min (keyless rate limits are tight;
// the locked concept requires a 60s+ cache).
const { fetchJson, makeCache } = require('../fetchJson');

const cache = makeCache(2 * 60 * 1000);

// Base-URL overrides exist so a forced-failure check (or a future mirror)
// can point a source elsewhere via env; defaults are the real APIs.
const coingeckoBase = () => process.env.PETE_COINGECKO_BASE_URL || 'https://api.coingecko.com';
const coinbaseBase = () => process.env.PETE_COINBASE_BASE_URL || 'https://api.exchange.coinbase.com';
const krakenBase = () => process.env.PETE_KRAKEN_BASE_URL || 'https://api.kraken.com';

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

async function fetchCoinGecko(opts) {
  const json = await fetchJson(
    `${coingeckoBase()}/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`,
    opts
  );
  const btc = json && json.bitcoin;
  if (!btc || typeof btc.usd !== 'number') throw new Error('Unexpected CoinGecko payload shape');
  return {
    priceUsd: btc.usd,
    change24hPct: typeof btc.usd_24h_change === 'number' ? btc.usd_24h_change : null,
    source: 'CoinGecko',
  };
}

async function fetchCoinbase(opts) {
  const ticker = await fetchJson(`${coinbaseBase()}/products/BTC-USD/ticker`, opts);
  const priceUsd = num(ticker && ticker.price);
  if (priceUsd === null) throw new Error('Unexpected Coinbase payload shape');
  // 24h change comes from the stats endpoint (open vs last). It is
  // best-effort: if stats alone fails, the price still stands and the
  // change is honestly null — never borrowed from another source.
  let change24hPct = null;
  try {
    const stats = await fetchJson(`${coinbaseBase()}/products/BTC-USD/stats`, opts);
    const open = num(stats && stats.open);
    const last = num(stats && stats.last);
    if (open !== null && last !== null && open !== 0) {
      change24hPct = ((last - open) / open) * 100;
    }
  } catch { /* change stays null; the price reading is still real */ }
  return { priceUsd, change24hPct, source: 'Coinbase (fallback)' };
}

async function fetchKraken(opts) {
  const json = await fetchJson(`${krakenBase()}/0/public/Ticker?pair=XBTUSD`, opts);
  if (!json || (Array.isArray(json.error) && json.error.length)) {
    throw new Error(`Kraken error: ${(json && json.error && json.error.join('; ')) || 'unexpected payload shape'}`);
  }
  const result = json.result || {};
  const pair = result[Object.keys(result)[0]];
  const priceUsd = pair && Array.isArray(pair.c) ? num(pair.c[0]) : null;
  if (priceUsd === null) throw new Error('Unexpected Kraken payload shape');
  // Kraken's `o` is today's opening price; the change against it is
  // labelled as coming from Kraken like everything else here.
  const open = num(pair.o);
  const change24hPct = open !== null && open !== 0 ? ((priceUsd - open) / open) * 100 : null;
  return { priceUsd, change24hPct, source: 'Kraken (fallback)' };
}

// Tried in order; the first success wins and names itself in the reading.
const SOURCES = [
  { label: 'CoinGecko', readingSource: 'CoinGecko public API — BTC/USD', fetch: fetchCoinGecko },
  { label: 'Coinbase (fallback)', readingSource: 'Coinbase (fallback) — Coinbase Exchange public API, BTC/USD', fetch: fetchCoinbase },
  { label: 'Kraken (fallback)', readingSource: 'Kraken (fallback) — Kraken public API, BTC/USD', fetch: fetchKraken },
];

async function getHeart({ force = false, fetchFn, retryDelays, sleep } = {}) {
  const cached = cache.get(force);
  if (cached) return cached;
  const fetchedAt = new Date().toISOString();
  const opts = { fetchFn, retryDelays, sleep };
  const failures = [];
  for (const src of SOURCES) {
    try {
      const data = await src.fetch(opts);
      return cache.set({
        organ: 'heart',
        source: src.readingSource,
        ok: true,
        data,
        error: null,
        fetchedAt,
        cached: false,
      });
    } catch (err) {
      failures.push(`${src.label}: ${String(err && err.message ? err.message : err)}`);
    }
  }
  const msg = failures.join(' · ');
  const last = cache.getStale();
  if (last && last.ok) {
    // Stale-while-error: a real past reading, labelled stale, carrying
    // its ORIGINAL fetchedAt and its ORIGINAL source. Never fresh.
    return { ...last, stale: true, error: msg, cached: false };
  }
  return {
    organ: 'heart',
    source: 'BTC/USD — CoinGecko · Coinbase (fallback) · Kraken (fallback)',
    ok: false,
    data: null,
    error: msg,
    fetchedAt,
    cached: false,
  };
}

module.exports = { getHeart, _sources: SOURCES };
