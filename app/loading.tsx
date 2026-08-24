import BottomNav from "@/components/bottom-nav";
import {
  SkeletonBar,
  SkeletonCard,
  SkeletonHeader,
  SkeletonPage,
} from "@/components/skeleton";

/**
 * 首頁（月報表）的載入骨架。
 * 形狀對齊真實版面：深色主視覺 → 儲蓄率 → 三欄數字 → 兩張分析卡 → 圓餅圖。
 */
export default function Loading() {
  return (
    <>
      <SkeletonPage>
        <SkeletonHeader />

        {/* 每日可用額度（深色主視覺） */}
        <div className="rounded-2xl bg-slate-900 px-5 py-6">
          <SkeletonBar className="h-4 w-40 bg-slate-700" />
          <SkeletonBar className="mt-3 h-11 w-52 bg-slate-700" />
          <SkeletonBar className="mt-3 h-4 w-56 bg-slate-800" />
        </div>

        {/* 儲蓄率 */}
        <SkeletonCard>
          <SkeletonBar className="h-4 w-16" />
          <SkeletonBar className="mt-3 h-8 w-28" />
          <SkeletonBar className="mt-3 h-2.5 w-full" />
          <SkeletonBar className="mt-2 h-3 w-3/4" />
        </SkeletonCard>

        {/* 收入 / 消費 / 結餘 */}
        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <SkeletonBar className="h-3 w-10" />
              <SkeletonBar className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>

        {/* 消費速度 / 資產 */}
        {[0, 1].map((i) => (
          <SkeletonCard key={i}>
            <SkeletonBar className="h-4 w-20" />
            <div className="mt-4 grid grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((j) => (
                <div key={j}>
                  <SkeletonBar className="h-3 w-16" />
                  <SkeletonBar className="mt-2 h-5 w-24" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}

        {/* 圓餅圖 */}
        <SkeletonCard>
          <SkeletonBar className="h-4 w-20" />
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
            <div className="size-44 shrink-0 rounded-full bg-slate-200" />
            <div className="w-full space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBar key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </SkeletonCard>
      </SkeletonPage>
      <BottomNav />
    </>
  );
}
