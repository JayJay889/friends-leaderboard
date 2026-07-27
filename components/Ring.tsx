/**
 * WHOOP-style circular score gauge: thin arc on a faint track, starting at 12
 * o'clock, rounded caps, big DIN-style number in the middle.
 */
export default function Ring({
  value,
  color,
  size = 84,
  stroke = 7,
  children,
}: {
  /** 0–100 fill of the arc. */
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children}
      </span>
    </span>
  );
}

/** WHOOP recovery valuation bands: green 67–100, yellow 34–66, red 0–33. */
export function bandColor(score: number): string {
  return score >= 67 ? "#16EC06" : score >= 34 ? "#FFDE00" : "#FF0026";
}
