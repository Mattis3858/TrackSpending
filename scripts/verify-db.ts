import { prisma } from "../lib/prisma";
import { getFrequentCategoryIds, getHoldings, getTransactionsForMonth } from "../lib/queries";
import { fetchQuotes, fetchUsQuotes } from "../lib/quotes";
import { fetchUsdToTwd } from "../lib/fx";
import { summarizeMonth, expenseByCategory } from "../lib/reports";
import { valuePortfolio } from "../lib/analysis";
import { toDbDate } from "../lib/date";
import { formatTWD, formatPercent } from "../lib/money";

const userId = process.env.SEED_USER_ID!;
const YM = "2099-09"; // 用未來月份，不會撞到真實資料

async function main() {
  const cats = await prisma.category.findMany({
    where: { userId, name: { in: ["餐飲", "儲蓄", "就業收入"] } },
    select: { id: true, name: true, kind: true },
  });
  const byName = Object.fromEntries(cats.map((c) => [c.name, c]));
  console.log("分類:", cats.map((c) => `${c.name}(${c.kind})`).join(", "));

  const created = await prisma.$transaction([
    // 月初邊界：如果時區處理錯誤，這筆會掉到 8 月
    prisma.transaction.create({
      data: { userId, date: toDbDate(`${YM}-01`), type: "INCOME",
              amount: "50000.00", categoryId: byName["就業收入"].id, note: "__verify__" },
    }),
    // 小數精度：33.33 x 3
    ...["33.33", "33.33", "33.33"].map((amount) =>
      prisma.transaction.create({
        data: { userId, date: toDbDate(`${YM}-15`), type: "EXPENSE" as const,
                amount, categoryId: byName["餐飲"].id, note: "__verify__" },
      }),
    ),
    // 儲蓄：算支出但不算消費
    prisma.transaction.create({
      data: { userId, date: toDbDate(`${YM}-30`), type: "EXPENSE",
              amount: "20000.00", categoryId: byName["儲蓄"].id, note: "__verify__" },
    }),
    // TRANSFER：完全不能計入
    prisma.transaction.create({
      data: { userId, date: toDbDate(`${YM}-15`), type: "TRANSFER",
              amount: "9999.00", note: "__verify__" },
    }),
  ]);

  try {
    const txs = await getTransactionsForMonth(userId, YM);
    const s = summarizeMonth(txs);

    const results: [string, string, string][] = [
      ["月初 1 日未掉到上個月", txs.some((t) => t.date === `${YM}-01`) ? "PASS" : "FAIL", `讀回日期: ${txs.map((t) => t.date).sort()[0]}`],
      ["月底 30 日未掉到下個月", txs.some((t) => t.date === `${YM}-30`) ? "PASS" : "FAIL", ""],
      ["Decimal 33.33x3 = 99.99", s.consumptionExpense.toString() === "99.99" ? "PASS" : "FAIL", s.consumptionExpense.toString()],
      ["TRANSFER 未計入支出", s.totalExpense.toFixed(2) === "20099.99" ? "PASS" : "FAIL", s.totalExpense.toFixed(2)],
      ["儲蓄不算消費支出", s.savingsExpense.toFixed(2) === "20000.00" ? "PASS" : "FAIL", s.savingsExpense.toFixed(2)],
      ["儲蓄率 = (50000-99.99)/50000", s.savingsRate !== null && Math.abs(s.savingsRate - 0.9980002) < 1e-6 ? "PASS" : "FAIL", formatPercent(s.savingsRate, 2)],
      ["圓餅圖只有餐飲（排除儲蓄）", JSON.stringify(expenseByCategory(txs).map((i) => i.name)) === '["餐飲"]' ? "PASS" : "FAIL", expenseByCategory(txs).map((i) => i.name).join("/")],
    ];

    console.log();
    for (const [name, verdict, detail] of results) {
      console.log(`${verdict === "PASS" ? "✅" : "❌"} ${name}${detail ? `  → ${detail}` : ""}`);
    }
    console.log(`\n報表輸出：收入 ${formatTWD(s.totalIncome)} / 消費 ${formatTWD(s.consumptionExpense)} / 儲蓄 ${formatTWD(s.savingsExpense)} / 儲蓄率 ${formatPercent(s.savingsRate)}`);
    // groupBy 的語法在 Prisma 7 容易寫錯，這裡確認它真的跑得起來
    const frequent = await getFrequentCategoryIds(userId);
    const groupByOk = Array.isArray(frequent);
    results.push(["常用分類 groupBy 查詢可執行", groupByOk ? "PASS" : "FAIL", ""]);
    console.log((groupByOk ? "✅" : "❌") + " 常用分類 groupBy 查詢可執行  → 回傳 " + frequent.length + " 個分類");

    // ── 持股 + 真實報價 API 的端到端驗證
    const h = await prisma.holding.create({
      data: { userId, symbol: "__VERIFY__", name: "驗證用", shares: "1000", cost: "2000000" },
    });
    try {
      const book = await fetchQuotes();
      const quoteOk = book.quotes.size > 500;
      results.push(["報價 API 可用", quoteOk ? "PASS" : "FAIL", ""]);
      console.log((quoteOk ? "✅" : "❌") + " 報價 API 可用  → " + book.quotes.size + " 檔，失敗來源 " + (book.failed.join("/") || "無"));

      const tsmc = book.quotes.get("2330");
      console.log((tsmc ? "✅" : "❌") + " 2330 查得到  → " + (tsmc ? tsmc.name + " " + tsmc.price.toFixed(2) + " (" + tsmc.date + ")" : "查不到"));
      results.push(["2330 查得到報價", tsmc ? "PASS" : "FAIL", ""]);

      // 只取驗證用的那一筆，否則使用者的真實持股會混進來讓斷言失效
      const rows = (await getHoldings(userId)).filter((r) => r.symbol === "__VERIFY__");
      const port = valuePortfolio(rows, book.quotes);
      const fallbackOk = port.totalValue.toFixed(0) === "2000000";
      results.push(["查無報價的部位以成本計入", fallbackOk ? "PASS" : "FAIL", ""]);
      console.log((fallbackOk ? "✅" : "❌") + " 查無報價的部位以成本計入  → 市值 " + port.totalValue.toFixed(0) + "，missingQuotes=" + port.missingQuotes);

      if (tsmc) {
        const sim = valuePortfolio([{ symbol: "2330", name: "台積電", shares: "1000", cost: "2000000" }], book.quotes);
        console.log("ℹ  用真實報價試算 1000 股台積電：市值 " + sim.totalValue.toFixed(0) + "，損益 " + sim.totalGain.toFixed(0));
      }
    } finally {
      await prisma.holding.delete({ where: { id: h.id } });
      console.log("🧹 已清除驗證用持股");
    }

    // ── 複委託（美股 + 匯率）
    const us = await fetchUsQuotes(["VOO", "AAPL"]);
    const usOk = us.length === 2;
    results.push(["美股報價可用", usOk ? "PASS" : "FAIL", ""]);
    console.log((usOk ? "✅" : "❌") + " 美股報價可用  → " + us.map(q => q.symbol + " " + q.price.toFixed(2) + " " + q.currency).join(", "));

    const fx = await fetchUsdToTwd();
    results.push(["美元匯率可用", fx ? "PASS" : "FAIL", ""]);
    console.log((fx ? "✅" : "❌") + " 美元匯率可用  → " + (fx ? "USD/TWD " + fx.usdToTwd.toFixed(4) + " (" + fx.date + ")" : "取不到"));

    if (us.length > 0 && fx) {
      const q = new Map(us.map(x => [x.symbol, { price: x.price, date: x.date }]));
      const sim = valuePortfolio(
        [{ symbol: "VOO", name: "VOO", shares: "2", cost: "1426.64", currency: "US" + "D" as "USD" }],
        q, fx.usdToTwd,
      );
      const twdOk = sim.missingFx === 0 && sim.totalValue.greaterThan(0);
      results.push(["美股換算台幣", twdOk ? "PASS" : "FAIL", ""]);
      console.log((twdOk ? "✅" : "❌") + " 美股換算台幣  → 2 股 VOO 市值 NT$ " + sim.totalValue.toFixed(0) + "（成本 NT$ " + sim.totalCost.toFixed(0) + "）");
    }

    console.log(`\n整體：${results.every((r) => r[1] === "PASS") ? "全部通過" : "有失敗項目"}`);
  } finally {
    const del = await prisma.transaction.deleteMany({
      where: { userId, id: { in: created.map((t) => t.id) } },
    });
    console.log(`\n🧹 已清除測試資料 ${del.count} 筆`);
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
