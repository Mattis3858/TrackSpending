"use server";

/**
 * 推播訂閱的存取。訂閱資訊本身沒有敏感內容，但它綁定使用者，
 * 所以跟其他租戶資料一樣要經過 requireUserId。
 */

import { headers } from "next/headers";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { describeDevice } from "@/lib/push";
import type { ActionResult } from "./transactions";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function savePushSubscription(
  input: PushSubscriptionInput,
): Promise<ActionResult> {
  const userId = await requireUserId();

  if (!input?.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, message: "訂閱資訊不完整" };
  }

  const ua = (await headers()).get("user-agent") ?? "";

  try {
    // 先釋放這個 endpoint 上既有的訂閱。它可能屬於之前在同一台裝置
    // 登入過的其他使用者——實際持有裝置的人就該擁有它的推播，否則
    // 提醒會繼續寄給前一個人。
    //
    // 這一步刻意跨租戶（用 endpoint 而不是 userId 當條件），所以走
    // prismaUnscoped。它只刪不讀，不會洩漏任何資料。
    await prismaUnscoped.pushSubscription.deleteMany({
      where: { endpoint: input.endpoint },
    });

    await prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: describeDevice(ua),
      },
    });

    return { ok: true };
  } catch (error) {
    // 正式環境的 Server Component 錯誤會被 React 換成看不懂的代碼
    // （#441），所以這裡自己攔下來回傳可讀訊息。
    console.error("savePushSubscription failed", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "訂閱失敗",
    };
  }
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!endpoint) return { ok: false, message: "缺少 endpoint" };

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return { ok: true };
}

/** 目前這台裝置有沒有訂閱（用來決定開關的初始狀態） */
export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const userId = await requireUserId();
  if (!endpoint) return false;

  const found = await prisma.pushSubscription.findFirst({
    where: { endpoint, userId },
    select: { id: true },
  });
  return found !== null;
}
