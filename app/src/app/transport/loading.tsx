import { Skeleton, SkeletonSection } from "@/components/Skeleton";

/** Transport board skeleton — title, subtitle, then status-grouped leg lists. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-36 lg:hidden" />
      <Skeleton className="mb-6 mt-2 h-4 w-52" />
      <div className="flex flex-col gap-6">
        <SkeletonSection rows={2} />
        <SkeletonSection rows={3} />
        <SkeletonSection rows={2} />
      </div>
    </div>
  );
}
