"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

export default function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    if (password.length < 8) {
      setError("密碼至少 8 個字元");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(
        error.message === "User already registered"
          ? "這個 email 已經註冊過了，請直接登入"
          : error.message,
      );
      setPending(false);
      return;
    }

    // 專案若開啟 email 驗證，這時還拿不到 session，要先去收信
    if (!data.session) {
      setNeedsConfirmation(true);
      setPending(false);
      return;
    }

    // 預設分類會在第一次載入首頁時自動建立
    router.replace("/");
    router.refresh();
  }

  if (needsConfirmation) {
    return (
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-base font-medium">請到信箱收驗證信</p>
        <p className="mt-2 text-sm text-slate-500">
          我們寄了一封驗證信到 <span className="font-medium">{email}</span>，
          點擊信中的連結完成註冊後就可以登入。
        </p>
        <Link
          href="/login"
          className="mt-5 block rounded-lg bg-slate-900 py-2.5 text-center text-base font-medium text-white"
        >
          回到登入
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          密碼
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-slate-400">至少 8 個字元</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-sm font-medium">
          再次輸入密碼
        </label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "建立中…" : "建立帳號"}
      </button>

      <p className="text-center text-sm text-slate-500">
        已經有帳號了？
        <Link href="/login" className="ml-1 font-medium text-slate-900 hover:underline">
          登入
        </Link>
      </p>
    </form>
  );
}
