import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { BuildingFeature } from "@/lib/overpass";
import { fetchWikipediaSummary, type WikiSummary } from "@/lib/wikipedia";
import { ExternalLink } from "lucide-react";

interface Props {
  building: BuildingFeature | null;
  onClose: () => void;
}

export function BuildingInfoSheet({ building, onClose }: Props) {
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!building) return;
    const ac = new AbortController();
    setSummary(null);
    setLoading(true);
    fetchWikipediaSummary(building.name, ac.signal)
      .then((s) => setSummary(s))
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [building]);

  return (
    <Sheet open={!!building} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="hud-glass max-h-[85vh] rounded-t-3xl border-0 px-6 pb-8 pt-6 text-foreground"
      >
        <SheetHeader className="text-left">
          <div className="font-mono-hud text-[10px] text-[var(--hud-accent)]">
            STRUCTURE / SELECTED
          </div>
          <SheetTitle className="font-display text-3xl font-semibold uppercase leading-none tracking-wide text-white">
            {building?.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex gap-4 font-mono-hud text-xs text-white/70">
          {building?.heightMeters && (
            <div>
              <span className="text-white/40">HEIGHT </span>
              <span className="text-white">{Math.round(building.heightMeters)}m</span>
            </div>
          )}
          {building?.levels && (
            <div>
              <span className="text-white/40">FLOORS </span>
              <span className="text-white">{building.levels}</span>
            </div>
          )}
          <div>
            <span className="text-white/40">LAT </span>
            <span className="text-white">{building?.lat.toFixed(4)}</span>
          </div>
          <div>
            <span className="text-white/40">LNG </span>
            <span className="text-white">{building?.lng.toFixed(4)}</span>
          </div>
        </div>

        <div className="mt-5 text-sm leading-relaxed text-white/85">
          {loading && (
            <div className="space-y-2">
              <div className="shimmer h-3 w-full rounded bg-white/10" />
              <div className="shimmer h-3 w-11/12 rounded bg-white/10" />
              <div className="shimmer h-3 w-3/4 rounded bg-white/10" />
            </div>
          )}
          {!loading && summary?.extract && <p>{summary.extract}</p>}
          {!loading && !summary && (
            <p className="text-white/50">
              No Wikipedia entry found for this structure.
            </p>
          )}
        </div>

        {summary?.url && (
          <a
            href={summary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--hud-accent)]/40 bg-[var(--hud-accent)]/10 px-4 py-2 font-mono-hud text-xs uppercase text-[var(--hud-accent)] transition hover:bg-[var(--hud-accent)]/20"
          >
            Read more on Wikipedia <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </SheetContent>
    </Sheet>
  );
}
