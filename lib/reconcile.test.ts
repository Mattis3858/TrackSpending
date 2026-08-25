import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";

describe("reconcile", () => {
  it("實際比系統少 → 補一筆支出（有花掉但沒記到的錢）", () => {
    const r = reconcile("50000", "48500");
    expect(r.direction).toBe("EXPENSE");
    expect(r.amount.toFixed(0)).toBe("1500");
    expect(r.difference.toFixed(0)).toBe("-1500");
  });

  it("實際比系統多 → 補一筆收入", () => {
    const r = reconcile("50000", "51200");
    expect(r.direction).toBe("INCOME");
    expect(r.amount.toFixed(0)).toBe("1200");
  });

  it("完全相符時不需要調整", () => {
    const r = reconcile("50000", "50000");
    expect(r.direction).toBe("NONE");
    expect(r.amount.toFixed(0)).toBe("0");
  });

  it("小於一元的差額不建立交易（四捨五入誤差不值得記一筆）", () => {
    expect(reconcile("50000", "50000.5").direction).toBe("NONE");
    expect(reconcile("50000", "49999.99").direction).toBe("NONE");
  });

  it("剛好一元的差額要調整", () => {
    expect(reconcile("50000", "49999").direction).toBe("EXPENSE");
    expect(reconcile("50000", "50001").direction).toBe("INCOME");
  });

  it("系統現金為負（透支）也算得出來", () => {
    const r = reconcile("-2000", "500");
    expect(r.direction).toBe("INCOME");
    expect(r.amount.toFixed(0)).toBe("2500");
  });

  it("用 Decimal 運算，小數不會失真", () => {
    const r = reconcile("108135.33", "108000.11");
    expect(r.amount.toFixed(2)).toBe("135.22");
  });
});
