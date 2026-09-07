import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getTheme } from "@/lib/preferences";
import { setTheme } from "@/app/actions/theme";
import { getUserSetting, hasAnyTransaction } from "@/lib/queries";
import { saveSettings } from "@/app/actions/settings";
import type { SettingsInput } from "@/lib/validation";
import BottomNav from "@/components/bottom-nav";
import ThemeToggle from "@/components/theme-toggle";
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
  const [setting, started, theme] = await Promise.all([
    getUserSetting(userId),
    hasAnyTransaction(userId),
    getTheme(),
  ]);

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

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-8">
          <header className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">設定</h1>
            <ThemeToggle theme={theme} onToggleAction={setTheme} />
          </header>

          <div className="mt-5">
            <SettingsForm setting={setting} started={started} onSaveAction={save}>
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

              <div className="mt-6 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <Link
                  href="/settings/holdings"
                  className="flex items-center justify-between px-4 py-3.5 text-base hover:bg-slate-50"
                >
                  <span>
                    持股
                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                      登錄後投資現值自動更新
                    </span>
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">›</span>
                </Link>
                <Link
                  href="/settings/recurring"
                  className="flex items-center justify-between px-4 py-3.5 text-base hover:bg-slate-50"
                >
                  <span>
                    固定支出
                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                      房租、訂閱等每月跑不掉的支出
                    </span>
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">›</span>
                </Link>
                <Link
                  href="/settings/reconcile"
                  className="flex items-center justify-between px-4 py-3.5 text-base hover:bg-slate-50"
                >
                  <span>
                    對帳
                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                      實際餘額跟系統對不上時，補一筆調整
                    </span>
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">›</span>
                </Link>
                <Link
                  href="/settings/categories"
                  className="flex items-center justify-between px-4 py-3.5 text-base hover:bg-slate-50"
                >
                  <span>分類管理</span>
                  <span className="text-slate-400 dark:text-slate-500">›</span>
                </Link>
              </div>
            </SettingsForm>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
