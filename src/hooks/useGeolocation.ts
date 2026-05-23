import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";

export interface GeoState {
  position: LatLng | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  timedOut: boolean;
}

const SOFT_TIMEOUT_MS = 12000;

export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracy: null,
    error: null,
    loading: enabled,
    timedOut: false,
  });
  const softTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        position: null,
        accuracy: null,
        error: "Geolocation not supported in this browser",
        loading: false,
        timedOut: false,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true, timedOut: false, error: null }));

    // Soft timeout — surfaces a clear UI affordance instead of spinning forever
    softTimer.current = window.setTimeout(() => {
      setState((s) =>
        s.position
          ? s
          : { ...s, timedOut: true, loading: false, error: s.error ?? "GPS is taking too long" },
      );
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
          error: null,
          loading: false,
          timedOut: false,
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          error: err.message || "Location unavailable",
          loading: false,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => {
      navigator.geolocation.clearWatch(id);
      if (softTimer.current) clearTimeout(softTimer.current);
    };
  }, [enabled]);

  return state;
}
