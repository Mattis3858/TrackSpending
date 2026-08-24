"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_KINDS,
  KIND_HINT,
  KIND_LABEL,
  isSetAsideKind,
  type CategoryKind,
} from "@/lib/category";
import type { CategoryDTO } from "@/lib/queries";
import type { ActionResult } from "@/app/actions/transactions";

type ManagedCategory = CategoryDTO & { archived: boolean };

type Props = {
  categories: ManagedCategory[];
  onCreate: (input: {
    name: string;
    type: "INCOME" | "EXPENSE";
    color: string;
    kind: CategoryKind;
  }) => Promise<ActionResult>;
  onUpdate: (
    id: string,
    input: { name: string; kind?: CategoryKind; color?: string },
  ) => Promise<ActionResult>;
  onArchive: (id: string, archived: boolean) => Promise<ActionResult>;
};

const PALETTE = [
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
  "#22c55e",
  "#94a3b8",
];

const KIND_BADGE: Record<CategoryKind, string> = {
  VARIABLE: "",
  FIXED: "bg-indigo-50 text-indigo-700",
  SAVINGS: "bg-emerald-50 text-emerald-700",
  INVESTMENT: "bg-teal-50 text-teal-700",
};

export default function CategoryManager({
  categories,
  onCreate,
  onUpdate,
  onArchive,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newKind, setNewKind] = useState<CategoryKind>("VARIABLE");

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

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    run(
      () =>
        onCreate({
          name: newName.trim(),
          type: newType,
          color: newColor,
          kind: newType === "INCOME" ? "VARIABLE" : newKind,
        }),
      () => {
        setNewName("");
        setNewKind("VARIABLE");
      },
    );
  }

  function rename(c: ManagedCategory) {
    const next = prompt("新的分類名稱", c.name);
    const name = next ? next.trim() : "";
    if (!name || name === c.name) return;
    run(() => onUpdate(c.id, { name }));
  }

  function changeKind(c: ManagedCategory, kind: CategoryKind) {
    if (kind === c.kind) return;
    run(() => onUpdate(c.id, { name: c.name, kind }));
  }

  const groups: { type: "EXPENSE" | "INCOME"; label: string }[] = [
    { type: "EXPENSE", label: "支出分類" },
    { type: "INCOME", label: "收入分類" },
  ];

  return (
    <div className="space-y-6">
      <form
        onSubmit={submitNew}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <p className="text-sm font-medium text-slate-600">新增分類</p>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {(["EXPENSE", "INCOME"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setNewType(t)}
              className={
                newType === t
                  ? "rounded-md bg-white py-1.5 text-sm font-medium shadow-sm"
                  : "rounded-md py-1.5 text-sm text-slate-500"
              }
            >
              {t === "EXPENSE" ? "支出" : "收入"}
            </button>
          ))}
        </div>

        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="分類名稱"
          maxLength={20}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
        />

        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={"顏色 " + c}
              onClick={() => setNewColor(c)}
              className={
                newColor === c
                  ? "size-7 rounded-full ring-2 ring-slate-900 ring-offset-2"
                  : "size-7 rounded-full"
              }
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {newType === "EXPENSE" && (
          <div className="space-y-2">
            <span className="block text-sm text-slate-600">性質</span>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNewKind(k)}
                  className={
                    newKind === k
                      ? "rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm text-white"
                      : "rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
                  }
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">{KIND_HINT[newKind]}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !newName.trim()}
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

      {groups.map((g) => {
        const list = categories.filter((c) => c.type === g.type);
        if (list.length === 0) return null;
        return (
          <section key={g.type}>
            <h2 className="px-1 pb-1.5 text-xs font-medium text-slate-400">
              {g.label}
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {list.map((c) => (
                <li
                  key={c.id}
                  className={c.archived ? "px-4 py-3 opacity-50" : "px-4 py-3"}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color ?? "#94a3b8" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {c.name}
                      {g.type === "EXPENSE" && KIND_BADGE[c.kind] && (
                        <span
                          className={
                            "ml-2 rounded px-1.5 py-0.5 text-xs " + KIND_BADGE[c.kind]
                          }
                        >
                          {KIND_LABEL[c.kind]}
                        </span>
                      )}
                      {c.archived && (
                        <span className="ml-2 text-xs text-slate-400">已封存</span>
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => rename(c)}
                      disabled={isPending}
                      className="shrink-0 text-xs text-slate-500 hover:text-slate-900"
                    >
                      改名
                    </button>

                    {!c.isDefault && (
                      <button
                        type="button"
                        onClick={() => run(() => onArchive(c.id, !c.archived))}
                        disabled={isPending}
                        className="shrink-0 text-xs text-slate-500 hover:text-slate-900"
                      >
                        {c.archived ? "復原" : "封存"}
                      </button>
                    )}
                  </div>

                  {g.type === "EXPENSE" && !c.archived && (
                    <div className="mt-2 flex items-center gap-2 pl-6">
                      <label
                        htmlFor={"kind-" + c.id}
                        className="text-xs text-slate-400"
                      >
                        性質
                      </label>
                      <select
                        id={"kind-" + c.id}
                        value={c.kind}
                        disabled={isPending}
                        onChange={(e) =>
                          changeKind(c, e.target.value as CategoryKind)
                        }
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                      >
                        {CATEGORY_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      {isSetAsideKind(c.kind) && (
                        <span className="text-xs text-slate-400">不計入消費</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="space-y-1 px-1 text-xs text-slate-400">
        <p>
          性質隨時可以改（例如搬家後房租變動、或想把某個分類從變動改成固定）。報表都是即時計算，改完歷史交易會跟著重新歸類。
        </p>
        <p>分類只能封存不能刪除，這樣過去的交易紀錄與報表才不會壞掉。內建分類不開放封存。</p>
      </div>
    </div>
  );
}
