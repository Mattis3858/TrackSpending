"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTWD, formatUSD } from "@/lib/money";
import type { ActionResult } from "@/app/actions/transactions";
import type { SettingsInput } from "@/lib/validation";
import type { UserSettingDTO } from "@/lib/queries";

/** "1234.00" -> "1234"，讓輸入框不要一直顯示無意義的 .00 */
function trimAmount(value: string | null): string {
  if (!value) return "";
  return value.replace(/[.]?0+$/, "");
}

type Props = {
  setting: UserSettingDTO;
  /** 已經記過帳。用來決定「開始記帳前的資產」預設收合還是展開 */
  started: boolean;
  onSaveAction: (input: SettingsInput) => Promise<ActionResult>;
  /**
   * 插在「儲存」與「開始記帳前的資產」之間的內容（提醒開關與各項連結）。
   *
   * 為什麼要由外面傳進來：這些連結必須排在收合區塊上方，但收合區塊裡的
   * 欄位屬於這張表單、要跟著一起送出，不能移到表單外面。用 children 就能
   * 把版面順序交給頁面決定，同時保持表單完整。
   */
  children?: React.ReactNode;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const inputClass =
  "tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900";

export default function SettingsForm({
  setting,
  started,
  onSaveAction,
  children,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // 這組值填一次之後幾乎不會再動，開始記帳後就預設收起來
  const [startingOpen, setStartingOpen] = useState(!started);

  const [startingCash, setStartingCash] = useState(trimAmount(setting.startingCash));
  const [cashUsd, setCashUsd] = useState(trimAmount(setting.cashUsd));
  const [monthlyBudget, setMonthlyBudget] = useState(trimAmount(setting.monthlyBudget));
  const [targetSavingsRate, setTargetSavingsRate] = useState(
    setting.targetSavingsRate === null ? "" : String(setting.targetSavingsRate),
  );
  const [payday, setPayday] = useState(
    setting.payday === null ? "" : String(setting.payday),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await onSaveAction({
        startingCash,
        cashUsd,
        monthlyBudget,
        targetSavingsRate: targetSavingsRate === "" ? null : Number(targetSavingsRate),
        payday: payday === "" ? null : Number(payday),
      });

      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">預算與目標</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            「每日可用額度」需要一個消費預算。兩個都填的話以月預算優先。
          </p>
        </div>

        <Field label="目標儲蓄率（%）" hint="收入穩定前建議用這個，系統會依當月收入自動換算預算">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            placeholder="例如 30"
            value={targetSavingsRate}
            onChange={(e) => setTargetSavingsRate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="月消費預算" hint="固定金額，填了就不看目標儲蓄率">
          <input
            type="text"
            inputMode="decimal"
            placeholder="留空則由目標儲蓄率推算"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="發薪日（每月幾號）" hint="給發薪日倒數用，留空則不顯示">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            placeholder="例如 5"
            value={payday}
            onChange={(e) => setPayday(e.target.value)}
            className={inputClass}
          />
        </Field>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-xl bg-slate-900 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {isPending ? "儲存中…" : "儲存"}
        </button>
        {saved && <span className="text-sm text-emerald-600">已儲存</span>}
      </div>

      {/* 提醒開關與各項連結。排在收合區塊上方，但仍在表單內—— */}
      {/* 收合區塊裡的欄位要跟著這張表單一起送出，不能移到表單外面。 */}
      {children}

      {/* 開始記帳前的資產：填一次之後幾乎不會再動，所以放最下面且預設收起來 */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setStartingOpen((v) => !v)}
          aria-expanded={startingOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">
              開始記帳前的資產
            </span>
            <span className="mt-0.5 block text-xs text-slate-400">
              {startingOpen
                ? "系統只知道你開始記帳之後的收支。沒有這些數字，緊急預備金與總資產都會嚴重低估。"
                : `現金 ${formatTWD(setting.startingCash)}${
                    Number(setting.cashUsd) > 0
                      ? ` · 外幣 ${formatUSD(setting.cashUsd)}`
                      : ""
                  }`}
            </span>
          </span>
          <span
            className={
              startingOpen
                ? "shrink-0 rotate-180 text-slate-400 transition-transform"
                : "shrink-0 text-slate-400 transition-transform"
            }
            aria-hidden
          >
            ⌄
          </span>
        </button>

        {startingOpen && (
          <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4">
          <Field label="現金" hint="活存、定存、緊急備用金等隨時可動用的錢">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={startingCash}
              onChange={(e) => setStartingCash(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="外幣現金（美元）" hint="複委託帳戶裡還沒投入的美元餘額">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={cashUsd}
              onChange={(e) => setCashUsd(e.target.value)}
              className={inputClass}
            />
          </Field>

            <p className="text-xs text-slate-400">
              投資部位不用填在這裡——到「持股」頁登錄，市值會用公開報價自動計算。
            </p>

            {/* 這一區在主要儲存按鈕下方，改完不該要往上滾才能存。
                同一張表單，所以按哪一顆都會把全部欄位一起送出。 */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? "儲存中…" : "儲存"}
            </button>
          </div>
        )}
      </section>

    </form>
  );
}
