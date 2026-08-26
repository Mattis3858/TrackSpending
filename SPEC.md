# 個人記帳系統 — 技術開發規格書 v2

## 文件用途

這份文件給 Claude Code 在開發時當作依據。請照第 11 節「開發階段」的順序循序漸進實作，每個階段完成後先讓使用者測試再繼續下一階段。

**實作規則：**
- 資料庫 schema、環境變數、計算公式、安全規範都已經定義好，實作時嚴格照這份文件走。
- 第 5 節（核心設計決策）與第 8 節（報表計算規格）是**不可自行變更**的部分，這兩節定義了整個系統的語意，改了就會算錯錢。
- 如果遇到文件沒寫清楚的細節，**直接詢問使用者，不要自己假設**。

> **v2 主要變更**：修正儲蓄率算法（v1 的公式在記錄儲蓄時會算出 0%）、全表加上 `userId`、日期改用純日期型別避免時區錯月、固定收支範本加上冪等機制、分類/帳戶改為軟刪除、新增報表計算規格與安全規範、調整 Phase 範圍。詳細差異見 `SPEC.v1.md`。

---

## 1. 專案概況

- **使用者**：單一使用者（開發者本人）。不需要多人共用 UI，但**資料模型預留多使用者結構**（見第 5.1 節），避免未來要共用帳本時得重建資料庫。
- **用途**：記錄每月薪資收入、額外收入、各類支出、儲蓄，並能看到月報表與分類統計。
- **貨幣**：新台幣（TWD），介面上金額格式化為 `NT$ 1,234`（不顯示小數，除非有小數位）。
- **時區**：`Asia/Taipei`（UTC+8）。所有「今天」「本月」的判斷一律以台北時間為準。
- **裝置**：主要在手機瀏覽器隨手記帳，桌面瀏覽器看報表。頁面 mobile-first、響應式。
- **設計原則**：記一筆帳的操作成本必須夠低（見第 9 節 Phase 1 的 UX 要求），否則系統會因為懶得用而失敗。

## 2. 技術棧

| 項目 | 選用技術 | 說明 |
|---|---|---|
| 前端框架 | Next.js 16（App Router）+ TypeScript | Server Components 抓資料，Server Actions 處理新增/編輯/刪除。**v16 破壞性變更：`middleware.ts` 已改名為 `proxy.ts`；`params` / `searchParams` / `cookies()` 全部是 async** |
| 樣式 | Tailwind CSS + shadcn/ui | 加快開發、畫面更專業 |
| 資料庫 | Supabase（PostgreSQL） | 使用者已建立好 Supabase 專案 |
| ORM | Prisma 7 | 定義 schema、跑 migration、型別安全存取資料庫。**v7 破壞性變更：generator 改為 `prisma-client`、必須用 driver adapter（`@prisma/adapter-pg`）、連線字串移到 `prisma.config.ts`** |
| 驗證 | Supabase Auth（email + 密碼）+ `@supabase/ssr` | 單一使用者登入即可，不需要第三方 OAuth |
| 圖表 | Recharts | 分類圓餅圖、月趨勢線 |
| 表單驗證 | Zod + react-hook-form | 金額、日期等欄位驗證 |
| **測試** | **Vitest** | **報表加總邏輯必須有單元測試，見第 8.4 節** |
| 部署 | Vercel（Hobby 方案，免費） | 接 GitHub repo，push 到 main 分支自動部署 |

## 3. 環境變數

在 Supabase 專案的 **Project Settings → Database** 可以找到連線字串，**Project Settings → API** 可以找到 API keys。

```
# Prisma 用（注意：Supabase 需要兩組連線字串，帳號格式不同，複製時容易混）
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# Supabase client 用（前端登入用）
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."

# 僅後端使用，絕對不能出現在前端程式碼或 NEXT_PUBLIC_ 開頭
SUPABASE_SERVICE_ROLE_KEY="..."
```

- `DATABASE_URL` 走 6543 port（connection pooler），使用者名稱是 `postgres.[project-ref]`。**應用程式執行期用這個**（透過 `lib/prisma.ts` 的 driver adapter）。
- `DIRECT_URL` 走 5432 port（直連），使用者名稱是 `postgres`。**只有 Prisma CLI 用這個**（migrate / db push / studio），走 pooler 會讓 migration 失敗。
- 兩個都要設定。Serverless 環境務必在 pooler 字串帶 `connection_limit=1`。

**單一 env 檔**：本機只維護 `.env.local`（Next.js 原生會讀）。Prisma 7 預設不讀 `.env`，所以 `prisma.config.ts` 明確用 `dotenv` 載入 `.env.local`，避免密鑰散在兩個檔案。`.env.example` 是版控裡的範本，不含真實值。

正式環境的變數要在 Vercel 專案的 **Settings → Environment Variables** 另外設定一次（含 `DIRECT_URL`）。

**Prisma 7 的連線設定分工（跟 v6 不同，不要照舊寫法）：**
```ts
// prisma.config.ts —— 只影響 CLI
datasource: { url: env("DIRECT_URL") }

// lib/prisma.ts —— 影響應用程式執行期
new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
```
schema.prisma 的 `datasource db` **不再寫 `url` / `directUrl`**。

**部署設定（漏掉會 build 失敗）：** `package.json` 需有 `"postinstall": "prisma generate"`；seed 指令設在 `prisma.config.ts` 的 `migrations.seed`（v7 不再讀 package.json 的 `prisma.seed`）。

## 4. 資料庫 Schema（Prisma）

```prisma
generator client {
  provider = "prisma-client" // Prisma 7 的新 generator，不是 prisma-client-js
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  // Prisma 7：連線字串在 prisma.config.ts，不寫在這裡
}

enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
}

model Category {
  id          String          @id @default(cuid())
  userId      String          // Supabase auth.users.id
  name        String
  type        TransactionType
  isDefault   Boolean         @default(false) // 系統內建分類，不可刪除
  isSavings   Boolean         @default(false) // 這類 EXPENSE 視為「儲蓄」而非「消費」，見 5.2
  archived    Boolean         @default(false) // 軟刪除，見 5.4
  color       String?         // 圓餅圖固定色，hex，例：#f59e0b
  sortOrder   Int             @default(0)
  budgetLimit Decimal?        @db.Decimal(10, 2) // 每月預算上限，Phase 2 才做 UI
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  transactions Transaction[]
  templates    RecurringTemplate[]

  @@unique([userId, name, type]) // 防止 seed 重跑產生重複分類
  @@index([userId, archived])
}

model Account {
  id             String   @id @default(cuid())
  userId         String
  name           String   // 例如：薪轉戶、儲蓄戶、現金
  initialBalance Decimal  @default(0) @db.Decimal(12, 2) // 建立帳戶時的起始餘額
  archived       Boolean  @default(false)
  sortOrder      Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  fromTransactions Transaction[] @relation("fromAccount")
  toTransactions   Transaction[] @relation("toAccount")

  @@unique([userId, name])
}

model Transaction {
  id          String          @id @default(cuid())
  userId      String
  date        DateTime        @db.Date // 純日期，不帶時刻，避免時區錯月，見 5.3
  type        TransactionType
  amount      Decimal         @db.Decimal(10, 2) // 一律為正數，見 5.5
  note        String?

  categoryId  String?
  category    Category?       @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  accountId   String?         // TRANSFER 的轉出帳戶；INCOME/EXPENSE 可留空或指定帳戶
  account     Account?        @relation("fromAccount", fields: [accountId], references: [id], onDelete: Restrict)
  toAccountId String?         // 僅 TRANSFER 使用：轉入帳戶
  toAccount   Account?        @relation("toAccount", fields: [toAccountId], references: [id], onDelete: Restrict)

  importHash  String?         // Phase 2 CSV 匯入去重用，現在先留欄位
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  recurringRun RecurringRun?

  @@unique([userId, importHash]) // Postgres 中多筆 NULL 視為相異，不影響手動輸入
  @@index([userId, date])
  @@index([userId, type, date])
  @@index([categoryId])
}

model RecurringTemplate {
  id         String   @id @default(cuid())
  userId     String
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  // 沒有 type 欄位：類型一律由 category.type 決定，避免兩邊不一致
  amount     Decimal  @db.Decimal(10, 2)
  dayOfMonth Int      // 1-31，超過當月天數時自動 clamp 到該月最後一天，見 5.6
  note       String?
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  runs RecurringRun[]

  @@index([userId, active])
}

// 記錄「某範本在某月已經產生過交易」，靠 unique 約束保證不會重複產生
model RecurringRun {
  id            String            @id @default(cuid())
  templateId    String
  template      RecurringTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  yearMonth     String            // 格式固定 "2026-09"
  transactionId String?           @unique
  transaction   Transaction?      @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  createdAt     DateTime          @default(now())

  @@unique([templateId, yearMonth])
}

model NetWorthSnapshot {
  id          String   @id @default(cuid())
  userId      String
  date        DateTime @db.Date
  totalAssets Decimal  @db.Decimal(12, 2)
  note        String?
  createdAt   DateTime @default(now())

  @@unique([userId, date])
}
```

