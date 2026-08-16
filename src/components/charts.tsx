"use client";

/**
 * Charts.
 *
 * Hand-drawn SVG rather than a charting library, for three reasons: the
 * factor-overlay form below does not exist off the shelf, the page's
 * ruled-paper grid has to line up with the plot's own gridlines, and a
 * library would have shipped 100KB to draw seven polylines.
 *
 * Encoding rules held throughout:
 *  - ONE y-axis per plot. A factor is never drawn on a second scale
 *    against a metric; it gets its own aligned strip underneath, sharing
 *    only the x-axis. Two scales on one plot invent correlations.
 *  - Colour identifies a metric and nothing else. It never encodes
 *    magnitude, rank or goodness.
 *  - Hairline, solid gridlines. Never dashed.
 *  - Values are reachable without hovering: endpoints are labelled and
 *    every screen with a chart also offers the numbers as text.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONCERN_META,
  FACTOR_META,
  type Concern,
  type Entry,
  type FactorId,
} from "@/lib/domain";
import { formatDay, type DayKey } from "@/lib/dates";

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export function seriesColor(metricId: Concern): string {
  return `var(--series-${CONCERN_META[metricId].slot})`;
}

/* ------------------------------------------------------------------ */
/* Scales                                                              */
/* ------------------------------------------------------------------ */

function niceDomain(values: number[], padRatio = 0.12): [number, number] {
  if (values.length === 0) return [0, 100];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 5;
    max += 5;
  }
  const pad = (max - min) * padRatio;
  return [Math.max(0, min - pad), Math.min(100, max + pad)];
}

