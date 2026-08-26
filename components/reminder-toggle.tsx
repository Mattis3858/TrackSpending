"use client";

import { useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";
import type { ActionResult } from "@/app/actions/transactions";
import type { PushSubscriptionInput } from "@/app/actions/push";

type Props = {
  publicKey: string;
  onSubscribe: (input: PushSubscriptionInput) => Promise<ActionResult>;
  onUnsubscribe: (endpoint: string) => Promise<ActionResult>;
  onCheck: (endpoint: string) => Promise<boolean>;
};

/**
 * Brave 為了去 Google 化，預設關閉「使用 Google 服務進行推播訊息」。
 * Web Push 在 Chromium 系底層走的就是 FCM，關掉之後 subscribe() 必定
 * 以 AbortError 失敗——但錯誤訊息完全看不出跟這個設定有關。
 */
function isBrave(): boolean {
  const nav = navigator as Navigator & { brave?: { isBrave?: unknown } };
  return typeof nav.brave?.isBrave === "function";
}

/**
 * 把瀏覽器丟出的原始錯誤翻成看得懂的說明。
 * pushManager.subscribe() 失敗時 Chrome 只會給
 * "Registration failed - push service error"，那對使用者毫無幫助。
 */
function explain(error: unknown): string {
  const err = error instanceof Error ? error : null;
  const message = err?.message ?? String(error);

  if (err?.name === "AbortError" || /push service/i.test(message)) {
    if (isBrave()) {
      return "Brave 預設關閉了 Google 的推播服務，所以註冊失敗。到 brave://settings/privacy 打開「Use Google services for push messaging」並重新啟動 Brave 即可。（打開等於讓推播經過 Google 的伺服器，那正是 Brave 預設關掉它的原因——不想開的話桌面端就跳過，手機那台不受影響。）";
    }
    return "瀏覽器連不上推播服務。常見原因：網路或防火牆擋住 Google 的推播服務、瀏覽器停用了推播，或這個瀏覽器設定檔的推播註冊壞掉了。可以試著清除本站資料後重新啟動瀏覽器；手機那台不受影響。";
  }
  if (err?.name === "NotAllowedError") {
    return "通知權限被拒絕。到瀏覽器的網站設定把「通知」改成允許，再回來開啟。";
  }
  if (err?.name === "InvalidStateError") {
    return "這個瀏覽器已經有一個舊的推播訂閱。清除本站資料後再試一次。";
  }
  if (err?.name === "NotSupportedError") {
    return "這個瀏覽器不支援推播，或推播功能被停用了。";
  }
  return message;
}

type State =
  | "loading"
  | "unsupported"
  | "denied"
  | "off"
  | "on"
  | "working";

export default function ReminderToggle({
  publicKey,
  onSubscribe,
  onUnsubscribe,
  onCheck,
}: Props) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  // 開啟頁面時對照瀏覽器的訂閱狀態與伺服器紀錄，兩邊都有才算「已開啟」
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (!existing) {
          setState("off");
          return;
        }
        // 瀏覽器有訂閱但伺服器沒有（例如換了資料庫），視為未開啟
        setState((await onCheck(existing.endpoint)) ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onCheck]);

  async function enable() {
    setError(null);
    setState("working");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Chrome 要求每次推播都必須顯示通知，不能靜默
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = subscription.toJSON();
      const result = await onSubscribe({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });

      if (result.ok) {
        setState("on");
      } else {
        setError(result.message);
        setState("off");
      }
    } catch (e) {
      setError(explain(e));
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("working");

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await onUnsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(explain(e));
      setState("on");
    }
  }

  const body = () => {
    switch (state) {
      case "loading":
        return <p className="text-sm text-slate-400">檢查中…</p>;

      case "unsupported":
        return (
          <p className="text-sm text-slate-500">
            這個瀏覽器不支援推播通知。把網站安裝成應用程式（Chrome 選單 → 安裝應用程式）之後就可以使用。
          </p>
        );

      case "denied":
        return (
          <p className="text-sm text-amber-700">
            通知權限已被封鎖。到瀏覽器的網站設定裡把「通知」改成允許，再回來開啟。
          </p>
        );

      case "on":
        return (
          <>
            <p className="text-sm text-emerald-700">已開啟</p>
            <button
              type="button"
              onClick={disable}
              className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
            >
              關閉提醒
            </button>
          </>
        );

      case "working":
        return <p className="text-sm text-slate-400">處理中…</p>;

      default:
        return (
          <button
            type="button"
            onClick={enable}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            開啟提醒
          </button>
        );
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">每日記帳提醒</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          每晚 22:00 固定提醒你記帳，不管當天記過沒有——晚餐和宵夜常常是漏掉的那幾筆。
        </p>
      </div>

      {body()}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="text-xs text-slate-400">
        提醒是綁定裝置的，每台想收到的手機或電腦都要各自開啟。
      </p>
    </section>
  );
}
