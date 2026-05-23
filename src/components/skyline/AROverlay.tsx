import { useMemo } from "react";
import { angularDelta, bearingDeg, distanceMeters, type LatLng } from "@/lib/geo";
import type { BuildingFeature } from "@/lib/overpass";

interface Props {
  user: LatLng;
  heading: number;
  buildings: BuildingFeature[];
  fovDeg?: number;
  selectedId: string | null;
  onSelect: (b: BuildingFeature) => void;
  /** Minimum building height (m) to render. Default 40m (~12 floors). */
  minHeightMeters?: number;
  /** Max simultaneous markers in view. Default 14. */
  maxMarkers?: number;
}

interface Projected {
  b: BuildingFeature;
  delta: number;
  distance: number;
  xPct: number;
  scale: number;
  score: number;
  lane: number; // 0..3 vertical lane for label stagger
}

export function AROverlay({
  user,
  heading,
  buildings,
  fovDeg = 60,
  selectedId,
  onSelect,
  minHeightMeters = 40,
  maxMarkers = 14,
}: Props) {
  const projected = useMemo<Projected[]>(() => {
    const half = fovDeg / 2;
    const candidates: Omit<Projected, "lane">[] = [];
    for (const b of buildings) {
      const h = b.heightMeters ?? (b.levels ? b.levels * 3.2 : 0);
      const dist = distanceMeters(user, { lat: b.lat, lng: b.lng });
      if (dist < 30 || dist > 5000) continue;

      // Distance-scaled notability: distant buildings must be much taller.
      const requiredHeight = Math.max(minHeightMeters, 25 + (dist / 1000) * 25);
      if (h < requiredHeight) continue;

      const brng = bearingDeg(user, { lat: b.lat, lng: b.lng });
      const delta = angularDelta(heading, brng);
      if (Math.abs(delta) > half) continue;

      const xPct = 50 + (delta / half) * 50;
      const scale = Math.max(0.7, Math.min(1.1, 1.15 - dist / 6000));
      const score = h / Math.sqrt(Math.max(dist, 1));
      candidates.push({ b, delta, distance: dist, xPct, scale, score });
    }

    // Cluster: drop markers within ~4° bearing of a more notable neighbor.
    candidates.sort((a, b) => b.score - a.score);
    const kept: Omit<Projected, "lane">[] = [];
    const minSeparationDeg = 4;
    for (const c of candidates) {
      if (kept.length >= maxMarkers) break;
      if (kept.some((k) => Math.abs(k.delta - c.delta) < minSeparationDeg)) continue;
      kept.push(c);
    }

    // Stagger lanes left-to-right by bearing
    const byBearing = [...kept].sort((a, b) => a.delta - b.delta);
    const lanes = new Map<string, number>();
    byBearing.forEach((k, i) => lanes.set(k.b.id, i % 4));

    return kept
      .map((k) => ({ ...k, lane: lanes.get(k.b.id) ?? 0 }))
      .sort((a, b) => b.distance - a.distance);
  }, [user, heading, buildings, fovDeg, minHeightMeters, maxMarkers]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />

      {projected.map((p) => {
        const selected = p.b.id === selectedId;
        const heightLabel = p.b.heightMeters
          ? `${Math.round(p.b.heightMeters)}m${p.b.levels ? ` · ${p.b.levels}fl` : ""}`
          : p.b.levels
            ? `${p.b.levels} fl`
            : "—";
        const distLabel =
          p.distance > 1000
            ? `${(p.distance / 1000).toFixed(1)}km`
            : `${Math.round(p.distance)}m`;
        // Lane offsets (top %): 4 staggered vertical lanes in top half
        const laneTop = [8, 18, 28, 38][p.lane];
        return (
          <div
            key={p.b.id}
            className="absolute flex flex-col items-center"
            style={{
              left: `${p.xPct}%`,
              top: `${laneTop}%`,
              bottom: "50%",
              transform: `translateX(-50%) scale(${p.scale})`,
              transformOrigin: "top center",
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(p.b)}
              className={`pointer-events-auto hud-pill rounded-full px-2.5 py-1 text-left transition-all ${
                selected ? "ring-2 ring-[var(--hud-accent)] shadow-[0_0_20px_rgba(0,191,255,0.5)] z-10" : ""
              }`}
            >
              <div
                className={`font-display text-xs font-semibold leading-tight whitespace-nowrap ${
                  selected ? "text-[var(--hud-accent)]" : "text-white"
                }`}
              >
                {p.b.name}
              </div>
              <div className="font-mono-hud text-[9px] text-white/60 whitespace-nowrap">
                {heightLabel} · {distLabel}
              </div>
            </button>
            <div
              className="mt-1 w-px flex-1"
              style={{
                background: selected
                  ? "var(--hud-accent)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
