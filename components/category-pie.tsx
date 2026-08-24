"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export type PieDatum = {
  name: string;
  /** 已格式化好的金額字串，避免把 Decimal 傳進 Client Component（SPEC 5.5） */
  label: string;
  value: number;
  ratio: number;
  color: string;
};

export default function CategoryPie({ data }: { data: PieDatum[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        這個月還沒有消費紀錄
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="100%"
              paddingAngle={1.5}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="w-full space-y-1.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: d.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-slate-600">{d.name}</span>
            <span className="tabular shrink-0 text-slate-400">
              {Math.round(d.ratio * 100)}%
            </span>
            <span className="tabular w-24 shrink-0 text-right font-medium">
              {d.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
