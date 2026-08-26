"use server";

/**
 * 固定支出範本 — 見 SPEC 8.13
 *
 * 只記錄「每月固定要付什麼、多少錢」，不會自動產生交易。
 * 它的用途是讓「每日可用額度」與「緩衝資金」把還沒發生但跑不掉的
 * 支出先扣掉——否則月初會系統性高估，記房租那天數字又突然腰斬。
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toDbAmount } from "@/lib/money";
import { recurringTemplateInputSchema } from "@/lib/validation";
import type { ActionResult } from "./transactions";

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "輸入不正確";
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/settings/recurring");
}

/** 範本必須指向自己的支出分類，而且不能是儲蓄或投資 */
async function assertExpenseCategory(userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId, archived: false },
    select: { type: true, kind: true },
  });
  if (!category) return "找不到這個分類";
  if (category.type !== "EXPENSE") return "固定支出範本只能用支出分類";
  if (category.kind === "SAVINGS" || category.kind === "INVESTMENT") {
    return "儲蓄與投資不是消費支出，不需要設固定範本";
  }
  return null;
}

export async function createRecurringTemplate(
  raw: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = recurringTemplateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const input = parsed.data;

  const categoryError = await assertExpenseCategory(userId, input.categoryId);
  if (categoryError) return { ok: false, message: categoryError };

  const duplicate = await prisma.recurringTemplate.findFirst({
    where: { userId, categoryId: input.categoryId, active: true },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, message: "這個分類已經有固定支出範本了，請直接編輯" };
  }

  await prisma.recurringTemplate.create({
    data: {
      userId,
      categoryId: input.categoryId,
      amount: toDbAmount(input.amount),
      dayOfMonth: input.dayOfMonth,
      note: input.note?.trim() || null,
    },
  });

  revalidateAll();
  return { ok: true };
}

export async function updateRecurringTemplate(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!id) return { ok: false, message: "缺少範本 id" };

  const parsed = recurringTemplateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const input = parsed.data;

  const result = await prisma.recurringTemplate.updateMany({
    where: { id, userId },
    data: {
      amount: toDbAmount(input.amount),
      dayOfMonth: input.dayOfMonth,
      note: input.note?.trim() || null,
    },
  });
  if (result.count === 0) return { ok: false, message: "找不到這個範本" };

  revalidateAll();
  return { ok: true };
}

export async function deleteRecurringTemplate(
  id: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!id) return { ok: false, message: "缺少範本 id" };

  const result = await prisma.recurringTemplate.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) return { ok: false, message: "找不到這個範本" };

  revalidateAll();
  return { ok: true };
}