## 5. 核心設計決策（不可自行變更）

這一節定義系統語意。這些決策每一條都對應一個「上線後才會發現、而且要動資料才能修」的錯誤，實作時務必遵守。

### 5.1 每張表都有 `userId`

雖然目前只有一位使用者，但所有表都帶 `userId`（存 Supabase `auth.users.id` 的 UUID 字串，不建立對應的 `User` model）。原因：

- **Prisma 用 Postgres 連線字串直連，會繞過 Supabase 的 RLS policy**，資料庫層等於沒有防護，安全性 100% 依賴應用層。所以應用層的 `userId` 過濾是唯一防線，不能省。
- 未來若要跟伴侶共用帳本，不必回填整個資料庫。

**規則：所有查詢、更新、刪除都必須帶 `where: { userId }`。**沒有例外。

### 5.2 儲蓄率的定義（v1 這裡是錯的）

「儲蓄」是 `EXPENSE` 分類（方便在支出圓餅圖看到儲蓄佔比），但**它不是消費**。如果沿用 v1 的公式 `(收入-支出)/收入`，會發生：

> 月收 50,000，消費 30,000，存 20,000 記成「儲蓄」支出 → 支出合計 50,000 → 結餘 0 → **儲蓄率 0%**

存錢反而讓儲蓄率歸零，數字完全反了。因此 `Category` 加上 `isSavings` 旗標，報表分開計算：

- **消費支出** = `kind` 為 `VARIABLE` 或 `FIXED`
- **存下來的錢** = `kind` 為 `SAVINGS` 或 `INVESTMENT`
- **儲蓄率** = (總收入 − 消費支出) / 總收入

### 5.2b 分類性質用互斥的 `CategoryKind`，不用多個布林旗標

```
VARIABLE   變動消費：餐飲、交通、娛樂
FIXED      固定消費：房租、水電瓦斯、保險。仍是消費，但短期內砍不掉
SAVINGS    儲蓄：錢存起來，仍然是現金
INVESTMENT 投資：錢投入股票 / ETF，離開現金部位
```

用 enum 而不是 `isSavings` / `isFixed` / `isInvestment` 三個布林值，是因為布林值可以組出矛盾狀態（同時 isSavings + isFixed），enum 從結構上就不可能。

**`SAVINGS` 與 `INVESTMENT` 必須分開**，否則緊急預備金會把股票當成隨時可動用的現金，指標就失去警示功能（見 8.5）。

**kind 開放使用者隨時修改**（搬家後房租性質改變、想把某分類從變動改成固定）。報表都是即時計算，改完歷史交易會跟著重新歸類。

完整公式見第 8 節。

### 5.3 日期一律用純日期，不存時刻

`Transaction.date` 用 `@db.Date`。理由：若用 `DateTime`（Postgres `timestamptz`，以 UTC 儲存），台北時間 9/1 早上 7 點的交易會存成 UTC `2026-08-31T23:00Z`，**被算進 8 月報表**。每個月都會有幾筆跑錯月，而且極難 debug。

**日期處理規則：**

- 應用層一律用 `YYYY-MM-DD` 字串傳遞日期，只在存進 DB 的邊界轉成 `Date`。
- **禁止使用 `new Date().toISOString().slice(0,10)` 取得「今天」**——那是 UTC 日期，台灣時間早上 8 點前會差一天。
- 統一放在 `lib/date.ts`：

```ts
// 台北時間的今天，回傳 "YYYY-MM-DD"
export function todayTaipei(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

// "2026-09" -> Prisma where 條件用的區間 [gte, lt)
export function monthRange(ym: string): { gte: Date; lt: Date }

// "2026-09-15" <-> DB 的 Date 物件互轉
export function toDbDate(ymd: string): Date   // new Date(`${ymd}T00:00:00Z`)
export function fromDbDate(d: Date): string   // d.toISOString().slice(0, 10)
```

### 5.4 分類與帳戶只能軟刪除

`Category` / `Account` 的刪除一律是把 `archived` 設為 `true`，UI 下拉選單不再顯示，但歷史交易的關聯完好。

**不可以真的 `delete`**：使用者刪掉「娛樂」分類後，過去所有娛樂支出會變成未分類，歷史報表就永久壞了。schema 用 `onDelete: Restrict` 在資料庫層擋住這件事。`isDefault = true` 的分類連 archive 都不開放。

### 5.5 金額一律為正數，用 Decimal 全程計算

- `amount` 永遠是正數，方向由 `type` 決定。表單驗證：`amount > 0`。
- **退款/退貨的記法**：記成 `INCOME` 的「額外收入」或自建「退款」分類，**不允許負數支出**（負數會讓所有加總與圓餅圖的邊界爆炸）。
- **Prisma 的 `Decimal` 不能直接傳給 Client Component**，會噴 `Only plain objects can be passed to Client Components`。正確做法是在 Server 端算完後轉成字串再往下傳，**不要用 `Number()` 轉**（那會讓 Decimal 型別失去意義）。
- 統一放在 `lib/money.ts`：加總、相減、格式化（`formatTWD`）。**除了 `lib/money.ts` 以外的檔案不應該出現 `Number(amount)`。**

### 5.6 固定收支範本必須是冪等的

v1 只說「偵測本月尚未產生對應交易」，但沒有任何欄位記錄，只能靠「同分類+同金額+同月份」猜——使用者一旦調整金額（例如房租調漲）就偵測失敗，會重複產生一筆。

因此用 `RecurringRun` 表記錄產生歷史，`@@unique([templateId, yearMonth])` 在資料庫層保證同一範本同一個月最多只會產生一次。

- `dayOfMonth` 超過當月天數時 clamp 到該月最後一天（設 31 的範本在 2 月要落在 28/29 號）。
- 產生的是**草稿**：使用者確認金額後才真正寫入 `Transaction`，不要自動幫使用者確認。

### 5.7 「儲蓄」該用分類還是 TRANSFER？只能擇一

系統同時有「儲蓄」分類與 `TRANSFER` 帳戶轉帳，兩者都能表達「把錢存起來」。**同一筆錢兩邊都記會重複計算**。規則：

- **有開儲蓄帳戶** → 用 `TRANSFER`（不計入收支，只影響帳戶餘額）
- **沒開儲蓄帳戶** → 用「儲蓄」分類的 `EXPENSE`（計入支出但不計入消費）

UI 上要在對應欄位放一行說明文字提醒這個差異。Phase 1 不開放 `TRANSFER`（見第 9 節），所以第一版一律用「儲蓄」分類。

## 6. 預設分類清單（seed 用）

