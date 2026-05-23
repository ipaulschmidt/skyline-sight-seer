/**
 * Per-building accuracy feedback stored in localStorage.
 * Lets users flag whether a label correctly identifies what they're looking at.
 */

const KEY = "skylinear:feedback:v1";

export type Vote = "up" | "down";

export interface FeedbackEntry {
  vote: Vote;
  ts: number;
}

type Store = Record<string, FeedbackEntry>;

function read(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
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

export function setFeedback(buildingId: string, vote: Vote): FeedbackEntry {
  const store = read();
  // Toggle off if same vote pressed twice
  if (store[buildingId]?.vote === vote) {
    delete store[buildingId];
    write(store);
    return { vote, ts: 0 };
  }
  const entry = { vote, ts: Date.now() };
  store[buildingId] = entry;
  write(store);
  return entry;
}

export function getAllFeedback(): Store {
  return read();
}
