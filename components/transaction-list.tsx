"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateLabel } from "@/lib/date";
import { amountFormatter } from "@/lib/money";
import type { TransactionDTO } from "@/lib/queries";
import type { ActionResult } from "@/app/actions/transactions";

function groupByDate(txs: TransactionDTO[]) {
  const map = new Map<string, TransactionDTO[]>();
  for (const tx of txs) {
    const list = map.get(tx.date);
    if (list) list.push(tx);
    else map.set(tx.date, [tx]);
  }
  return [...map.entries()];
}

export default function TransactionList({
  txs,
  hidden = false,
  onDeleteAction,
}: {
  txs: TransactionDTO[];
  hidden?: boolean;
  onDeleteAction: (id: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const fmt = amountFormatter(hidden);
  const [, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await onDeleteAction(id);
      setBusyId(null);
      setConfirmId(null);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  if (txs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        這個月還沒有任何紀錄
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {groupByDate(txs).map(([date, list]) => (
        <section key={date}>
          <h2 className="px-1 pb-1.5 text-xs font-medium text-slate-400">
            {formatDateLabel(date)}
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {list.map((tx) => {
              const confirming = confirmId === tx.id;
              const busy = busyId === tx.id;

              return (
                <li key={tx.id} className="flex items-stretch">
                  {confirming ? (
                    // 確認列：直接就地確認，不跳系統對話框
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
                        刪除「{tx.category?.name ?? "未分類"}
                        {" "}
                        {fmt(tx.amount)}」？
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={busy}
                        className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(tx.id)}
                        disabled={busy}
                        className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {busy ? "刪除中…" : "刪除"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/transactions/${tx.id}/edit`}
                        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 hover:bg-slate-50"
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tx.category?.color ?? "#94a3b8" }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {tx.category?.name ?? "未分類"}
                          </span>
                          {tx.note && (
                            <span className="block truncate text-xs text-slate-400">
                              {tx.note}
                            </span>
                          )}
                        </span>
                        <span
                          className={
                            tx.type === "INCOME"
                              ? "tabular shrink-0 text-sm font-semibold text-emerald-600"
                              : "tabular shrink-0 text-sm font-semibold text-slate-900"
                          }
                        >
                          {hidden ? "" : tx.type === "INCOME" ? "+" : "−"}
                          {fmt(tx.amount).replace("NT$ ", "")}
                        </span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => setConfirmId(tx.id)}
                        aria-label="刪除這筆交易"
                        className="shrink-0 px-3 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
