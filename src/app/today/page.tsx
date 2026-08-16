"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  CONCERNS,
  CONCERN_META,
  UNITS_PER_CAPTURE,
  emptyLog,
  type Concern,
  type DailyLog,
  type Entry,
  type PhotoStats,
} from "@/lib/domain";
import { preparePhoto, lightingDeviation } from "@/lib/image";
import { formatDayLong, relativeDay, todayKey } from "@/lib/dates";
import { LogForm } from "@/components/LogForm";
import { seriesColor } from "@/components/charts";

type Phase = "idle" | "preparing" | "ready" | "analysing" | "done" | "error";

interface AnalysisPayload {
  mode: "live" | "simulated";
  scores: Partial<Record<Concern, number>>;
  uiScores: Partial<Record<Concern, number>>;
  overall: number | null;
  skinAge: number | null;
  unitsConsumed: number;
  notice?: string;
  elapsedMs?: number;
}

export default function TodayPage() {
  const { myEntries, saveEntry, mode, setMode, ready } = useStore();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [photo, setPhoto] = useState<{ blob: Blob; stats: PhotoStats } | null>(
    null,
  );
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [log, setLog] = useState<DailyLog>(emptyLog());
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = todayKey();
  const existing = myEntries.find((e) => e.date === today);

  // Prefill from an existing entry for today, so re-opening the page
  // continues the day rather than starting over.
  //
  // Adjusted during render rather than in an effect: this is React's
  // documented pattern for resetting state when the value it derives from
  // changes, and it avoids the extra render pass an effect would cost.
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (existing && seededFrom !== existing.id) {
    setSeededFrom(existing.id);
    setLog(existing.log);
  }

  const onPickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPhase("preparing");
      setError(null);
      setSaved(false);
      try {
        const prepared = await preparePhoto(file);
        const history = myEntries
          .map((e) => e.photo)
          .filter((p): p is PhotoStats => p !== null);
        const deviation = lightingDeviation(prepared.stats, history);
        setPhoto({ blob: prepared.blob, stats: prepared.stats });
        setWarnings(
          [...prepared.warnings, deviation.message].filter(
            (w): w is string => Boolean(w),
          ),
        );
        setPhase("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read that photo.");
        setPhase("error");
      }
    },
    [myEntries],
  );

  const runAnalysis = useCallback(async () => {
    if (!photo) return;
    setPhase("analysing");
    setError(null);
    try {
      const form = new FormData();
      form.append("image", photo.blob, "capture.jpg");
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "The analysis failed.");
        setPhase("error");
        return;
      }
      setAnalysis(body as AnalysisPayload);
      setPhase("done");
    } catch {
      setError("Could not reach the analysis service. Check your connection.");
      setPhase("error");
    }
  }, [photo]);

  const save = useCallback(() => {
    if (!analysis) return;
    const entry: Entry = {
      id: existing?.id ?? `entry-${today}-${Date.now()}`,
      date: today,
      createdAt: new Date().toISOString(),
      source: analysis.mode === "live" ? "live" : "fixture",
      scores: analysis.scores,
      overall: analysis.overall,
      skinAge: analysis.skinAge,
      photo: photo?.stats ?? null,
      log,
    };
    saveEntry(entry);
    setSaved(true);
    if (mode !== "mine") setMode("mine");
  }, [analysis, existing, today, photo, log, saveEntry, mode, setMode]);

  return (
    <div className="py-8 sm:py-10">
      <header className="max-w-2xl">
        <p className="eyebrow">{formatDayLong(today)}</p>
        <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight sm:text-[38px]">
          Today&rsquo;s reading
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
          One photo and about twenty seconds of logging. The log is the part
          that makes the analysis possible — the photo alone can only tell you
          what your skin is like, never why.
        </p>
      </header>

      {existing && !saved && (
        <p className="mt-4 max-w-2xl border-l-2 border-l-[var(--warning)] bg-[var(--surface)] p-3 text-[13px] leading-relaxed">
          You already saved a reading today ({relativeDay(existing.date)}).
          Saving again replaces it — one entry per day keeps the analysis
          honest.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------------- Capture ---------------- */}
        <section>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold">1 · The photo</h2>
            <UnitsChip />
          </div>

          <div className="mt-3 border bg-[var(--surface)] p-4">
            {photo ? (
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.stats.thumbnail}
                  alt="Your capture, downscaled preview"
                  className="h-28 w-auto border object-cover"
                />
                <dl className="flex-1 space-y-1 text-[12px]">
                  <p className="eyebrow">Capture conditions</p>
                  <MeasureRow
                    label="Brightness"
                    value={`${photo.stats.brightness.toFixed(0)} / 255`}
                  />
                  <MeasureRow
                    label="Contrast"
                    value={photo.stats.contrast.toFixed(0)}
                  />
                  <MeasureRow
                    label="Warmth"
                    value={`${photo.stats.warmth >= 0 ? "+" : "−"}${Math.abs(photo.stats.warmth).toFixed(0)}`}
                  />
                </dl>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  Front-facing, even light, hair off your forehead, no glasses.
                  <br />
                  Your face needs to fill more than 60% of the frame.
                </p>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              capture="user"
              className="sr-only"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-[3px] bg-[var(--ink)] px-3 py-2 text-[13px] font-medium text-[var(--surface)]"
              >
                {photo ? "Choose a different photo" : "Take or choose a photo"}
              </button>
              {photo && phase !== "done" && (
                <button
                  onClick={runAnalysis}
                  disabled={phase === "analysing"}
                  className="rounded-[3px] border border-[var(--ink)] px-3 py-2 text-[13px] font-medium disabled:opacity-50"
                >
                  {phase === "analysing" ? "Analysing…" : "Analyse this photo"}
                </button>
              )}
            </div>

            {warnings.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t pt-3">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--warning)" }}
                    />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p
                role="alert"
                className="mt-3 border-l-2 border-l-[var(--critical)] bg-[var(--surface-2)] p-3 text-[13px] leading-relaxed"
              >
                {error}
              </p>
            )}
          </div>

          {analysis && <ResultPanel analysis={analysis} />}
        </section>

        {/* ---------------- Log ---------------- */}
        <section>
          <h2 className="text-[15px] font-semibold">2 · The boring part</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">
            Yesterday&rsquo;s numbers, since that is what today&rsquo;s face is
            reacting to.
          </p>
          <div className="mt-3">
            <LogForm value={log} onChange={setLog} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={!analysis || saved}
              className="rounded-[3px] bg-[var(--ink)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saved ? "Saved" : "Save today's entry"}
            </button>
            {!analysis && (
              <p className="text-[12.5px] text-[var(--ink-3)]">
                Analyse a photo first.
              </p>
            )}
            {saved && (
              <Link
                href="/"
                className="text-[13px] underline underline-offset-2"
              >
                See what it changed
              </Link>
            )}
          </div>

          {ready && myEntries.length > 0 && (
            <p className="reading mt-4 text-[12px] text-[var(--ink-3)]">
              {myEntries.length} entries saved in this browser.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function MeasureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b pb-1 last:border-0">
      <dt className="text-[var(--ink-2)]">{label}</dt>
      <dd className="reading font-medium">{value}</dd>
    </div>
  );
}

