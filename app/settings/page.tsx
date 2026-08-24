import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getUserSetting } from "@/lib/queries";
import { saveSettings } from "@/app/actions/settings";
import type { SettingsInput } from "@/lib/validation";
import BottomNav from "@/components/bottom-nav";
import SettingsForm from "@/components/settings-form";

export const metadata = { title: "設定 · 記帳" };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const setting = await getUserSetting(userId);

  async function save(input: SettingsInput) {
    "use server";
    return saveSettings(input);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-8">
          <h1 className="text-xl font-semibold tracking-tight">設定</h1>

          <div className="mt-5">
            <SettingsForm setting={setting} onSaveAction={save} />
          </div>

          <Link
            href="/settings/categories"
            className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base hover:bg-slate-50"
          >
            <span>分類管理</span>
            <span className="text-slate-400">›</span>
          </Link>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
