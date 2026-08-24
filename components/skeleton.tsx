/**
 * 載入骨架的共用元件。
 *
 * 目的不是讓頁面變快，而是讓「點下去到畫面出現」之間不是一片凍結。
 * 骨架的形狀要跟真實內容接近，資料回來時才不會整個版面跳動。
 */

export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-slate-200 ${className}`} />;
}

export function SkeletonCard({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 ${className}`}
    >
      {children}
    </div>
  );
}

/** 整頁骨架的外框：固定用 animate-pulse，維持一致的節奏 */
export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 px-4 py-6" aria-busy="true" aria-label="載入中">
      <div className="mx-auto w-full max-w-lg animate-pulse space-y-4 pb-24">
        {children}
      </div>
    </main>
  );
}

/** 頁首：月份切換器 + 右側按鈕 */
export function SkeletonHeader() {
  return (
    <div className="flex items-center justify-between">
      <SkeletonBar className="h-6 w-36" />
      <SkeletonBar className="h-6 w-16" />
    </div>
  );
}
