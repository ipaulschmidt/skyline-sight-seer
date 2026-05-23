import { useEffect, useRef, useState } from "react";
import { Compass, Check, RotateCw, X } from "lucide-react";

interface Props {
  heading: number | null;
  /** Called when calibration completes. Offset is added to raw heading. */
  onComplete: (offsetDeg: number) => void;
  onCancel?: () => void;
  /** Existing offset to fine-tune on top of the auto-detected one. */
  initialOffset?: number;
}

interface Sample {
  t: number;
  h: number;
}

/** Angular difference (a - b) normalized to [-180, 180]. */
function angDiff(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Rolling-window calibration:
 * 1. User rotates ≥270° of unique bearings (proves sensor responds & settles).
 * 2. Stability check: max angular variation in last ~1.2s < 6°.
 * 3. Optional manual nudge slider for fine-tuning offset.
 */
export function CompassCalibration({
  heading,
  onComplete,
  onCancel,
  initialOffset = 0,
}: Props) {
  const samples = useRef<Sample[]>([]);
  const coverage = useRef<Set<number>>(new Set()); // 10° bins visited
  const [coveragePct, setCoveragePct] = useState(0);
  const [stable, setStable] = useState(false);
  const [phase, setPhase] = useState<"rotate" | "hold" | "tune">("rotate");
  const [manualOffset, setManualOffset] = useState(initialOffset);

  useEffect(() => {
    if (heading == null || phase === "tune") return;
    const now = performance.now();
    samples.current.push({ t: now, h: heading });
    // keep last 1200ms
    samples.current = samples.current.filter((s) => now - s.t < 1200);

    // coverage in 20° bins — 9/18 bins = 180° is plenty to prove sensor responds
    coverage.current.add(Math.floor(((heading % 360) + 360) % 360 / 20));
    const pct = Math.min(100, (coverage.current.size / 9) * 100);
    setCoveragePct(pct);

    // stability: spread of recent samples (looser threshold)
    if (samples.current.length >= 6) {
      const ref = samples.current[0].h;
      const spread = samples.current.reduce(
        (m, s) => Math.max(m, Math.abs(angDiff(s.h, ref))),
        0,
      );
      const isStable = spread < 12;
      setStable(isStable);

      // Advance as soon as enough coverage is gathered AND user has held still
      if (pct >= 100 && isStable && phase === "rotate") {
        setPhase("hold");
      }
    }
  }, [heading, phase]);

  // Auto-advance from "hold" to "tune" after ~600ms
  useEffect(() => {
    if (phase !== "hold") return;
    const t = setTimeout(() => setPhase("tune"), 600);
    return () => clearTimeout(t);
  }, [phase]);

  const canFinishEarly = coveragePct >= 60;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="hud-pill w-[min(420px,92vw)] rounded-3xl p-6 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Compass
            className={`h-5 w-5 ${
              phase === "tune" ? "text-emerald-400" : "text-[var(--hud-accent)]"
            }`}
          />
          <div className="font-display text-lg font-semibold text-white">
            Compass calibration
          </div>
        </div>

        {phase === "rotate" && (
          <>
            <div className="mb-4 font-mono-hud text-[11px] uppercase text-white/70">
              Rotate your phone slowly in a full circle, then hold still
            </div>

            {/* Compass dial preview */}
            <div className="relative mx-auto mb-4 h-32 w-32 rounded-full border-2 border-white/20">
              <div
                className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-full origin-bottom rounded-full bg-[var(--hud-accent)] transition-transform duration-100"
                style={{ transform: `translate(-50%, -100%) rotate(${heading ?? 0}deg)`, transformOrigin: "bottom center" }}
              />
              <div className="absolute left-1/2 top-1 -translate-x-1/2 font-mono-hud text-[10px] text-white/60">
                N
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono-hud text-xs text-[var(--hud-accent)]">
                {heading != null ? `${Math.round(heading)}°` : "—"}
              </div>
            </div>

            {/* Coverage bar */}
            <div className="mb-2 flex items-center justify-between font-mono-hud text-[10px] uppercase text-white/60">
              <span>Coverage</span>
              <span className="text-[var(--hud-accent)]">{Math.round(coveragePct)}%</span>
            </div>
            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[var(--hud-accent)] transition-all duration-200"
                style={{ width: `${coveragePct}%` }}
              />
            </div>

            <div
              className={`flex items-center justify-center gap-2 font-mono-hud text-[10px] uppercase ${
                stable ? "text-emerald-400" : "text-white/50"
              }`}
            >
              {stable ? <Check className="h-3 w-3" /> : <RotateCw className="h-3 w-3 animate-spin" />}
              {stable ? "Heading stable" : "Waiting for stability…"}
            </div>
          </>
        )}

        {phase === "hold" && (
          <div className="py-6">
            <Check className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
            <div className="font-mono-hud text-xs uppercase text-emerald-400">
              Locking heading…
            </div>
          </div>
        )}

        {phase === "tune" && (
          <>
            <div className="mb-4 font-mono-hud text-[11px] uppercase text-white/70">
              Optional: nudge if labels look offset from real buildings
            </div>
            <div className="mb-2 flex items-center justify-between font-mono-hud text-[10px] uppercase text-white/60">
              <span>Offset</span>
              <span className="text-[var(--hud-accent)]">
                {manualOffset > 0 ? "+" : ""}
                {manualOffset}°
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={manualOffset}
              onChange={(e) => setManualOffset(parseInt(e.target.value))}
              className="mb-4 w-full accent-[var(--hud-accent)]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => onComplete(manualOffset)}
                className="flex-1 rounded-full bg-[var(--hud-accent)] px-4 py-2 font-mono-hud text-[11px] uppercase text-[#001218]"
              >
                Use calibration
              </button>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="rounded-full bg-white/10 px-4 py-2 font-mono-hud text-[11px] uppercase text-white/80"
                  aria-label="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </>
        )}

        {phase === "rotate" && onCancel && (
          <button
            onClick={onCancel}
            className="mt-4 w-full rounded-full bg-white/10 px-4 py-2 font-mono-hud text-[10px] uppercase text-white/70"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

const STORAGE_KEY = "skyline.compass.offset";

export function loadCompassOffset(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? parseFloat(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function saveCompassOffset(offset: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(offset));
}

export function applyCompassOffset(heading: number | null, offset: number): number | null {
  if (heading == null) return null;
  return ((heading + offset) % 360 + 360) % 360;
}
