"use server";

/**
 * 分類 Server Actions。
 * 刪除一律是軟刪除（archived = true），不可以真的 delete，
 * 否則歷史交易的分類會消失、過去的報表就永久壞掉。見 SPEC 5.4
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { categoryInputSchema } from "@/lib/validation";
import type { ActionResult } from "./transactions";

function invalid(message: string): ActionResult {
  return { ok: false, message };
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/settings/categories");
}

export async function createCategory(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = categoryInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "輸入不正確");
  const input = parsed.data;

  const duplicate = await prisma.category.findFirst({
    where: { userId, name: input.name, type: input.type },
    select: { id: true, archived: true },
  });
  if (duplicate) {
    if (duplicate.archived) {
      // 同名分類之前被封存過，直接復原而不是報錯
      await prisma.category.update({
        where: { id: duplicate.id },
        data: { archived: false, color: input.color, kind: input.kind ?? "VARIABLE" },
      });
      revalidateAll();
      return { ok: true };
    }
    return invalid("已經有同名的分類了");
  }

  const maxOrder = await prisma.category.aggregate({
    where: { userId, type: input.type },
    _max: { sortOrder: true },
  });

  await prisma.category.create({
    data: {
      userId,
      name: input.name,
      type: input.type,
      color: input.color ?? "#94a3b8",
      kind: input.kind ?? "VARIABLE",
      isDefault: false,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });

  revalidateAll();
  return { ok: true };
}

export async function updateCategory(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = categoryInputSchema
    .pick({ name: true, color: true, kind: true })
    .safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "輸入不正確");
  const input = parsed.data;

  const existing = await prisma.category.findFirst({
    where: { id, userId },
    select: { id: true, type: true },
  });
  if (!existing) return invalid("找不到這個分類");

  const duplicate = await prisma.category.findFirst({
    where: { userId, name: input.name, type: existing.type, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) return invalid("已經有同名的分類了");

  await prisma.category.updateMany({
    where: { id, userId },
    data: {
      name: input.name,
      ...(input.color ? { color: input.color } : {}),
      // kind 開放修改（例如搬家後房租性質改變、或想把某個分類從變動改成固定）。
      // 報表都是即時計算，改完歷史交易會跟著重新歸類。
      ...(input.kind ? { kind: input.kind } : {}),
    },
  });

  revalidateAll();
  return { ok: true };
}

/** 封存（軟刪除）。內建分類不開放封存。 */
export async function archiveCategory(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const existing = await prisma.category.findFirst({
    where: { id, userId },
    select: { isDefault: true },
  });
  if (!existing) return invalid("找不到這個分類");
  if (existing.isDefault && archived) return invalid("內建分類不能封存");

  await prisma.category.updateMany({ where: { id, userId }, data: { archived } });

  revalidateAll();
  return { ok: true };
}
