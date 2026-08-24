"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toDbAmount } from "@/lib/money";
import { settingsInputSchema } from "@/lib/validation";
import type { ActionResult } from "./transactions";

/** 空字串代表「沒填」，轉成 null；有值就轉成兩位小數字串 */
function optionalAmount(value: string | undefined) {
  const v = value?.trim();
  return v ? toDbAmount(v) : null;
}

export async function saveSettings(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = settingsInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "輸入不正確" };
  }
  const input = parsed.data;

  const investmentValue = optionalAmount(input.investmentValue);
  const existing = await prisma.userSetting.findUnique({
    where: { userId },
    select: { investmentValue: true },
  });

  // 投資現值有變動才更新時間戳，否則「最後更新於」會每次存檔都被刷新
  const valueChanged =
    investmentValue !== (existing?.investmentValue?.toString() ?? null);

  const data = {
    startingCash: optionalAmount(input.startingCash) ?? "0",
    startingInvestment: optionalAmount(input.startingInvestment) ?? "0",
    investmentValue,
    ...(valueChanged
      ? { investmentValueAt: investmentValue ? new Date() : null }
      : {}),
    monthlyBudget: optionalAmount(input.monthlyBudget),
    targetSavingsRate: input.targetSavingsRate ?? null,
    payday: input.payday ?? null,
  };

  await prisma.userSetting.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}
