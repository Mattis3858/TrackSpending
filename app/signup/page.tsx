import { Suspense } from "react";
import SignupForm from "./signup-form";

export const metadata = { title: "註冊 · 記帳" };

export default function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">建立帳號</h1>
        <p className="mt-1 text-sm text-slate-500">
          每個帳號有各自獨立的帳本，資料不會互通
        </p>

        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
      </div>
    </main>
  );
}
