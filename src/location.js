'use strict';

// Location config — the ONLY place locations are defined.
//
// Patchwork Pete is ONE shared creature who lives in ONE benchmark place
// ("home"). His official mood and breathing are computed only from home's
// weather and air, so every visitor and judge sees the same Pete and his
// state is comparable over time.
//
// Home is configurable in exactly one place — environment variables:
//   PETE_HOME_NAME  (default: the placeholder below)
//   PETE_HOME_LAT, PETE_HOME_LON
// Default home (Rev's pick, 2026-11-17): Borneo — the peat-haze heart of
// the "lungs of the world", labelled simply "Borneo" everywhere (Rev's
// call: no city, province, or country names). When Borneo's air is clean
// Pete breathes easy; when haze rolls in, Pete coughs. Rev may re-point
// Pete's home by setting the env vars; no code change is needed and
// nothing else in the codebase hard-codes a home place.
//
// Visitor locations are a separate, comparison-only concern ("Your air vs
// Pete's air"): normalizeLocation() validates them, and they never feed
// Pete's official state, scores, or diary.

const HOME = {
  name: process.env.PETE_HOME_NAME || 'Borneo',
  lat: Number.isFinite(Number(process.env.PETE_HOME_LAT)) && process.env.PETE_HOME_LAT !== undefined
    ? Number(process.env.PETE_HOME_LAT) : -2.21,
  lon: Number.isFinite(Number(process.env.PETE_HOME_LON)) && process.env.PETE_HOME_LON !== undefined
    ? Number(process.env.PETE_HOME_LON) : 113.92,
};

function homeLocation() {
  return { lat: HOME.lat, lon: HOME.lon, place: HOME.name };
}

function normalizeLocation(input = {}) {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon) &&
    input.lat !== undefined && input.lon !== undefined && input.lat !== '' && input.lon !== '';
  const place = typeof input.place === 'string' && input.place.trim()
    ? input.place.trim().slice(0, 80)
    : null;
  if (!hasCoords) return { ...homeLocation(), isHome: true };
  return {
    lat: Math.max(-90, Math.min(90, lat)),
    lon: Math.max(-180, Math.min(180, lon)),
    place: place || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    isHome: false,
  };
}

// Cache key: coordinates rounded to 2 decimals (~1 km) so nearby requests
// share a reading instead of hammering the free APIs.
function locationKey(loc) {
  return `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
}

module.exports = { HOME, homeLocation, normalizeLocation, locationKey };
