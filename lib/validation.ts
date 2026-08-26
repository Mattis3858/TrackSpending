/**
 * 表單驗證 schema — client 與 server 共用同一份。
 * Server Action 一定要再驗一次，不能相信瀏覽器傳來的資料。見 SPEC 7.3
 */
import { z } from "zod";
import { isValidYmd } from "./date";
import { money } from "./money";
import { CATEGORY_KINDS } from "./category";

/** 只允許正數、最多兩位小數 */
const AMOUNT_RE = /^[0-9]+([.][0-9]{1,2})?$/;

/** Phase 1 只開放 INCOME / EXPENSE，TRANSFER 是 Phase 2。見 SPEC 第 9 節 */
export const ENTRY_TYPES = ["INCOME", "EXPENSE"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const transactionInputSchema = z.object({
  date: z
    .string()
    .min(1, "請選擇日期")
    .refine(isValidYmd, "日期格式不正確"),
  type: z.enum(ENTRY_TYPES, { message: "請選擇收入或支出" }),
  // 用 superRefine 而不是串接 .refine()：Zod 的 refine 鏈即使前一項失敗仍會繼續執行，
  // 串接會讓「金額超出上限」那一項拿到空字串，並在 money() 裡拋出 DecimalError。
  amount: z.string().superRefine((raw, ctx) => {
    const value = raw.trim();
    if (!value) {
      ctx.addIssue({ code: "custom", message: "請輸入金額" });
      return;
    }
    if (!AMOUNT_RE.test(value)) {
      ctx.addIssue({ code: "custom", message: "金額只能是數字，最多兩位小數" });
      return;
    }
    const amount = money(value);
    if (!amount.greaterThan(0)) {
      ctx.addIssue({ code: "custom", message: "金額必須大於 0" });
      return;
    }
    if (!amount.lessThan(100_000_000)) {
      ctx.addIssue({ code: "custom", message: "金額超出上限" });
    }
  }),
  categoryId: z.string().min(1, "請選擇分類"),
  note: z.string().max(200, "備註最多 200 字").optional(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "請輸入分類名稱").max(20, "分類名稱最多 20 字"),
  type: z.enum(ENTRY_TYPES, { message: "請選擇類型" }),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "顏色格式需為 #rrggbb")
    .optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** 可為空的金額欄位（設定用），空字串代表「沒填」 */
function optionalMoneyField(label: string) {
  return z.string().superRefine((raw, ctx) => {
    const value = raw.trim();
    if (!value) return; // 允許留空
    if (!AMOUNT_RE.test(value)) {
      ctx.addIssue({ code: "custom", message: `${label}只能是數字，最多兩位小數` });
      return;
    }
    if (!money(value).lessThan(1_000_000_000)) {
      ctx.addIssue({ code: "custom", message: `${label}超出上限` });
    }
  });
}

export const settingsInputSchema = z.object({
  /** 開始記帳前手上的現金（活存、定存、緊急備用金） */
  startingCash: optionalMoneyField("現金"),
  /** 外幣現金（美元） */
  cashUsd: optionalMoneyField("外幣現金"),
  /** 月消費預算，留空就用目標儲蓄率推算 */
  monthlyBudget: optionalMoneyField("月預算"),
  targetSavingsRate: z
    .union([z.number().int().min(0).max(99), z.null()])
    .optional(),
  payday: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;

/** 股數：允許到小數第 5 位。複委託的零股常有 5 位小數 */
const SHARES_RE = /^[0-9]+([.][0-9]{1,5})?$/;

export const holdingInputSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "請輸入股票代號")
    .max(10, "股票代號太長")
    .regex(/^[0-9A-Za-z]+$/, "股票代號只能是英數字"),
  /** 留空時由報價 API 自動帶入 */
  name: z.string().trim().max(30, "名稱最多 30 字").optional(),
  market: z.enum(["TWSE", "TPEX", "US"]).optional(),
  shares: z.string().superRefine((raw, ctx) => {
    const v = raw.trim();
    if (!v) {
      ctx.addIssue({ code: "custom", message: "請輸入股數" });
      return;
    }
    if (!SHARES_RE.test(v)) {
      ctx.addIssue({ code: "custom", message: "股數只能是數字，最多五位小數" });
      return;
    }
    if (!money(v).greaterThan(0)) {
      ctx.addIssue({ code: "custom", message: "股數必須大於 0" });
    }
  }),
  cost: z.string().superRefine((raw, ctx) => {
    const v = raw.trim();
    if (!v) {
      ctx.addIssue({ code: "custom", message: "請輸入成本" });
      return;
    }
    if (!AMOUNT_RE.test(v)) {
      ctx.addIssue({ code: "custom", message: "成本只能是數字，最多兩位小數" });
      return;
    }
    if (!money(v).greaterThan(0)) {
      ctx.addIssue({ code: "custom", message: "成本必須大於 0" });
    }
  }),
  note: z.string().max(100, "備註最多 100 字").optional(),
});

export type HoldingInputForm = z.infer<typeof holdingInputSchema>;

export const recurringTemplateInputSchema = z.object({
  categoryId: z.string().min(1, "請選擇分類"),
  amount: z.string().superRefine((raw, ctx) => {
    const value = raw.trim();
    if (!value) {
      ctx.addIssue({ code: "custom", message: "請輸入金額" });
      return;
    }
    if (!AMOUNT_RE.test(value)) {
      ctx.addIssue({ code: "custom", message: "金額只能是數字，最多兩位小數" });
      return;
    }
    if (!money(value).greaterThan(0)) {
      ctx.addIssue({ code: "custom", message: "金額必須大於 0" });
    }
  }),
  dayOfMonth: z
    .number()
    .int()
    .min(1, "日期必須在 1 到 31 之間")
    .max(31, "日期必須在 1 到 31 之間"),
  note: z.string().max(100, "備註最多 100 字").optional(),
});

export type RecurringTemplateInput = z.infer<typeof recurringTemplateInputSchema>;
