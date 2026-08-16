"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  BINARY_FACTORS,
  CONCERNS,
  CONCERN_META,
  FACTOR_META,
} from "@/lib/domain";
import { formatDayLong, relativeDay } from "@/lib/dates";
import { seriesColor } from "@/components/charts";

export default function LogPage() {
  const { entries, mode, ready, deleteEntry, clearMine, myEntries } = useStore();
  const [confirmClear, setConfirmClear] = useState(false);

  if (!ready) return <div className="py-24" aria-busy="true" />;

  const ordered = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="py-8 sm:py-10">
      <header className="max-w-2xl">
        <p className="eyebrow">
          {mode === "demo" ? "Demo diary" : "Your diary"} · {entries.length}{" "}
          entries
        </p>
        <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight sm:text-[38px]">
          The log
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
          Every reading, newest first. This is the raw material — the analysis
          on the insights page is computed from exactly this and nothing else.
        </p>
      </header>

      {ordered.length === 0 ? (
        <div className="mt-8 border border-dashed bg-[var(--surface)] p-6">
          <p className="text-[15px]">Nothing logged yet.</p>
          <Link
            href="/today"
            className="mt-3 inline-block rounded-[3px] bg-[var(--ink)] px-3 py-2 text-[13px] font-medium text-[var(--surface)]"
          >
            Take your first reading
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-2">
          {ordered.map((entry) => (
            <article
              key={entry.id}
              className="border bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[14px] font-semibold">
                  {formatDayLong(entry.date)}
                </h2>
                <span className="reading text-[11.5px] text-[var(--ink-3)]">
                  {relativeDay(entry.date)}
                </span>
                <span
                  className="reading rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    background:
                      entry.source === "live"
                        ? "color-mix(in srgb, var(--good) 20%, transparent)"
                        : entry.source === "demo"
                          ? "color-mix(in srgb, var(--warning) 25%, transparent)"
                          : "var(--surface-3)",
                  }}
                >
                  {entry.source === "live"
                    ? "LIVE API"
                    : entry.source === "demo"
                      ? "DEMO"
                      : "SIMULATED"}
                </span>
                {entry.overall !== null && (
                  <span className="reading ml-auto text-[12px] text-[var(--ink-2)]">
                    overall {entry.overall.toFixed(1)}
                    {entry.skinAge !== null && ` · skin age ${entry.skinAge}`}
                  </span>
                )}
              </div>

              {/* Scores */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 lg:grid-cols-7">
                {CONCERNS.map((c) => (
                  <div key={c} className="flex items-baseline gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                      style={{ background: seriesColor(c) }}
                    />
                    <span className="truncate text-[11.5px] text-[var(--ink-2)]">
                      {CONCERN_META[c].label}
                    </span>
                    <span className="reading ml-auto text-[12px] font-medium">
                      {typeof entry.scores[c] === "number"
                        ? entry.scores[c]!.toFixed(1)
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Log */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-[12px]">
                {entry.log.sleepHours !== null && (
                  <LogChip label="Sleep" value={`${entry.log.sleepHours}h`} />
                )}
                {entry.log.waterLitres !== null && (
                  <LogChip label="Water" value={`${entry.log.waterLitres}L`} />
                )}
                {entry.log.stress !== null && (
                  <LogChip label="Stress" value={`${entry.log.stress}/5`} />
                )}
                {BINARY_FACTORS.filter((f) => entry.log[f]).map((f) => (
                  <span
                    key={f}
                    className="rounded-[2px] bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px]"
                  >
                    {FACTOR_META[f].label}
                  </span>
                ))}
                {entry.photo && (
                  <span className="reading text-[11px] text-[var(--ink-3)]">
                    light {entry.photo.brightness.toFixed(0)}/255
                  </span>
                )}
                {mode === "mine" && (
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="ml-auto text-[11.5px] text-[var(--ink-3)] underline underline-offset-2 hover:text-[var(--critical)]"
                  >
                    Delete
                  </button>
                )}
              </div>

              {entry.log.productChanged && entry.log.productName && (
                <p className="mt-2 border-l-2 border-l-[var(--ink)] pl-2 text-[12.5px]">
                  <strong className="font-medium">Product change:</strong>{" "}
                  {entry.log.productName}
                </p>
              )}

              {entry.log.note && (
                <p className="mt-2 text-[12.5px] italic leading-relaxed text-[var(--ink-2)]">
                  {entry.log.note}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {mode === "mine" && myEntries.length > 0 && (
        <div className="mt-8 border-t pt-4">
          {confirmClear ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px]">
                Delete all {myEntries.length} of your entries? This cannot be
                undone.
              </p>
              <button
                onClick={() => {
                  clearMine();
                  setConfirmClear(false);
                }}
                className="rounded-[3px] bg-[var(--critical)] px-3 py-1.5 text-[12.5px] font-medium text-white"
              >
                Delete everything
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="text-[12.5px] underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-[12.5px] text-[var(--ink-3)] underline underline-offset-2 hover:text-[var(--ink)]"
            >
              Delete my diary
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LogChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[var(--ink-3)]">{label}</span>
      <span className="reading font-medium">{value}</span>
    </span>
  );
}
