-- 持股明細：有了它就能用公開報價 API 自動算投資現值，
-- 不必再手動維護 UserSetting.investmentValue。

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('TWSE', 'TPEX');

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" "Market" NOT NULL DEFAULT 'TWSE',
    "shares" DECIMAL(14,4) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holding_userId_archived_idx" ON "Holding"("userId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_userId_symbol_key" ON "Holding"("userId", "symbol");
