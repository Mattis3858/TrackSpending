import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { prismaUnscoped } from "@/lib/prisma";
import { toDbDate, todayTaipei } from "@/lib/date";
import { isGoneStatus } from "@/lib/push";

/**
 * 每日記帳提醒 — 見 SPEC 8.9
 *
 * 由排程在台北時間每晚 22:00（= 14:00 UTC）呼叫。
 *
 * **每天固定提醒所有開啟的人，不管當天記過沒有。**
 * 早餐午餐記了不代表今天記完了——晚餐與宵夜都發生在 22:00 之前，
 * 那正是最需要提醒的時候。用「有沒有記過」當跳過條件，會在最該提醒的
 * 日子不提醒。要不要收提醒由使用者用開關決定，不是由系統猜。
 *
 * 訊息會依當天已記的筆數變化，比固定字串有用。
 *
 * 這支端點會掃過所有使用者的訂閱，所以用 prismaUnscoped 繞過租戶防線。
 * 它是這個專案裡唯一這樣做的地方。
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 未設定" }, { status: 500 });
  }

  // Vercel Cron 會帶 Authorization: Bearer <CRON_SECRET>。
  // 也接受 ?secret= 讓外部排程服務（例如 cron-job.org）能用。
  const header = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("secret");
  if (header !== `Bearer ${secret}` && query !== secret) return unauthorized();

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "VAPID 設定不完整" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const today = todayTaipei();

  const [subscriptions, countRows] = await Promise.all([
    prismaUnscoped.pushSubscription.findMany({
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    }),
    // 當天筆數只影響訊息內容，不影響要不要送
    prismaUnscoped.transaction.groupBy({
      by: ["userId"],
      where: { date: toDbDate(today) },
      _count: { _all: true },
    }),
  ]);

  const countByUser = new Map(countRows.map((r) => [r.userId, r._count._all]));

  function payloadFor(userId: string): string {
    const count = countByUser.get(userId) ?? 0;
    return JSON.stringify({
      title: count === 0 ? "今天還沒記帳" : "晚餐和宵夜記了嗎？",
      body:
        count === 0
          ? "花一分鐘把今天的花費補上吧"
          : `今天記了 ${count} 筆，還有漏掉的就趁現在補`,
      url: "/",
      tag: `daily-${today}`,
    });
  }

  let sent = 0;
  const goneIds: string[] = [];
  const failures: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadFor(sub.userId),
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 / 410 代表使用者移除了 app 或撤銷授權，訂閱已經永久失效
        if (isGoneStatus(status)) goneIds.push(sub.id);
        else failures.push(`${sub.id}:${status ?? "unknown"}`);
      }
    }),
  );

  if (goneIds.length > 0) {
    await prismaUnscoped.pushSubscription.deleteMany({
      where: { id: { in: goneIds } },
    });
  }
  if (sent > 0) {
    await prismaUnscoped.pushSubscription.updateMany({
      where: { id: { in: subscriptions.map((t) => t.id) } },
      data: { lastSentAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    date: today,
    subscriptions: subscriptions.length,
    sent,
    removed: goneIds.length,
    failed: failures.length,
  });
}
