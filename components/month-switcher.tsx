import Link from "next/link";
import { addMonths, formatYearMonthLabel, type YearMonth } from "@/lib/date";

export default function MonthSwitcher({
  ym,
  basePath,
}: {
  ym: YearMonth;
  basePath: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`${basePath}?m=${addMonths(ym, -1)}`}
        aria-label="上個月"
        className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
      >
        ‹
      </Link>
      <span className="min-w-[7.5rem] text-center text-base font-semibold">
        {formatYearMonthLabel(ym)}
      </span>
      <Link
        href={`${basePath}?m=${addMonths(ym, 1)}`}
        aria-label="下個月"
        className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
      >
        ›
      </Link>
    </div>
  );
}
