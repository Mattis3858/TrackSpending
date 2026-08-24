import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "登入 · 記帳" };

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">記帳</h1>
        <p className="mt-1 text-sm text-slate-500">
          登入後開始記錄每月收支
        </p>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
