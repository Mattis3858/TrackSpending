import { requireUserId } from "@/lib/auth";
import { isSetAsideKind, type CategoryKind } from "@/lib/category";
import { prisma } from "@/lib/prisma";
import {
  archiveCategory,
  createCategory,
  updateCategory,
} from "@/app/actions/categories";
import BottomNav from "@/components/bottom-nav";
import CategoryManager from "@/components/category-manager";

export const metadata = { title: "分類管理 · 記帳" };

export default async function CategoriesPage() {
  const userId = await requireUserId();

  const categories = await prisma.category.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      kind: true,
      isDefault: true,
      color: true,
      sortOrder: true,
      archived: true,
    },
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const items = categories.map((c) => ({
    ...c,
    isSavings: isSetAsideKind(c.kind),
  }));

  async function create(input: {
    name: string;
    type: "INCOME" | "EXPENSE";
    color: string;
    kind: CategoryKind;
  }) {
    "use server";
    return createCategory(input);
  }

  async function update(
    id: string,
    input: { name: string; kind?: CategoryKind; color?: string },
  ) {
    "use server";
    return updateCategory(id, input);
  }

  async function archive(id: string, archived: boolean) {
    "use server";
    return archiveCategory(id, archived);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-xl font-semibold tracking-tight">分類管理</h1>
          <div className="mt-5">
            <CategoryManager
              categories={items}
              onCreate={create}
              onUpdate={update}
              onArchive={archive}
            />
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
