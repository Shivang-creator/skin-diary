"use client";

/**
 * Client-side diary state.
 *
 * Deliberately localStorage and nothing else:
 *
 *  - No account, no login. A judge, or anyone else, can use the whole
 *    product on first click. Sign-up is the biggest drop-off in a habit
 *    product, and this one lives or dies on daily habit.
 *  - Face photos and a health log are about as personal as data gets.
 *    Keeping them on the device means there is no server to breach and
 *    nothing to explain in a privacy policy. Photos are sent to YouCam
 *    for analysis and are never stored by us.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { Entry } from "./domain";
import { buildDemoEntries } from "./demo/seed";
import {
  subscribe,
  getEntriesSnapshot,
  getEntriesServerSnapshot,
  getModeSnapshot,
  getModeServerSnapshot,
  writeEntries,
  writeMode,
  isHydratedStore,
  type DataMode,
} from "./entryStore";

export type { DataMode };

interface StoreValue {
  /** False during SSR and the first hydration pass. */
  ready: boolean;
  mode: DataMode;
  setMode: (m: DataMode) => void;
  /** The entries currently being viewed — demo or real, per `mode`. */
  entries: Entry[];
  /** The user's own entries, regardless of the current mode. */
  myEntries: Entry[];
  demoEntries: Entry[];
  saveEntry: (entry: Entry) => void;
  deleteEntry: (id: string) => void;
  clearMine: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const ready = useSyncExternalStore(
    isHydratedStore.subscribe,
    isHydratedStore.getSnapshot,
    isHydratedStore.getServerSnapshot,
  );

  const myEntries = useSyncExternalStore(
    subscribe,
    getEntriesSnapshot,
    getEntriesServerSnapshot,
  );

  const storedMode = useSyncExternalStore(
    subscribe,
    getModeSnapshot,
    getModeServerSnapshot,
  );

  // The demo diary is generated, never persisted, so it can never be
  // confused with or merged into real entries.
  const demoEntries = useMemo(() => buildDemoEntries(), []);

  // With no explicit choice recorded, land on the demo unless the visitor
  // already has a diary of their own.
  const mode: DataMode =
    storedMode ?? (myEntries.length > 0 ? "mine" : "demo");

  const saveEntry = useCallback(
    (entry: Entry) => {
      const current = getEntriesSnapshot();
      // One entry per calendar day: saving today again replaces today.
      const next = [
        ...current.filter((e) => e.date !== entry.date),
        entry,
      ].sort((a, b) => a.date.localeCompare(b.date));
      writeEntries(next);
    },
    [],
  );

  const deleteEntry = useCallback((id: string) => {
    writeEntries(getEntriesSnapshot().filter((e) => e.id !== id));
  }, []);

  const clearMine = useCallback(() => writeEntries([]), []);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      mode,
      setMode: writeMode,
      entries: mode === "demo" ? demoEntries : myEntries,
      myEntries,
      demoEntries,
      saveEntry,
      deleteEntry,
      clearMine,
    }),
    [ready, mode, demoEntries, myEntries, saveEntry, deleteEntry, clearMine],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
