"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CallsPerDay } from "@/lib/types";

export function CallsPerDayChart({ data }: { data: CallsPerDay[] }) {
  const rows = data.map((d) => ({
    ...d,
    // "2026-10-21" -> "Tue 21". The key is a local date, so it is parsed as
    // local time rather than as a UTC instant.
    label: new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold">Calls — last 7 days</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 800, height: 256 }}
        >
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#22304f" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#93a3bd", fontSize: 11 }}
              axisLine={{ stroke: "#22304f" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#93a3bd", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(56,189,248,0.06)" }}
              contentStyle={{
                background: "#111a2e",
                border: "1px solid #22304f",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Bar dataKey="calls" name="Calls" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            <Bar
              dataKey="connected"
              name="Connected"
              fill="#34d399"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="interested"
              name="Interested"
              fill="#a78bfa"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
