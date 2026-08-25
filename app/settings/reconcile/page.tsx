import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getMonthlyTotals, getUserSetting, sumMonthlyTotals } from "@/lib/queries";
import { assetSummary } from "@/lib/analysis";
import { createAdjustment } from "@/app/actions/reconcile";
import BottomNav from "@/components/bottom-nav";
import ReconcileForm from "@/components/reconcile-form";

export const metadata = { title: "對帳 · 記帳" };

export default async function ReconcilePage() {
  const userId = await requireUserId();

  const [history, setting] = await Promise.all([
    getMonthlyTotals(userId),
    getUserSetting(userId),
  ]);
  const allTime = sumMonthlyTotals(history);

  // 只對台幣現金對帳。美元現金是設定頁手動維護的欄位，直接改那裡就好。
  const assets = assetSummary({
    startingCash: setting.startingCash,
    allTimeIncome: allTime.income,
    allTimeConsumption: allTime.consumption,
    allTimeInvestment: allTime.investment,
  });

  async function adjust(input: {
    expected: string;
    actual: string;
    note?: string;
  }) {
    "use server";
    return createAdjustment(input);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-8">
          <header className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">對帳</h1>
            <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">
              設定
            </Link>
          </header>

          <p className="mt-2 text-sm text-slate-500">
            漏記或記錯難免發生。輸入實際餘額，系統會補一筆調整讓兩邊一致。
          </p>

          <div className="mt-6">
            <ReconcileForm expected={assets.cash.toFixed(2)} onAdjust={adjust} />
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