| 分類 | 類型 | kind | 備註 |
|---|---|---|---|
| 就業收入 | INCOME | - | 薪水，建議記**實領**金額，見第 12 節 |
| 額外收入 | INCOME | - | 獎金、副業、退款 |
| 房租 | EXPENSE | false | |
| 水電瓦斯 | EXPENSE | false | |
| 餐飲 | EXPENSE | false | |
| 交通 | EXPENSE | false | |
| 娛樂 | EXPENSE | false | |
| 保險 | EXPENSE | false | |
| **儲蓄** | EXPENSE | **true** | 使用者主動歸類「這筆錢是要存起來的」，不計入消費支出 |
| **投資** | EXPENSE | **true** | 買股票 / ETF / 基金等。錢沒有消失只是換了形式，同樣不計入消費支出 |
| 其他 | EXPENSE | false | |

`prisma/seed.ts` 實作要求：

- 全部 `isDefault: true`，並指定 `color` 與 `sortOrder`（圓餅圖顏色要固定，否則每次新增分類顏色會整組重排）。「儲蓄」與「投資」的顏色刻意都用綠色系。
- **upsert 的 `update` 區塊只校正 `isSavings` / `isDefault`，不可以覆寫 `color` 與 `sortOrder`**，否則重跑 seed 會把使用者在 UI 上改過的顏色與排序洗掉。
- **必須用 `upsert` 搭配 `@@unique([userId, name, type])`，不可以用 `create`**，否則 seed 重跑會產生重複分類。
- seed 需要知道 `userId`：從環境變數 `SEED_USER_ID` 讀取，或在無使用者時讓 script 明確報錯，不要塞假值。

## 7. 安全規範（每個 Server Action 都要遵守）

### 7.1 proxy 不足以保護資料

Next.js 16 把 `middleware.ts` 改名為 `proxy.ts`（runtime 固定 nodejs，不支援 edge）。本專案的 `proxy.ts` 只負責兩件事：更新 Supabase session cookie、未登入時導向 `/login`。

**它不是安全邊界。** Server Actions 是獨立的公開 HTTP endpoint，任何人拿到 action id 就能直接呼叫，不會經過頁面渲染；Next.js 的 middleware 也曾有 authorization bypass 漏洞（CVE-2025-29927）。因此：

> **每一個 Server Action 的第一行都必須自己呼叫 `requireUser()`，不能只依賴 proxy.ts。**

```ts
// lib/auth.ts
export async function requireUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}
```

### 7.2 所有權檢查

編輯/刪除不可以只用 `id` 當條件，必須連同 `userId` 一起，避免猜 id 就能改別人的資料：

```ts
// ✅ 正確
await prisma.transaction.updateMany({ where: { id, userId: user.id }, data })
// ❌ 錯誤
await prisma.transaction.update({ where: { id }, data })
```

### 7.3 其他

- `SUPABASE_SERVICE_ROLE_KEY` 只能出現在 Server 端檔案，絕不放進任何 Client Component 或 `NEXT_PUBLIC_` 變數。
- 使用 `supabase.auth.getUser()` 驗證身分，**不要用 `getSession()`**（後者的 cookie 內容未經伺服器驗證）。
- 所有 Server Action 的輸入都用 Zod schema 驗證後才進 DB，不要相信表單傳來的型別。

## 8. 報表計算規格（最容易寫錯的部分）

### 8.1 月份區間

本月交易 = `date >= 當月1日 且 date < 次月1日`，區間用 `lib/date.ts` 的 `monthRange()` 產生，右邊界一律用 `<` 不用 `<=`。

### 8.2 計算公式

設本月交易集合為 T：

```
總收入      = Σ amount, where type = INCOME
消費支出    = Σ amount, where type = EXPENSE 且 category.isSavings = false
儲蓄支出    = Σ amount, where type = EXPENSE 且 category.isSavings = true
總支出      = 消費支出 + 儲蓄支出
結餘        = 總收入 − 總支出
實際存下    = 總收入 − 消費支出          （= 結餘 + 儲蓄支出）
儲蓄率      = 總收入 > 0 ? 實際存下 / 總收入 : null
```

**`type = TRANSFER` 的交易完全排除在以上所有加總之外**，一筆都不能混進去。這是最容易漏掉的一點，查詢時就用 `type: { in: ['INCOME', 'EXPENSE'] }` 過濾掉，不要靠後續 if 判斷。

### 8.3 顯示規則

- 首頁最顯眼的數字是**儲蓄率**，旁邊補上「實際存下 NT$ X」。
- 總收入為 0 時，儲蓄率顯示 `—`，**不可以出現 `NaN`、`Infinity` 或 `0%`**。
- 儲蓄率為負數（入不敷出）要正常顯示負值並標紅，不要 clamp 到 0。
- 分類圓餅圖只取**消費支出**，儲蓄另外用一塊獨立的數字呈現（混進圓餅圖會讓「餐飲佔比」被稀釋得沒有意義）。

### 8.4 實作與測試要求

計算邏輯**必須抽成不碰資料庫的純函式**，放在 `lib/reports.ts`，這樣才測得到：

```ts
// 吃 Transaction 陣列，吐報表數字，不做任何 DB 查詢
export function summarizeMonth(txs: TxForReport[]): MonthSummary
```

`lib/reports.test.ts` 必須涵蓋以下案例（Vitest），這些全部通過才能進到下一個開發階段：

| # | 情境 | 預期結果 |
|---|---|---|
| 1 | 收入 50,000／消費 30,000／儲蓄 20,000 | 實際存下 20,000、儲蓄率 40%、結餘 0 |
| 2 | 完全沒有收入，只有支出 | 儲蓄率 `null`（不是 0、不是 NaN） |
| 3 | 完全沒有任何交易 | 各項皆為 0，儲蓄率 `null` |
| 4 | 含一筆 TRANSFER 10,000 | 收入、支出、儲蓄率皆不受影響 |
| 5 | 支出大於收入 | 儲蓄率為負值 |
| 6 | 只有儲蓄支出、沒有其他消費 | 儲蓄率 100% |
| 7 | 交易日期落在當月 1 日與最後一日 | 兩筆都要被算進來 |
| 8 | 交易日期落在上月最後一日與次月 1 日 | 兩筆都不能被算進來 |
| 9 | 帶小數的金額（如 33.33 × 3） | 加總精確，不出現浮點誤差 |

## 8.5 衍生分析規格（lib/analysis.ts）

reports.ts 負責單月加總，analysis.ts 負責從加總再推出來的東西。全部是純函式，由 `lib/analysis.test.ts` 覆蓋。

### 消費速度與每日可用額度

```
日均消費   = 當月消費支出 ÷ 已過天數     ← 分母是「已過天數」不是當月總天數
月底預測   = 日均消費 × 當月總天數
剩餘天數   = 當月總天數 − 已過天數 + 1   ← 包含今天
每日可用額度 = (月預算 − 已花消費) ÷ 剩餘天數
```

**日均消費的分母絕對不能用當月總天數**：18 號已花 18,600 除以 31 只有 600，會嚴重低估、預測失去意義。

月預算來源：`UserSetting.monthlyBudget` 優先；沒設就用 `收入 × (1 − 目標儲蓄率)` 推算。月初薪水還沒入帳時當月收入是 0，要退回用近期收入，否則額度會顯示 0。

### 資產與緊急預備金

```
現金       = 起始現金 + (累計收入 − 累計消費) − 累計投資投入
投資成本   = 起始投資 + 累計投資投入
總資產     = 現金 + (投資現值 ?? 投資成本)
緊急預備金月數 = 現金 ÷ 月均消費
```

三個關鍵決策：

