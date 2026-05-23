import { useEffect, useRef, useState } from "react";
import { distanceMeters, type LatLng } from "@/lib/geo";
import { loadAreaPack, readPack, type BuildingFeature, type LoadStatus } from "@/lib/overpass";

interface Options {
  /** Don't refetch unless user moved at least this many meters. */
  minMoveMeters?: number;
  /** Minimum interval between network fetches (cache reads always allowed). */
  minIntervalMs?: number;
  /** How long the position must be stable before fetching. */
  debounceMs?: number;
  radiusMeters?: number;
  /** Disable entirely (e.g. when not started). */
  enabled?: boolean;
}

interface State {
  buildings: BuildingFeature[];
  status: LoadStatus | null;
  fromCache: boolean;
  error: string | null;
}

/**
 * Smart Overpass fetcher:
 *   1. localStorage cache hit  → instant, no network
 *   2. Skips refetch if user moved < minMoveMeters from last fetch center
 *   3. Throttles real network fetches to minIntervalMs
 *   4. Debounces while GPS is jittering
 */
export function useAreaPack(userPos: LatLng | null, opts: Options = {}) {
  const {
    minMoveMeters = 400,
    minIntervalMs = 30_000,
    debounceMs = 1500,
    radiusMeters = 5000,
    enabled = true,
  } = opts;

  const [state, setState] = useState<State>({
    buildings: [],
    status: null,
    fromCache: false,
    error: null,
  });

  const lastFetchCenter = useRef<LatLng | null>(null);
  const lastNetworkAt = useRef<number>(0);
  const inflight = useRef<AbortController | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const reloadNonce = useRef(0);

  useEffect(() => {
    if (!enabled || !userPos) return;

    // 1. Instant cache read — always safe, no rate limit
    const cached = readPack(userPos, radiusMeters);
    if (cached) {
      setState({
        buildings: cached.buildings,
        status: { kind: "cache-hit", buildings: cached.buildings },
        fromCache: true,
        error: null,
      });
      lastFetchCenter.current = userPos;
      return;
    }

    // 2. Distance + interval gates before scheduling a network fetch
    const moved =
      lastFetchCenter.current == null
        ? Infinity
        : distanceMeters(lastFetchCenter.current, userPos);
    if (moved < minMoveMeters) return;

    const sinceLast = Date.now() - lastNetworkAt.current;
    const delay = Math.max(debounceMs, minIntervalMs - sinceLast);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      // Abort any in-flight request before starting a new one
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      lastNetworkAt.current = Date.now();
      lastFetchCenter.current = userPos;

      setState((s) => ({ ...s, error: null, fromCache: false }));

      loadAreaPack(userPos, {
        radiusMeters,
        signal: ac.signal,
        onStatus: (status) =>
          setState((s) => ({
            ...s,
            status,
            fromCache: status.kind === "cache-hit",
          })),
      })
        .then((buildings) =>
          setState({
            buildings,
            status: { kind: "downloaded", buildings },
            fromCache: false,
            error: null,
          }),
        )
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          setState((s) => ({ ...s, error: (e as Error).message ?? "Load failed" }));
        });
    }, delay);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos?.lat, userPos?.lng, enabled, radiusMeters, reloadNonce.current]);

  // Cleanup on unmount
  useEffect(() => () => inflight.current?.abort(), []);

  const refresh = () => {
    lastFetchCenter.current = null;
    lastNetworkAt.current = 0;
    reloadNonce.current += 1;
    // Force re-run by nudging state — effect deps include reloadNonce.current
    setState((s) => ({ ...s, status: { kind: "downloading", mirror: "", attempt: 0 } }));
  };

  return { ...state, refresh };
}
