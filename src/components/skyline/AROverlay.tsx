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
}

interface Projected {
  b: BuildingFeature;
  delta: number; // signed degrees from heading
  distance: number;
  xPct: number; // 0..100
  scale: number;
}

export function AROverlay({
  user,
  heading,
  buildings,
  fovDeg = 60,
  selectedId,
  onSelect,
}: Props) {
  const projected = useMemo<Projected[]>(() => {
    const half = fovDeg / 2;
    const items: Projected[] = [];
    for (const b of buildings) {
      const dist = distanceMeters(user, { lat: b.lat, lng: b.lng });
      if (dist < 30 || dist > 5000) continue;
      const brng = bearingDeg(user, { lat: b.lat, lng: b.lng });
      const delta = angularDelta(heading, brng);
      if (Math.abs(delta) > half) continue;
      const xPct = 50 + (delta / half) * 50;
      const scale = Math.max(0.75, Math.min(1.15, 1.2 - dist / 5000));
      items.push({ b, delta, distance: dist, xPct, scale });
    }
    // Closer buildings render in front
    return items.sort((a, b) => b.distance - a.distance);
  }, [user, heading, buildings, fovDeg]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Horizon guide */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />

      {projected.map((p) => {
        const selected = p.b.id === selectedId;
        const heightLabel = p.b.heightMeters
          ? `${Math.round(p.b.heightMeters)}m${p.b.levels ? ` · ${p.b.levels} fl` : ""}`
          : p.b.levels
          ? `${p.b.levels} floors`
          : "—";
        const distLabel =
          p.distance > 1000
            ? `${(p.distance / 1000).toFixed(1)}km`
            : `${Math.round(p.distance)}m`;
        return (
          <div
            key={p.b.id}
            className="absolute top-0 bottom-1/2 flex flex-col items-center justify-end"
            style={{
              left: `${p.xPct}%`,
              transform: `translateX(-50%) scale(${p.scale})`,
              transformOrigin: "bottom center",
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(p.b)}
              className={`pointer-events-auto hud-pill rounded-full px-3 py-1.5 text-left transition-all ${
                selected ? "ring-2 ring-[var(--hud-accent)] shadow-[0_0_20px_rgba(0,191,255,0.5)]" : ""
              }`}
              style={selected ? { borderColor: "var(--hud-accent)" } : undefined}
            >
              <div
                className={`font-display text-sm font-semibold leading-tight ${
                  selected ? "text-[var(--hud-accent)]" : "text-white"
                }`}
              >
                {p.b.name}
              </div>
              <div className="font-mono-hud text-[10px] text-white/70">
                {heightLabel} · {distLabel}
              </div>
            </button>
            <div
              className="mt-1 w-px flex-1"
              style={{
                background: selected
                  ? "var(--hud-accent)"
                  : "linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0))",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
