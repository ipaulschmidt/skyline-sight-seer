import type { LatLng } from "./geo";

export interface BuildingFeature {
  id: string;
  name: string;
  lat: number;
  lng: number;
  heightMeters?: number;
  levels?: number;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function parseHeight(tag?: string): number | undefined {
  if (!tag) return undefined;
  const m = tag.match(/[\d.]+/);
  if (!m) return undefined;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

export async function fetchNearbyBuildings(
  user: LatLng,
  radiusMeters = 5000,
  signal?: AbortSignal,
): Promise<BuildingFeature[]> {
  const query = `
    [out:json][timeout:25];
    (
      way["building"]["name"]["height"](around:${radiusMeters},${user.lat},${user.lng});
      way["building"]["name"]["building:levels"](around:${radiusMeters},${user.lat},${user.lng});
      relation["building"]["name"]["height"](around:${radiusMeters},${user.lat},${user.lng});
    );
    out center tags;
  `;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal,
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const json = (await res.json()) as { elements: OverpassElement[] };

  const seen = new Set<string>();
  const out: BuildingFeature[] = [];
  for (const el of json.elements) {
    const tags = el.tags ?? {};
    const name = tags.name;
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const heightMeters = parseHeight(tags.height);
    const levels = tags["building:levels"]
      ? parseInt(tags["building:levels"], 10)
      : undefined;
    const key = name + "|" + lat.toFixed(4) + "|" + lng.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${el.type}/${el.id}`,
      name,
      lat,
      lng,
      heightMeters: heightMeters ?? (levels ? levels * 3.2 : undefined),
      levels,
    });
  }
  return out;
}

/** Static fallback dataset for desktop demo mode (Midtown NYC). */
export const DEMO_LOCATION: LatLng = { lat: 40.7484, lng: -73.9857 };
export const DEMO_BUILDINGS: BuildingFeature[] = [
  { id: "demo/empire", name: "Empire State Building", lat: 40.7484, lng: -73.9857, heightMeters: 381, levels: 102 },
  { id: "demo/chrysler", name: "Chrysler Building", lat: 40.7516, lng: -73.9755, heightMeters: 319, levels: 77 },
  { id: "demo/onevanderbilt", name: "One Vanderbilt", lat: 40.7531, lng: -73.9783, heightMeters: 427, levels: 73 },
  { id: "demo/rockefeller", name: "30 Rockefeller Plaza", lat: 40.7587, lng: -73.9787, heightMeters: 266, levels: 70 },
  { id: "demo/bryant", name: "Bank of America Tower", lat: 40.7556, lng: -73.9839, heightMeters: 366, levels: 55 },
  { id: "demo/metlife", name: "MetLife Building", lat: 40.7546, lng: -73.9762, heightMeters: 246, levels: 59 },
  { id: "demo/432park", name: "432 Park Avenue", lat: 40.7616, lng: -73.9719, heightMeters: 426, levels: 85 },
  { id: "demo/hudson", name: "One World Trade Center", lat: 40.7127, lng: -74.0134, heightMeters: 541, levels: 104 },
];
