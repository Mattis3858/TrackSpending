"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "報表" },
  { href: "/transactions", label: "交易" },
  { href: "/settings", label: "設定" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 py-3 text-center text-sm ${
                active ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
