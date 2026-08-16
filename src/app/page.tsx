"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { analyse, bestPerPair, ANALYSIS_CONFIG } from "@/lib/analysis/engine";
import { CONCERNS, CONCERN_META, type Concern } from "@/lib/domain";
import { MetricSpark, TrendChart } from "@/components/charts";
import {
  HeadlineFinding,
  ProductFindingCard,
  TestRegister,
} from "@/components/findings";
import { formatDay } from "@/lib/dates";

export default function InsightsPage() {
  const { entries, ready, mode } = useStore();
  const [selected, setSelected] = useState<Concern | null>(null);

  const result = useMemo(() => analyse(entries), [entries]);
  const deduped = useMemo(() => bestPerPair(result.findings), [result]);

  // Everything that cleared the corrected-significance bar, and the
  // handful we lead with. These are counted separately so the summary
  // line can state the true number of survivors rather than the number
  // of cards on screen.
  const survivors = deduped.filter(
    (f) => f.confidence === "strong" || f.confidence === "moderate",
  );
  const headlines = survivors.slice(0, 3);

  // Focus the chart on whatever the strongest finding is about, unless
  // the reader has picked something else.
  const focusMetric: Concern =
    selected ?? headlines[0]?.metricId ?? CONCERNS[0];
  const focusFactor =
    selected === null
      ? (headlines[0]?.factorId ?? null)
      : (deduped.find(
          (f) =>
            f.metricId === selected &&
            (f.confidence === "strong" || f.confidence === "moderate"),
        )?.factorId ?? null);

  if (!ready) {
    return <div className="py-24" aria-busy="true" />;
  }

  const { quality } = result;
  const hasEnough = quality.entryCount >= ANALYSIS_CONFIG.minPairedObservations;

  return (
    <div className="py-8 sm:py-10">
      {/* ---------------- Hero ---------------- */}
      <header className="max-w-3xl">
        <p className="eyebrow">
          {mode === "demo" ? "Demo diary" : "Your diary"} ·{" "}
          {quality.entryCount} readings
          {quality.firstDate && quality.lastDate ? (
            <> · {formatDay(quality.firstDate)}–{formatDay(quality.lastDate)}</>
          ) : null}
        </p>
        <h1 className="mt-2 text-[34px] leading-[1.08] font-semibold tracking-tight sm:text-[44px]">
          What actually
          <br />
          changed your skin
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--ink-2)]">
          Every skin app scores you once and tells you what your face looks
          like today. This one photographs you repeatedly, logs what you did,
          and reports which of those things actually track with your skin
          metrics — with the sample size printed next to every claim.
        </p>
      </header>

      {!hasEnough ? (
        <EmptyState count={quality.entryCount} />
      ) : (
        <>
          {/* ---------------- Headline findings ---------------- */}
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-[15px] font-semibold">
                {headlines.length > 0
                  ? "What we found"
                  : "Nothing survived the correction"}
              </h2>
              <p className="text-[13px] text-[var(--ink-2)]">
                {survivors.length > 0 ? (
                  <>
                    <span className="reading">{survivors.length}</span> of{" "}
                    <span className="reading">{result.hypothesesTested}</span>{" "}
                    tested relationships survived correction for multiple
                    comparisons
                    {survivors.length > headlines.length ? (
                      <>
                        {" "}
                        — the strongest{" "}
                        <span className="reading">{headlines.length}</span> are
                        below, the rest are in the register
                      </>
                    ) : null}
                    .
                  </>
                ) : (
                  <>
                    We tested{" "}
                    <span className="reading">{result.hypothesesTested}</span>{" "}
                    relationships and none of them held up. That is a real
                    result, not a failure.
                  </>
                )}
              </p>
            </div>

            {headlines.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {headlines.map((f, i) => (
                  <HeadlineFinding key={f.id} finding={f} rank={i + 1} />
                ))}
              </div>
            ) : (
              <p className="mt-4 max-w-2xl border bg-[var(--surface)] p-4 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                Either the things you are logging genuinely do not move your
                skin, or there is not yet enough data to tell. Keep logging —
                the register below shows how close each one came.
              </p>
            )}
          </section>

          {/* ---------------- Trend ---------------- */}
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold">
                {CONCERN_META[focusMetric].label} over time
              </h2>
              <p className="text-[13px] text-[var(--ink-2)]">
                {CONCERN_META[focusMetric].blurb} Higher is better.
              </p>
            </div>

            <div className="mt-3 border bg-[var(--surface)] p-3 sm:p-4">
              <TrendChart
                entries={entries}
                metricId={focusMetric}
                factorId={focusFactor}
                productChanges={result.productChanges}
                height={focusFactor ? 280 : 226}
              />
              {focusFactor && (
                <p className="mt-1 border-t pt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
                  The strip below the plot is the logged factor on its own
                  scale, sharing only the date axis. It is drawn separately
                  rather than on a second y-axis, because overlaying two
                  scales on one plot makes any two lines look related.
                </p>
              )}
            </div>

            <p className="eyebrow mt-6">All seven metrics</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {CONCERNS.map((c) => (
                <MetricSpark
                  key={c}
                  entries={entries}
                  metricId={c}
                  selected={c === focusMetric}
                  onSelect={() => setSelected(c)}
                />
              ))}
            </div>
          </section>

          {/* ---------------- Products ---------------- */}
          {result.productFindings.length > 0 && (
            <section className="mt-10">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[15px] font-semibold">Did the product work?</h2>
                <p className="max-w-2xl text-[13px] text-[var(--ink-2)]">
                  Each product change splits the diary in two. We compare the{" "}
                  <span className="reading">
                    {ANALYSIS_CONFIG.productWindowDays}
                  </span>{" "}
                  days before against the{" "}
                  <span className="reading">
                    {ANALYSIS_CONFIG.productWindowDays}
                  </span>{" "}
                  days after a{" "}
                  <span className="reading">
                    {ANALYSIS_CONFIG.productWashoutDays}
                  </span>
                  -day washout, because nothing works on day one.
                </p>
              </div>
              {(() => {
                const moved = result.productFindings.filter(
                  (f) => f.confidence === "strong" || f.confidence === "moderate",
                );
                const unmoved = result.productFindings.filter(
                  (f) => f.confidence === "none" || f.confidence === "weak",
                );
                return (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {(moved.length > 0 ? moved : result.productFindings.slice(0, 2)).map(
                        (f) => (
                          <ProductFindingCard key={f.id} finding={f} />
                        ),
                      )}
                    </div>
                    {moved.length > 0 && unmoved.length > 0 && (
                      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
                        The other{" "}
                        <span className="reading">{unmoved.length}</span>{" "}
                        metrics showed no clear change over the same window:{" "}
                        {unmoved
                          .map((f) => CONCERN_META[f.metricId].label.toLowerCase())
                          .join(", ")}
                        . A product that moves one metric and leaves the rest
                        alone is the normal, believable result — one that
                        appears to improve everything at once is usually a sign
                        that something else changed.
                      </p>
                    )}
                  </>
                );
              })()}
            </section>
          )}

          {/* ---------------- Register ---------------- */}
          <div className="mt-12">
            <TestRegister
              findings={deduped}
              hypothesesTested={result.hypothesesTested}
            />
          </div>
        </>
      )}

      {/* ---------------- Quality ---------------- */}
      <section className="mt-12">
        <h2 className="text-[15px] font-semibold">How much to trust this</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="border bg-[var(--surface)] p-4">
            <p className="eyebrow">Your data</p>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <Row label="Readings" value={String(quality.entryCount)} />
              <Row
                label="Days covered"
                value={quality.spanDays ? String(quality.spanDays) : "—"}
              />
              <Row
                label="Days missed"
                value={String(quality.missedDays)}
              />
              <Row
                label="Lighting consistency"
                value={
                  quality.brightnessSd !== null
                    ? `±${quality.brightnessSd.toFixed(0)} / 255`
                    : "not measured"
                }
              />
              <Row
                label="Hypotheses tested"
                value={String(result.hypothesesTested)}
              />
            </dl>
          </div>

          <div className="border bg-[var(--surface)] p-4">
            <p className="eyebrow">Warnings</p>
            {quality.warnings.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--ink-2)]">
                No data-quality problems detected.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {quality.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[13px] leading-relaxed text-[var(--ink-2)]"
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
          </div>
        </div>

        <LimitsStrip />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-1.5 last:border-0">
      <dt className="text-[var(--ink-2)]">{label}</dt>
      <dd className="reading font-medium">{value}</dd>
    </div>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <section className="mt-8 border border-dashed bg-[var(--surface)] p-6">
      <p className="eyebrow">Not enough data</p>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed">
        You have <span className="reading">{count}</span>{" "}
        {count === 1 ? "reading" : "readings"}. Skin Diary will not report a
        correlation below{" "}
        <span className="reading">{ANALYSIS_CONFIG.minPairedObservations}</span>{" "}
        paired observations, because a correlation over four points is noise
        and showing it would be worse than showing nothing.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/today"
          className="rounded-[3px] bg-[var(--ink)] px-3 py-2 text-[13px] font-medium text-[var(--surface)]"
        >
          Take today&rsquo;s reading
        </Link>
        <span className="self-center text-[13px] text-[var(--ink-2)]">
          or switch to the demo diary above to see a full six weeks.
        </span>
      </div>
    </section>
  );
}