1. **存下來的錢用「收入 − 消費」算，不是加總儲蓄類交易。** 使用者忘記記那筆儲蓄時，錢還在戶頭裡，用收入減消費才不會憑空消失——**這個算法不依賴使用者的記帳紀律**。
2. **投資投入要從現金扣掉。** 錢進了股票就不是現金，不扣的話緊急預備金會虛胖。
3. **緊急預備金只算現金，不含投資。** 真的需要用錢時不該被迫在低點賣股；混入投資會讓這個指標永遠是安全值，失去警示功能。

**系統無法得知投資市值**，`investmentValue` 由使用者手動更新。沒填時總資產退而用成本計算，並且不顯示未實現損益（不能假裝知道）。

### 月均消費

取最近 3 個**完整**月份的平均，**排除當月**（還沒過完會拉低平均）。只有當月資料時才退而用當月。完全沒資料回傳 `null`。

### 金額遮罩

眼睛按鈕的狀態存在 **cookie**（`hide_amounts`），不是 localStorage。

因為金額是在 Server Component 裡格式化成字串的：用 localStorage 的話，HTML 會先帶著真實金額送到瀏覽器、再由 JS 蓋掉，中間會閃一下真實數字——那正好是「有人在旁邊」時最不該發生的事。放 cookie 伺服器就讀得到，送出去的 HTML 本身已經是遮罩過的。

**只遮絕對金額**，百分比、天數、分類名稱、圓餅圖比例維持顯示。被瞄到「儲蓄率 40%」沒關係，被瞄到「總資產 NT$ 857,407」才有關係。遮罩字串固定寬度且不帶正負號，避免從長度反推位數。

### 儲蓄率拆解

儲蓄率不要跟「儲蓄+投資佔收入比」並列成兩個數字——兩者只差在「沒明確歸類、還留在帳上」的部分，數值接近但不相等，並列會讓人不知道該信哪個。**改成把儲蓄率拆成「已投入」與「還在帳上」兩段**，資訊更多且不衝突。

## 8.6 台股報價與持股估值（lib/quotes.ts、lib/analysis.ts）

### 為什麼不串接銀行 / 券商

台灣的銀行與券商**沒有給個人使用的公開 API**。開放銀行第二階段（消費者資訊查詢）必須透過持牌的 TSP 業者才能接，個人申請不到；爬網銀登入會卡在 OTP、違反服務條款，而且必須把使用者的網銀密碼存在系統裡——為了省手動輸入去承擔這個風險完全不划算。**不要再評估這條路。**

### 實際採用的來源（免費、公開、免金鑰）

| 來源 | 端點 | 涵蓋 | 欄位 |
|---|---|---|---|
| 證交所 | `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` | 上市股票 + ETF，約 1,377 檔 | `Code` / `Name` / `ClosingPrice` / `Change` |
| 櫃買中心 | `www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes` | 上櫃股票、債券 ETF，約 1,010 檔 | `SecuritiesCompanyCode` / `CompanyName` / `Close` / `Change` |

**兩邊的欄位名稱不同**，各自有專屬的解析函式。日期是民國格式（`1150821` = 2026-08-21）。

### 三條不可妥協的規則

1. **報價抓不到絕不能讓頁面壞掉。** 外部 API 不在我們的控制範圍，任何失敗（逾時、DNS、對方掛掉、格式變動）都退化成「沒有現值」，成本與其他報表照常顯示。`fetchQuotes()` 永不拋錯。
2. **查不到報價的部位以成本計入市值**，不是算成 0。否則外部 API 一出問題，使用者的總資產就會憑空暴跌。同時回報 `missingQuotes` 讓 UI 提示。
3. **價格是 `--` 或空字串（停牌、無成交）要略過，不能當成 0 元。**

### 複委託（美股）

| 用途 | 來源 | 備註 |
|---|---|---|
| 美股報價 | `query1.finance.yahoo.com/v8/finance/chart/<代號>` | **非官方端點**，必須帶 `User-Agent`（不帶回 429）；批次端點 v7/quote 已回 401 不能用，只能一檔一個請求 |
| 美元匯率 | `open.er-api.com/v6/latest/USD` | 免費免金鑰，每日更新。台銀牌告匯率端點會回 HTML（有防爬），不能用 |

Yahoo 是非官方端點、隨時可能改或擋，所以美股報價失敗只退化成該部位以成本顯示，不影響台股與其餘報表。

**多幣別的處理原則：**

- 成本與報價都以**原幣別**儲存與顯示（美股是 USD），**損益與報酬率也用原幣別算**——報酬率不該被匯率波動污染。
- 合計（總市值、總成本）一律換算成**台幣**。
- **取不到匯率時，美元部位不併入台幣合計**，並回報 `missingFx` 讓 UI 提示。寧可少算也不要用 0 或猜的匯率。

**資產畫面的幣別呈現**：現金與投資各自拆成「台幣」與「美元」兩行（美元為 0 時不顯示），**總資產只用台幣**——換算過的合計才有意義，再拆幣別只會讓人分不清哪個是原幣、哪個是換算值。緊急預備金用換算後的總現金，因為美元現金同樣隨時可動用。

**持股是投資部位的唯一事實來源**。`UserSetting` 原本有 `startingInvestment` / `investmentValue` 兩個手動欄位，已移除——有持股紀錄時它們完全不會被讀取，是「被靜默忽略的設定」，使用者改了卻發現數字不動，比沒有這個欄位更糟。沒有持股時投資成本退回「記帳期間投入投資的金額」，而且**沒有市值**（不用成本冒充現值）。

**已知的簡化**：美元成本用「今日匯率」換算台幣，所以本金部分的匯兌損益沒有被單獨拆出來。要精確就得記錄每筆買進當下的匯率，對個人淨值檢視來說不值得。UI 上標示為換算值。

### 快取與效能

報價快取 **15 分鐘**（`next: { revalidate: 900 }`）——個人淨值不需要即時報價。加上 8 秒逾時。

首頁的資產卡是**唯一需要外部 API 的區塊**，所以用 `<Suspense>` 包起來串流載入。函式在雪梨、報價來源在台灣，這一趟不能拖慢剛優化過的首頁。

### 持股與手動設定的關係

有持股紀錄時，投資成本與現值**完全以持股為準**，忽略 `UserSetting.startingInvestment` 與 `investmentValue`，而且**不再把 `allTimeInvestment` 加進成本**（持股成本本身已經包含記帳期間投入的錢，加了會重複計算）。

現金的算法不受影響：投入投資的錢仍然要從現金扣掉。

## 8.8 多租戶（每個帳號各自獨立的帳本）

### 三道防線

資料隔離**完全靠應用層**，因為 Prisma 直連 Postgres 會繞過 Supabase 的 RLS（見 5.1）。所以做了三層：

1. **每支查詢都帶 `where: { userId }`** — 基本要求，`lib/queries.ts` 的每個函式第一個參數都是 userId。
2. **`lib/tenant-guard.ts` 執行期防線** — Prisma client extension 攔截所有查詢，針對租戶資料表若條件裡沒有 userId 就拋 `MissingTenantScopeError`。把「靠自律」變成「結構上做不到」。
3. **`npm run verify:db` 的隔離驗證** — 建一個假的第二使用者塞資料，確認讀不到對方的交易與分類，並確認 guard 真的會擋。

**受保護的資料表**：`Category`、`Transaction`、`Holding`、`UserSetting`、`Account`、`RecurringTemplate`、`NetWorthSnapshot`。

**guard 的一個副作用（是好事）**：`update({ where: { id } })` 這種只靠 id 的寫法會被擋下，必須改成 `updateMany({ where: { id, userId } })`。這正是 7.2 一直要求的做法，現在變成強制。

**`$queryRaw` 不在 guard 的守備範圍**（無法檢查 SQL 字串），寫 raw query 時要自己確認有 `where t."userId" = ${userId}`。目前只有 `getMonthlyTotals` 用到，已經帶了。

### 尚未做：資料庫層的 RLS

