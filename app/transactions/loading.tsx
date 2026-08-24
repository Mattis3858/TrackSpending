import BottomNav from "@/components/bottom-nav";
import {
  SkeletonBar,
  SkeletonHeader,
  SkeletonPage,
} from "@/components/skeleton";

/** 交易列表的載入骨架：兩欄小計 + 依日期分組的清單 */
export default function Loading() {
  return (
    <>
      <SkeletonPage>
        <SkeletonHeader />

        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <SkeletonBar className="h-3 w-8" />
              <SkeletonBar className="mt-2 h-5 w-24" />
            </div>
          ))}
        </div>

        {[0, 1, 2].map((g) => (
          <section key={g}>
            <SkeletonBar className="mb-2 ml-1 h-3 w-20" />
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="size-2.5 shrink-0 rounded-full bg-slate-200" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBar className="h-4 w-24" />
                  </div>
                  <SkeletonBar className="h-4 w-16 shrink-0" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </SkeletonPage>
      <BottomNav />
    </>
  );
}
