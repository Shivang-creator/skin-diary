/**
 * The localStorage-backed diary, exposed as a React external store.
 *
 * Written against `useSyncExternalStore` rather than the usual
 * "useState + useEffect that reads localStorage on mount" pattern. That
 * pattern sets state during an effect, which causes a cascading render on
 * every page load — and React's own guidance is that data living outside
 * React should be subscribed to, not copied into state.
 *
 * Doing it properly also gets cross-tab synchronisation for free: two
 * open tabs stay consistent via the `storage` event.
 */

import type { Entry } from "./domain";

const ENTRIES_KEY = "skin-diary:entries:v1";
const MODE_KEY = "skin-diary:mode:v1";

export type DataMode = "demo" | "mine";

/** Stable empty reference — a new [] each read would loop forever. */
const EMPTY: Entry[] = [];

const listeners = new Set<() => void>();

/* ---- Cached snapshots ---- */

let entriesRaw: string | null = null;
let entriesCache: Entry[] = EMPTY;
let modeCache: DataMode | null = null;

function emit() {
  for (const l of listeners) l();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab wrote to localStorage.
  const onStorage = (e: StorageEvent) => {
    if (e.key === ENTRIES_KEY || e.key === MODE_KEY || e.key === null) {
      entriesRaw = null;
      modeCache = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Snapshot getter. Must return a referentially stable value when nothing
 * has changed, so the raw string is compared before re-parsing.
 */
export function getEntriesSnapshot(): Entry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ENTRIES_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === entriesRaw) return entriesCache;

  entriesRaw = raw;
  if (!raw) {
    entriesCache = EMPTY;
    return entriesCache;
  }
  try {
    const parsed = JSON.parse(raw);
    entriesCache = Array.isArray(parsed) ? (parsed as Entry[]) : EMPTY;
  } catch {
    entriesCache = EMPTY;
  }
  return entriesCache;
}

export function getEntriesServerSnapshot(): Entry[] {
  return EMPTY;
}

export function getModeSnapshot(): DataMode | null {
  if (modeCache !== null) return modeCache;
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    modeCache = raw === "mine" || raw === "demo" ? raw : null;
  } catch {
    modeCache = null;
  }
  return modeCache;
}

export function getModeServerSnapshot(): DataMode | null {
  return null;
}

/* ---- Writers ---- */

export function writeEntries(next: Entry[]) {
  entriesCache = next;
  try {
    entriesRaw = JSON.stringify(next);
    window.localStorage.setItem(ENTRIES_KEY, entriesRaw);
  } catch {
    // Quota exhausted or private mode. The in-memory snapshot still
    // serves this session, which beats throwing at the user mid-entry.
    entriesRaw = null;
  }
  emit();
}

export function writeMode(mode: DataMode) {
  modeCache = mode;
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* non-fatal */
  }
  emit();
}

/* ---- Hydration flag ---- */

const noopSubscribe = () => () => {};
export const isHydratedStore = {
  subscribe: noopSubscribe,
  getSnapshot: () => true,
  getServerSnapshot: () => false,
};
