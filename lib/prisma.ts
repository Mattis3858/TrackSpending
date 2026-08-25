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
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertTenantScoped(model, operation, args);
          return query(args);
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
