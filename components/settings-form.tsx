"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  onSaveAction: (input: SettingsInput) => Promise<ActionResult>;
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

export default function SettingsForm({ setting, onSaveAction }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [startingCash, setStartingCash] = useState(trimAmount(setting.startingCash));
  const [cashUsd, setCashUsd] = useState(trimAmount(setting.cashUsd));
  const [startingInvestment, setStartingInvestment] = useState(
    trimAmount(setting.startingInvestment),
  );
  const [investmentValue, setInvestmentValue] = useState(
    trimAmount(setting.investmentValue),
  );
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
        startingInvestment,
        investmentValue,
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
          <h2 className="text-sm font-semibold text-slate-900">開始記帳前的資產</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            系統只知道你開始記帳之後的收支。沒有這些數字，緊急預備金與總資產都會嚴重低估。
          </p>
        </div>

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

        <Field label="投資成本" hint="已投入股票 / ETF 的本金總額">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={startingInvestment}
            onChange={(e) => setStartingInvestment(e.target.value)}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">投資現值</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            登錄「持股」之後這裡就不用管了，系統會自動用公開報價算市值。沒有持股紀錄時才會用到這個欄位。
          </p>
        </div>

        <Field label="目前市值">
          <input
            type="text"
            inputMode="decimal"
            placeholder="留空則用成本計算"
            value={investmentValue}
            onChange={(e) => setInvestmentValue(e.target.value)}
            className={inputClass}
          />
        </Field>

        {setting.investmentValueAt && (
          <p className="text-xs text-slate-400">
            最後更新：
            {new Intl.DateTimeFormat("zh-TW", {
              timeZone: "Asia/Taipei",
              dateStyle: "medium",
            }).format(setting.investmentValueAt)}
          </p>
        )}
      </section>

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
    </form>
  );
}
