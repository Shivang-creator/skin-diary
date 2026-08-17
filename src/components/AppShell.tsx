"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { Wordmark } from "./Mark";
import { Intro } from "./Intro";

const NAV = [
  { href: "/", label: "Insights" },
  { href: "/today", label: "Today" },
  { href: "/log", label: "Log" },
  { href: "/method", label: "Method" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-full">
      <Intro />
      {/* The chart-paper ground: one ruled sheet behind the whole app. */}
      <div
        aria-hidden
        className="chart-paper pointer-events-none fixed inset-0 -z-10"
      />

      <header className="sticky top-0 z-20 border-b bg-[var(--paper)]/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <Wordmark size={22} />
            <span className="hidden text-[11px] text-[var(--ink-3)] sm:inline">
              a skin notebook that counts its own guesses
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-[3px] px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-[var(--ink)] text-[var(--surface)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <ModeBar />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-6xl border-t px-4 py-8 text-[12px] leading-relaxed text-[var(--ink-3)] sm:px-6">
        <p className="max-w-2xl">
          Slept On is a self-tracking notebook, not a medical device. It does not
          diagnose anything, treat anything, or give dermatological advice. Skin
          numbers come from the Perfect Corp YouCam AI Skin Analysis API. Every
          correlation is worked out on your own device, by arithmetic you can
          check.{" "}
          <Link href="/method" className="underline underline-offset-2">
            The method, and where it breaks
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}

/**
 * The demo/real switch.
 *
 * Always visible, because a visitor must never be in doubt about whether
 * the numbers on screen are theirs or ours.
 */
function ModeBar() {
  const { mode, setMode, myEntries, ready } = useStore();

  return (
    <div className="border-t bg-[var(--surface-2)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <div
          className="flex rounded-[3px] border p-0.5"
          role="group"
          aria-label="Which diary to show"
        >
          <button
            onClick={() => setMode("demo")}
            aria-pressed={mode === "demo"}
            className={`rounded-[2px] px-2.5 py-1 text-[12px] transition-colors ${
              mode === "demo"
                ? "bg-[var(--ink)] text-[var(--surface)]"
                : "text-[var(--ink-2)] hover:text-[var(--ink)]"
            }`}
          >
            Demo diary
          </button>
          <button
            onClick={() => setMode("mine")}
            aria-pressed={mode === "mine"}
            className={`rounded-[2px] px-2.5 py-1 text-[12px] transition-colors ${
              mode === "mine"
                ? "bg-[var(--ink)] text-[var(--surface)]"
                : "text-[var(--ink-2)] hover:text-[var(--ink)]"
            }`}
          >
            My diary
            {ready && myEntries.length > 0 ? (
              <span className="reading ml-1.5 text-[11px] opacity-70">
                {myEntries.length}
              </span>
            ) : null}
          </button>
        </div>

        <p className="text-[12px] text-[var(--ink-2)]">
          {mode === "demo" ? (
            <>
              <span className="reading rounded-[2px] bg-[var(--warning)]/20 px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink)]">
                DEMO DATA
              </span>{" "}
              A synthetic six-week diary, so the analysis has something to
              work with. These are not real readings.
            </>
          ) : ready && myEntries.length === 0 ? (
            <>
              Your diary is empty.{" "}
              <Link href="/today" className="underline underline-offset-2">
                Take your first reading
              </Link>
              .
            </>
          ) : (
            <>Your own entries, stored only in this browser.</>
          )}
        </p>
      </div>
    </div>
  );
}
