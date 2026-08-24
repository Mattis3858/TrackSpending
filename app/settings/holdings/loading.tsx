import BottomNav from "@/components/bottom-nav";
import { SkeletonBar, SkeletonCard, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPage>
        <SkeletonBar className="h-7 w-20" />

        <div className="rounded-2xl bg-slate-900 px-5 py-5">
          <SkeletonBar className="h-4 w-16 bg-slate-700" />
          <SkeletonBar className="mt-3 h-8 w-40 bg-slate-700" />
          <SkeletonBar className="mt-3 h-4 w-56 bg-slate-800" />
        </div>

        <SkeletonCard>
          <SkeletonBar className="h-4 w-20" />
          <SkeletonBar className="mt-3 h-11 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <SkeletonBar className="h-11" />
            <SkeletonBar className="h-11" />
          </div>
        </SkeletonCard>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start justify-between px-4 py-3">
              <div>
                <SkeletonBar className="h-4 w-28" />
                <SkeletonBar className="mt-2 h-3 w-40" />
              </div>
              <div className="text-right">
                <SkeletonBar className="h-4 w-24" />
                <SkeletonBar className="mt-2 h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonPage>
      <BottomNav />
    </>
  );
}
