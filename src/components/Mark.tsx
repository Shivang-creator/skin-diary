/**
 * The mark.
 *
 * Seven dots at uneven heights — a week of readings, drawn by hand rather
 * than plotted. One of them is filled: the thing that turned out to matter.
 * The baseline is deliberately not straight, because nothing in this app is
 * a clean line and the logo shouldn't pretend otherwise.
 */
export function Mark({ size = 28 }: { size?: number }) {
  // uneven on purpose — a plotted-looking logo would be a lie about the data
  const dots = [
    { x: 6, y: 21, r: 2.1 },
    { x: 15, y: 16, r: 2.1 },
    { x: 24, y: 23, r: 2.1 },
    { x: 33, y: 11, r: 3.4, lead: true },
    { x: 42, y: 18, r: 2.1 },
    { x: 51, y: 14, r: 2.1 },
    { x: 60, y: 20, r: 2.1 },
  ];

  return (
    <svg
      width={size * (66 / 30)}
      height={size}
      viewBox="0 0 66 30"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* a hand-drawn baseline, not a ruled one */}
      <path
        d="M 3 27.4 C 14 26.6, 24 27.9, 34 27.1 S 54 26.4, 63 27.2"
        stroke="currentColor"
        strokeOpacity={0.28}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill={d.lead ? "var(--lead)" : "currentColor"}
          fillOpacity={d.lead ? 1 : 0.32}
        />
      ))}
      {/* the one that mattered gets a stem down to the line */}
      <path
        d="M 33 15 L 33 26.6"
        stroke="var(--lead)"
        strokeOpacity={0.45}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={size} />
      <span className="display text-[19px] leading-none tracking-[-0.01em]">
        Slept On
      </span>
    </span>
  );
}
