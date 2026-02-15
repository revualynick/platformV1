"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  week: string;
  avg: number;
  high: number;
  low: number;
}

export function TeamTrendChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#064E3B" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#064E3B" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorRange" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#059669" stopOpacity={0.08} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12, fill: "#A8A29E" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[30, 100]}
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
        <Area
          type="monotone"
          dataKey="high"
          stroke="#059669"
          strokeWidth={1}
          strokeDasharray="4 4"
          fill="url(#colorRange)"
          name="Highest"
        />
        <Area
          type="monotone"
          dataKey="avg"
          stroke="#064E3B"
          strokeWidth={2.5}
          fill="url(#colorAvg)"
          name="Team Avg"
          dot={{ r: 3.5, fill: "#064E3B", strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="low"
          stroke="#D97706"
          strokeWidth={1}
          strokeDasharray="4 4"
          fill="none"
          name="Lowest"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
