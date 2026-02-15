"use client";

interface EngagementRingProps {
  score: number; // 0-100
  size?: number;
  label?: string;
}

export function EngagementRing({
  score,
  size = 160,
  label = "Engagement",
}: EngagementRingProps) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  const getColor = () => {
    if (score >= 80) return { stroke: "#064E3B", bg: "rgba(6, 78, 59, 0.08)" };
    if (score >= 60) return { stroke: "#D97706", bg: "rgba(217, 119, 6, 0.08)" };
    return { stroke: "#DC2626", bg: "rgba(220, 38, 38, 0.08)" };
  };

  const { stroke, bg } = getColor();

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#E7E5E4"
            strokeWidth="8"
          />
          {/* Progress */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              animation: "ring-fill 1.2s ease-out",
              transition: "stroke-dashoffset 0.8s ease-out",
            }}
          />
          {/* Glow */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            opacity="0.15"
            filter="blur(4px)"
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-display text-4xl font-bold tabular-nums"
            style={{ color: stroke }}
          >
            {score}
          </span>
        </div>
      </div>
      <span className="text-xs font-medium uppercase tracking-wider text-stone-400">
        {label}
      </span>
    </div>
  );
}
