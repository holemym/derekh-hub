/**
 * Calm loading placeholders (DESIGN.md §Loading) — shimmer, never spinners.
 * The `.skeleton` class provides the sweep; these are thin layout helpers so
 * each route's loading.tsx can echo its real structure.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** A card-shaped block matching the CaseCard silhouette. */
export function SkeletonCard() {
  return (
    <div className="surface p-5" aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-20 rounded-chip" />
      </div>
      <Skeleton className="mt-4 h-3 w-40" />
      <div className="mt-4 flex gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[3px] flex-1" />
        ))}
      </div>
    </div>
  );
}

/** A single list row silhouette. */
export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3" aria-hidden>
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-2 h-3 w-20" />
      </div>
      <Skeleton className="h-4 w-4 rounded-full" />
    </div>
  );
}

/** A titled block: eyebrow label + a surface holding rows. */
export function SkeletonSection({ rows = 3 }: { rows?: number }) {
  return (
    <section aria-hidden>
      <Skeleton className="mb-2 ml-1 h-3 w-24" />
      <div className="surface divide-y divide-line overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </section>
  );
}
