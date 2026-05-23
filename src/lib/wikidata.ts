/**
 * Wikidata enrichment for buildings.
 *
 * Wikipedia coverage of mid-rise / residential buildings is thin, but Wikidata
 * has structured entries for thousands of them. We try Wikidata first.
 *
 * Lookup chain:
 *   1) If OSM has a `wikidata` tag (Q-id) → fetch directly via EntityData.
 *   2) Else search Wikidata by name and accept only if the result's
 *      description hints at a place (city, "building", "tower", ...).
 */

export interface WikidataResult {
  description: string | null;
  architect: string | null;
  yearBuilt: string | null;
  architecturalStyle: string | null;
  imageUrl: string | null;
  wikidataUrl: string | null;
  wikidataId: string | null;
}

const CACHE_PREFIX = "skylinear:wikidata:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface Cached {
  ts: number;
  result: WikidataResult;
}

function readCache(id: string): WikidataResult | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function writeCache(id: string, result: WikidataResult) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_PREFIX + id,
      JSON.stringify({ ts: Date.now(), result } satisfies Cached),
    );
  } catch {
    /* quota — ignore */
  }
}

/** Subset of the Wikidata claim shape we care about. */
interface Claim {
  mainsnak?: {
    datavalue?: {
      value:
        | string
        | { id?: string; time?: string }
        | Record<string, unknown>;
    };
  };
}

interface EntityData {
  entities: Record<
    string,
    {
      labels?: Record<string, { value: string }>;
      descriptions?: Record<string, { value: string }>;
      claims?: Record<string, Claim[]>;
    }
  >;
}

function claimString(claims: Record<string, Claim[]> | undefined, prop: string): string | null {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  if (!v) return null;
  if (typeof v === "string") return v;
  return null;
}

function claimTime(claims: Record<string, Claim[]> | undefined, prop: string): string | null {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  if (v && typeof v === "object" && "time" in v && typeof v.time === "string") {
    // Wikidata time format: "+1973-00-00T00:00:00Z"
    const m = v.time.match(/([+-]?\d{4})/);
    if (m) return m[1].replace(/^\+/, "");
  }
  return null;
}

function claimEntityId(
  claims: Record<string, Claim[]> | undefined,
  prop: string,
): string | null {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  if (v && typeof v === "object" && "id" in v && typeof v.id === "string") return v.id;
  return null;
}

/** Resolve a Q-id to its English label (one extra request). Cached. */
async function resolveLabel(id: string, signal?: AbortSignal): Promise<string | null> {
  const cacheKey = CACHE_PREFIX + "label:" + id;
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      try {
        const p = JSON.parse(raw) as { ts: number; label: string };
        if (Date.now() - p.ts < CACHE_TTL_MS) return p.label;
      } catch {
        /* ignore */
      }
    }
  }
  try {
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=labels&languages=en&format=json&origin=*`,
      { signal },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as EntityData;
    const label = j.entities?.[id]?.labels?.en?.value ?? null;
    if (label && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), label }));
      } catch {
        /* ignore */
      }
    }
    return label;
  } catch {
    return null;
  }
}

/** Build a Commons thumbnail URL from a P18 filename. */
function commonsThumb(filename: string, width = 600): string {
  const clean = filename.replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=${width}`;
}

async function fetchById(id: string, signal?: AbortSignal): Promise<WikidataResult | null> {
  const cached = readCache(id);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,
      { signal },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as EntityData;
    const entity = j.entities?.[id];
    if (!entity) return null;

    const claims = entity.claims;
    const description = entity.descriptions?.en?.value ?? null;

    // P571 inception, fallback P1619 opening
    const yearBuilt = claimTime(claims, "P571") ?? claimTime(claims, "P1619");

    const architectId = claimEntityId(claims, "P84");
    const styleId = claimEntityId(claims, "P149");
    const image = claimString(claims, "P18");

    const [architect, architecturalStyle] = await Promise.all([
      architectId ? resolveLabel(architectId, signal) : Promise.resolve(null),
      styleId ? resolveLabel(styleId, signal) : Promise.resolve(null),
    ]);

    const result: WikidataResult = {
      description,
      architect,
      yearBuilt,
      architecturalStyle,
      imageUrl: image ? commonsThumb(image) : null,
      wikidataUrl: `https://www.wikidata.org/wiki/${id}`,
      wikidataId: id,
    };
    writeCache(id, result);
    return result;
  } catch {
    return null;
  }
}

const PLACE_KEYWORDS = [
  "building",
  "tower",
  "skyscraper",
  "plaza",
  "hotel",
  "complex",
  "house",
  "apartment",
  "residence",
  "stadium",
  "arena",
  "church",
  "cathedral",
  "museum",
  "library",
  "store",
  "restaurant",
  "school",
  "hospital",
];

interface SearchResult {
  search: { id: string; description?: string }[];
}

async function searchByName(
  name: string,
  cityHint?: string,
  signal?: AbortSignal,
): Promise<WikidataResult | null> {
  try {
    const q = cityHint ? `${name} ${cityHint}` : name;
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&type=item&format=json&limit=3&origin=*`,
      { signal },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as SearchResult;
    const candidate = j.search?.find((s) => {
      const desc = (s.description ?? "").toLowerCase();
      if (!desc) return false;
      if (cityHint && desc.includes(cityHint.toLowerCase())) return true;
      return PLACE_KEYWORDS.some((k) => desc.includes(k));
    });
    if (!candidate) return null;
    return await fetchById(candidate.id, signal);
  } catch {
    return null;
  }
}

export async function fetchWikidata(
  opts: { wikidataId?: string | null; name: string; cityHint?: string },
  signal?: AbortSignal,
): Promise<WikidataResult | null> {
  if (opts.wikidataId) {
    const direct = await fetchById(opts.wikidataId, signal);
    if (direct) return direct;
  }
  return searchByName(opts.name, opts.cityHint, signal);
}
