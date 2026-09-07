"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Theme } from "@/lib/preferences";

type Props = {
  theme: Theme;
  onToggleAction: (theme: Theme) => Promise<void>;
};

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}

export default function ThemeToggle({ theme, onToggleAction }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // 樂觀狀態：按下去立刻反應，不必等伺服器來回。
  // null 代表「沿用伺服器傳來的值」。
  const [optimistic, setOptimistic] = useState<Theme | null>(null);
  const dark = (optimistic ?? theme) === "dark";

  // 伺服器的值追上樂觀值之後就把樂觀值清掉，讓 prop 重新成為唯一事實來源。
  // 少了這一步，之後從別的頁面回來時會拿著過期的樂觀值，
  // 按鈕圖示就會跟實際主題對不上——看起來像「怎麼按都不會變」。
  useEffect(() => {
    if (optimistic !== null && optimistic === theme) setOptimistic(null);
  }, [theme, optimistic]);

  async function toggle() {
    const next: Theme = dark ? "light" : "dark";

    setPending(true);
    setOptimistic(next);
    // 同步切換 <html> 的 class，畫面立刻反應
    document.documentElement.classList.toggle("dark", next === "dark");

    await onToggleAction(next);
    // 讓伺服器端重新渲染，之後的導覽才會拿到正確的主題
    router.refresh();
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={dark}
      aria-label={dark ? "切換成淺色模式" : "切換成深色模式"}
      title={dark ? "切換成淺色模式" : "切換成深色模式"}
      className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
