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

  const data = {
    startingCash: optionalAmount(input.startingCash) ?? "0",
    cashUsd: optionalAmount(input.cashUsd) ?? "0",
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
