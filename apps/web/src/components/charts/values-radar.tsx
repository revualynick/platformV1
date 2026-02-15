"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

interface ValueScore {
  value: string;
  score: number;
}

export function ValuesRadar({ data }: { data: ValueScore[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
        <PolarGrid stroke="#E7E5E4" />
        <PolarAngleAxis
          dataKey="value"
          tick={{ fontSize: 11, fill: "#78716C" }}
        />
        <Radar
          dataKey="score"
          stroke="#064E3B"
          fill="#064E3B"
          fillOpacity={0.12}
          strokeWidth={2}
          dot={{ r: 3, fill: "#064E3B" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
