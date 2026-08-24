-- 外幣現金：複委託帳戶裡還沒投入的美元餘額。
-- 交易紀錄都是台幣，所以這個值由使用者自己維護。

-- AlterTable
ALTER TABLE "UserSetting" ADD COLUMN "cashUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;
