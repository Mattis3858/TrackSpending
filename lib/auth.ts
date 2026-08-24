/**
 * 身分驗證 — 見 SPEC.md 第 7 節
 *
 * proxy.ts 只保護「頁面渲染」。Server Action 是獨立的公開 HTTP endpoint，
 * 不會經過頁面，所以每一個 Server Action 都必須自己呼叫 requireUser()。
 * 只靠 proxy/middleware 保護是不夠的。
 *
 * 另外一律用 getUser() 而不是 getSession()：後者只讀 cookie，內容未經伺服器驗證。
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/** 取得目前登入者，未登入回傳 null */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** 取得目前登入者，未登入直接拋錯。所有 Server Action 的第一行都要呼叫這個。 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** 便利函式：只要 userId，用來組 where 條件 */
export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}
