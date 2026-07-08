import { Skeleton, SkeletonCard } from "@/components/Skeleton";

/** Today skeleton — title row, then a stack of case cards. */
export default function Loading() {
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-36 rounded-chip" />
      </div>
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
