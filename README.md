# 個人記帳系統

單人使用的每月收支記帳工具。開發規格見 [SPEC.md](./SPEC.md)（第 5 節「核心設計決策」與第 8 節「報表計算規格」定義了系統語意，改動前務必先讀）。

## 本機試用

```bash
npm run dev
```

開 http://localhost:3000 ，用 Supabase Auth 裡建立的帳號登入。
手機同網段可連 `http://<你的內網 IP>:3000`（`npm run dev` 啟動時會印出 Network 位址）。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm test` | 單元測試（改動 `lib/` 之後必跑） |
| `npm run verify:db` | 對真實資料庫做整合驗證，測試資料會自動清除 |
| `npm run db:migrate` | 套用 schema 變更 |
| `npm run db:seed` | 寫入預設分類（需要 `SEED_USER_ID`） |
| `npm run db:studio` | 用 Prisma Studio 直接看資料 |
| `npm run build` | 正式版建置 |

## 環境變數

複製 `.env.example` 成 `.env.local` 後填入 Supabase 的值。**兩個容易踩的點：**

1. `DATABASE_URL` 用 pooler（port 6543，帳號 `postgres.[ref]`）；`DIRECT_URL` 用 **Session Pooler**（同一個 pooler 主機、port 5432）。
   **不要用 `db.<ref>.supabase.co:5432`** — Supabase 的直連位址是 IPv6-only，一般網路連不到，會噴 `P1001: Can't reach database server`。
2. `SEED_USER_ID` 是 Supabase → Authentication → Users 那一列的 **User UID**。

Prisma 7 不會自動讀 `.env`，連線設定由 `prisma.config.ts` 用 dotenv 載入 `.env.local`。

## 常見狀況

**動過 schema 之後一定要重啟 dev server。** `lib/prisma.ts` 把 Prisma Client 快取在 `globalThis`（避免熱重載爆連線數），`prisma generate` 不會替換掉跑著的舊實例。症狀是 `Cannot read properties of undefined (reading 'findUnique')`，但 `tsc` 和 `next build` 都正常——因為只有那個長跑的行程是舊的。

## 架構重點

```
lib/date.ts      台北時區日期工具（禁止用 toISOString().slice(0,10) 取今天）
lib/money.ts     Decimal 金額運算與格式化（其他檔案不應出現 Number(amount)）
lib/reports.ts   報表計算純函式，不碰 DB，由 lib/reports.test.ts 完整覆蓋
lib/queries.ts   資料庫讀取，回傳值已把 Decimal 轉成字串
lib/auth.ts      requireUser()，每個 Server Action 的第一行都要呼叫
proxy.ts         Next.js 16 的 middleware，只更新 session 與導向，不是安全邊界
```

**兩個最容易寫錯的規則**（都有測試守著）：

- `TRANSFER` 不計入任何收支加總
- 儲蓄率 = (總收入 − **消費**支出) / 總收入 —— 「儲蓄」分類是 `EXPENSE` 但不算消費，用 `(收入 − 總支出)/收入` 會讓有存錢的月份算出 0%