function LimitsStrip() {
  return (
    <div className="mt-3 border-l-2 border-l-[var(--warning)] bg-[var(--surface)] p-4">
      <p className="eyebrow">Read this before believing any of it</p>
      <ul className="mt-2 grid gap-1.5 text-[13px] leading-relaxed text-[var(--ink-2)] sm:grid-cols-2">
        <li>
          <strong className="font-medium text-[var(--ink)]">
            Correlation is not causation.
          </strong>{" "}
          Sleeping more on the days you also drink less is not the same as
          sleep improving your skin.
        </li>
        <li>
          <strong className="font-medium text-[var(--ink)]">
            Lighting moves the numbers.
          </strong>{" "}
          A different lamp can shift a reading more than a good week of
          sleep can.
        </li>
        <li>
          <strong className="font-medium text-[var(--ink)]">
            Small samples lie.
          </strong>{" "}
          Every claim above carries its n. Distrust the small ones.
        </li>
        <li>
          <strong className="font-medium text-[var(--ink)]">
            This is not medical advice.
          </strong>{" "}
          Skin Diary is not a diagnostic tool. See a dermatologist for
          anything that concerns you.
        </li>
      </ul>
      <Link
        href="/method"
        className="mt-3 inline-block text-[13px] underline underline-offset-2"
      >
        The full method, and everything it cannot tell you
      </Link>
    </div>
  );
}
