import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// 專案只用一份 .env.local（Next.js 也讀這份），避免密鑰散在兩個檔案
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // 這個 url 只有 Prisma CLI 會用到（migrate / db push / studio），
    // 必須是「直連」字串（port 5432），走 pooler 會讓 migration 失敗。
    //
    // 應用程式執行期不讀這裡：runtime 走 lib/prisma.ts 的 driver adapter，
    // 連的是 DATABASE_URL（pooler, port 6543）。見 SPEC.md 第 3 節。
    url: env("DIRECT_URL"),
  },
});
