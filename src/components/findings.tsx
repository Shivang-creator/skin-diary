"use client";

import { useState } from "react";
import {
  CONCERN_META,
  FACTOR_META,
  type Concern,
} from "@/lib/domain";
import { CONFIDENCE_LABEL, type Confidence } from "@/lib/stats/correlation";
import type { Finding, ProductFinding } from "@/lib/analysis/engine";
import { seriesColor } from "./charts";
import { formatDay } from "@/lib/dates";

/**
 * Confidence badge.
 *
 * Colour is paired with a word, always — a status colour never carries
 * the meaning on its own. "Not enough data" is shown with the same
 * prominence as "Strong signal", because the whole point is that a
 * finding over nine days must not look like a finding over forty.
 */
export function ConfidenceBadge({
  confidence,
  n,
}: {
  confidence: Confidence;
  n?: number;
}) {
  const style: Record<Confidence, { bg: string; fg: string }> = {
    strong: { bg: "var(--good)", fg: "var(--good)" },
    moderate: { bg: "var(--warning)", fg: "var(--ink)" },
    weak: { bg: "var(--serious)", fg: "var(--ink)" },
    none: { bg: "var(--ink-3)", fg: "var(--ink-2)" },
    insufficient: { bg: "var(--ink-3)", fg: "var(--ink-2)" },
  };
  const s = style[confidence];

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: s.bg }}
      />
      <span className="text-[11px] font-medium" style={{ color: s.fg }}>
        {CONFIDENCE_LABEL[confidence]}
      </span>
      {n !== undefined && (
        <span className="reading text-[11px] text-[var(--ink-3)]">n={n}</span>
      )}
    </span>
  );
}

/** A headline finding, given room to be read. */
export function HeadlineFinding({
  finding,
  rank,
}: {
  finding: Finding;
  rank: number;
}) {
  const color = seriesColor(finding.metricId);

  return (
    <article className="relative border bg-[var(--surface)] p-5">
      <div
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: color }}
      />
      <div className="flex items-center gap-2">
        <span className="eyebrow">Finding {String(rank).padStart(2, "0")}</span>
        <span className="ml-auto">
          <ConfidenceBadge confidence={finding.confidence} />
        </span>
      </div>

      <p className="mt-2 text-[17px] leading-snug font-medium">
        {finding.sentence}
      </p>

      <p className="reading mt-2.5 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
        {finding.detail}
      </p>

      {finding.brightnessAdjusted && (
        <p className="mt-2 border-t pt-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
          {finding.brightnessAdjusted.collapsed ? (
            <>
              <strong className="font-medium text-[var(--critical)]">
                Probably lighting.
              </strong>{" "}
              Holding photo brightness constant, this drops to{" "}
              <span className="reading">
                ρ = {finding.brightnessAdjusted.r.toFixed(2)}
              </span>
              . Treat it as an artefact of how the photos were lit.
            </>
          ) : (
            <>
              <strong className="font-medium">Survives the lighting check.</strong>{" "}
              With photo brightness held constant it is still{" "}
              <span className="reading">
                ρ = {finding.brightnessAdjusted.r.toFixed(2)}
              </span>
              , so this is not just a change in how the photos were lit.
            </>
          )}
        </p>
      )}
    </article>
  );
}

export function ProductFindingCard({ finding }: { finding: ProductFinding }) {
  const better = finding.diff > 0;
  return (
    <article className="border bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2">
        <span className="eyebrow">
          Product · started {formatDay(finding.changeDate)}
        </span>
        <span className="ml-auto">
          <ConfidenceBadge confidence={finding.confidence} />
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-snug font-medium">
        {finding.sentence}
      </p>
      <div className="mt-3 flex items-end gap-4">
        <Stat label="Before" value={finding.beforeMean} n={finding.nBefore} />
        <div
          className="reading pb-1 text-[15px] font-semibold"
          style={{ color: better ? "var(--good-ink)" : "var(--critical)" }}
        >
          {better ? "+" : "−"}
          {Math.abs(finding.diff).toFixed(1)}
        </div>
        <Stat label="After" value={finding.afterMean} n={finding.nAfter} />
      </div>
      <p className="reading mt-2.5 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
        {finding.detail}
      </p>
    </article>
  );
}

