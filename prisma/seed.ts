/**
 * 預設分類 seed — 見 SPEC.md 第 6 節
 *
 * 必須用 upsert 搭配 @@unique([userId, name, type])，不可以用 create，
 * 否則 seed 重跑會產生一堆重複分類。
 *
 * 執行：SEED_USER_ID=<supabase auth user id> npm run db:seed
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_CATEGORIES } from "../lib/default-categories";

// 分類清單跟 lib/provisioning.ts 共用，避免兩邊分歧
const CATEGORIES = DEFAULT_CATEGORIES;

async function main() {
  const userId = process.env.SEED_USER_ID;
  if (!userId) {
    throw new Error(
      "SEED_USER_ID 未設定。請先在 Supabase Auth 建立使用者，把該 user 的 id (UUID) 填進 .env.local 的 SEED_USER_ID。",
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    for (const [index, c] of CATEGORIES.entries()) {
      await prisma.category.upsert({
        where: {
          userId_name_type: { userId, name: c.name, type: c.type },
        },
        // 已存在時只校正語意相關欄位。
        // 不要覆寫 color / sortOrder，否則重跑 seed 會把使用者在 UI 上改過的顏色與排序洗掉。
        update: {
          kind: c.kind,
          isDefault: true,
        },
        create: {
          userId,
          name: c.name,
          type: c.type,
          isDefault: true,
          kind: c.kind,
          color: c.color,
          sortOrder: index,
        },
      });
    }

    const count = await prisma.category.count({ where: { userId } });
    console.log(`✅ Seed 完成：${CATEGORIES.length} 個預設分類，該使用者目前共 ${count} 個分類。`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌ Seed 失敗：", e);
  process.exit(1);
});
