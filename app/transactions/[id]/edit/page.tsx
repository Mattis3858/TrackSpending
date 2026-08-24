import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getCategories, getTransaction } from "@/lib/queries";
import { deleteTransaction, updateTransaction } from "@/app/actions/transactions";
import type { TransactionInput } from "@/lib/validation";
import TransactionForm from "@/components/transaction-form";

export const metadata = { title: "編輯交易 · 記帳" };

export default async function EditTransactionPage(
  props: PageProps<"/transactions/[id]/edit">,
) {
  const userId = await requireUserId();
  const { id } = await props.params;

  const [tx, categories] = await Promise.all([
    getTransaction(userId, id),
    getCategories(userId),
  ]);
  if (!tx) notFound();

  // TRANSFER 是 Phase 2 才開放，Phase 1 的表單不處理
  if (tx.type === "TRANSFER") notFound();

  const defaultValues: TransactionInput = {
    date: tx.date,
    type: tx.type,
    // DB 存的是 "1234.50"，編輯時顯示成 "1234.5" 比較自然
    amount: tx.amount.replace(/[.]?0+$/, ""),
    categoryId: tx.category?.id ?? "",
    note: tx.note ?? "",
  };

  async function submit(input: TransactionInput) {
    "use server";
    return updateTransaction(id, input);
  }

  async function remove() {
    "use server";
    return deleteTransaction(id);
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto w-full max-w-lg">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">編輯交易</h1>
          <Link href="/transactions" className="text-sm text-slate-500 hover:text-slate-900">
            取消
          </Link>
        </header>

        <div className="mt-6">
          <TransactionForm
            categories={categories}
            defaultValues={defaultValues}
            submitLabel="更新"
            onSubmitAction={submit}
            onDeleteAction={remove}
          />
        </div>
      </div>
    </main>
  );
}
