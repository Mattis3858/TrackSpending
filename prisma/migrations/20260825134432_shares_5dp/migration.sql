-- 股數改為 5 位小數：複委託的零股常有 5 位以上小數。
-- 只是放寬精度（整數位仍保留 10 位），既有資料不會失真。

-- AlterTable
ALTER TABLE "Holding" ALTER COLUMN "shares" SET DATA TYPE DECIMAL(15,5);
