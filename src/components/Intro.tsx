"use client";

import { useEffect, useState } from "react";
import { Mark } from "./Mark";

/**
 * The mark draws itself once, then gets out of the way.
 *
 * Once per session, not per page load. Making somebody sit through an intro
 * every single time is how you teach them to close the tab, and this app
 * already asks for weeks of their patience.
 */
export function Intro() {
  const [phase, setPhase] = useState<"wait" | "playing" | "gone">("wait");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem("slepton.intro") === "1";
    } catch {
      /* private mode: just play it */
    }
    if (seen) {
      setPhase("gone");
      return;
    }
    try {
      window.sessionStorage.setItem("slepton.intro", "1");
    } catch {
      /* ignore */
    }
    setPhase("playing");
    const t = setTimeout(() => setPhase("gone"), 2100);
    return () => clearTimeout(t);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (phase !== "playing") return null;

  return (
    <div className="intro-veil fixed inset-0 z-50 grid place-items-center bg-[var(--paper)]">
      <div className="flex flex-col items-center gap-5">
        <div className="intro-mark text-[var(--ink)]">
          <Mark size={72} />
        </div>
        <span className="intro-word display text-[26px] tracking-[-0.01em]">
          Slept On
        </span>
        <span className="intro-word-2 text-[12px] tracking-[0.22em] text-[var(--ink-3)] uppercase">
          it was the sleep
        </span>
      </div>
    </div>
  );
}
