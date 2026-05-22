import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/geo";

export interface GeoState {
  position: LatLng | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
    loading: enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ position: null, error: "Geolocation not supported", loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          error: null,
          loading: false,
        });
      },
      (err) => {
        setState({ position: null, error: err.message, loading: false });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return state;
}
