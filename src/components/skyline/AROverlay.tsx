import { useMemo, useRef } from "react";
import { angularDelta, bearingDeg, distanceMeters, type LatLng } from "@/lib/geo";
import type { BuildingFeature } from "@/lib/overpass";
import { getAllFeedback } from "@/lib/feedback";
import { loadFovDegrees } from "./FOVCalibration";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface Props {
  user: LatLng;
  heading: number;
  buildings: BuildingFeature[];
  /** If omitted, falls back to the calibrated FOV from localStorage (or 60). */
  fovDeg?: number;
  /** Pitch above horizon in degrees (0 = phone upright, +up, -down). */
  tiltDeg?: number;
  selectedId: string | null;
  onSelect: (b: BuildingFeature) => void;
  onTapBearing?: (bearingOffsetDeg: number) => void;
  minHeightMeters?: number;
  maxMarkers?: number;
  viewerHeightMeters?: number;
}

interface Projected {
  b: BuildingFeature;
  delta: number;
  distance: number;
  xPct: number;
  yPct: number;
  scale: number;
  score: number;
}

export function AROverlay({
  user,
  heading,
  buildings,
  fovDeg,
  tiltDeg = 0,
  selectedId,
  onSelect,
  onTapBearing,
  minHeightMeters = 40,
  maxMarkers = 14,
  viewerHeightMeters = 1.6,
}: Props) {
  const calibratedFov = useMemo(() => loadFovDegrees(), []);
  const effectiveFov = fovDeg ?? calibratedFov;

  const feedback = useMemo(() => getAllFeedback(), [selectedId]);

  // ---- Throttled recompute ----
  // Heading fires ~60Hz on device; full occlusion + scoring on every frame is
  // wasteful when the user is holding still. Short-circuit if heading and tilt
  // haven't changed meaningfully since the last computation.
  const lastComputedHeadingRef = useRef<number | null>(null);
  const lastComputedTiltRef = useRef<number | null>(null);
  const previousResultRef = useRef<Projected[]>([]);

  const projected = useMemo<Projected[]>(() => {
    if (
      lastComputedHeadingRef.current !== null &&
      lastComputedTiltRef.current !== null &&
      Math.abs(heading - lastComputedHeadingRef.current) < 0.4 &&
      Math.abs(tiltDeg - lastComputedTiltRef.current) < 1
    ) {
      return previousResultRef.current;
    }

    const half = effectiveFov / 2;
    const zoomFactor = effectiveFov / 60;
    const eye = Math.max(0, viewerHeightMeters);
    const maxDist = 2000 / Math.max(0.5, zoomFactor);

    interface Pre {
      b: BuildingFeature;
      delta: number;
      distance: number;
      h: number;
      angTop: number; // radians
    }
    const pre: Pre[] = [];
    const heightRelief = Math.min(1, eye / 60);
    for (const b of buildings) {
      const h = b.heightMeters ?? (b.levels ? b.levels * 3.2 : 0);
      const dist = distanceMeters(user, { lat: b.lat, lng: b.lng });
      if (dist < 30 || dist > maxDist) continue;

      const baseReq = Math.max(
        minHeightMeters * Math.max(0.5, zoomFactor),
        (25 + (dist / 1000) * 25) * Math.max(0.5, zoomFactor),
      );
      const requiredHeight = baseReq * (1 - 0.7 * heightRelief);
      if (h < requiredHeight) continue;

      const brng = bearingDeg(user, { lat: b.lat, lng: b.lng });
      const delta = angularDelta(heading, brng);
      if (Math.abs(delta) > half) continue;

      const angTop = Math.atan2(h - eye, dist);
      pre.push({ b, delta, distance: dist, h, angTop });
    }

    const occWindow = Math.max(1.2, 2.5 * zoomFactor);
    const byDist = [...pre].sort((a, b) => a.distance - b.distance);
    const visible: Pre[] = [];
    for (const p of byDist) {
      const blocked = visible.some(
        (n) =>
          n.distance < p.distance - 20 &&
          Math.abs(n.delta - p.delta) < occWindow &&
          n.angTop > 0 &&
          n.angTop >= p.angTop * 0.95,
      );
      if (!blocked) visible.push(p);
    }

    // Vertical FOV — derived from horizontal FOV and the viewport aspect.
    const vw = typeof window !== "undefined" ? window.innerWidth : 1;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1;
    const vFov = effectiveFov * (vh / Math.max(1, vw));
    const halfV = vFov / 2;

    const candidates: Projected[] = visible.map((p) => {
      const xPct = 50 + (p.delta / half) * 50;
      const elevationDeg = (p.angTop * 180) / Math.PI;
      // Screen Y increases downward. A building above the horizon line
      // (elevationDeg > tiltDeg) should sit above center.
      let yPct = 50 - ((elevationDeg - tiltDeg) / halfV) * 50;
      yPct = Math.max(5, Math.min(85, yPct));
      const scale = Math.max(0.7, Math.min(1.1, 1.15 - p.distance / 6000));
      const score =
        p.h / Math.sqrt(Math.max(p.distance, 1)) + (50 / Math.max(p.distance, 50)) * 1000;
      return {
        b: p.b,
        delta: p.delta,
        distance: p.distance,
        xPct,
        yPct,
        scale,
        score,
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    const kept: Projected[] = [];
    const minSeparationDeg = Math.max(1.5, 4 * zoomFactor);
    for (const c of candidates) {
      if (kept.length >= maxMarkers) break;
      if (kept.some((k) => Math.abs(k.delta - c.delta) < minSeparationDeg)) continue;
      kept.push(c);
    }

    // Vertical anti-overlap: when two labels would stack too closely and are
    // also tight in bearing, nudge the lower-priority one down by 3%.
    kept.sort((a, b) => b.score - a.score);
    for (let i = 0; i < kept.length; i++) {
      for (let j = 0; j < i; j++) {
        const dy = Math.abs(kept[i].yPct - kept[j].yPct);
        const dx = Math.abs(kept[i].delta - kept[j].delta);
        if (dy < 6 && dx < 3) {
          kept[i].yPct = Math.min(85, kept[i].yPct + 3);
        }
      }
    }

    const result = kept.sort((a, b) => b.distance - a.distance);
    lastComputedHeadingRef.current = heading;
    lastComputedTiltRef.current = tiltDeg;
    previousResultRef.current = result;
    return result;
  }, [
    user,
    heading,
    tiltDeg,
    buildings,
    effectiveFov,
    minHeightMeters,
    maxMarkers,
    viewerHeightMeters,
  ]);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTapBearing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const half = effectiveFov / 2;
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
              top: `${p.yPct}%`,
              transform: `translate(-50%, -50%) scale(${p.scale})`,
              transformOrigin: "center",
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
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pick the best-matching building for a tap at the given bearing offset.
 */
export function pickBuildingAtBearing(
  user: LatLng,
  heading: number,
  bearingOffsetDeg: number,
  buildings: BuildingFeature[],
  toleranceDeg = 5,
  viewerHeightMeters = 1.6,
): BuildingFeature | null {
  const targetBearing = (heading + bearingOffsetDeg + 360) % 360;
  const eye = Math.max(0, viewerHeightMeters);

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
      out.push({ b, delta, dist, h, angTop: Math.atan2(h - eye, dist) });
    }
    return out;
  };

  const pickFrom = (cands: Cand[]): BuildingFeature | null => {
    if (!cands.length) return null;
    const byDist = [...cands].sort((a, b) => a.dist - b.dist);
    for (const c of byDist) {
      const blocked = byDist.some(
        (n) =>
          n.dist < c.dist - 20 &&
          n.angTop > 0 &&
          n.angTop >= c.angTop * 0.95,
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