真正的縱深防禦是 Postgres RLS，但用 Prisma 要付出的代價不小：

- 必須另建一個**非 superuser** 的資料庫角色（`postgres` 是表的擁有者，預設會繞過 RLS，除非加 `FORCE ROW LEVEL SECURITY`，而 superuser 連 FORCE 都無視）
- 每個請求要用 `SET LOCAL app.user_id` 帶入身分，等於每支查詢都要包在 transaction 裡

這是一個獨立的專案，不是順手可以加的。目前的三道防線已經擋得住「忘記加 userId」這個實際會發生的錯誤；RLS 留作日後強化。

### 新使用者初始化

預設分類清單抽到 `lib/default-categories.ts`，由 `prisma/seed.ts` 與 `lib/provisioning.ts` **共用同一份**——分成兩份會在加分類時忘記改另一邊，讓不同時期註冊的使用者拿到不同的預設值。

初始化時機是**第一次成功載入首頁**，不是註冊當下：Supabase 若開啟 email 驗證，`signUp` 當下拿不到 session，那時沒有可信的 userId。`ensureProvisioned()` 必須是冪等的（用 `createMany + skipDuplicates`），因為它每次首頁載入都會被呼叫。

### 注意：註冊是開放的

任何人都能在 `/signup` 註冊。若之後想限制（邀請碼、白名單、關閉註冊），要在 signup 流程加檢查——目前沒有任何限制。

## 8.9 每日記帳提醒（Web Push）

台北時間每晚 **22:00** 固定提醒所有開啟的人，**不管當天記過沒有**。

一開始的設計是「今天記過就跳過」，但那是錯的：早餐午餐記了不代表今天記完了——晚餐與宵夜都發生在 22:00 之前，那正是最需要提醒的時候。用「有沒有記過」當跳過條件，會在最該提醒的日子不提醒。**要不要收提醒由使用者用開關決定，不是由系統猜。**

訊息會依當天已記的筆數變化（0 筆是「今天還沒記帳」，有筆數則是「晚餐和宵夜記了嗎？今天記了 N 筆」），比固定字串有用。

### 元件

| 檔案 | 角色 |
|---|---|
| `public/sw.js` | Service worker，**只處理推播，刻意不做任何快取** |
| `lib/push.ts` | base64url 轉換、裝置描述、失效判斷（純函式，可測） |
| `app/actions/push.ts` | 訂閱的存取，以 `endpoint` 為唯一鍵 |
| `app/api/cron/reminder/route.ts` | 排程端點 |
| `components/reminder-toggle.tsx` | 設定頁的開關 |

### 幾個關鍵決定

**Service worker 不做快取。** 這個 app 每一頁都是伺服器即時算的（報表、資產、報價），快取只會讓人看到過期數字而且難以察覺。離線也沒有意義——資料全在 Supabase。沒有 fetch handler 不影響安裝，Chrome 現在只看 manifest。

**`proxy.ts` 必須放行 `/sw.js` 與 `/api/cron`。** service worker 被導向登入頁的 HTML 就註冊不起來，而且錯誤訊息完全看不出原因；排程端點的呼叫者是機器，沒有登入 cookie，它用自己的 `CRON_SECRET` 驗證。

**兩個地方需要跨租戶操作**，用 `prismaUnscoped` 繞過 5.1 的租戶防線：

1. 排程端點——本來就要掃過所有使用者的訂閱。
2. 訂閱時「釋放 endpoint」——同一台裝置換帳號登入時，舊訂閱屬於前一個使用者。實際持有裝置的人就該擁有它的推播，否則提醒會繼續寄給前一個人。這一步只刪不讀，不會洩漏資料。

除此之外一律用 `prisma`。

> **踩過的坑**：`PushSubscription` 加進租戶防線後，原本的 `upsert({ where: { endpoint } })` 就被擋下了（`endpoint` 是唯一鍵但不含 userId），使用者按下「開啟提醒」只會看到 React #441——**正式版把 Server Component 的錯誤換成看不懂的代碼**。教訓是：把一張表加進防線之後，一定要實際跑過它的寫入路徑。`npm run verify:db` 現在有這一項。
>
> 順帶讓 `savePushSubscription` 自己攔下例外並回傳可讀訊息，不要讓使用者只看到 #441。

**只有 404 / 410 才刪訂閱。** 那代表使用者移除了 app 或撤銷授權，訂閱永久失效。其他錯誤（500、429、暫時性網路問題）只是這次沒送到，刪掉會讓人莫名其妙收不到提醒。

**推播是手機系統通知，不是 email。** `VAPID_SUBJECT` 的 `mailto:` 只是 Web Push 協定要求的聯絡方式，讓推播服務商在發送方出問題時有辦法聯絡，**系統不會寄任何 email**。路徑是 Vercel 排程 → FCM → 手機的 Chrome → Android 通知欄。

**訂閱綁定裝置不是帳號**，每台想收到的裝置都要各自開啟。`endpoint` 當唯一鍵，同一台重複訂閱是覆寫；換帳號登入時 `userId` 會一併更新，避免推播寄到前一個使用者。

### 環境變數

```
VAPID_PUBLIC_KEY   公鑰，會出現在前端
VAPID_PRIVATE_KEY              私鑰，絕對不能加 NEXT_PUBLIC_
VAPID_SUBJECT                  mailto:聯絡信箱，推播服務商要求
CRON_SECRET                    保護排程端點
```

用 `npx web-push generate-vapid-keys` 產生金鑰。**四個都要設到 Vercel**，否則設定頁不會顯示開關（缺公鑰）或排程會回 500。

### 排程

`vercel.json` 的 `crons`：`"0 14 * * *"`（UTC）= 台北 22:00。Vercel Cron 會帶 `Authorization: Bearer <CRON_SECRET>`。

端點同時接受 `?secret=`，所以若 Vercel 方案不支援排程，任何外部排程服務都能改呼叫 `/api/cron/reminder?secret=...` 達到一樣效果。

### 瀏覽器端的兩個已知阻礙

**Brave 預設關閉 Google 推播服務**（去 Google 化的一環）。Web Push 在 Chromium 系底層走的就是 FCM，關掉之後 `subscribe()` 必定以 `AbortError` 失敗，而錯誤訊息（`Registration failed - push service error`）完全看不出跟這個設定有關。解法是到 `brave://settings/privacy` 開啟並重啟瀏覽器。程式會偵測 Brave 並直接給這段說明。

### ColorOS 的注意事項

OPPO 的 ColorOS 對背景程序管理激進，通知可能延遲或收不到。解法是「設定 → 電池 → 把 Chrome 排除在省電最佳化之外」。這不在程式能控制的範圍。

## 8.10 資產對帳

### 信用卡造成的結構性落差（不是錯誤）

系統的「現金」是 `起始現金 + 累計收入 − 累計消費 − 累計投資`，**消費記在你刷卡的當下**，但銀行要到繳費才扣款。

所以平常你的銀行餘額會**比系統的數字高**，高出的部分就是尚未繳的卡費。換句話說，系統的現金數字是「等所有卡費結清後你會剩下的錢」——那其實是更有用的數字，但拿它跟今天的銀行餘額比對一定對不上。

**最準的對帳時機是信用卡帳單剛繳完的那幾天。** 這件事要在 UI 上講清楚，否則使用者會以為系統算錯了。

### 調整要留下痕跡，不是改設定

漏記或記錯時，**建立一筆看得見的「差額調整」交易**，而不是偷偷修改 `startingCash`。

理由：三個月後你看到現金少了 1,500，要能在交易列表找到那一筆知道發生過什麼事。改設定值不留任何痕跡，而且會讓過去每一個月的報表跟著變動。

### 為什麼調整是 VARIABLE（計入消費）

