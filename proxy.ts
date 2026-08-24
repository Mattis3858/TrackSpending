/**
 * Next.js 16 把 middleware 改名為 proxy（runtime 固定 nodejs）。
 *
 * 這裡只做兩件事：
 * 1. 更新 Supabase session cookie（不做會在 Server Component 過期後被登出）
 * 2. 未登入時導向 /login
 *
 * 注意：這不是安全邊界。真正的授權檢查在每個 Server Action 內的 requireUser()。
 * 見 SPEC.md 7.1
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth", "/api/health"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // 排除靜態資源，否則 CSS/JS/圖片也會被擋。
  // manifest.webmanifest 也必須放行：Chrome 在判斷「能不能安裝成 app」時會抓它，
  // 被導向登入頁的話就讀不到 manifest，安裝提示不會出現。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
