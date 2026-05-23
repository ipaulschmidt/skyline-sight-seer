import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { BuildingFeature } from "@/lib/overpass";
import { fetchWikipediaSummary, type WikiSummary } from "@/lib/wikipedia";
import { ExternalLink, ThumbsUp, ThumbsDown, Check, Pencil } from "lucide-react";
import {
  getFeedback,
  setFeedback,
  setCorrection,
  clearFeedback,
  type FeedbackEntry,
  type Vote,
} from "@/lib/feedback";
import { distanceMeters, type LatLng } from "@/lib/geo";

interface Props {
  building: BuildingFeature | null;
  onClose: () => void;
  /** Where the user is standing — attached to corrections for location-aware learning. */
  userLocation?: LatLng | null;
  /** All loaded buildings — used to offer "pick the right one" candidates near the tap. */
  allBuildings?: BuildingFeature[];
}

const NEARBY_RADIUS_M = 250;
const NEARBY_LIMIT = 8;

export function BuildingInfoSheet({
  building,
  onClose,
  userLocation,
  allBuildings,
}: Props) {
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<FeedbackEntry | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (!building) return;
    const ac = new AbortController();
    setSummary(null);
    setLoading(true);
    const existing = getFeedback(building.id) ?? null;
    setEntry(existing);
    setShowCorrection(existing?.vote === "down");
    setTypedName(existing?.correctName ?? "");
    fetchWikipediaSummary(building.name, ac.signal)
      .then((s) => setSummary(s))
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [building]);

  /** Other buildings near the selected one — candidates for "this was the real one". */
  const nearbyCandidates = useMemo(() => {
    if (!building || !allBuildings?.length) return [];
    return allBuildings
      .filter((b) => b.id !== building.id)
      .map((b) => ({
        b,
        dToSelected: distanceMeters(
          { lat: building.lat, lng: building.lng },
          { lat: b.lat, lng: b.lng },
        ),
        dToUser: userLocation
          ? distanceMeters(userLocation, { lat: b.lat, lng: b.lng })
          : undefined,
      }))
      .filter((c) => c.dToSelected < NEARBY_RADIUS_M)
      .sort((a, b) => a.dToSelected - b.dToSelected)
      .slice(0, NEARBY_LIMIT);
  }, [building, allBuildings, userLocation]);

  const castVote = (v: Vote) => {
    if (!building) return;
    const result = setFeedback(building.id, v, userLocation ?? undefined);
    if (result.ts === 0) {
      setEntry(null);
      setShowCorrection(false);
    } else {
      setEntry(result);
      if (v === "down") setShowCorrection(true);
      else setShowCorrection(false);
    }
  };

  const pickCorrect = (id: string) => {
    if (!building) return;
    const next = setCorrection(building.id, {
      correctBuildingId: id,
      userLocation: userLocation ?? undefined,
    });
    setEntry(next);
  };

  const saveTypedName = () => {
    if (!building) return;
    const name = typedName.trim();
    const next = setCorrection(building.id, {
      correctName: name.length ? name : null,
      userLocation: userLocation ?? undefined,
    });
    setEntry(next);
  };

  const clearAll = () => {
    if (!building) return;
    clearFeedback(building.id);
    setEntry(null);
    setShowCorrection(false);
    setTypedName("");
  };

  const vote = entry?.vote ?? null;
  const pickedId = entry?.correctBuildingId;

  return (
    <Sheet open={!!building} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="hud-glass max-h-[85vh] overflow-y-auto rounded-t-3xl border-0 px-6 pb-8 pt-6 text-foreground"
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

        {/* Accuracy feedback */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono-hud text-[10px] uppercase text-white/60">
              Is this label correct?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => castVote("up")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono-hud text-[10px] uppercase transition ${
                  vote === "up"
                    ? "bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/50"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
                aria-pressed={vote === "up"}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Accurate
              </button>
              <button
                onClick={() => castVote("down")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono-hud text-[10px] uppercase transition ${
                  vote === "down"
                    ? "bg-red-400/20 text-red-300 ring-1 ring-red-400/50"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
                aria-pressed={vote === "down"}
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Wrong
              </button>
            </div>
          </div>

          {/* Correction surface — shown after WRONG */}
          {showCorrection && (
            <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
              <div className="font-mono-hud text-[10px] uppercase text-white/50">
                What is it actually? · Helps the labels get smarter at this spot
              </div>

              {/* Nearby pickable candidates */}
              {nearbyCandidates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {nearbyCandidates.map(({ b, dToSelected }) => {
                    const picked = pickedId === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => pickCorrect(picked ? "" : b.id)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-mono-hud text-[10px] transition ${
                          picked
                            ? "bg-[var(--hud-accent)]/25 text-[var(--hud-accent)] ring-1 ring-[var(--hud-accent)]/60"
                            : "bg-white/5 text-white/75 hover:bg-white/10"
                        }`}
                      >
                        {picked && <Check className="h-3 w-3" />}
                        <span className="max-w-[140px] truncate">{b.name}</span>
                        <span className="text-white/40">{Math.round(dToSelected)}m</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Typed-in correction */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Pencil className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTypedName();
                    }}
                    placeholder="Or type the real name (e.g. Panda Express)"
                    className="w-full rounded-full border border-white/10 bg-black/30 py-1.5 pl-7 pr-3 font-mono-hud text-[11px] text-white placeholder:text-white/30 focus:border-[var(--hud-accent)]/50 focus:outline-none"
                  />
                </div>
                <button
                  onClick={saveTypedName}
                  disabled={typedName.trim() === (entry?.correctName ?? "")}
                  className="rounded-full bg-[var(--hud-accent)]/20 px-3 py-1.5 font-mono-hud text-[10px] uppercase text-[var(--hud-accent)] transition hover:bg-[var(--hud-accent)]/30 disabled:opacity-30"
                >
                  Save
                </button>
              </div>

              {/* Confirmation of what's been saved */}
              {(entry?.correctName || entry?.correctBuildingId) && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-400/5 px-3 py-2 font-mono-hud text-[10px] text-emerald-300/80">
                  <span>
                    Saved · this label will be demoted here next time
                    {entry.userLat != null ? " (location attached)" : ""}.
                  </span>
                  <button
                    onClick={clearAll}
                    className="text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {summary?.url && (
          <a
            href={summary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--hud-accent)]/40 bg-[var(--hud-accent)]/10 px-4 py-2 font-mono-hud text-xs uppercase text-[var(--hud-accent)] transition hover:bg-[var(--hud-accent)]/20"
          >
            Read more on Wikipedia <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </SheetContent>
    </Sheet>
  );
}