`現金 = 起始現金 + 收入 − 消費 − 投資`。這個公式裡，`SAVINGS` 與 `INVESTMENT` 類的支出**不會讓現金減少**（前者仍是現金、後者另外扣掉）。所以調整若不是 `VARIABLE`，現金根本不會動，對帳就失去意義。

語意上也說得通：對不上通常就是**漏記的消費**，算進消費才誠實。UI 會明講「會計入本月消費，儲蓄率會跟著下降」。

### 範圍

只對**台幣現金**對帳。美元現金是設定頁手動維護的欄位，直接改那裡就好；投資部位由持股與即時報價決定，不需要對帳。

## 8.11 緩衝／娛樂資金

> 這個月扣掉「跑不掉的」與「照目前速度會花掉的」之後，還剩多少可以自由運用。

```
緩衝資金 = 當月收入 − 預估固定支出 − 預估變動消費
預估變動消費 = (本月已花的變動消費 ÷ 已過天數) × 當月總天數
預估固定支出 = max(本月已記錄的固定支出, 近三個月的固定支出平均)
```

### 兩個容易寫錯的地方

**① 日均只能用變動消費，不能用全部消費。**

房租是某一天的一大筆。把它混進日均再乘上天數會嚴重高估——15,000 的房租在第 6 天會讓日均變成 2,600，乘 30 天就是 78,000。固定支出是整月一次，本來就該分開算。

**② 固定支出只能扣一次。**

直覺上會寫成「收入 − 日均×天數 − 必要支出」，但日均若含固定支出，這樣就**重複扣了一次**。所以拆成「固定」與「變動」兩塊，各扣一次。

### 為什麼固定支出取「已記錄」與「歷史平均」的較大者

月初房租還沒記時，只用已記錄的會低估支出、**高估緩衝**——那是比較危險的方向（你以為還有錢可以花）。用歷史平均推估比較保守。房租記進去之後，實際值通常會超過歷史值，就自動改用實際值。

歷史平均**排除當月**（當月的固定支出還沒發生完），且只有當月以外有資料時才推估；沒有可靠參考值就不推估，直接用已記錄的。

### 分類的 kind 決定這個數字準不準

`FIXED` 與 `VARIABLE` 的歸類直接影響計算。每月固定要付的（房租、水電網路、保險、AI 工具訂閱、健身房月費）都要標記為 `FIXED`，否則會被當成日常變動消費、拉高日均並高估整月支出。

## 8.12 快取與效能

### Next.js 的 fetch 快取有個致命的綁定

> Cache entries are tagged based on which route file renders them.

所以**任何 `revalidatePath("/")` 都會清掉首頁渲染時建立的所有快取**，包含報價。踩到兩次：

1. `setHideAmounts` 原本呼叫 `revalidatePath("/", "layout")`——按一次眼睛就重抓 2,347 檔股票報價（實測 1.3 秒）。**切換顯示格式不該有這種代價。**已改成只寫 cookie，重新渲染交給客戶端的 `router.refresh()`。
2. `createTransaction` 的 `revalidatePath("/")` 是必要的（資料真的變了），但它同樣會清掉報價快取。

第 2 點沒辦法靠調整 `revalidatePath` 解決，所以改成**把報價存在自己的資料庫**（`QuoteCache` / `FxRateCache`），完全不受 Next 快取語意影響。

### 報價快取的三個設計

- **只快取使用者實際持有的代號。** 證交所端點一次回傳全市場 2,000 多檔，但我們只需要其中幾檔。
- **不是租戶資料。** 市場報價人人相同，快取一份大家共用，所以不在 `TENANT_MODELS` 裡。
- **外部 API 掛掉時退回過期快取**，而不是「查無報價、以成本顯示」。昨天的收盤價遠比沒有報價有用。

實測（本機，跨海連雪梨）：冷啟動 4,280 ms → 讀快取 570 ms。那 570 ms 幾乎都是本機的往返延遲；正式環境函式與資料庫同區，只要幾毫秒。

### useTransition 會擋住 Suspense 骨架

眼睛按鈕原本用 `useTransition` 包住 Server Action。**轉場期間 React 不顯示 Suspense 骨架，而是等整棵樹都好了才換畫面**——包含要抓報價的資產卡。改成 `router.refresh()` 之後，資產卡會先顯示骨架，其餘畫面立刻更新。

### 每次請求只驗一次身分

`getCurrentUser` 用 React `cache()` 包起來。首頁一次渲染會呼叫兩次（頁面本身與資產卡），每次都打一趟 Supabase Auth。`cache()` 的範圍限於單一請求，不會跨使用者共用。

### 還沒做的兩個槓桿

- **`DATABASE_URL` 的 `connection_limit=1`** 會讓 `Promise.all` 裡的多支查詢實際上序列化。同區之後每趟只剩幾毫秒所以影響很小，真要再壓可以調到 3~5。
- **把 Supabase 搬到東京**：目前台灣→雪梨往返約 130 ms，是每次導覽的下限。搬到東京配 `hnd1` 可降到約 40 ms，但要重建專案並搬資料。

## 9. 功能規格

### Phase 1（MVP，第一版一定要有）

- [ ] 登入頁（Supabase Auth email + 密碼）+ middleware 保護 + 每個 action 自行驗證
- [ ] 新增 / 編輯 / 刪除交易（日期、類型、分類、金額、備註）——**只開放 INCOME / EXPENSE**
- [ ] 交易列表，依月份篩選
- [ ] 月報表首頁：本月收入、消費支出、結餘、**儲蓄率 + 實際存下金額**（依第 8 節公式）
- [ ] 分類圓餅圖（本月**消費支出**依分類佔比）
- [ ] 分類管理（新增／改名／改顏色／封存）
- [ ] `lib/reports.ts` 單元測試全數通過

**Phase 1 的 UX 硬性要求**（隨手記帳的成敗關鍵，不是加分項）：

- 首頁右下角懸浮 `+` 按鈕，點下去用 bottom sheet / dialog 直接記帳，**不換頁**
- 金額欄位 `inputMode="decimal"` 且自動 focus
- 日期預設今天（台北時間）、分類預設帶入上次使用的分類
- 常用分類（餐飲、交通）做成一鍵可點的大按鈕
- 目標：從打開首頁到記完一筆，3 次點擊內完成

**Phase 1 刻意不做**：`TRANSFER` 與帳戶管理。理由：轉帳需要完整的帳戶 CRUD、初始餘額、餘額計算才有意義，做一半會變成沒人用的死欄位；而剛開始記帳最重要的是先掌握「錢花去哪」。schema 保留 `TRANSFER` 與 `Account`，**報表邏輯從第一天就要正確排除 TRANSFER**，只是 UI 先不開放。

### Phase 1.5（第一版能穩定每天使用後）

- [ ] 固定收支範本（RecurringTemplate）：範本 CRUD + 每月一鍵產生草稿，用 `RecurringRun` 保證冪等
- [ ] 首頁「距離發薪日還有 N 天 · 本月剩餘可支配 NT$ X」（對剛進職場的實用度高於月報表）
- [ ] 月趨勢線圖（近 6 個月收入／消費／儲蓄率）

### Phase 2

- [ ] 帳戶管理（CRUD + 初始餘額）與 `TRANSFER` 交易，帳戶餘額 = 初始餘額 + 流入 − 流出
- [ ] 分類預算上限 + 接近／超支提示
- [ ] CSV 匯入（銀行 / 信用卡帳單），欄位對應介面 + 用 `importHash` 去重
- [ ] 淨資產快照（NetWorthSnapshot）與趨勢圖
- [ ] PWA（可加到手機主畫面）

### Phase 3（有餘力再做）

- [ ] 收據照片上傳（存 Supabase Storage）
- [ ] 標籤系統（跨分類標記，例如「旅行」）
- [ ] 房租等可列舉扣除額項目標記，報稅季匯出清單
- [ ] 年度總結頁面

## 10. 頁面路由規劃

