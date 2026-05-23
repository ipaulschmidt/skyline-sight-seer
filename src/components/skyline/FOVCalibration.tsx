import { useState } from "react";
import { X, Crosshair } from "lucide-react";

const FOV_STORAGE_KEY = "skyline_fov_degrees";
const DEFAULT_FOV = 60;

export function loadFovDegrees(): number {
  if (typeof window === "undefined") return DEFAULT_FOV;
  const raw = window.localStorage.getItem(FOV_STORAGE_KEY);
  if (!raw) return DEFAULT_FOV;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT_FOV;
  return Math.min(90, Math.max(50, n));
}

export function saveFovDegrees(v: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOV_STORAGE_KEY, String(v));
}

export function hasFovCalibration(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FOV_STORAGE_KEY) !== null;
}

interface Tap {
  screenX: number;
  bearing: number;
}

interface Props {
  /** Current compass heading (already calibrated). */
  heading: number | null;
  onComplete: (fovDeg: number) => void;
  onCancel: () => void;
}

/**
 * Two-tap FOV calibration. Tap two landmarks; we derive horizontal FOV from
 * the angular span between their bearings and the screen-x span between the
 * taps.
 */
export function FOVCalibration({ heading, onComplete, onCancel }: Props) {
  const [tap1, setTap1] = useState<Tap | null>(null);
  const [tap2, setTap2] = useState<Tap | null>(null);
  const [derived, setDerived] = useState<number | null>(null);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (heading == null) return;
    if (derived != null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t: Tap = { screenX: x, bearing: heading };
    if (!tap1) {
      setTap1(t);
      return;
    }
    if (!tap2) {
      setTap2(t);
      // Derive FOV. Use signed angular delta to handle the 0/360 wrap.
      const angularSpan = Math.abs(
        ((t.bearing - tap1.bearing + 540) % 360) - 180,
      );
      const screenSpan = Math.abs(t.screenX - tap1.screenX) / rect.width;
      if (screenSpan < 0.05 || angularSpan < 1) {
        // Too close together — reset and try again.
        setTap1(null);
        setTap2(null);
        return;
      }
      const raw = angularSpan / screenSpan;
      const clamped = Math.min(90, Math.max(50, raw));
      setDerived(clamped);
    }
  };

  const confirm = () => {
    if (derived == null) return;
    saveFovDegrees(derived);
    onComplete(derived);
  };

  const reset = () => {
    setTap1(null);
    setTap2(null);
    setDerived(null);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={handleTap}
        style={{ cursor: "crosshair" }}
      >
        {tap1 && (
          <Marker x={tap1.screenX} label="1" />
        )}
        {tap2 && (
          <Marker x={tap2.screenX} label="2" />
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2">
        <div className="hud-pill pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2">
          <Crosshair className="h-4 w-4 text-[var(--hud-accent)]" />
          <span className="font-mono-hud text-[11px] uppercase tracking-wider text-white/80">
            FOV Calibration
          </span>
          <button
            onClick={onCancel}
            className="ml-2 rounded-full p-1 text-white/60 hover:text-white"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-20 w-[min(420px,90vw)] -translate-x-1/2">
        <div className="hud-pill rounded-2xl px-4 py-3 text-center">
          {derived == null ? (
            <p className="font-display text-sm text-white">
              Tap two landmarks you can identify on the skyline.
              <br />
              <span className="font-mono-hud text-[11px] text-white/60">
                {tap1 ? "Now tap the second landmark." : "Tap the first landmark."}
              </span>
            </p>
          ) : (
            <p className="font-display text-sm text-white">
              Detected FOV:{" "}
              <span className="text-[var(--hud-accent)] font-semibold">
                {Math.round(derived)}°
              </span>
            </p>
          )}
        </div>
      </div>

      {derived != null && (
        <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 gap-3">
          <button
            onClick={reset}
            className="hud-pill rounded-full px-5 py-2 font-mono-hud text-xs uppercase text-white/80"
          >
            Retry
          </button>
          <button
            onClick={confirm}
            className="rounded-full bg-[var(--hud-accent)] px-5 py-2 font-mono-hud text-xs uppercase text-black"
          >
            Confirm
          </button>
        </div>
      )}

      {heading == null && (
        <div className="pointer-events-none absolute left-1/2 bottom-10 -translate-x-1/2 font-mono-hud text-[11px] uppercase text-red-300">
          Waiting for compass…
        </div>
      )}
    </div>
  );
}

function Marker({ x, label }: { x: number; label: string }) {
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 flex flex-col items-center"
      style={{ left: x, transform: "translateX(-50%)" }}
    >
      <div className="h-full w-px bg-[var(--hud-accent)]/80" />
      <div className="absolute top-1/2 -translate-y-1/2 hud-pill rounded-full px-2 py-0.5 font-mono-hud text-[10px] text-[var(--hud-accent)]">
        {label}
      </div>
    </div>
  );
}
