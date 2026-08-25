/**
 * 多租戶防護 — 見 SPEC 5.1 / 第 7 節
 *
 * 背景：Prisma 用 Postgres 連線字串直連，**會繞過 Supabase 的 RLS**，
 * 所以資料庫層沒有防護，全靠應用層每支查詢都帶 `where: { userId }`。
 * 單一使用者時漏掉沒差；開放多人之後，漏一支就是使用者之間的資料外洩。
 *
 * 這個 guard 把「靠自律」變成「結構上做不到」：任何針對租戶資料表的查詢，
 * 若條件裡沒有 userId 就直接拋錯，而不是安靜地回傳別人的資料。
 *
 * 它不能取代 RLS（真正的資料庫層防護），但成本低很多而且立刻生效。
 */

/** 每一列都屬於某個使用者的資料表 */
const TENANT_MODELS = new Set([
  "Category",
  "Transaction",
  "Holding",
  "UserSetting",
  "Account",
  "RecurringTemplate",
  "NetWorthSnapshot",
]);

/** 讀寫既有資料：條件裡必須有 userId */
const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "upsert",
]);

/** 新增資料：data 裡必須有 userId */
const CREATE_OPERATIONS = new Set(["create", "createMany"]);

export class MissingTenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation}() 沒有帶 userId。租戶資料表的每一支查詢都必須綁定使用者，` +
        `否則會讀到或改到別人的資料。見 SPEC 5.1。`,
    );
    this.name = "MissingTenantScopeError";
  }
}

function hasUserId(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (obj.userId !== undefined && obj.userId !== null) return true;

  // 複合鍵，例如 where: { userId_name_type: { userId, name, type } }
  for (const [key, nested] of Object.entries(obj)) {
    if (key.startsWith("userId_") && hasUserId(nested)) return true;
  }

  // AND / OR 裡任一分支帶了 userId 也算數
  for (const key of ["AND", "OR"] as const) {
    const branch = obj[key];
    if (Array.isArray(branch) && branch.some(hasUserId)) return true;
    if (branch && !Array.isArray(branch) && hasUserId(branch)) return true;
  }

  return false;
}

/** 檢查單一操作是否綁定了使用者；沒有就拋錯 */
export function assertTenantScoped(
  model: string | undefined,
  operation: string,
  args: unknown,
): void {
  if (!model || !TENANT_MODELS.has(model)) return;

  const a = (args ?? {}) as Record<string, unknown>;

  if (CREATE_OPERATIONS.has(operation)) {
    const data = a.data;
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0 || !rows.every(hasUserId)) {
      throw new MissingTenantScopeError(model, operation);
    }
    return;
  }

  if (WHERE_OPERATIONS.has(operation)) {
    // upsert 的 create 也要帶 userId，不然新建出來的資料沒有歸屬
    if (operation === "upsert" && !hasUserId(a.create)) {
      throw new MissingTenantScopeError(model, "upsert.create");
    }
    if (!hasUserId(a.where)) {
      throw new MissingTenantScopeError(model, operation);
    }
  }
}
