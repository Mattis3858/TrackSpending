import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getCategories, getRecurringTemplates } from "@/lib/queries";
import { isSetAsideKind } from "@/lib/category";
import {
  createRecurringTemplate,
  deleteRecurringTemplate,
  updateRecurringTemplate,
} from "@/app/actions/recurring";
import BottomNav from "@/components/bottom-nav";
import RecurringManager from "@/components/recurring-manager";

export const metadata = { title: "固定支出 · 記帳" };

type Input = { categoryId: string; amount: string; dayOfMonth: number; note?: string };

export default async function RecurringPage() {
  const userId = await requireUserId();

  const [templates, allCategories] = await Promise.all([
    getRecurringTemplates(userId),
    getCategories(userId),
  ]);

  // 儲蓄與投資不是消費支出，不需要設固定範本
  const categories = allCategories.filter(
    (c) => c.type === "EXPENSE" && !isSetAsideKind(c.kind),
  );

  async function create(input: Input) {
    "use server";
    return createRecurringTemplate(input);
  }
  async function update(id: string, input: Input) {
    "use server";
    return updateRecurringTemplate(id, input);
  }
  async function remove(id: string) {
    "use server";
    return deleteRecurringTemplate(id);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-8">
          <header className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">固定支出</h1>
            <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">
              設定
            </Link>
          </header>

          <p className="mt-2 text-sm text-slate-500">
            每月跑不掉的支出。登錄之後，月初的「每日可用額度」就不會把房租那筆錢算成可以花的。
          </p>

          <div className="mt-6">
            <RecurringManager
              templates={templates}
              categories={categories}
              onCreate={create}
              onUpdate={update}
              onDelete={remove}
            />
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
