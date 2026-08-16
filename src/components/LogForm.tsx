"use client";

import { BINARY_FACTORS, FACTOR_META, type DailyLog } from "@/lib/domain";

/**
 * The daily log.
 *
 * Friction here kills the product: a diary that takes two minutes gets
 * abandoned in a week, and an abandoned diary has no series to analyse.
 * So every control is one tap or one drag, nothing is required, and the
 * whole form fits on one screen. Blank fields are simply excluded from
 * the relevant comparisons rather than blocking a save.
 */
export function LogForm({
  value,
  onChange,
}: {
  value: DailyLog;
  onChange: (next: DailyLog) => void;
}) {
  const set = <K extends keyof DailyLog>(key: K, v: DailyLog[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="divide-y border bg-[var(--surface)]">
      <SliderRow
        label="Sleep"
        unit="hours"
        min={0}
        max={12}
        step={0.5}
        value={value.sleepHours}
        onChange={(v) => set("sleepHours", v)}
        format={(v) => v.toFixed(1)}
      />

      <SliderRow
        label="Water"
        unit="litres"
        min={0}
        max={5}
        step={0.25}
        value={value.waterLitres}
        onChange={(v) => set("waterLitres", v)}
        format={(v) => v.toFixed(2)}
      />

      {/* Stress: five discrete states, so five buttons beat a slider. */}
      <div className="p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium">Stress</span>
          <span className="reading ml-auto text-[12px] text-[var(--ink-3)]">
            {value.stress !== null ? `${value.stress} / 5` : "not logged"}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => set("stress", value.stress === n ? null : n)}
              aria-pressed={value.stress === n}
              aria-label={`Stress ${n} of 5`}
              className={`reading h-8 flex-1 rounded-[3px] border text-[12px] transition-colors ${
                value.stress === n
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                  : "hover:border-[var(--rule-strong)]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-[var(--ink-3)]">
          <span>calm</span>
          <span>very stressed</span>
        </div>
      </div>

      {/* Yes/no factors as toggle chips — one tap each. */}
      <div className="p-3">
        <span className="text-[13px] font-medium">Yesterday</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BINARY_FACTORS.map((id) => {
            const on = value[id];
            return (
              <button
                key={id}
                onClick={() => set(id, !on)}
                aria-pressed={on}
                className={`rounded-[3px] border px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  on
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                    : "text-[var(--ink-2)] hover:border-[var(--rule-strong)]"
                }`}
              >
                {FACTOR_META[id].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product change — the event that drives the change-point test. */}
      <div className="p-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value.productChanged}
            onChange={(e) => {
              const on = e.target.checked;
              onChange({
                ...value,
                productChanged: on,
                productName: on ? value.productName : null,
              });
            }}
            className="h-4 w-4 accent-[var(--ink)]"
          />
          <span className="text-[13px] font-medium">
            I started or changed a product
          </span>
        </label>
        {value.productChanged && (
          <input
            type="text"
            value={value.productName ?? ""}
            onChange={(e) => set("productName", e.target.value)}
            placeholder="e.g. Niacinamide 10% serum"
            className="mt-2 w-full rounded-[3px] border bg-[var(--surface-2)] px-2.5 py-2 text-[13px] outline-none"
          />
        )}
        {value.productChanged && (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
            Naming it lets Skin Diary compare your metrics before and after,
            with a washout period.
          </p>
        )}
      </div>

      <div className="p-3">
        <label
          htmlFor="note"
          className="block text-[13px] font-medium"
        >
          Note
          <span className="ml-1.5 text-[11.5px] font-normal text-[var(--ink-3)]">
            optional, not analysed
          </span>
        </label>
        <textarea
          id="note"
          value={value.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          placeholder="Anything worth remembering about today."
          className="mt-1.5 w-full resize-y rounded-[3px] border bg-[var(--surface-2)] px-2.5 py-2 text-[13px] outline-none"
        />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  onChange: (v: number | null) => void;
  format: (v: number) => string;
}) {
  const display = value ?? (min + max) / 2;

  return (
    <div className="p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="reading ml-auto text-[12px]">
          {value !== null ? (
            <>
              <span className="font-semibold">{format(value)}</span>
              <span className="ml-1 text-[var(--ink-3)]">{unit}</span>
            </>
          ) : (
            <span className="text-[var(--ink-3)]">not logged</span>
          )}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={display}
          aria-label={`${label} in ${unit}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-5 flex-1"
        />
        {value !== null && (
          <button
            onClick={() => onChange(null)}
            className="text-[11px] text-[var(--ink-3)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
