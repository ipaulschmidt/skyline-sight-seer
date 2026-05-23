import { useMemo } from "react";
import { angularDelta, bearingDeg, distanceMeters, type LatLng } from "@/lib/geo";
import type { BuildingFeature } from "@/lib/overpass";
import { getAllFeedback } from "@/lib/feedback";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface Props {
  user: LatLng;
  heading: number;
  buildings: BuildingFeature[];
  fovDeg?: number;
  selectedId: string | null;
  onSelect: (b: BuildingFeature) => void;
  /** Tap on empty area returns the bearing offset (deg) the user tapped. */
  onTapBearing?: (bearingOffsetDeg: number) => void;
  minHeightMeters?: number;
  maxMarkers?: number;
  /** Viewer eye height above local ground in meters (floor height etc). */
  viewerHeightMeters?: number;
}

interface Projected {
  b: BuildingFeature;
  delta: number;
  distance: number;
  xPct: number;
  scale: number;
  score: number;
  lane: number;
}

export function AROverlay({
  user,
  heading,
  buildings,
  fovDeg = 60,
  selectedId,
  onSelect,
  onTapBearing,
  minHeightMeters = 40,
  maxMarkers = 14,
}: Props) {
  const feedback = useMemo(() => getAllFeedback(), [selectedId]);

  const projected = useMemo<Projected[]>(() => {
    const half = fovDeg / 2;
    const zoomFactor = fovDeg / 60; // 1 at normal, ~0.33 at strong zoom

    // Tighter distance cap. Zoom extends reach (telephoto sees farther).
    // 2km baseline, up to ~4km at 3x zoom.
    const maxDist = 2000 / Math.max(0.5, zoomFactor);

    // First pass: gather everything in FOV with basic visibility info.
    interface Pre {
      b: BuildingFeature;
      delta: number;
      distance: number;
      h: number;
      /** angular elevation of the rooftop = atan(h/dist), in radians */
      angTop: number;
    }
    const pre: Pre[] = [];
    for (const b of buildings) {
      const h = b.heightMeters ?? (b.levels ? b.levels * 3.2 : 0);
      const dist = distanceMeters(user, { lat: b.lat, lng: b.lng });
      if (dist < 30 || dist > maxDist) continue;

      const requiredHeight = Math.max(
        minHeightMeters * Math.max(0.5, zoomFactor),
        (25 + (dist / 1000) * 25) * Math.max(0.5, zoomFactor),
      );
      if (h < requiredHeight) continue;

      const brng = bearingDeg(user, { lat: b.lat, lng: b.lng });
      const delta = angularDelta(heading, brng);
      if (Math.abs(delta) > half) continue;

      pre.push({ b, delta, distance: dist, h, angTop: Math.atan2(h, dist) });
    }

    // Occlusion pass: a building is hidden if a CLOSER building in roughly the
    // same direction has a taller apparent height (rooftop angular elevation).
    // Bearing window scales with FOV — tight angular cone in front of viewer.
    const occWindow = Math.max(1.2, 2.5 * zoomFactor); // degrees
    const byDist = [...pre].sort((a, b) => a.distance - b.distance);
    const visible: Pre[] = [];
    for (const p of byDist) {
      const blocked = visible.some(
        (n) =>
          n.distance < p.distance - 20 && // must be meaningfully closer
          Math.abs(n.delta - p.delta) < occWindow &&
          n.angTop >= p.angTop * 0.95, // near building's top covers far building
      );
      if (!blocked) visible.push(p);
    }

    // Project + score the survivors.
    const candidates: Omit<Projected, "lane">[] = visible.map((p) => {
      const xPct = 50 + (p.delta / half) * 50;
      const scale = Math.max(0.7, Math.min(1.1, 1.15 - p.distance / 6000));
      // Prefer nearer + taller buildings (they dominate the actual view).
      const score = p.h / Math.sqrt(Math.max(p.distance, 1)) + 50 / Math.max(p.distance, 50) * 1000;
      return { b: p.b, delta: p.delta, distance: p.distance, xPct, scale, score };
    });

    candidates.sort((a, b) => b.score - a.score);
    const kept: Omit<Projected, "lane">[] = [];
    const minSeparationDeg = Math.max(1.5, 4 * zoomFactor);
    for (const c of candidates) {
      if (kept.length >= maxMarkers) break;
      if (kept.some((k) => Math.abs(k.delta - c.delta) < minSeparationDeg)) continue;
      kept.push(c);
    }

    const byBearing = [...kept].sort((a, b) => a.delta - b.delta);
    const lanes = new Map<string, number>();
    byBearing.forEach((k, i) => lanes.set(k.b.id, i % 4));

    return kept
      .map((k) => ({ ...k, lane: lanes.get(k.b.id) ?? 0 }))
      .sort((a, b) => b.distance - a.distance);
  }, [user, heading, buildings, fovDeg, minHeightMeters, maxMarkers]);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTapBearing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const half = fovDeg / 2;
    const offset = ((xPct - 50) / 50) * half;
    onTapBearing(offset);
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      onClick={handleTap}
      style={{ cursor: onTapBearing ? "crosshair" : "default" }}
    >
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-white/10" />

      {/* Reticle when tap-to-label is active */}
      {onTapBearing && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40">
          <div className="h-8 w-8 rounded-full border border-[var(--hud-accent)]" />
          <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--hud-accent)]" />
          <div className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-[var(--hud-accent)]" />
        </div>
      )}

      {projected.map((p) => {
        const selected = p.b.id === selectedId;
        const vote = feedback[p.b.id]?.vote;
        const heightLabel = p.b.heightMeters
          ? `${Math.round(p.b.heightMeters)}m${p.b.levels ? ` · ${p.b.levels}fl` : ""}`
          : p.b.levels
            ? `${p.b.levels} fl`
            : "—";
        const distLabel =
          p.distance > 1000
            ? `${(p.distance / 1000).toFixed(1)}km`
            : `${Math.round(p.distance)}m`;
        const laneTop = [8, 18, 28, 38][p.lane];
        const voteClass =
          vote === "up"
            ? "ring-1 ring-emerald-400/60"
            : vote === "down"
              ? "ring-1 ring-red-400/60 opacity-60"
              : "";
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
              onClick={(e) => {
                e.stopPropagation();
                onSelect(p.b);
              }}
              className={`pointer-events-auto hud-pill rounded-full px-2.5 py-1 text-left transition-all ${voteClass} ${
                selected
                  ? "ring-2 ring-[var(--hud-accent)] shadow-[0_0_20px_rgba(0,191,255,0.5)] z-10"
                  : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className={`font-display text-xs font-semibold leading-tight whitespace-nowrap ${
                    selected ? "text-[var(--hud-accent)]" : "text-white"
                  }`}
                >
                  {p.b.name}
                </div>
                {vote === "up" && <ThumbsUp className="h-3 w-3 text-emerald-400" />}
                {vote === "down" && <ThumbsDown className="h-3 w-3 text-red-400" />}
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

/**
 * Pick the best-matching building for a tap at the given bearing offset.
 * Two-pass: first within tight tolerance preferring tighter+notable, then a
 * wider sweep if nothing matched. Never excludes small buildings.
 */
export function pickBuildingAtBearing(
  user: LatLng,
  heading: number,
  bearingOffsetDeg: number,
  buildings: BuildingFeature[],
  toleranceDeg = 5,
): BuildingFeature | null {
  const targetBearing = (heading + bearingOffsetDeg + 360) % 360;

  // Gather all in-cone candidates with apparent height.
  interface Cand {
    b: BuildingFeature;
    delta: number;
    dist: number;
    h: number;
    angTop: number;
  }
  const inCone = (tol: number, maxDist: number): Cand[] => {
    const out: Cand[] = [];
    for (const b of buildings) {
      const dist = distanceMeters(user, { lat: b.lat, lng: b.lng });
      if (dist < 5 || dist > maxDist) continue;
      const brng = bearingDeg(user, { lat: b.lat, lng: b.lng });
      const delta = Math.abs(angularDelta(targetBearing, brng));
      if (delta > tol) continue;
      const h = b.heightMeters ?? (b.levels ? b.levels * 3.2 : 10);
      out.push({ b, delta, dist, h, angTop: Math.atan2(h, dist) });
    }
    return out;
  };

  // Prefer the closest unoccluded candidate — that's what's actually in frame.
  const pickFrom = (cands: Cand[]): BuildingFeature | null => {
    if (!cands.length) return null;
    const byDist = [...cands].sort((a, b) => a.dist - b.dist);
    for (const c of byDist) {
      const blocked = byDist.some(
        (n) => n.dist < c.dist - 20 && n.angTop >= c.angTop * 0.95,
      );
      if (!blocked) return c.b;
    }
    return byDist[0].b;
  };

  return (
    pickFrom(inCone(toleranceDeg, 2500)) ||
    pickFrom(inCone(toleranceDeg * 2, 3500)) ||
    pickFrom(inCone(toleranceDeg * 3, 5000))
  );
}
