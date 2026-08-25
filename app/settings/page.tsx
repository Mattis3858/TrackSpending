import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getUserSetting } from "@/lib/queries";
import { saveSettings } from "@/app/actions/settings";
import type { SettingsInput } from "@/lib/validation";
import BottomNav from "@/components/bottom-nav";
import SettingsForm from "@/components/settings-form";
import ReminderToggle from "@/components/reminder-toggle";
import {
  deletePushSubscription,
  hasPushSubscription,
  savePushSubscription,
  type PushSubscriptionInput,
} from "@/app/actions/push";

export const metadata = { title: "設定 · 記帳" };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const setting = await getUserSetting(userId);

  async function save(input: SettingsInput) {
    "use server";
    return saveSettings(input);
  }

  async function subscribe(input: PushSubscriptionInput) {
    "use server";
    return savePushSubscription(input);
  }
  async function unsubscribe(endpoint: string) {
    "use server";
    return deletePushSubscription(endpoint);
  }
  async function checkSubscription(endpoint: string) {
    "use server";
    return hasPushSubscription(endpoint);
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-8">
          <h1 className="text-xl font-semibold tracking-tight">設定</h1>

          <div className="mt-5">
            <SettingsForm setting={setting} onSaveAction={save} />
          </div>

          {vapidPublicKey && (
            <div className="mt-6">
              <ReminderToggle
                publicKey={vapidPublicKey}
                onSubscribe={subscribe}
                onUnsubscribe={unsubscribe}
                onCheck={checkSubscription}
              />
            </div>
          )}

          <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <Link
              href="/settings/holdings"
              className="flex items-center justify-between px-4 py-3.5 text-base hover:bg-slate-50"
            >
              <span>
                持股
                <span className="block text-xs text-slate-400">
                  登錄後投資現值自動更新
                </span>
              </span>
              <span className="text-slate-400">›</span>
            </Link>
            <Link
              href="/settings/categories"
              className="flex items-center justify-between px-4 py-3.5 text-base hover:bg-slate-50"
            >
              <span>分類管理</span>
              <span className="text-slate-400">›</span>
            </Link>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
