import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries";
import { todayTaipei } from "@/lib/date";
import { createTransaction } from "@/app/actions/transactions";
import type { TransactionInput } from "@/lib/validation";
import TransactionForm from "@/components/transaction-form";

export const metadata = { title: "記一筆 · 記帳" };

export default async function NewTransactionPage() {
  const userId = await requireUserId();
  const [categories, lastCategoryId] = await Promise.all([
    getCategories(userId),
    getLastUsedCategoryId(userId),
  ]);

  // SPEC 第 9 節 UX：日期預設今天（台北時間）、分類帶入上次使用的
  const defaultValues: TransactionInput = {
    date: todayTaipei(),
    type: "EXPENSE",
    amount: "",
    categoryId: lastCategoryId ?? "",
    note: "",
  };

  async function submit(input: TransactionInput) {
    "use server";
    return createTransaction(input);
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto w-full max-w-lg">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">記一筆</h1>
          <Link href="/transactions" className="text-sm text-slate-500 hover:text-slate-900">
            取消
          </Link>
        </header>

        <div className="mt-6">
          <TransactionForm
            categories={categories}
            defaultValues={defaultValues}
            submitLabel="儲存"
            onSubmitAction={submit}
          />
        </div>
      </div>
    </main>
  );
}
