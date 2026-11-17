'use strict';

// Location helpers — Pete has NO fixed home (concept change, Rev
// 2026-11-17): he moves in with each visitor. The visitor chooses where
// Pete lives (city search, browser geolocation, or a preset capital),
// the choice persists in their browser's localStorage, and Pete's face
// (weather) and lungs (air) read THAT place. Until a visitor chooses,
// there is no home at all — mood and lungs report an honest
// "awaiting home" state rather than silently reading somewhere.
//
// normalizeLocation(input) -> { lat, lon, place } | null
//   null means "no place chosen" — callers must not invent one.
// locationKey(loc) -> cache key from rounded coordinates.

function normalizeLocation(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon) &&
    input.lat !== undefined && input.lon !== undefined && input.lat !== '' && input.lon !== '';
  if (!hasCoords) return null;
  const place = typeof input.place === 'string' && input.place.trim()
    ? input.place.trim().slice(0, 80)
    : null;
  const clat = Math.max(-90, Math.min(90, lat));
  const clon = Math.max(-180, Math.min(180, lon));
  return {
    lat: clat,
    lon: clon,
    place: place || `${clat.toFixed(2)}, ${clon.toFixed(2)}`,
  };
}

// Cache key: coordinates rounded to 2 decimals (~1 km) so nearby requests
// share a reading instead of hammering the free APIs.
function locationKey(loc) {
  return `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
}

module.exports = { normalizeLocation, locationKey };
