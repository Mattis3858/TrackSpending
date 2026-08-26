/**
 * 預設分類清單 — 見 SPEC 第 6 節
 *
 * 這份清單同時給兩個地方用，所以抽出來共用：
 *   prisma/seed.ts       開發時初始化
 *   lib/provisioning.ts  新使用者註冊後自動建立
 *
 * 分成兩份會在加分類時忘記改另一邊，讓不同時期註冊的使用者拿到不同的預設值。
 */

export type DefaultCategory = {
  name: string;
  type: "INCOME" | "EXPENSE";
  kind: "VARIABLE" | "FIXED" | "SAVINGS" | "INVESTMENT";
  color: string;
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "就業收入", type: "INCOME", kind: "VARIABLE", color: "#22c55e" },
  { name: "額外收入", type: "INCOME", kind: "VARIABLE", color: "#14b8a6" },
  { name: "房租", type: "EXPENSE", kind: "FIXED", color: "#6366f1" },
  { name: "水電網路", type: "EXPENSE", kind: "FIXED", color: "#0ea5e9" },
  // 訂閱制、每月固定要付 → FIXED。這個歸類會影響緩衝資金的計算（見 SPEC 8.11）
  { name: "AI 工具", type: "EXPENSE", kind: "FIXED", color: "#7c3aed" },
  { name: "健身房", type: "EXPENSE", kind: "FIXED", color: "#f43f5e" },
  { name: "餐食", type: "EXPENSE", kind: "VARIABLE", color: "#f59e0b" },
  { name: "飲料", type: "EXPENSE", kind: "VARIABLE", color: "#06b6d4" },
  { name: "交通", type: "EXPENSE", kind: "VARIABLE", color: "#3b82f6" },
  { name: "日常用品", type: "EXPENSE", kind: "VARIABLE", color: "#84cc16" },
  { name: "水果", type: "EXPENSE", kind: "VARIABLE", color: "#4d7c0f" },
  // 金額不規則、偶爾很大筆，跟娛樂之類的放在一起看會失去意義
  { name: "醫療", type: "EXPENSE", kind: "VARIABLE", color: "#b91c1c" },
  { name: "娛樂", type: "EXPENSE", kind: "VARIABLE", color: "#ec4899" },
  { name: "保險", type: "EXPENSE", kind: "FIXED", color: "#8b5cf6" },
  // 儲蓄與投資都不計入「消費支出」。見 SPEC 5.2
  // 兩者的差別：SAVINGS 仍是現金，計入緊急預備金；INVESTMENT 已離開現金部位
  { name: "儲蓄", type: "EXPENSE", kind: "SAVINGS", color: "#10b981" },
  { name: "投資", type: "EXPENSE", kind: "INVESTMENT", color: "#059669" },
  { name: "其他", type: "EXPENSE", kind: "VARIABLE", color: "#94a3b8" },
  // 對帳用：實際餘額跟系統算出來的對不上時，補一筆讓兩邊一致。
  // 收入與支出兩個方向都要有（多了記 INCOME、少了記 EXPENSE）。
  // 刻意是 VARIABLE：對不上通常就是漏記的消費，算進消費才會讓
  // 「現金 = 收入 − 消費 − 投資」保持成立。
  { name: "差額調整", type: "EXPENSE", kind: "VARIABLE", color: "#64748b" },
  { name: "差額調整", type: "INCOME", kind: "VARIABLE", color: "#64748b" },
];
