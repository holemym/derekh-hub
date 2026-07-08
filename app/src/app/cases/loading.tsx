import { Skeleton, SkeletonSection } from "@/components/Skeleton";

/** Cases skeleton — title, then stage-grouped list sections. */
export default function Loading() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="flex flex-col gap-6">
        <SkeletonSection rows={3} />
        <SkeletonSection rows={2} />
        <SkeletonSection rows={2} />
      </div>
    </div>
  );
}