function ResultPanel({ analysis }: { analysis: AnalysisPayload }) {
  return (
    <div className="mt-4 border bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="eyebrow">Result</p>
        <span
          className="reading rounded-[2px] px-1.5 py-0.5 text-[10.5px] font-medium"
          style={{
            background:
              analysis.mode === "live"
                ? "color-mix(in srgb, var(--good) 20%, transparent)"
                : "color-mix(in srgb, var(--warning) 25%, transparent)",
          }}
        >
          {analysis.mode === "live" ? "LIVE YOUCAM API" : "SIMULATED"}
        </span>
        {analysis.mode === "live" && (
          <span className="reading ml-auto text-[11px] text-[var(--ink-3)]">
            {analysis.unitsConsumed} units
            {analysis.elapsedMs
              ? ` · ${(analysis.elapsedMs / 1000).toFixed(1)}s`
              : ""}
          </span>
        )}
      </div>

      {analysis.notice && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          {analysis.notice}
        </p>
      )}

      <dl className="mt-3 space-y-1">
        {CONCERNS.map((c) => {
          const v = analysis.scores[c];
          return (
            <div
              key={c}
              className="flex items-center gap-2 border-b py-1 last:border-0"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                style={{ background: seriesColor(c) }}
              />
              <dt className="text-[13px]">{CONCERN_META[c].label}</dt>
              <dd className="reading ml-auto text-[13px] font-semibold">
                {typeof v === "number" ? v.toFixed(1) : "—"}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
        Scores are YouCam&rsquo;s <span className="reading">raw_score</span>,
        1–100, where higher means healthier. We store the raw value rather than{" "}
        <span className="reading">ui_score</span>, which YouCam deliberately
        flatters for consumer display.
      </p>
    </div>
  );
}

/** Live unit balance, so the cost of a capture is known before spending it. */
function UnitsChip() {
  const [data, setData] = useState<{
    configured: boolean;
    balance: number | null;
    costPerCapture: number;
    capturesRemaining?: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/units")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  if (!data.configured) {
    return (
      <span className="reading ml-auto text-[11px] text-[var(--ink-3)]">
        fixture mode · 0 units
      </span>
    );
  }

  return (
    <span className="reading ml-auto text-[11px] text-[var(--ink-3)]">
      {data.balance !== null ? `${data.balance.toFixed(0)} units left` : "—"} ·{" "}
      {data.costPerCapture ?? UNITS_PER_CAPTURE}/capture
      {data.capturesRemaining !== undefined
        ? ` · ${data.capturesRemaining} left`
        : ""}
    </span>
  );
}