```
/login                    登入頁
/?m=2026-08               月報表首頁（月份用 searchParams，預設當月）
/transactions?m=2026-08   交易列表（可篩選月份/分類/類型）
/transactions/new         新增交易（手機主要用首頁的 bottom sheet，此頁作為 fallback）
/transactions/[id]/edit   編輯交易
/settings/categories      分類管理
/templates                固定收支範本管理        （Phase 1.5）
/settings/accounts        帳戶管理                （Phase 2）
```

月份一律放在 URL query（`?m=YYYY-MM`）而不是 client state：可分享、瀏覽器返回鍵行為正常、Server Component 直接讀得到。

## 11. 開發階段（給 Claude Code 的實作順序）

1. **專案初始化**：`create-next-app`（TypeScript + Tailwind + App Router）、安裝 Prisma / shadcn/ui / Vitest、設定 `postinstall` 與 seed script、確認 `prisma migrate dev` 能對 Supabase 跑通
2. **資料庫 schema + seed**：套用第 4 節 schema，寫第 6 節的 seed（記得用 `upsert`）
3. **登入功能**：`@supabase/ssr` 串接 Auth、登入頁、`proxy.ts`（Next 16 的 middleware）、`lib/auth.ts` 的 `requireUser()`
4. **核心工具層 + 測試（先於 UI）**：`lib/date.ts`、`lib/money.ts`、`lib/reports.ts`，並讓第 8.4 節的 9 個測試案例全部通過。**這一步做完再開始寫畫面**——邏輯先確定正確，UI 才有意義
5. **交易 CRUD**：新增/編輯/刪除/列表，先不用管美觀，功能對就好
6. **月報表首頁**：接上 `summarizeMonth()`，用真實測試資料驗證數字
7. **圖表**：分類圓餅圖（只取消費支出，用 `Category.color`）
8. **分類管理**：CRUD + 封存
9. **手機 UX 打磨**：懸浮按鈕、bottom sheet 快速記帳、預設值
10. **部署**：接上 Vercel、設定環境變數（含 `DIRECT_URL`）、確認正式環境跑得起來

每個階段完成後先讓使用者實際測試，再進下一階段。

## 12. 其他注意事項

**金額與計算**
- 金額欄位一律 `Decimal`，不要用 `Float`（浮點數算錢會有精度誤差）。
- Server Action 處理完 mutation 記得 `revalidatePath`，不然月報表不會即時更新。
- 表單驗證：金額必須 > 0、日期不能為空、`EXPENSE`/`INCOME` 必須有分類且分類 `type` 要跟交易 `type` 一致。

**薪資記錄（針對即將進入職場的情境）**
- 「就業收入」建議記**實領金額**（扣掉勞健保與所得稅預扣後實際入帳的數字），這樣收入才跟銀行帳戶對得起來。帳面薪資寫在備註即可，不要為此增加 schema 複雜度。

**維運**
- Supabase 免費方案專案閒置約 7 天會被自動暫停（出國一趟回來可能就登不進去），到 dashboard 手動 restore 即可，不是 bug。
- Prisma schema 有異動時務必跑 migration 而不是 `db push`，保留變更歷史。
- **動過 `prisma/schema.prisma` 之後一定要重啟 `npm run dev`**。`lib/prisma.ts` 把 client 快取在 `globalThis`，`prisma generate` 不會替換掉跑著的舊實例。症狀是 `Cannot read properties of undefined (reading 'findUnique')`，但 `tsc` 與 `next build` 都正常——因為只有那個長跑的行程是舊的。

**實作前自我檢查清單**
- [ ] 這個查詢有帶 `userId` 嗎？
- [ ] 這個加總排除 `TRANSFER` 了嗎？
- [ ] 這個「支出」該用總支出還是消費支出？
- [ ] 這個日期是台北時間還是 UTC？
- [ ] 這個 Server Action 開頭有 `requireUser()` 嗎？
- [ ] 這個 Decimal 有安全地轉換後才傳給 Client Component 嗎？

## 13. 開發進度

### 已完成並驗證

| 步驟 | 內容 | 狀態 |
|---|---|---|
| 1 | 專案初始化（Next.js 16.3.1 / Prisma 7.9.1 / Tailwind v4 / Vitest 4） | ✅ build 通過 |
| 2 | schema + seed | ✅ migration `init` 已套用，10 個預設分類已寫入 |
| 3 | 登入 + `proxy.ts` 路由保護 | ✅ 未登入一律 307 導向 `/login` |
| 4 | 核心工具層 `lib/{date,money,reports}.ts` | ✅ 48 個單元測試全過（含 8.4 節 9 個必測案例） |
| 5 | 交易 CRUD | ✅ |
| 6 | 月報表首頁（儲蓄率 / 實際存下 / 收入 / 消費 / 結餘） | ✅ |
| 7 | 分類圓餅圖（Recharts，只取消費支出） | ✅ |
| 8 | 分類管理（新增 / 改名 / 換色 / 封存） | ✅ |
| 9 | 手機 UX：懸浮 ＋ 按鈕 + bottom sheet 快速記帳、常用分類大按鈕、今天／昨天一鍵 | ✅ |
| — | 交易列表就地刪除（不必點進編輯頁） | ✅ |
| — | `CategoryKind` 重構 + `UserSetting` + 設定頁 | ✅ |
| — | 衍生分析：每日可用額度、消費速度、資產與緊急預備金、儲蓄率拆解 | ✅ |
| — | 持股明細 + 台股公開報價，投資現值自動更新 | ✅ |
| — | 複委託（美股）：Yahoo 報價 + 美元匯率換算 | ✅ |
| — | 資產依幣別拆分（現金／投資各分台幣與美元） | ✅ |
| — | 多租戶：註冊流程、新使用者初始化、租戶隔離防線 | ✅ |
| — | 每日記帳提醒（Web Push + 排程），每天固定發送 | ✅ |
| — | 飲料獨立分類（餐飲改名為餐食） | ✅ |
| — | 資產對帳：建立「差額調整」交易讓實際與系統一致 | ✅ |
| — | 分類調整：水電網路、日常用品、AI 工具、健身房 | ✅ |
| — | 緩衝／娛樂資金 | ✅ |
| — | 金額遮罩（眼睛按鈕），狀態存 cookie 讓伺服器端就渲染成遮罩 | ✅ |
| — | PWA：`app/manifest.ts` + 圖示，可安裝成 Android WebAPK | ✅ 待部署後才能安裝 |

**對真實資料庫的整合驗證**（`npm run verify:db`，測試資料會自動清除）：月初 1 日與月底不會因時區跑錯月、Decimal 33.33×3 = 99.99 精確、TRANSFER 未計入、儲蓄不算消費、圓餅圖排除儲蓄 — 全數通過。

### 步驟 9 的實作重點

- `components/quick-add-sheet.tsx`：首頁與交易列表右下角的懸浮 ＋，開 bottom sheet 就地記帳，**不換頁**
- **常用分類由實際使用頻率決定**（`getFrequentCategoryIds`，看最近 90 天的支出筆數），不是寫死餐飲、交通。使用紀錄不足 6 個時用預設排序遞補
- 開啟時自動 focus 金額欄位（`inputMode="decimal"` 會直接叫出數字鍵盤）、鎖住背景捲動、Esc 關閉
- 日期給「今天 / 昨天」一鍵按鈕，其他日期才需要開日期選擇器
- `/transactions/new` 保留為 fallback（桌面與深層連結用）

### 平台策略（決定過，不要再重新評估）

**只做一個響應式網頁 + PWA，不做原生 app、不做桌面 app。**

