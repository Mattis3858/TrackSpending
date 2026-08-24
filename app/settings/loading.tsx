import BottomNav from "@/components/bottom-nav";
import { SkeletonBar, SkeletonCard, SkeletonPage } from "@/components/skeleton";

/** 設定頁的載入骨架：三張表單卡片 */
export default function Loading() {
  return (
    <>
      <SkeletonPage>
        <SkeletonBar className="h-7 w-20" />

        {[0, 1, 2].map((c) => (
          <SkeletonCard key={c}>
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="mt-2 h-3 w-full" />
            <div className="mt-5 space-y-4">
              {[0, 1].map((f) => (
                <div key={f}>
                  <SkeletonBar className="h-4 w-16" />
                  <SkeletonBar className="mt-2 h-11 w-full" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </SkeletonPage>
      <BottomNav />
    </>
  );
}
