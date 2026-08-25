import { describe, expect, it } from "vitest";
import { MissingTenantScopeError, assertTenantScoped } from "./tenant-guard";

const ok = (model: string | undefined, op: string, args: unknown) =>
  expect(() => assertTenantScoped(model, op, args)).not.toThrow();

const blocked = (model: string, op: string, args: unknown) =>
  expect(() => assertTenantScoped(model, op, args)).toThrow(MissingTenantScopeError);

describe("assertTenantScoped — 讀取", () => {
  it("有帶 userId 的查詢放行", () => {
    ok("Transaction", "findMany", { where: { userId: "u1", date: {} } });
    ok("Category", "findFirst", { where: { userId: "u1", archived: false } });
  });

  it("沒帶 userId 的查詢被擋下", () => {
    blocked("Transaction", "findMany", { where: { date: {} } });
    blocked("Transaction", "findFirst", { where: { id: "t1" } });
    blocked("Holding", "findMany", {});
    blocked("Category", "count", { where: {} });
  });

  it("userId 是 null 或 undefined 一樣擋下（最容易發生的漏洞）", () => {
    blocked("Transaction", "findMany", { where: { userId: undefined } });
    blocked("Transaction", "findMany", { where: { userId: null } });
  });
});

describe("assertTenantScoped — 寫入", () => {
  it("create 的 data 必須有 userId", () => {
    ok("Transaction", "create", { data: { userId: "u1", amount: "100" } });
    blocked("Transaction", "create", { data: { amount: "100" } });
  });

  it("createMany 每一筆都要有", () => {
    ok("Holding", "createMany", {
      data: [{ userId: "u1" }, { userId: "u1" }],
    });
    blocked("Holding", "createMany", {
      data: [{ userId: "u1" }, { symbol: "2330" }],
    });
    blocked("Holding", "createMany", { data: [] });
  });

  it("update / delete 只靠 id 會被擋下（必須連 userId 一起）", () => {
    blocked("Holding", "update", { where: { id: "h1" }, data: {} });
    blocked("Transaction", "delete", { where: { id: "t1" } });
    ok("Holding", "updateMany", { where: { id: "h1", userId: "u1" }, data: {} });
    ok("Transaction", "deleteMany", { where: { id: "t1", userId: "u1" } });
  });

  it("upsert 的 where 與 create 兩邊都要有 userId", () => {
    ok("UserSetting", "upsert", {
      where: { userId: "u1" },
      update: {},
      create: { userId: "u1" },
    });
    // create 少了 userId：資料會建出來但沒有歸屬
    blocked("UserSetting", "upsert", {
      where: { userId: "u1" },
      update: {},
      create: {},
    });
  });
});

describe("assertTenantScoped — where 的各種寫法", () => {
  it("複合唯一鍵（userId_name_type）算數", () => {
    ok("Category", "upsert", {
      where: { userId_name_type: { userId: "u1", name: "餐飲", type: "EXPENSE" } },
      update: {},
      create: { userId: "u1" },
    });
  });

  it("AND / OR 分支裡的 userId 算數", () => {
    ok("Transaction", "findMany", {
      where: { AND: [{ userId: "u1" }, { type: "EXPENSE" }] },
    });
    ok("Transaction", "findMany", {
      where: { OR: [{ userId: "u1" }] },
    });
  });

  it("OR 分支完全沒有 userId 時擋下", () => {
    blocked("Transaction", "findMany", {
      where: { OR: [{ type: "EXPENSE" }, { type: "INCOME" }] },
    });
  });
});

describe("assertTenantScoped — 不屬於租戶的資料表", () => {
  it("沒有 userId 概念的表不受限制", () => {
    ok("RecurringRun", "findMany", { where: { yearMonth: "2026-08" } });
    ok(undefined, "findMany", {});
  });
});
