-- 移除手動維護的投資欄位。投資部位一律以 Holding（持股明細）為單一事實來源。
--
-- 這三個欄位在有持股紀錄時就完全不會被讀取，是「被靜默忽略的設定」——
-- 使用者改了卻發現數字不動，比沒有這個欄位更糟。
-- 持股 + 公開報價 API 是它們的上位替代。

-- AlterTable
ALTER TABLE "UserSetting" DROP COLUMN "investmentValue",
DROP COLUMN "investmentValueAt",
DROP COLUMN "startingInvestment";
