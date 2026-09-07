"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/transactions";

type Props = {
  onRefresh: () => Promise<ActionResult>;
};

export default function RefreshQuotesButton({ onRefresh }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function refresh() {
    setError(null);
    setDone(false);
    setPending(true);

    const result = await onRefresh();
    setPending(false);

    if (result.ok) {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={pending ? "size-4 animate-spin" : "size-4"}
          aria-hidden
        >
          <path d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992" />
          <path d="M20.015 9.348a8.25 8.25 0 0 0-14.38-2.98L2.985 9.05m0 5.602a8.25 8.25 0 0 0 14.38 2.98l2.65-2.68" />
        </svg>
        {pending ? "更新中…" : "更新報價"}
      </button>

      {done && (
        <p className="mt-1.5 text-xs text-emerald-600">已更新</p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
