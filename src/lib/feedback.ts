/**
 * Per-building accuracy feedback + corrections, stored in localStorage.
 *
 * Schema (v2):
 *   {
 *     vote: "up" | "down",
 *     correctName?: string,           // user-typed correct label
 *     correctBuildingId?: string,     // user picked a nearby building as the real one
 *     userLat?: number,               // where the user was standing when correcting
 *     userLng?: number,
 *     ts: number,
 *   }
 *
 * Shape is intentionally flat/portable so it can be synced to Lovable Cloud
 * in a future pass without rewriting consumers.
 */

import { distanceMeters, type LatLng } from "./geo";

const KEY = "skylinear:feedback:v2";
const LEGACY_KEY = "skylinear:feedback:v1";

export type Vote = "up" | "down";

export interface FeedbackEntry {
  vote: Vote;
  correctName?: string;
  correctBuildingId?: string;
  userLat?: number;
  userLng?: number;
  ts: number;
}

type Store = Record<string, FeedbackEntry>;

function read(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
    // Migrate from v1 (vote-only)
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, { vote: Vote; ts: number }>;
      localStorage.setItem(KEY, JSON.stringify(parsed));
      return parsed as Store;
    }
    return {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

export function getFeedback(buildingId: string): FeedbackEntry | undefined {
  return read()[buildingId];
}

export function getAllFeedback(): Store {
  return read();
}

/**
 * Cast a simple up/down vote. Pressing the same vote twice clears it.
 * Preserves any existing correction fields when toggling vote direction.
 */
export function setFeedback(
  buildingId: string,
  vote: Vote,
  userLocation?: LatLng,
): FeedbackEntry {
  const store = read();
  const existing = store[buildingId];
  if (existing?.vote === vote && !existing.correctName && !existing.correctBuildingId) {
    delete store[buildingId];
    write(store);
    return { vote, ts: 0 };
  }
  const entry: FeedbackEntry = {
    ...existing,
    vote,
    ts: Date.now(),
    ...(userLocation
      ? { userLat: userLocation.lat, userLng: userLocation.lng }
      : {}),
  };
  store[buildingId] = entry;
  write(store);
  return entry;
}

/**
 * Save a richer correction. Always forces vote="down" since corrections imply
 * the label was wrong. Pass an empty patch to clear (e.g. user retracted).
 */
export function setCorrection(
  buildingId: string,
  patch: {
    correctName?: string | null;
    correctBuildingId?: string | null;
    userLocation?: LatLng;
  },
): FeedbackEntry {
  const store = read();
  const existing = store[buildingId];
  const entry: FeedbackEntry = {
    ...existing,
    vote: "down",
    ts: Date.now(),
  };
  if (patch.correctName === null) delete entry.correctName;
  else if (patch.correctName !== undefined) entry.correctName = patch.correctName.trim();
  if (patch.correctBuildingId === null) delete entry.correctBuildingId;
  else if (patch.correctBuildingId !== undefined)
    entry.correctBuildingId = patch.correctBuildingId;
  if (patch.userLocation) {
    entry.userLat = patch.userLocation.lat;
    entry.userLng = patch.userLocation.lng;
  }
  store[buildingId] = entry;
  write(store);
  return entry;
}

export function clearFeedback(buildingId: string) {
  const store = read();
  delete store[buildingId];
  write(store);
}

/* ------------------------------------------------------------------ */
/*  Scoring helpers — consumed by AROverlay to bias labels over time. */
/* ------------------------------------------------------------------ */

const NEAR_RADIUS_M = 150;

/**
 * Multiplier applied to a building's projection score based on prior feedback.
 *  - Down-vote near current location: 0.35 (strongly demoted)
 *  - Down-vote elsewhere / no location: 0.75 (mildly demoted)
 *  - Up-vote near current location: 1.5  (boosted)
 *  - Up-vote elsewhere: 1.15
 *  - No feedback: 1.0
 */
export function scoreMultiplierFor(
  buildingId: string,
  user: LatLng,
  store?: Store,
): number {
  const s = store ?? read();
  const entry = s[buildingId];
  if (!entry) return 1;
  const near =
    entry.userLat != null &&
    entry.userLng != null &&
    distanceMeters(user, { lat: entry.userLat, lng: entry.userLng }) < NEAR_RADIUS_M;
  if (entry.vote === "down") return near ? 0.35 : 0.75;
  if (entry.vote === "up") return near ? 1.5 : 1.15;
  return 1;
}

/**
 * If any nearby down-voted building's correction pointed at THIS building as
 * the real one, boost its score. Returns the multiplier to compound.
 */
export function correctionBoostFor(
  buildingId: string,
  user: LatLng,
  store?: Store,
): number {
  const s = store ?? read();
  let boost = 1;
  for (const key in s) {
    const e = s[key];
    if (e.correctBuildingId !== buildingId) continue;
    const near =
      e.userLat != null &&
      e.userLng != null &&
      distanceMeters(user, { lat: e.userLat, lng: e.userLng }) < NEAR_RADIUS_M;
    boost *= near ? 1.6 : 1.2;
  }
  return boost;
}
