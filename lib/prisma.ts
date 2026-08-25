/**
 * Prisma Client 單例。
 * Prisma 7 一律走 driver adapter（@prisma/adapter-pg），連線字串走 pooler。
 * 開發時 Next.js 熱重載會反覆執行模組，用 globalThis 快取避免連線數暴增。
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assertTenantScoped } from "@/lib/tenant-guard";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // 多租戶防線：任何針對租戶資料表、卻沒帶 userId 的查詢一律拋錯。
  // Prisma 直連會繞過 RLS，這是唯一擋得住「忘記加 userId」的機制。見 SPEC 5.1
  const guarded = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertTenantScoped(model, operation, args);
          return query(args);
        },
      },
    },
  });

  // $extends 回傳的是共用同一條連線的新 client，不會多開連線池
  return { guarded, unscoped: client };
}

const clients = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = clients;
}

/** 一般用途。所有針對租戶資料表的查詢都必須帶 userId，否則拋錯。 */
export const prisma = clients.guarded;

/**
 * 跨租戶查詢專用，**繞過租戶防線**。
 *
 * 目前只有每日提醒的排程任務會用到——它本來就要掃過所有使用者的訂閱。
 * 任何新的使用都應該在 review 時被質疑：99% 的情況你要的是 `prisma`。
 */
export const prismaUnscoped = clients.unscoped;
