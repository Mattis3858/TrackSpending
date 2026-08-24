-- CategoryKind：用一個互斥的 enum 取代 isSavings 布林旗標，
-- 同時把「固定 / 變動消費」與「儲蓄 / 投資」的區分一次做進去。
-- 投資必須跟儲蓄分開，否則緊急預備金月數會把股票當成隨時可動用的現金。

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('VARIABLE', 'FIXED', 'SAVINGS', 'INVESTMENT');

-- AlterTable：先加欄位，資料轉移完才能砍掉 isSavings
ALTER TABLE "Category" ADD COLUMN "kind" "CategoryKind" NOT NULL DEFAULT 'VARIABLE';

-- 資料轉移（一次性，依現有的預設分類名稱對應）
UPDATE "Category" SET "kind" = 'SAVINGS'    WHERE "isSavings" = true;
UPDATE "Category" SET "kind" = 'INVESTMENT' WHERE "name" = '投資' AND "type" = 'EXPENSE';
UPDATE "Category" SET "kind" = 'FIXED'
  WHERE "type" = 'EXPENSE' AND "name" IN ('房租', '水電瓦斯', '保險');

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "isSavings";

-- CreateTable
CREATE TABLE "UserSetting" (
    "userId" TEXT NOT NULL,
    "startingCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startingInvestment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "investmentValue" DECIMAL(12,2),
    "investmentValueAt" TIMESTAMP(3),
    "monthlyBudget" DECIMAL(10,2),
    "targetSavingsRate" INTEGER,
    "payday" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("userId")
);
