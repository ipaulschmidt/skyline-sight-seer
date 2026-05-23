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

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function parseHeight(tag?: string): number | undefined {
  if (!tag) return undefined;
  const m = tag.match(/[\d.]+/);
  if (!m) return undefined;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/** Round to a coarse tile key so nearby positions share the same pack. */
export function tileKey(user: LatLng, radiusMeters: number): string {
  // ~0.02° ≈ 2km cells; one cache entry covers a neighborhood
  const lat = Math.round(user.lat * 50) / 50;
  const lng = Math.round(user.lng * 50) / 50;
  return `skylinear:pack:${CACHE_VERSION}:${lat.toFixed(2)},${lng.toFixed(2)}:${radiusMeters}`;
}

interface CachedPack {
  ts: number;
  buildings: BuildingFeature[];
  center: LatLng;
}

export function readPack(user: LatLng, radiusMeters: number): CachedPack | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(tileKey(user, radiusMeters));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPack;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePack(user: LatLng, radiusMeters: number, buildings: BuildingFeature[]) {
  if (typeof localStorage === "undefined") return;
  try {
    const pack: CachedPack = { ts: Date.now(), buildings, center: user };
    localStorage.setItem(tileKey(user, radiusMeters), JSON.stringify(pack));
  } catch {
    /* quota — ignore */
  }
}

export function listCachedPacks(): { key: string; pack: CachedPack }[] {
  if (typeof localStorage === "undefined") return [];
  const out: { key: string; pack: CachedPack }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(`skylinear:pack:${CACHE_VERSION}:`)) continue;
    try {
      out.push({ key: k, pack: JSON.parse(localStorage.getItem(k)!) });
    } catch {
      /* ignore */
    }
  }
  return out;
}

function buildQuery(user: LatLng, radiusMeters: number): string {
  // Pull buildings that have ANY identifying tag — name, brand, operator,
  // an address, or a recognizable use (shop/amenity/tourism/office). This
  // catches landmarks like "Harley-Davidson Honolulu" that lack a `name`
  // tag but do have `shop` or `brand`. Falls back to address when needed.
  const a = `around:${radiusMeters},${user.lat},${user.lng}`;
  return `
    [out:json][timeout:25];
    (
      way["building"]["name"](${a});
      relation["building"]["name"](${a});
      way["building"]["brand"](${a});
      way["building"]["operator"](${a});
      way["building"]["shop"](${a});
      way["building"]["amenity"](${a});
      way["building"]["tourism"](${a});
      way["building"]["office"](${a});
      way["building"]["addr:housename"](${a});
      way["building"]["addr:housenumber"](${a});
    );
    out center tags;
  `;
}

async function fetchWithTimeout(url: string, body: string, ms: number, signal?: AbortSignal) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      method: "POST",
      body: "data=" + encodeURIComponent(body),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  }
}

export type LoadStatus =
  | { kind: "cache-hit"; buildings: BuildingFeature[] }
  | { kind: "downloading"; mirror: string; attempt: number }
  | { kind: "downloaded"; buildings: BuildingFeature[] }
  | { kind: "failed"; error: string };

export interface LoadAreaPackOptions {
  radiusMeters?: number;
  signal?: AbortSignal;
  onStatus?: (s: LoadStatus) => void;
  forceRefresh?: boolean;
}

/** PeakFinder-style: try cache first, otherwise download from a mirror with retries. */
export async function loadAreaPack(
  user: LatLng,
  opts: LoadAreaPackOptions = {},
): Promise<BuildingFeature[]> {
  const radius = opts.radiusMeters ?? 5000;

  if (!opts.forceRefresh) {
    const cached = readPack(user, radius);
    if (cached) {
      opts.onStatus?.({ kind: "cache-hit", buildings: cached.buildings });
      return cached.buildings;
    }
  }

  const query = buildQuery(user, radius);
  let lastErr = "";

  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length; attempt++) {
    const mirror = OVERPASS_MIRRORS[attempt];
    opts.onStatus?.({ kind: "downloading", mirror, attempt: attempt + 1 });
    try {
      const res = await fetchWithTimeout(mirror, query, 20000, opts.signal);
      if (!res.ok) {
        lastErr = `HTTP ${res.status} from ${new URL(mirror).host}`;
        continue;
      }
      const json = (await res.json()) as { elements: OverpassElement[] };
      const buildings = normalize(json.elements);
      writePack(user, radius, buildings);
      opts.onStatus?.({ kind: "downloaded", buildings });
      return buildings;
    } catch (e) {
      if ((e as Error).name === "AbortError" && opts.signal?.aborted) throw e;
      lastErr = (e as Error).message || "network error";
      continue;
    }
  }

  // Last-ditch: any stale cache?
  const stale = (() => {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(tileKey(user, radius));
      return raw ? (JSON.parse(raw) as CachedPack) : null;
    } catch {
      return null;
    }
  })();
  if (stale) {
    opts.onStatus?.({ kind: "cache-hit", buildings: stale.buildings });
    return stale.buildings;
  }

  opts.onStatus?.({ kind: "failed", error: lastErr || "All mirrors failed" });
  throw new Error(lastErr || "All Overpass mirrors failed");
}

function deriveName(tags: Record<string, string>): string | null {
  const direct =
    tags.name ||
    tags["name:en"] ||
    tags.brand ||
    tags.operator ||
    tags["addr:housename"];
  if (direct) return direct;
  // Synthesize from address
  const hn = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (hn && street) return `${hn} ${street}`;
  if (street) return street;
  // Synthesize from use
  const use = tags.shop || tags.amenity || tags.tourism || tags.office;
  if (use) {
    const pretty = use.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return pretty;
  }
  return null;
}

function normalize(elements: OverpassElement[]): BuildingFeature[] {
  const seen = new Set<string>();
  const out: BuildingFeature[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = deriveName(tags);
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
  // Prefer taller / more notable buildings first, but keep up to 1200 so
  // smaller landmarks remain pickable via tap-to-label.
  out.sort((a, b) => (b.heightMeters ?? 0) - (a.heightMeters ?? 0));
  return out.slice(0, 1200);
}

/** Legacy alias kept so other call sites keep compiling. */
export async function fetchNearbyBuildings(
  user: LatLng,
  radiusMeters = 5000,
  signal?: AbortSignal,
): Promise<BuildingFeature[]> {
  return loadAreaPack(user, { radiusMeters, signal });
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

export const DEMO_CITIES: { name: string; location: LatLng }[] = [
  { name: "New York (Midtown)", location: { lat: 40.7484, lng: -73.9857 } },
  { name: "Chicago (Loop)", location: { lat: 41.8819, lng: -87.6278 } },
  { name: "London (City)", location: { lat: 51.5145, lng: -0.0865 } },
  { name: "Paris (La Défense)", location: { lat: 48.8918, lng: 2.2415 } },
  { name: "Tokyo (Shinjuku)", location: { lat: 35.6896, lng: 139.6917 } },
  { name: "Dubai (Downtown)", location: { lat: 25.1972, lng: 55.2744 } },
  { name: "Hong Kong (Central)", location: { lat: 22.2819, lng: 114.1577 } },
  { name: "San Francisco (SoMa)", location: { lat: 37.7898, lng: -122.3942 } },
];
