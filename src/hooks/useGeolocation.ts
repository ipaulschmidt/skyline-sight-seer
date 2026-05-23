import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";

export interface GeoState {
  position: LatLng | null;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  error: string | null;
  loading: boolean;
  timedOut: boolean;
  lastUpdated: number | null;
  refreshing: boolean;
}

const SOFT_TIMEOUT_MS = 45000;

export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracy: null,
    altitude: null,
    altitudeAccuracy: null,
    error: null,
    loading: enabled,
    timedOut: false,
    lastUpdated: null,
    refreshing: false,
  });
  const softTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({
        ...s,
        error: "Geolocation not supported in this browser",
        loading: false,
      }));
      return;
    }

    setState((s) => ({ ...s, loading: true, timedOut: false, error: null }));

    softTimer.current = window.setTimeout(() => {
      // Soft timeout: flag it for diagnostics but DON'T treat as an error.
      // GPS can take a while indoors; we keep waiting silently and only
      // surface a problem if the browser reports an actual error.
      setState((s) => (s.position ? s : { ...s, timedOut: true }));
    }, SOFT_TIMEOUT_MS);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (softTimer.current) {
          clearTimeout(softTimer.current);
          softTimer.current = null;
        }
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy ?? null,
          altitude: pos.coords.altitude ?? null,
          altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
          error: null,
          loading: false,
          timedOut: false,
          lastUpdated: Date.now(),
          refreshing: false,
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          error: err.message || "Location unavailable",
          loading: false,
          refreshing: false,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => {
      navigator.geolocation.clearWatch(id);
      if (softTimer.current) clearTimeout(softTimer.current);
    };
  }, [enabled]);

  // Force a fresh, high-accuracy single-shot fix. Useful for a manual
  // "re-check my coordinates" button — watchPosition can sit on a stale
  // cached fix for a while, especially indoors.
  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setState((s) => ({ ...s, refreshing: true, error: null, timedOut: false }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState((s) => ({
          ...s,
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy ?? null,
          altitude: pos.coords.altitude ?? null,
          altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
          error: null,
          loading: false,
          timedOut: false,
          lastUpdated: Date.now(),
          refreshing: false,
        }));
      },
      (err) => {
        setState((s) => ({
          ...s,
          error: err.message || "Couldn't refresh location",
          refreshing: false,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, []);

  return { ...state, refresh };
}
