"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryDTO } from "@/lib/queries";
import type { ActionResult } from "@/app/actions/transactions";
import type { TransactionInput } from "@/lib/validation";

type Props = {
  categories: CategoryDTO[];
  frequentIds: string[];
  lastUsedCategoryId: string | null;
  today: string;
  yesterday: string;
  onSubmitAction: (input: TransactionInput) => Promise<ActionResult>;
};

type EntryType = "EXPENSE" | "INCOME";

export default function QuickAddSheet({
  categories,
  frequentIds,
  lastUsedCategoryId,
  today,
  yesterday,
  onSubmitAction,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<EntryType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(lastUsedCategoryId ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setType("EXPENSE");
    setAmount("");
    setCategoryId(lastUsedCategoryId ?? "");
    setDate(today);
    setNote("");
    setShowAll(false);
    setError(null);
  }, [lastUsedCategoryId, today]);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // 開啟時鎖住背景捲動，並把游標放到金額欄位（手機會直接彈出數字鍵盤）
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => amountRef.current?.focus(), 60);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const sameType = categories.filter((c) => c.type === type);

  // 支出：常用的排前面，不足 6 個就用預設排序遞補，不要讓按鈕區空著
  const frequent =
    type === "EXPENSE"
      ? [
          ...frequentIds
            .map((id) => sameType.find((c) => c.id === id))
            .filter((c): c is CategoryDTO => Boolean(c)),
          ...sameType.filter((c) => !frequentIds.includes(c.id)),
        ].slice(0, 6)
      : sameType;

  const visible = showAll || type === "INCOME" ? sameType : frequent;
  const hasMore = type === "EXPENSE" && sameType.length > frequent.length;

  function switchType(next: EntryType) {
    setType(next);
    if (!categories.some((c) => c.id === categoryId && c.type === next)) {
      setCategoryId("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await onSubmitAction({
      date,
      type,
      amount: amount.trim(),
      categoryId,
      note: note.trim(),
    });

    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    close();
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    router.refresh();
  }

  const canSubmit = amount.trim() !== "" && categoryId !== "" && !pending;

  return (
    <>
      {/* 懸浮按鈕：固定在底部導覽上方 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="快速記帳"
        className="fixed bottom-20 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-slate-900 text-3xl font-light text-white shadow-lg shadow-slate-900/25 transition-transform active:scale-95"
      >
        ＋
      </button>

      {saved && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-50 flex justify-center">
          <span className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
            已記錄
          </span>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="關閉"
            onClick={close}
            className="absolute inset-0 bg-slate-900/40"
          />

          <form
            onSubmit={submit}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300" />

            {/* 類型 */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(["EXPENSE", "INCOME"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={
                    type === t
                      ? "rounded-lg bg-white py-2 text-sm font-medium shadow-sm"
                      : "rounded-lg py-2 text-sm text-slate-500"
                  }
                >
                  {t === "EXPENSE" ? "支出" : "收入"}
                </button>
              ))}
            </div>

            {/* 金額 */}
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-2xl text-slate-400">NT$</span>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                placeholder="0"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular w-full min-w-0 border-b-2 border-slate-200 bg-transparent pb-1 text-4xl font-semibold outline-none focus:border-slate-900"
              />
            </div>

            {/* 分類：常用的做成大按鈕 */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {visible.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={
                    c.id === categoryId
                      ? "flex items-center justify-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-2 py-3 text-sm text-white"
                      : "flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-3 text-sm text-slate-700 active:bg-slate-50"
                  }
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}

              {hasMore && !showAll && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="rounded-xl border border-dashed border-slate-300 px-2 py-3 text-sm text-slate-500"
                >
                  更多
                </button>
              )}
            </div>

            {/* 日期：今天／昨天一鍵，其他情況才開日期選擇器 */}
            <div className="mt-5 flex items-center gap-2">
              {[
                { label: "今天", value: today },
                { label: "昨天", value: yesterday },
              ].map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDate(d.value)}
                  className={
                    date === d.value
                      ? "rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
                      : "rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                  }
                >
                  {d.label}
                </button>
              ))}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="tabular ml-auto rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600"
              />
            </div>

            <input
              type="text"
              placeholder="備註（選填）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-900"
            />

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-slate-200 px-5 py-3.5 text-base text-slate-600"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 rounded-xl bg-slate-900 py-3.5 text-base font-medium text-white disabled:opacity-40"
              >
                {pending ? "儲存中…" : "儲存"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
