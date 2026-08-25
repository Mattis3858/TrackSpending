/**
 * 新使用者初始化 — 見 SPEC 第 14 節
 *
 * 每個註冊的人都要有自己的 11 個預設分類與一筆 UserSetting，
 * 否則第一次進來會看到空白的分類清單、記不了帳。
 *
 * 為什麼是「首次登入時建立」而不是「註冊時建立」：
 * Supabase 若開啟 email 驗證，signUp 當下不一定拿得到 session，
 * 那時沒有可信的 userId 可用。改成第一次成功載入頁面時補上，
 * 對兩種設定都成立。
 *
 * 這個函式必須是冪等的——它會在每次首頁載入時被呼叫。
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";

export type ProvisionResult = {
  /** 這次是否真的建立了資料 */
  created: boolean;
  categoriesCreated: number;
};

/**
 * 確保使用者有預設分類與設定。已經有了就什麼都不做。
 *
 * @param hasCategories 呼叫端若已經查過分類，可以傳進來省一次查詢
 */
export async function ensureProvisioned(
  userId: string,
  hasCategories?: boolean,
): Promise<ProvisionResult> {
  if (hasCategories) return { created: false, categoriesCreated: 0 };

  if (hasCategories === undefined) {
    const existing = await prisma.category.count({ where: { userId } });
    if (existing > 0) return { created: false, categoriesCreated: 0 };
  }

  // createMany + skipDuplicates：即使兩個請求同時觸發也不會產生重複分類
  const result = await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c, index) => ({
      userId,
      name: c.name,
      type: c.type,
      kind: c.kind,
      color: c.color,
      sortOrder: index,
      isDefault: true,
    })),
    skipDuplicates: true,
  });

  await prisma.userSetting.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  return { created: result.count > 0, categoriesCreated: result.count };
}
