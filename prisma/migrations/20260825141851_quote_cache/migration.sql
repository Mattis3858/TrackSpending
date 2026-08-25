-- 報價與匯率快取。不是租戶資料——市場報價人人相同，快取一份共用。
--
-- Next.js 的 fetch 快取依渲染它的路由標記，所以任何 revalidatePath("/")
-- （例如記一筆帳）都會連報價一起清掉。存自己的資料庫就不受影響。

-- CreateTable
CREATE TABLE "QuoteCache" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "quoteDate" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteCache_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "FxRateCache" (
    "pair" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "rateDate" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRateCache_pkey" PRIMARY KEY ("pair")
);
