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
 * 只提醒「今天還沒記帳」的人。已經記過的就不吵——會固定每天跳的通知
 * 很快就會被使用者關掉，那反而讓提醒功能整個失效。
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

  const [subscriptions, recordedRows] = await Promise.all([
    prismaUnscoped.pushSubscription.findMany({
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    }),
    // 今天已經記過帳的使用者，一次查完不必逐人查詢
    prismaUnscoped.transaction.findMany({
      where: { date: toDbDate(today) },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const recorded = new Set(recordedRows.map((r) => r.userId));
  const targets = subscriptions.filter((s) => !recorded.has(s.userId));

  const payload = JSON.stringify({
    title: "今天還沒記帳",
    body: "花一分鐘把今天的花費補上吧",
    url: "/",
    tag: `daily-${today}`,
  });

  let sent = 0;
  const goneIds: string[] = [];
  const failures: string[] = [];

  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
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
      where: { id: { in: targets.map((t) => t.id) } },
      data: { lastSentAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    date: today,
    subscriptions: subscriptions.length,
    // 今天已經記過帳、所以不打擾的裝置數
    skipped: subscriptions.length - targets.length,
    sent,
    removed: goneIds.length,
    failed: failures.length,
  });
}
