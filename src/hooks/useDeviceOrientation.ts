import { useEffect, useState, useCallback, useRef } from "react";
import type { LatLng } from "@/lib/geo";
import { distanceMeters } from "@/lib/geo";

export interface Orientation {
  heading: number | null; // 0 = True North, clockwise (declination-corrected)
  rawHeading: number | null; // uncorrected magnetic heading
  pitch: number | null; // raw beta (0=flat, 90=upright)
  tiltDeg: number | null; // beta - 90 (0=upright facing forward, +up, -down)
  declination: number | null;
  supported: boolean;
  permission: "granted" | "denied" | "prompt" | "unsupported";
}

interface IOSDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const DECLINATION_STORAGE_KEY = "skyline_declination";
const DECLINATION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DECLINATION_REFETCH_KM = 200;
const NOAA_TIMEOUT_MS = 3000;

interface CachedDecl {
  value: number;
  ts: number;
  lat: number;
  lng: number;
}

function readCachedDeclination(pos: LatLng): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DECLINATION_STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedDecl;
    if (Date.now() - c.ts > DECLINATION_TTL_MS) return null;
    const km = distanceMeters(pos, { lat: c.lat, lng: c.lng }) / 1000;
    if (km > DECLINATION_REFETCH_KM) return null;
    return c.value;
  } catch {
    return null;
  }
}

function writeCachedDeclination(pos: LatLng, value: number) {
  if (typeof window === "undefined") return;
  const c: CachedDecl = { value, ts: Date.now(), lat: pos.lat, lng: pos.lng };
  try {
    window.localStorage.setItem(DECLINATION_STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* noop */
  }
}

async function fetchDeclination(pos: LatLng): Promise<number | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), NOAA_TIMEOUT_MS);
  try {
    const url = `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${pos.lat}&lon1=${pos.lng}&resultFormat=json`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: Array<{ declination?: number }> };
    const v = json.result?.[0]?.declination;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function useDeviceOrientation(position?: LatLng | null) {
  const [state, setState] = useState<Orientation>({
    heading: null,
    rawHeading: null,
    pitch: null,
    tiltDeg: null,
    declination: null,
    supported: typeof window !== "undefined" && "DeviceOrientationEvent" in window,
    permission: "prompt",
  });

  const declinationRef = useRef<number>(0);
  const lastDeclFetchKey = useRef<string | null>(null);

  // Fetch / load declination once we have a position. Re-fetch if user moves
  // beyond the cache radius.
  useEffect(() => {
    if (!position) return;
    const cached = readCachedDeclination(position);
    if (cached != null) {
      declinationRef.current = cached;
      setState((s) => ({ ...s, declination: cached }));
      return;
    }
    // Avoid refetching within the same ~10km tile until we have an answer.
    const key = `${position.lat.toFixed(1)},${position.lng.toFixed(1)}`;
    if (lastDeclFetchKey.current === key) return;
    lastDeclFetchKey.current = key;
    let cancelled = false;
    fetchDeclination(position).then((v) => {
      if (cancelled) return;
      const value = v ?? 0;
      declinationRef.current = value;
      if (v != null) writeCachedDeclination(position, v);
      setState((s) => ({ ...s, declination: value }));
    });
    return () => {
      cancelled = true;
    };
  }, [position?.lat, position?.lng]);

  const handler = useCallback((e: DeviceOrientationEvent) => {
    const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let raw: number | null = null;
    if (typeof ev.webkitCompassHeading === "number") {
      raw = ev.webkitCompassHeading;
    } else if (typeof e.alpha === "number") {
      raw = (360 - e.alpha) % 360;
    }
    const decl = declinationRef.current;
    const heading = raw == null ? null : (raw + decl + 360) % 360;
    const pitch = typeof e.beta === "number" ? e.beta : null;
    const tiltDeg = pitch == null ? null : pitch - 90;
    setState((s) => ({
      ...s,
      rawHeading: raw,
      heading,
      pitch,
      tiltDeg,
    }));
  }, []);

  const request = useCallback(async () => {
    if (typeof window === "undefined") return;
    const DOE = (window as unknown as { DeviceOrientationEvent?: IOSDeviceOrientationEvent })
      .DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        setState((s) => ({ ...s, permission: res }));
        if (res !== "granted") return;
      } catch {
        setState((s) => ({ ...s, permission: "denied" }));
        return;
      }
    } else {
      setState((s) => ({ ...s, permission: "granted" }));
    }
    window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.addEventListener("deviceorientation", handler, true);
  }, [handler]);

  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
      window.removeEventListener("deviceorientation", handler, true);
    };
  }, [handler]);

  return { ...state, request };
}
