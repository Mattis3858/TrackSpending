"use server";

/**
 * 交易 Server Actions。
 *
 * 每一個 action 都必須：
 * 1. 第一行 requireUserId()（proxy.ts 不保護 Server Action，見 SPEC 7.1）
 * 2. 用 zod 重新驗證輸入（不相信瀏覽器傳來的資料，見 SPEC 7.3）
 * 3. 所有 DB 操作帶 userId，用 updateMany/deleteMany 確保所有權（見 SPEC 7.2）
 * 4. 結束前 revalidatePath，不然月報表不會即時更新
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toDbDate } from "@/lib/date";
import { toDbAmount } from "@/lib/money";
import { transactionInputSchema } from "@/lib/validation";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function invalid(message: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, message, fieldErrors };
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/transactions");
}

/** 確認分類存在、屬於本人、且類型與交易一致 */
async function assertCategory(userId: string, categoryId: string, type: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId, archived: false },
    select: { id: true, type: true },
  });
  if (!category) return "找不到這個分類";
  if (category.type !== type) return "分類的類型與這筆交易不符";
  return null;
}

export async function createTransaction(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return invalid("表單有欄位需要修正", fieldErrors);
  }

  const input = parsed.data;
  const categoryError = await assertCategory(userId, input.categoryId, input.type);
  if (categoryError) return invalid(categoryError, { categoryId: categoryError });

  await prisma.transaction.create({
    data: {
      userId,
      date: toDbDate(input.date),
      type: input.type,
      amount: toDbAmount(input.amount),
      note: input.note?.trim() || null,
      categoryId: input.categoryId,
    },
  });

  revalidateAll();
  return { ok: true };
}

export async function updateTransaction(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!id) return invalid("缺少交易 id");

  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return invalid("表單有欄位需要修正", fieldErrors);
  }

  const input = parsed.data;
  const categoryError = await assertCategory(userId, input.categoryId, input.type);
  if (categoryError) return invalid(categoryError, { categoryId: categoryError });

  // 用 updateMany 帶 userId，避免只靠 id 就能改到別人的資料（SPEC 7.2）
  const result = await prisma.transaction.updateMany({
    where: { id, userId },
    data: {
      date: toDbDate(input.date),
      type: input.type,
      amount: toDbAmount(input.amount),
      note: input.note?.trim() || null,
      categoryId: input.categoryId,
    },
  });

  if (result.count === 0) return invalid("找不到這筆交易");

  revalidateAll();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!id) return invalid("缺少交易 id");

  const result = await prisma.transaction.deleteMany({ where: { id, userId } });
  if (result.count === 0) return invalid("找不到這筆交易");

  revalidateAll();
  return { ok: true };
}
