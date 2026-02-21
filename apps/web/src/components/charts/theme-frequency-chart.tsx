"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const BAR_COLORS = [
  "#4a7c59", // forest
  "#5a8c69",
  "#6a9c79",
  "#7aac89",
  "#8abc99",
  "#9acca9",
  "#aadcb9",
  "#baecc9",
  "#cafcd9",
  "#dafce9",
];

interface ThemeFrequencyChartProps {
  themeFrequency: Record<string, number>;
}

export function ThemeFrequencyChart({
  themeFrequency,
}: ThemeFrequencyChartProps) {
  const data = Object.entries(themeFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-stone-400 py-8 text-center">
        No theme data available yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 40 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fontSize: 12, fill: "#78716c" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
            fontSize: "13px",
          }}
          formatter={(value: number) => [`${value} mentions`, "Frequency"]}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
          {data.map((_entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={BAR_COLORS[index % BAR_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
