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
    return {
      title: j.title,
      extract: j.extract ?? "",
      url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnail: j.thumbnail?.source,
    };
  } catch {
    return null;
  }
}
