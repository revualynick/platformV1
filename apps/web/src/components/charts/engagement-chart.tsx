"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  week: string;
  score: number;
  interactions: number;
}

export function EngagementChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12, fill: "#A8A29E" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[50, 100]}
          tick={{ fontSize: 12, fill: "#A8A29E" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#1C1917",
            border: "none",
            borderRadius: "12px",
            fontSize: "13px",
            color: "#FAFAF9",
            boxShadow: "0 8px 24px rgba(28, 25, 23, 0.2)",
          }}
          itemStyle={{ color: "#FAFAF9" }}
          labelStyle={{ color: "#A8A29E", marginBottom: "4px" }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#064E3B"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#064E3B", strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "#059669", strokeWidth: 2, stroke: "#fff" }}
          name="Score"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
