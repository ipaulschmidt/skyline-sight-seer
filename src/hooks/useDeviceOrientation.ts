import { useEffect, useState, useCallback } from "react";

export interface Orientation {
  heading: number | null; // 0 = North, clockwise
  pitch: number | null;
  supported: boolean;
  permission: "granted" | "denied" | "prompt" | "unsupported";
}

interface IOSDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export function useDeviceOrientation() {
  const [state, setState] = useState<Orientation>({
    heading: null,
    pitch: null,
    supported: typeof window !== "undefined" && "DeviceOrientationEvent" in window,
    permission: "prompt",
  });

  const handler = useCallback((e: DeviceOrientationEvent) => {
    // webkitCompassHeading is the true compass on iOS
    const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    let heading: number | null = null;
    if (typeof ev.webkitCompassHeading === "number") {
      heading = ev.webkitCompassHeading;
    } else if (e.absolute && typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    } else if (typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    }
    setState((s) => ({
      ...s,
      heading,
      pitch: typeof e.beta === "number" ? e.beta : null,
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
