"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTWD } from "@/lib/money";
import { reconcile } from "@/lib/reconcile";
import type { ActionResult } from "@/app/actions/transactions";

type Props = {
  /** 系統依交易紀錄算出來的現金（字串，Decimal 不跨邊界） */
  expected: string;
  onAdjust: (input: {
    expected: string;
    actual: string;
    note?: string;
  }) => Promise<ActionResult>;
};

export default function ReconcileForm({ expected, onAdjust }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 即時預覽差額，讓使用者按下按鈕前就知道會產生什麼
  let preview: ReturnType<typeof reconcile> | null = null;
  if (actual.trim()) {
    try {
      preview = reconcile(expected, actual.trim());
    } catch {
      preview = null;
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    startTransition(async () => {
      const result = await onAdjust({
        expected,
        actual: actual.trim(),
        note: note.trim() || undefined,
      });
      if (result.ok) {
        setDone(true);
        setActual("");
        setNote("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl bg-slate-900 px-5 py-5 text-white">
        <p className="text-sm text-slate-400">系統算出來的現金</p>
        <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
          {formatTWD(expected)}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          起始現金 + 累計收入 − 累計消費 − 累計投資
        </p>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">對帳前先確認信用卡</p>
        <p className="mt-1 text-xs">
          刷卡當下系統就扣了，但銀行要到繳費才扣。所以平常你的銀行餘額會比上面的數字高，高出的部分就是還沒繳的卡費——那不是錯誤。
          <span className="mt-1 block font-medium">
            最準的對帳時機是信用卡帳單剛繳完的那幾天。
          </span>
        </p>
      </div>

      <div>
        <label htmlFor="actual" className="block text-sm font-medium text-slate-700">
          實際餘額
        </label>
        <p className="mt-0.5 text-xs text-slate-400">
          銀行帳戶 + 現金 + 電子支付餘額的總和（不含投資）
        </p>
        <input
          id="actual"
          type="text"
          inputMode="decimal"
          placeholder="例如 108000"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="tabular mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
        />
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          {preview.direction === "NONE" ? (
            <p className="text-sm text-emerald-700">
              差額 {formatTWD(preview.difference.abs())}，小於 1 元不需要調整。
            </p>
          ) : (
            <>
              <p className="text-sm">
                差額{" "}
                <span
                  className={
                    preview.direction === "EXPENSE"
                      ? "font-semibold text-red-600"
                      : "font-semibold text-emerald-600"
                  }
                >
                  {preview.difference.isNegative() ? "−" : "+"}
                  {formatTWD(preview.amount)}
                </span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                {preview.direction === "EXPENSE"
                  ? `會建立一筆「差額調整」支出 ${formatTWD(preview.amount)}——代表有花掉但沒記到的錢。它會計入本月消費，儲蓄率會跟著下降。`
                  : `會建立一筆「差額調整」收入 ${formatTWD(preview.amount)}——代表有進帳沒記到，或某筆支出記多了。`}
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <label htmlFor="note" className="block text-sm font-medium text-slate-700">
          備註<span className="ml-1 text-slate-400">（選填）</span>
        </label>
        <input
          id="note"
          type="text"
          placeholder="例如：8 月對帳，漏記了幾筆便利商店"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {done && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          已建立調整交易，現金已經跟你輸入的餘額一致。
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !preview || preview.direction === "NONE"}
        className="w-full rounded-xl bg-slate-900 py-3 text-base font-medium text-white disabled:opacity-40"
      >
        {isPending ? "建立中…" : "建立調整交易"}
      </button>

      <p className="text-xs text-slate-400">
        調整會留下一筆看得見的交易，不是偷偷改設定。三個月後你還能在交易列表找到它，知道當時發生過什麼事。
      </p>
    </form>
  );
}
