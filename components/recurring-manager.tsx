"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTWD, money } from "@/lib/money";
import type { CategoryDTO, RecurringTemplateDTO } from "@/lib/queries";
import type { ActionResult } from "@/app/actions/transactions";

type Input = { categoryId: string; amount: string; dayOfMonth: number; note?: string };

type Props = {
  templates: RecurringTemplateDTO[];
  /** 可以設固定範本的分類（支出、非儲蓄投資） */
  categories: CategoryDTO[];
  onCreate: (input: Input) => Promise<ActionResult>;
  onUpdate: (id: string, input: Input) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
};

const inputClass =
  "tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900";

export default function RecurringManager({
  templates,
  categories,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("5");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDay, setEditDay] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const used = new Set(templates.map((t) => t.categoryId));
  const available = categories.filter((c) => !used.has(c.id));

  const total = templates.reduce((acc, t) => acc.plus(money(t.amount)), money("0"));

  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        onOk?.();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        onCreate({
          categoryId,
          amount: amount.trim(),
          dayOfMonth: Number(day) || 1,
        }),
      () => {
        setCategoryId("");
        setAmount("");
      },
    );
  }

  function startEdit(t: RecurringTemplateDTO) {
    setEditingId(t.id);
    setEditAmount(t.amount.replace(/[.]?0+$/, ""));
    setEditDay(String(t.dayOfMonth));
    setConfirmId(null);
  }

  return (
    <div className="space-y-6">
      {templates.length > 0 && (
        <section className="rounded-2xl bg-slate-900 px-5 py-5 text-white">
          <p className="text-sm text-slate-400">每月固定支出合計</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
            {formatTWD(total)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            這筆金額會在月初就先從「每日可用額度」與「緩衝資金」裡扣掉，不必等到實際記帳那天。
          </p>
        </section>
      )}

      <form
        onSubmit={submitNew}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div>
          <p className="text-sm font-medium text-slate-600">新增固定支出</p>
          <p className="mt-0.5 text-xs text-slate-400">
            房租、健身房、訂閱這類金額固定的填精確值；水電這類會浮動的填近期的概數——大致正確遠勝過完全不算。
            <span className="mt-1 block">
              <strong>兩個月繳一次的（台電、雙月網路費）填月均值</strong>，例如雙月 2,400 就填 1,200。非繳費月預留的那筆，正好是在幫你為下期帳單存錢。
            </span>
          </p>
        </div>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
        >
          <option value="">選擇分類</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="每月金額"
            inputMode="decimal"
            className={inputClass}
          />
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-slate-500">每月</span>
            <input
              value={day}
              onChange={(e) => setDay(e.target.value)}
              placeholder="5"
              inputMode="numeric"
              className={inputClass}
            />
            <span className="shrink-0 text-sm text-slate-500">號</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || !categoryId || !amount.trim()}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          新增
        </button>

        {available.length === 0 && categories.length > 0 && (
          <p className="text-xs text-slate-400">
            所有可用的分類都已經設過範本了。
          </p>
        )}
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          還沒有固定支出範本
          <span className="mt-1 block text-xs text-slate-400">
            設定之後，月初的每日可用額度就不會把房租那筆錢算成可以花的
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {templates.map((t) => {
            const editing = editingId === t.id;
            const confirming = confirmId === t.id;

            return (
              <li key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.categoryColor ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {t.categoryName}
                    </span>
                    <span className="tabular block text-xs text-slate-400">
                      每月 {t.dayOfMonth} 號
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatTWD(t.amount)}
                  </span>
                </div>

                {editing ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        placeholder="金額"
                        inputMode="decimal"
                        className={inputClass}
                      />
                      <input
                        value={editDay}
                        onChange={(e) => setEditDay(e.target.value)}
                        placeholder="幾號"
                        inputMode="numeric"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            () =>
                              onUpdate(t.id, {
                                categoryId: t.categoryId,
                                amount: editAmount.trim(),
                                dayOfMonth: Number(editDay) || 1,
                              }),
                            () => setEditingId(null),
                          )
                        }
                        disabled={isPending}
                        className="flex-1 rounded-lg bg-slate-900 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        儲存
                      </button>
                    </div>
                  </div>
                ) : confirming ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-500">
                      刪除 {t.categoryName} 的固定支出？
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => run(() => onDelete(t.id))}
                      disabled={isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-3 pl-6">
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(t.id)}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      刪除
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
