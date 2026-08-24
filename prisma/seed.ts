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
import { CategoryKind, TransactionType } from "../generated/prisma/enums";

type SeedCategory = {
  name: string;
  type: TransactionType;
  kind?: CategoryKind;
  color: string;
};

const CATEGORIES: SeedCategory[] = [
  { name: "就業收入", type: TransactionType.INCOME, color: "#22c55e" },
  { name: "額外收入", type: TransactionType.INCOME, color: "#14b8a6" },
  { name: "房租", type: TransactionType.EXPENSE, kind: CategoryKind.FIXED, color: "#6366f1" },
  { name: "水電瓦斯", type: TransactionType.EXPENSE, kind: CategoryKind.FIXED, color: "#0ea5e9" },
  { name: "餐飲", type: TransactionType.EXPENSE, color: "#f59e0b" },
  { name: "交通", type: TransactionType.EXPENSE, color: "#3b82f6" },
  { name: "娛樂", type: TransactionType.EXPENSE, color: "#ec4899" },
  { name: "保險", type: TransactionType.EXPENSE, kind: CategoryKind.FIXED, color: "#8b5cf6" },
  // 儲蓄與投資都不計入「消費支出」。見 SPEC 5.2
  // 顏色刻意都用綠色系，提醒這兩類是「錢還在，只是換了形式」
  // 兩者的差別：SAVINGS 仍是現金，計入緊急預備金；INVESTMENT 已離開現金部位，不計入
  { name: "儲蓄", type: TransactionType.EXPENSE, kind: CategoryKind.SAVINGS, color: "#10b981" },
  { name: "投資", type: TransactionType.EXPENSE, kind: CategoryKind.INVESTMENT, color: "#059669" },
  { name: "其他", type: TransactionType.EXPENSE, color: "#94a3b8" },
];

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
          kind: c.kind ?? CategoryKind.VARIABLE,
          isDefault: true,
        },
        create: {
          userId,
          name: c.name,
          type: c.type,
          isDefault: true,
          kind: c.kind ?? CategoryKind.VARIABLE,
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
