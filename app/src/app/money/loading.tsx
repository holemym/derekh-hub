import { Skeleton, SkeletonSection } from "@/components/Skeleton";

/** Money overview skeleton — title, subtitle, totals band, grouped invoices. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-28 lg:hidden" />
      <Skeleton className="mb-6 mt-2 h-4 w-56" />
      <div className="surface mb-6 grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-6">
        <SkeletonSection rows={3} />
        <SkeletonSection rows={2} />
      </div>
    </div>
  );
}