function ticksFor([min, max]: [number, number], count = 4): number[] {
  const span = max - min;
  const rawStep = span / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? mag * 10;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/* ------------------------------------------------------------------ */
/* TrendChart                                                          */
/* ------------------------------------------------------------------ */

export interface TrendChartProps {
  entries: Entry[];
  metricId: Concern;
  /** Optional factor drawn in its own aligned strip below. */
  factorId?: FactorId | null;
  productChanges?: Array<{ date: DayKey; name: string }>;
  height?: number;
}

export function TrendChart({
  entries,
  metricId,
  factorId = null,
  productChanges = [],
  height = 220,
}: TrendChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () =>
      entries
        .filter((e) => typeof e.scores[metricId] === "number")
        .map((e) => ({
          date: e.date,
          value: e.scores[metricId] as number,
          entry: e,
        })),
    [entries, metricId],
  );

  const stripHeight = factorId ? 54 : 0;
  const M = { top: 14, right: 52, bottom: 22, left: 40 };
  const plotH = height - M.top - M.bottom - stripHeight;
  const plotW = Math.max(0, width - M.left - M.right);

  const domain = useMemo(
    () => niceDomain(points.map((p) => p.value)),
    [points],
  );
  const yTicks = useMemo(() => ticksFor(domain), [domain]);

  if (points.length === 0) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-center border border-dashed py-10 text-[13px] text-[var(--ink-3)]"
      >
        No {CONCERN_META[metricId].label.toLowerCase()} readings yet.
      </div>
    );
  }

  const x = (i: number) =>
    points.length === 1
      ? M.left + plotW / 2
      : M.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) =>
    M.top + plotH - ((v - domain[0]) / (domain[1] - domain[0])) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const color = seriesColor(metricId);
  const last = points[points.length - 1];
  const active = hover !== null ? points[hover] : null;

  // Factor strip values, aligned to the same x positions.
  const factorMeta = factorId ? FACTOR_META[factorId] : null;
  const factorValues = factorId
    ? points.map((p) => {
        if (!factorMeta) return null;
        if (factorMeta.kind === "binary") {
          return p.entry.log[factorId as "alcohol"] ? 1 : 0;
        }
        const v = p.entry.log[factorId as "sleepHours"];
        return typeof v === "number" ? v : null;
      })
    : [];
  const factorNums = factorValues.filter(
    (v): v is number => typeof v === "number",
  );
  const factorDomain =
    factorMeta?.kind === "binary"
      ? ([0, 1] as [number, number])
      : niceDomain(factorNums, 0.15);

  const stripTop = M.top + plotH + 16;
  const stripPlotH = Math.max(0, stripHeight - 22);
  const fy = (v: number) =>
    stripTop +
    stripPlotH -
    ((v - factorDomain[0]) / (factorDomain[1] - factorDomain[0] || 1)) *
      stripPlotH;

  const nearestIndex = (clientX: number, rect: DOMRect) => {
    const rel = clientX - rect.left - M.left;
    if (points.length === 1) return 0;
    const i = Math.round((rel / plotW) * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, i));
  };

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${CONCERN_META[metricId].label} score over ${points.length} readings, from ${formatDay(points[0].date)} to ${formatDay(last.date)}`}
          onMouseMove={(e) =>
            setHover(nearestIndex(e.clientX, e.currentTarget.getBoundingClientRect()))
          }
          onMouseLeave={() => setHover(null)}
          className="touch-none"
        >
          {/* Horizontal gridlines — solid hairlines, one shade off paper. */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="reading"
                fontSize={10}
                fill="var(--ink-3)"
              >
                {t}
              </text>
            </g>
          ))}

          {/* Product changes: a labelled vertical rule at the event. */}
          {productChanges.map((pc) => {
            const idx = points.findIndex((p) => p.date >= pc.date);
            if (idx < 0) return null;
            return (
              <g key={`${pc.date}-${pc.name}`}>
                <line
                  x1={x(idx)}
                  x2={x(idx)}
                  y1={M.top}
                  y2={M.top + plotH + stripHeight}
                  stroke="var(--ink-3)"
                  strokeWidth={1}
                />
                <text
                  x={x(idx) + 4}
                  y={M.top + 8}
                  fontSize={9}
                  className="reading"
                  fill="var(--ink-2)"
                >
                  {pc.name.length > 22 ? `${pc.name.slice(0, 21)}…` : pc.name}
                </text>
              </g>
            );
          })}

          {/* The series */}
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Endpoint marker + direct label: the value is readable
              without hovering. */}
          <circle
            cx={x(points.length - 1)}
            cy={y(last.value)}
            r={4}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={2}
          />
          <text
            x={x(points.length - 1) + 9}
            y={y(last.value)}
            dominantBaseline="middle"
            className="reading"
            fontSize={12}
            fontWeight={600}
            fill="var(--ink)"
          >
            {last.value.toFixed(0)}
          </text>

          {/* Crosshair */}
          {active && hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={M.top}
                y2={M.top + plotH}
                stroke="var(--rule-strong)"
                strokeWidth={1}
              />
              <circle
                cx={x(hover)}
                cy={y(active.value)}
                r={4.5}
                fill={color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            </g>
          )}

          {/* x-axis endpoints only — a label per day would be unreadable. */}
          <text
            x={M.left}
            y={height - 4}
            fontSize={10}
            className="reading"
            fill="var(--ink-3)"
          >
            {formatDay(points[0].date)}
          </text>
          <text
            x={M.left + plotW}
            y={height - 4}
            textAnchor="end"
            fontSize={10}
            className="reading"
            fill="var(--ink-3)"
          >
            {formatDay(last.date)}
          </text>

          {/* Factor strip: its own scale, shared x. Never a second y-axis
              on the plot above. */}
          {factorMeta && (
            <g>
              <text
                x={M.left}
                y={stripTop - 5}
                fontSize={9}
                className="reading"
                fill="var(--ink-3)"
                style={{ letterSpacing: "0.08em" }}
              >
                {factorMeta.label.toUpperCase()}
                {factorMeta.unit ? ` (${factorMeta.unit})` : ""}
              </text>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={stripTop + stripPlotH}
                y2={stripTop + stripPlotH}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              {factorMeta.kind === "binary"
                ? factorValues.map((v, i) =>
                    v === 1 ? (
                      <rect
                        key={i}
                        x={x(i) - 2}
                        y={stripTop + 4}
                        width={4}
                        height={stripPlotH - 4}
                        rx={1}
                        fill="var(--ink-2)"
                      />
                    ) : null,
                  )
                : (() => {
                    const segs: string[] = [];
                    let started = false;
                    factorValues.forEach((v, i) => {
                      if (typeof v !== "number") {
                        started = false;
                        return;
                      }
                      segs.push(`${started ? "L" : "M"}${x(i)},${fy(v)}`);
                      started = true;
                    });
                    return (
                      <path
                        d={segs.join(" ")}
                        fill="none"
                        stroke="var(--ink-2)"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                      />
                    );
                  })()}
            </g>
          )}
        </svg>
      )}

      {/* Tooltip */}
      {active && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 border bg-[var(--surface)] px-2.5 py-2 text-[12px] shadow-sm"
          style={{
            left: Math.min(Math.max(x(hover ?? 0), 80), width - 80),
            top: 4,
          }}
        >
          <div className="reading text-[11px] text-[var(--ink-3)]">
            {formatDay(active.date)}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-[1px]"
              style={{ background: color }}
            />
            <span className="text-[var(--ink-2)]">
              {CONCERN_META[metricId].label}
            </span>
            <span className="reading ml-auto font-semibold">
              {active.value.toFixed(1)}
            </span>
          </div>
          {factorMeta && (
            <div className="mt-1 flex items-center gap-1.5 border-t pt-1">
              <span className="text-[var(--ink-2)]">{factorMeta.label}</span>
              <span className="reading ml-auto">
                {factorMeta.kind === "binary"
                  ? active.entry.log[factorId as "alcohol"]
                    ? "yes"
                    : "no"
                  : (active.entry.log[factorId as "sleepHours"] ?? "—")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small multiples                                                     */
/* ------------------------------------------------------------------ */

export function MetricSpark({
  entries,
  metricId,
  selected,
  onSelect,
}: {
  entries: Entry[];
  metricId: Concern;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const H = 46;

  const values = entries
    .filter((e) => typeof e.scores[metricId] === "number")
    .map((e) => e.scores[metricId] as number);

  const meta = CONCERN_META[metricId];
  const color = seriesColor(metricId);
  const domain = niceDomain(values, 0.2);
  const latest = values.length ? values[values.length - 1] : null;
  const change = values.length >= 2 ? latest! - values[0] : null;

  const x = (i: number) =>
    values.length <= 1 ? width / 2 : (i / (values.length - 1)) * width;
  const y = (v: number) =>
    H - 6 - ((v - domain[0]) / (domain[1] - domain[0] || 1)) * (H - 12);

  const Wrapper = onSelect ? "button" : "div";

  return (
    <Wrapper
      onClick={onSelect}
      aria-pressed={onSelect ? selected : undefined}
      className={`block w-full border p-3 text-left transition-colors ${
        selected
          ? "border-[var(--ink)] bg-[var(--surface)]"
          : "bg-[var(--surface)] hover:border-[var(--rule-strong)]"
      }`}
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
          style={{ background: color }}
          aria-hidden
        />
        <span className="truncate text-[12px] font-medium">{meta.label}</span>
        <span className="reading ml-auto text-[13px] font-semibold">
          {latest !== null ? latest.toFixed(0) : "—"}
        </span>
      </div>

      <div ref={ref} className="mt-1.5">
        {width > 0 && values.length > 0 && (
          <svg width={width} height={H} aria-hidden>
            <path
              d={values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <circle cx={x(values.length - 1)} cy={y(latest!)} r={2.5} fill={color} />
          </svg>
        )}
      </div>

      <div className="reading mt-0.5 text-[10px] text-[var(--ink-3)]">
        {change !== null ? (
          <>
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(1)} since {formatDay(entries[0].date)}
          </>
        ) : (
          "—"
        )}
        <span className="ml-1.5">n={values.length}</span>
      </div>
    </Wrapper>
  );
}