- 「網頁和 app 共用同一份資料」不需要額外做——資料在 Supabase，任何客戶端都只是同一份資料的視窗。
- PWA **不是另一個客戶端**，它不打包程式碼，安裝後的殼載入的還是同一個網站。所以維護乘數是 **1**：改一次、push 一次，手機上的 app 下次開啟就是新版，沒有商店審核、沒有新舊版本並存。
- 目前 UI 層 1,638 行、核心邏輯層 877 行——**65% 的程式碼是 UI**。每多一個原生客戶端就要重寫這 65%，而且往後每次改動都要做 N 次。個人專案通常死在這裡。
- 使用者是 **Android（OPPO Reno 8 5G / ColorOS）**。Chrome 安裝 PWA 會產生真正的 WebAPK：主畫面 + 應用程式抽屜 + 多工切換器 + 持久化儲存。iOS 那些限制（Safari 儲存清理、手動加到主畫面）都不適用。
- **Capacitor 包 WebView 行不通**：Server Components + Server Actions 沒辦法 `output: 'export'` 成靜態檔。Android 若真要上架，用 TWA（程式碼零修改）比較合理，但單一使用者沒有上架需求。

**什麼情況才重新考慮原生 app**：(1) 因為開瀏覽器麻煩而漏記帳 (2) 需要離線記帳 (3) 想要桌面小工具顯示今日可用額度。第 3 點最可能成立。

真要走到那一步也不是重來：`lib/{date,money,reports,analysis,category,validation}.ts` 共 877 行、100 個測試，完全不相依 React 與 Next.js，可直接搬到 React Native。

### PWA 注意事項

- **安裝需要 HTTPS**。`http://192.168.x.x:3000` 這種區網位址 Chrome 不會提供安裝選項，只能建立普通書籤捷徑。**必須先部署到 Vercel** 才裝得起來。
- `proxy.ts` 的 matcher 必須放行 `manifest.webmanifest`，否則會被導向登入頁，Chrome 讀不到 manifest 就不會出現安裝提示。
- 圖示用 `node scripts/generate-icons.mjs` 產生（純 Node 手寫 PNG，不依賴 sharp）。改設計就改 `draw()` 重跑。
- 改動 manifest 的**圖示或名稱**時，Android 的 WebAPK 需要重新產生，Chrome 會自動偵測但可能延遲數天。程式碼與資料的更新是即時的，不受影響。
- ColorOS 對背景程序管理激進，若之後做推播提醒，需要把 Chrome 排除在省電最佳化之外，否則可能收不到。

### 部署

正式站：**https://track-spending-mattis.vercel.app**

Vercel 上必須設定 4 個環境變數（`DATABASE_URL`、`DIRECT_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`）。**`DIRECT_URL` 不能漏**——`prisma.config.ts` 的 `env("DIRECT_URL")` 找不到變數會拋錯，而 build 會跑 `prisma generate`，所以漏掉會直接 build 失敗。

`SUPABASE_SERVICE_ROLE_KEY` 與 `SEED_USER_ID` 不需要設（前者程式沒用到，後者只有本機 seed 用得到）。

build 指令是 `prisma migrate deploy && next build`：每次部署會先套用未執行的 migration，schema 變更才不會只停在本機。migration 失敗時 build 會中止，這是刻意的——不要讓程式碼跑在還沒套用 schema 的資料庫上。

### 效能：函式與資料庫必須同區（實測過的坑）

初次部署時實測 `x-vercel-id: hkg1::iad1::`——Vercel 函式跑在**美國維吉尼亞**，而 Supabase 在 **ap-southeast-2（雪梨）**。使用者在台灣。三個地方分散在地球兩端，每次頁面載入是：

```
台灣 → 香港入口 → 美東（函式）→ 雪梨（資料庫）→ 美東 → 香港 → 台灣
                    跨太平洋 ~250ms   美澳往返 ~200ms × 每支查詢
```

**修法：`vercel.json` 指定 `"regions": ["syd1"]`**，讓函式跟資料庫同區。

為什麼不選離台灣最近的東京：頁面載入會打多支查詢，「函式↔資料庫」的往返次數是「使用者↔函式」的好幾倍，所以**跟資料庫同區的收益遠大於靠近使用者**。

```
iad1（美東）: 台灣→美東 ~250ms + 美東↔雪梨 ~200ms × N
syd1（雪梨）: 台灣→雪梨 ~130ms + 同區 ~1ms × N        ← 選這個
hnd1（東京）: 台灣→東京 ~40ms  + 東京↔雪梨 ~110ms × N  ← 反而較差
```

更徹底的做法是把 Supabase 專案搬到東京或新加坡再配 `hnd1`/`sin1`，但那要重建專案並搬資料。

**另一個相關細節**：`DATABASE_URL` 帶 `connection_limit=1`（serverless 的建議值），這會讓 `Promise.all` 裡的多支查詢實際上**序列化**執行。函式與資料庫同區後每趟只剩 ~1ms 所以影響很小；若日後仍嫌慢，可以把它調到 3~5。

### 載入骨架

所有主要路由都有 `loading.tsx`。它不會讓頁面變快，但點下去立刻有畫面而不是凍住，**感受上的差異比實際延遲的改善還大**。骨架形狀要對齊真實版面，資料回來時才不會整個跳動；骨架裡也要放 `BottomNav`，否則導覽列會在切換時閃掉。

### 待辦

- **分類月變化排行**：`categoryDelta()` 已寫好並測試過，但還沒接 UI（需要兩個月資料才看得到東西）
- **月度趨勢線**：`getMonthlyTotals()` 已可用，圖表未做。建議放獨立的 `/reports` 頁而不是首頁，資料不足時首頁只會看到一個孤點
- 步驟 10 部署到 Vercel
- Phase 1.5：固定收支範本、發薪日倒數、月趨勢線圖

### 常用指令

```bash
npm run dev        # 開發伺服器
npm test           # 單元測試（改動 lib/ 之後必跑）
npm run verify:db  # 對真實資料庫做整合驗證（會自動清除測試資料）
npm run db:migrate # 套用 schema 變更
npm run db:seed    # 寫入預設分類（需要 SEED_USER_ID）
npm run db:studio  # 用 Prisma Studio 看資料
```

### 使用者的起始資產（已填入資料庫）

| 項目 | 金額 | 存在哪 |
|---|---|---|
| 現金（活存 52,575 + 緊急備用金子帳戶 99,857） | 152,432 | `UserSetting.startingCash` |
| 台股投資成本 | 455,086 | `UserSetting.startingInvestment` |
| 台股現值 | 704,975 | `UserSetting.investmentValue`（需手動更新） |
| 目標儲蓄率 | 30% | `UserSetting.targetSavingsRate`（預設值，使用者可改） |

美股（成本 1,426 USD）金額小且涉及匯率換算，使用者決定先不納入。

### 環境設定的兩個實際坑（已解決，換機器時會再遇到）

1. **Supabase 直連是 IPv6-only**。`db.<ref>.supabase.co:5432` 沒有 IPv4 位址，沒買 IPv4 add-on 就會噴 `P1001: Can't reach database server`。解法是把 `DIRECT_URL` 改成 **Session Pooler**（跟 `DATABASE_URL` 同一個 pooler 主機，port 改 5432、帳號一樣是 `postgres.[ref]`、不加 `pgbouncer` 參數）。Session pooler 支援 prepared statements，可以正常跑 migration。
2. **UI 元件庫**：第 2 節列的 shadcn/ui 目前尚未導入，畫面先用純 Tailwind 手刻（步驟 5 的原則是「功能對就好」）。等步驟 9 打磨手機 UX 時再評估是否導入。

### 已知事項

- `npm audit` 會回報 `deepmerge-ts` 的 high 等級漏洞，來自 Prisma CLI 的 `@prisma/config`。**只影響本機 CLI 執行，不進入正式環境 runtime**；修掉需要把 Prisma 降到 6.x，代價過高，暫不處理。
- `formatPercent` 預設不顯示小數，所以 99.8% 會顯示成 100%。日常數字（40% 上下）沒問題，若之後覺得誤導可以改成 1 位小數。
