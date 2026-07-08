import { Skeleton } from "@/components/Skeleton";

/** Case-detail skeleton — back link, header, pipeline + details blocks. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-16" />
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-20 rounded-chip" />
      </div>

      {/* two-column on desktop, stacked on mobile — mirrors the real layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div>
            <Skeleton className="mb-2 ml-1 h-3 w-20" />
            <div className="surface p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="my-3 h-4 w-full" />
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="mb-2 ml-1 h-3 w-20" />
            <div className="surface p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="my-3 h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-2 ml-1 h-3 w-24" />
              <div className="surface p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-3 h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
