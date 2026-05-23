import { fetchWikidata, type WikidataResult } from "./wikidata";

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  thumbnail?: string;
}

export async function fetchWikipediaSummary(
  title: string,
  signal?: AbortSignal,
): Promise<WikiSummary | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal },
    );
    if (!res.ok) return null;
    const j = await res.json();
    if (j.type === "disambiguation") return null;
    return {
      title: j.title,
      extract: j.extract ?? "",
      url:
        j.content_urls?.desktop?.page ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnail: j.thumbnail?.source,
    };
  } catch {
    return null;
  }
}

/** Combined enrichment result for the info sheet. */
export interface BuildingEnrichment {
  description: string | null;
  architect: string | null;
  yearBuilt: string | null;
  architecturalStyle: string | null;
  imageUrl: string | null;
  wikidataId: string | null;
  wikidataUrl: string | null;
  wikipediaUrl: string | null;
}

/**
 * Enrich a building from Wikidata first, then fall back to Wikipedia summary
 * if Wikidata doesn't carry an English description.
 *
 * Always returns an object — fields may be null. Never throws.
 * Caller is responsible for setting a wall-clock timeout via the AbortSignal.
 */
export async function fetchBuildingInfo(
  opts: { wikidataId?: string | null; name: string; cityHint?: string },
  signal?: AbortSignal,
): Promise<BuildingEnrichment> {
  let wd: WikidataResult | null = null;
  try {
    wd = await fetchWikidata(opts, signal);
  } catch {
    wd = null;
  }

  let wikiUrl: string | null = null;
  let description = wd?.description ?? null;

  if (!description) {
    const summary = await fetchWikipediaSummary(opts.name, signal);
    if (summary) {
      wikiUrl = summary.url;
      if (summary.extract) description = summary.extract;
    }
  }

  return {
    description,
    architect: wd?.architect ?? null,
    yearBuilt: wd?.yearBuilt ?? null,
    architecturalStyle: wd?.architecturalStyle ?? null,
    imageUrl: wd?.imageUrl ?? null,
    wikidataId: wd?.wikidataId ?? null,
    wikidataUrl: wd?.wikidataUrl ?? null,
    wikipediaUrl: wikiUrl,
  };
}
