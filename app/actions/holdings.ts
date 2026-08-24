"use server";

/**
 * 持股 Server Actions。
 *
 * 新增時如果沒填名稱，會用股票代號去公開報價 API 查名稱與所屬市場，
 * 使用者只要打「2330」就好。查不到也不擋——可能是新上市或當天沒交易，
 * 讓使用者自己填名稱即可。
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { toDbAmount } from "@/lib/money";
import { lookupSymbol } from "@/lib/quotes";
import { holdingInputSchema } from "@/lib/validation";
import type { ActionResult } from "./transactions";

function invalid(message: string): ActionResult {
  return { ok: false, message };
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/settings/holdings");
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "輸入不正確";
}

export async function createHolding(raw: unknown): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = holdingInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const input = parsed.data;

  const symbol = input.symbol.toUpperCase();

  const existing = await prisma.holding.findFirst({
    where: { userId, symbol },
    select: { id: true, archived: true },
  });
  if (existing && !existing.archived) {
    return invalid(`已經有 ${symbol} 的持股了，請直接編輯`);
  }

  // 沒填名稱就去查；查不到就用代號當名稱，不擋使用者
  let name = input.name?.trim();
  let market = input.market;
  if (!name || !market) {
    const quote = await lookupSymbol(symbol);
    name = name || quote?.name || symbol;
    market = market || quote?.market || "TWSE";
  }

  const data = {
    symbol,
    name,
    market,
    shares: input.shares.trim(),
    cost: toDbAmount(input.cost),
    note: input.note?.trim() || null,
    archived: false,
  };

  if (existing) {
    // 之前封存過的同代號持股，直接復原並覆寫
    await prisma.holding.update({ where: { id: existing.id }, data });
  } else {
    await prisma.holding.create({ data: { userId, ...data } });
  }

  revalidateAll();
  return { ok: true };
}

export async function updateHolding(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!id) return invalid("缺少持股 id");

  const parsed = holdingInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const input = parsed.data;

  const result = await prisma.holding.updateMany({
    where: { id, userId },
    data: {
      name: input.name?.trim() || undefined,
      shares: input.shares.trim(),
      cost: toDbAmount(input.cost),
      note: input.note?.trim() || null,
      ...(input.market ? { market: input.market } : {}),
    },
  });
  if (result.count === 0) return invalid("找不到這筆持股");

  revalidateAll();
  return { ok: true };
}

/**
 * 持股用硬刪除（不像分類用封存）：
 * 持股不被歷史交易參照，刪掉不會破壞任何報表，賣光了就該消失。
 */
export async function deleteHolding(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!id) return invalid("缺少持股 id");

  const result = await prisma.holding.deleteMany({ where: { id, userId } });
  if (result.count === 0) return invalid("找不到這筆持股");

  revalidateAll();
  return { ok: true };
}

/** 新增表單用：輸入代號後即時帶出名稱 */
export async function lookupHoldingSymbol(
  symbol: string,
): Promise<{ name: string; market: "TWSE" | "TPEX"; price: string } | null> {
  await requireUserId();
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return null;

  const quote = await lookupSymbol(trimmed);
  if (!quote) return null;

  return {
    name: quote.name,
    market: quote.market,
    price: quote.price.toFixed(2),
  };
}
