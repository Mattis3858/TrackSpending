"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPercent, formatTWD } from "@/lib/money";
import type { ActionResult } from "@/app/actions/transactions";

/** 伺服器端已經把 Decimal 轉成字串再傳過來（SPEC 5.5） */
export type HoldingRow = {
  id: string;
  symbol: string;
  name: string;
  market: string;
  /** 原幣別。美股（複委託）是 USD，其餘是 TWD */
  currency: "TWD" | "USD";
  shares: string;
  /** 以下都是「原幣別」金額 */
  cost: string;
  price: string | null;
  value: string | null;
  gain: string | null;
  gainRatio: number | null;
  /** 換算台幣後的市值；缺匯率時為 null */
  valueTwd: string | null;
  quoteDate: string | null;
};

/** 美元部位用 US$ 標示，避免跟台幣金額混淆 */
function formatMoney(value: string, currency: "TWD" | "USD"): string {
  if (currency === "TWD") return formatTWD(value);
  return "US$ " + formatTWD(value).replace("NT$ ", "");
}

type Props = {
  rows: HoldingRow[];
  onCreate: (input: {
    symbol: string;
    shares: string;
    cost: string;
  }) => Promise<ActionResult>;
  onUpdate: (
    id: string,
    input: { symbol: string; shares: string; cost: string },
  ) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  onLookup: (
    symbol: string,
  ) => Promise<{
    name: string;
    market: string;
    price: string;
    currency: string;
  } | null>;
};

const inputClass =
  "tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900";

export default function HoldingsManager({
  rows,
  onCreate,
  onUpdate,
  onDelete,
  onLookup,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editShares, setEditShares] = useState("");
  const [editCost, setEditCost] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        onOk?.();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  // 離開代號欄位時去查名稱，讓使用者確認打對了
  async function lookup() {
    const s = symbol.trim();
    if (!s) {
      setPreview(null);
      return;
    }
    setLooking(true);
    const found = await onLookup(s);
    setLooking(false);
    setPreview(
      found
        ? `${found.name}　${found.currency === "USD" ? "US$" : ""}${found.price}${found.market === "US" ? "（美股複委託）" : ""}`
        : "查不到這個代號（仍可手動新增）",
    );
  }

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => onCreate({ symbol: symbol.trim(), shares: shares.trim(), cost: cost.trim() }),
      () => {
        setSymbol("");
        setShares("");
        setCost("");
        setPreview(null);
      },
    );
  }

  function startEdit(row: HoldingRow) {
    setEditingId(row.id);
    setEditShares(row.shares);
    setEditCost(row.cost.replace(/[.]?0+$/, ""));
    setConfirmId(null);
  }

  function saveEdit(row: HoldingRow) {
    run(
      () =>
        onUpdate(row.id, {
          symbol: row.symbol,
          shares: editShares.trim(),
          cost: editCost.trim(),
        }),
      () => setEditingId(null),
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submitNew}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div>
          <p className="text-sm font-medium text-slate-600">新增持股</p>
          <p className="mt-0.5 text-xs text-slate-400">
            名稱與市場會自動帶入，你只要打代號。成本填累計投入的總金額。
          </p>
        </div>

        <div>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onBlur={lookup}
            placeholder="股票代號，例如 2330 或 VOO"
            maxLength={10}
            className={inputClass}
          />
          {(looking || preview) && (
            <p className="mt-1.5 text-xs text-slate-500">
              {looking ? "查詢中…" : preview}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="股數（可到小數第 5 位）"
            inputMode="decimal"
            className={inputClass}
          />
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="總成本"
            inputMode="decimal"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !symbol.trim() || !shares.trim() || !cost.trim()}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          新增
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          還沒有持股紀錄
          <span className="mt-1 block text-xs text-slate-400">
            加進來之後，投資現值就會自動更新，不必再手動改設定
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {rows.map((row) => {
            const editing = editingId === row.id;
            const confirming = confirmId === row.id;
            const up = row.gainRatio !== null && row.gainRatio >= 0;

            return (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <span className="tabular">{row.symbol}</span>
                      <span className="ml-2 text-slate-600">{row.name}</span>
                    </p>
                    <p className="tabular mt-0.5 text-xs text-slate-400">
                      {row.shares} 股 · 成本 {formatMoney(row.cost, row.currency)}
                      {row.price &&
                        ` · 現價 ${row.currency === "USD" ? "US$" : ""}${row.price}`}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold">
                      {row.valueTwd
                        ? formatTWD(row.valueTwd)
                        : formatMoney(row.value ?? row.cost, row.currency)}
                    </p>
                    {row.currency === "USD" && row.valueTwd && (
                      <p className="tabular text-xs text-slate-400">
                        {formatMoney(row.value ?? row.cost, row.currency)}
                      </p>
                    )}
                    {row.gain !== null && row.gainRatio !== null ? (
                      <p
                        className={`tabular text-xs ${up ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {up ? "+" : ""}
                        {formatMoney(row.gain, row.currency)}（{up ? "+" : ""}
                        {formatPercent(row.gainRatio, 1)}）
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">查無報價</p>
                    )}
                  </div>
                </div>

                {editing ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={editShares}
                        onChange={(e) => setEditShares(e.target.value)}
                        placeholder="股數（可到小數第 5 位）"
                        inputMode="decimal"
                        className={inputClass}
                      />
                      <input
                        value={editCost}
                        onChange={(e) => setEditCost(e.target.value)}
                        placeholder="總成本"
                        inputMode="decimal"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(row)}
                        disabled={isPending}
                        className="flex-1 rounded-lg bg-slate-900 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        儲存
                      </button>
                    </div>
                  </div>
                ) : confirming ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-500">
                      刪除 {row.symbol}？
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => run(() => onDelete(row.id))}
                      disabled={isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(row.id)}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      刪除
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
