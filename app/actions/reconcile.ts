"use server";

/**
 * 資產對帳 — 見 SPEC 8.10
 *
 * 調整**留下一筆看得見的交易**，而不是偷偷改設定值。
 * 三個月後你看到現金少了 1,500，要能在交易列表找到「差額調整」
 * 那一筆知道發生過什麼事；改設定的話什麼痕跡都不會留下。
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toDbDate, todayTaipei } from "@/lib/date";
import { toDbAmount } from "@/lib/money";
import { ADJUSTMENT_CATEGORY, reconcile } from "@/lib/reconcile";
import type { ActionResult } from "./transactions";

export async function createAdjustment(input: {
  /** 系統依交易紀錄算出來的現金 */
  expected: string;
  /** 使用者實際數出來的餘額 */
  actual: string;
  note?: string;
}): Promise<ActionResult> {
  const userId = await requireUserId();

  let result;
  try {
    result = reconcile(input.expected, input.actual);
  } catch {
    return { ok: false, message: "餘額只能是數字" };
  }

  if (result.direction === "NONE") {
    return { ok: false, message: "差額小於 1 元，不需要調整" };
  }

  const category = await prisma.category.findFirst({
    where: { userId, name: ADJUSTMENT_CATEGORY, type: result.direction },
    select: { id: true },
  });

  if (!category) {
    return {
      ok: false,
      message: `找不到「${ADJUSTMENT_CATEGORY}」分類，請先到分類管理新增一個${
        result.direction === "EXPENSE" ? "支出" : "收入"
      }分類`,
    };
  }

  await prisma.transaction.create({
    data: {
      userId,
      date: toDbDate(todayTaipei()),
      type: result.direction,
      amount: toDbAmount(result.amount),
      categoryId: category.id,
      note: input.note?.trim() || "對帳調整",
    },
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/settings/reconcile");
  return { ok: true };
}
