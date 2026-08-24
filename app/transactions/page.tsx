import { requireUserId } from "@/lib/auth";
import {
  getCategories,
  getFrequentCategoryIds,
  getLastUsedCategoryId,
  getTransactionsForMonth,
} from "@/lib/queries";
import { addDays, todayTaipei } from "@/lib/date";
import type { TransactionInput } from "@/lib/validation";
import { createTransaction, deleteTransaction } from "@/app/actions/transactions";
import QuickAddSheet from "@/components/quick-add-sheet";
import { readYearMonth } from "@/lib/params";
import { summarizeMonth } from "@/lib/reports";
import { amountFormatter } from "@/lib/money";
import { getHideAmounts } from "@/lib/preferences";
import { setHideAmounts } from "@/app/actions/preferences";
import AmountVisibilityToggle from "@/components/amount-visibility-toggle";
import MonthSwitcher from "@/components/month-switcher";
import BottomNav from "@/components/bottom-nav";
import TransactionList from "@/components/transaction-list";

export const metadata = { title: "交易 · 記帳" };

export default async function TransactionsPage(
  props: PageProps<"/transactions">,
) {
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  const ym = readYearMonth(searchParams.m);

  const [txs, categories, frequentIds, lastUsedCategoryId] = await Promise.all([
    getTransactionsForMonth(userId, ym),
    getCategories(userId),
    getFrequentCategoryIds(userId),
    getLastUsedCategoryId(userId),
  ]);
  const summary = summarizeMonth(txs);
  const hidden = await getHideAmounts();
  const fmt = amountFormatter(hidden);

  const today = todayTaipei();

  async function quickAdd(input: TransactionInput) {
    "use server";
    return createTransaction(input);
  }

  async function removeTransaction(id: string) {
    "use server";
    return deleteTransaction(id);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-24">
          <header className="flex items-center justify-between">
            <MonthSwitcher ym={ym} basePath="/transactions" />
            <AmountVisibilityToggle hidden={hidden} onToggleAction={setHideAmounts} />
          </header>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-400">收入</p>
              <p className="tabular mt-0.5 text-lg font-semibold text-emerald-600">
                {fmt(summary.totalIncome)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-400">支出</p>
              <p className="tabular mt-0.5 text-lg font-semibold">
                {fmt(summary.totalExpense)}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <TransactionList txs={txs} hidden={hidden} onDeleteAction={removeTransaction} />
          </div>
        </div>
      </main>

      <QuickAddSheet
        categories={categories}
        frequentIds={frequentIds}
        lastUsedCategoryId={lastUsedCategoryId}
        today={today}
        yesterday={addDays(today, -1)}
        onSubmitAction={quickAdd}
      />
      <BottomNav />
    </>
  );
}
