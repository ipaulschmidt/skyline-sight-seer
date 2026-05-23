export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Bearing from a -> b in degrees, 0 = North, clockwise. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed angular difference (target - heading), normalized to [-180, 180]. */
export function angularDelta(heading: number, target: number): number {
  let d = ((target - heading + 540) % 360) - 180;
  return d;
}

/**
 * Forward haversine: given an origin, bearing (deg, 0=N CW), and distance (m),
 * return the destination lat/lng. Used to translate a tap (bearing + estimated
 * distance) into a coordinate for reverse geocoding.
 */
export function bearingAndDistanceToLatLng(
  originLat: number,
  originLng: number,
  bearingDegInput: number,
  distanceMetersInput: number,
): LatLng {
  const R = 6371000;
  const ang = distanceMetersInput / R;
  const brng = toRad(bearingDegInput);
  const lat1 = toRad(originLat);
  const lng1 = toRad(originLng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) +
      Math.cos(lat1) * Math.sin(ang) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}
