"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionInputSchema, type TransactionInput } from "@/lib/validation";
import type { CategoryDTO } from "@/lib/queries";
import type { ActionResult } from "@/app/actions/transactions";

type Props = {
  categories: CategoryDTO[];
  defaultValues: TransactionInput;
  submitLabel: string;
  onSubmitAction: (input: TransactionInput) => Promise<ActionResult>;
  onDeleteAction?: () => Promise<ActionResult>;
};

export default function TransactionForm({
  categories,
  defaultValues,
  submitLabel,
  onSubmitAction,
  onDeleteAction,
}: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<TransactionInput>({
    resolver: zodResolver(transactionInputSchema),
    defaultValues,
  });

  const type = watch("type");
  const categoryId = watch("categoryId");

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  function switchType(next: "EXPENSE" | "INCOME") {
    setValue("type", next);
    // 類型換了，原本選的分類可能不合法，清掉讓使用者重選
    const stillValid = categories.some(
      (c) => c.id === categoryId && c.type === next,
    );
    if (!stillValid) setValue("categoryId", "");
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSubmitAction(values);
      if (result.ok) {
        router.push("/transactions");
        router.refresh();
        return;
      }
      setFormError(result.message);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof TransactionInput, { message });
      }
    });
  });

  function onDelete() {
    if (!onDeleteAction) return;
    if (!confirm("確定要刪除這筆交易嗎？")) return;
    startTransition(async () => {
      const result = await onDeleteAction();
      if (result.ok) {
        router.push("/transactions");
        router.refresh();
      } else {
        setFormError(result.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* 類型切換 */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
        {(["EXPENSE", "INCOME"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchType(t)}
            className={`rounded-lg py-2.5 text-sm font-medium transition-colors ${
              type === t
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "EXPENSE" ? "支出" : "收入"}
          </button>
        ))}
      </div>

      {/* 金額 */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-slate-600">
          金額
        </label>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl text-slate-400">NT$</span>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            autoComplete="off"
            {...register("amount")}
            className="tabular w-full min-w-0 border-b-2 border-slate-300 bg-transparent pb-1 text-4xl font-semibold outline-none focus:border-slate-900"
          />
        </div>
        {errors.amount && (
          <p className="mt-1.5 text-sm text-red-600">{errors.amount.message}</p>
        )}
      </div>

      {/* 分類 */}
      <div>
        <span className="block text-sm font-medium text-slate-600">分類</span>
        <input type="hidden" {...register("categoryId")} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {visibleCategories.map((c) => {
            const selected = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setValue("categoryId", c.id, { shouldValidate: true })}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-sm transition-colors ${
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? "#94a3b8" }}
                  aria-hidden
                />
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
        {errors.categoryId && (
          <p className="mt-1.5 text-sm text-red-600">{errors.categoryId.message}</p>
        )}
      </div>

      {/* 日期 */}
      <div>
        <label htmlFor="date" className="block text-sm font-medium text-slate-600">
          日期
        </label>
        <input
          id="date"
          type="date"
          {...register("date")}
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
        />
        {errors.date && (
          <p className="mt-1.5 text-sm text-red-600">{errors.date.message}</p>
        )}
      </div>

      {/* 備註 */}
      <div>
        <label htmlFor="note" className="block text-sm font-medium text-slate-600">
          備註<span className="ml-1 text-slate-400">（選填）</span>
        </label>
        <input
          id="note"
          type="text"
          placeholder="例如：跟同事吃午餐"
          {...register("note")}
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
        />
        {errors.note && (
          <p className="mt-1.5 text-sm text-red-600">{errors.note.message}</p>
        )}
      </div>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "處理中…" : submitLabel}
        </button>
        {onDeleteAction && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            刪除
          </button>
        )}
      </div>
    </form>
  );
}