function Stat({
  label,
  value,
  n,
}: {
  label: string;
  value: number;
  n: number;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="reading text-[18px] font-semibold leading-tight">
        {value.toFixed(1)}
      </div>
      <div className="reading text-[10px] text-[var(--ink-3)]">n={n}</div>
    </div>
  );
}

/**
 * The full test register.
 *
 * Every hypothesis tested, including the ones that found nothing. This is
 * here on purpose: showing only the hits is how a tool like this becomes
 * a horoscope. If we tested 147 relationships and six survived, the
 * other 141 are part of the result.
 */
export function TestRegister({
  findings,
  hypothesesTested,
}: {
  findings: Finding[];
  hypothesesTested: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [metricFilter, setMetricFilter] = useState<Concern | "all">("all");

  const filtered =
    metricFilter === "all"
      ? findings
      : findings.filter((f) => f.metricId === metricFilter);
  const shown = expanded ? filtered : filtered.slice(0, 8);

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold">Everything we tested</h2>
        <p className="text-[13px] text-[var(--ink-2)]">
          All{" "}
          <span className="reading">{hypothesesTested}</span> hypotheses, hits
          and misses alike.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        <FilterChip
          active={metricFilter === "all"}
          onClick={() => setMetricFilter("all")}
        >
          All metrics
        </FilterChip>
        {Object.values(CONCERN_META).map((m) => (
          <FilterChip
            key={m.id}
            active={metricFilter === m.id}
            onClick={() => setMetricFilter(m.id)}
          >
            <span
              aria-hidden
              className="mr-1 inline-block h-2 w-2 rounded-[1px] align-middle"
              style={{ background: seriesColor(m.id) }}
            />
            {m.label}
          </FilterChip>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto border bg-[var(--surface)]">
        <table className="w-full min-w-[620px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b text-[var(--ink-3)]">
              <Th>Factor</Th>
              <Th>Metric</Th>
              <Th className="text-right">Lag</Th>
              <Th className="text-right">Effect</Th>
              <Th className="text-right">n</Th>
              <Th className="text-right">p</Th>
              <Th className="text-right">q</Th>
              <Th>Verdict</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <Td>{FACTOR_META[f.factorId].label}</Td>
                <Td>
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2 w-2 rounded-[1px] align-middle"
                    style={{ background: seriesColor(f.metricId) }}
                  />
                  {CONCERN_META[f.metricId].label}
                </Td>
                <Td className="reading text-right">
                  {f.lag === 0 ? "same day" : `+${f.lag}d`}
                </Td>
                <Td className="reading text-right">
                  {f.effect >= 0 ? "+" : "−"}
                  {Math.abs(f.effect).toFixed(2)}
                </Td>
                <Td className="reading text-right">{f.n}</Td>
                <Td className="reading text-right">
                  {f.p < 0.001 ? "<0.001" : f.p.toFixed(3)}
                </Td>
                <Td className="reading text-right">
                  {f.q < 0.001 ? "<0.001" : f.q.toFixed(3)}
                </Td>
                <Td>
                  <ConfidenceBadge confidence={f.confidence} />
                </Td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[var(--ink-3)]">
                  Nothing tested for this metric yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 8 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[12.5px] text-[var(--ink-2)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          {expanded
            ? "Show fewer"
            : `Show all ${filtered.length} results`}
        </button>
      )}

      <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-[var(--ink-3)]">
        <span className="reading">p</span> is the raw two-tailed probability of
        seeing an effect this large by chance.{" "}
        <span className="reading">q</span> is that value after a
        Benjamini-Hochberg correction across all {hypothesesTested} tests — the
        number that actually matters, because testing many things guarantees
        some of them look significant. Effect is Spearman&rsquo;s ρ for numeric
        factors and Cohen&rsquo;s d for yes/no factors.
      </p>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[3px] border px-2 py-1 text-[11.5px] transition-colors ${
        active
          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
          : "bg-[var(--surface)] text-[var(--ink-2)] hover:border-[var(--rule-strong)]"
      }`}
    >
      {children}
    </button>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
