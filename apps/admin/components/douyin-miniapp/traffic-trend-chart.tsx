"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis } from "recharts";
import type { TrafficStats } from "./traffic-dashboard";

export function TrafficTrendChart({ data }: { data: TrafficStats["daily"] }) {
  if (!data.some((day) => day.entries || day.appointments)) {
    return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
      暂无新版入口数据
    </div>;
  }
  return <div className="h-56 w-full" role="img" aria-label="每日进入和量房预约趋势">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)}
          tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip labelFormatter={(value) => `${value}（北京时间）`}
          formatter={(value, name) => [`${Number(value).toLocaleString("zh-CN")} 次`, name]} />
        <Legend />
        <Line type="monotone" dataKey="entries" name="进入"
          stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="appointments" name="预约"
          stroke="var(--success)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
