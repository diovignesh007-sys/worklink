export const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two WGS84 points. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Bounding box (min/max lat/lng) containing a radius around a point. */
export function bboxAround(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLng = radiusKm / (111.32 * cos);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: Math.max(lng - dLng, -180),
    maxLng: Math.min(lng + dLng, 180),
  };
}

/**
 * Fuzz an exact coordinate for public display (privacy: never expose exact
 * home coordinates to non-accepted users, §7). Deterministic per seed.
 */
export function approximatePoint(lat: number, lng: number, seed: string, jitterKm = 1.2) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const angle = (h % 360) * (Math.PI / 180);
  const r = jitterKm * (0.5 + ((h % 100) / 100) * 0.5);
  const dLat = (r * Math.cos(angle)) / 111.32;
  const dLng = (r * Math.sin(angle)) / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) };
}
