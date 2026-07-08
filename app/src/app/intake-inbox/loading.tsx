import { Skeleton, SkeletonSection } from "@/components/Skeleton";

/** Intake-inbox skeleton — back link, title, share-link block, submissions. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[720px]">
      <Skeleton className="mb-4 h-4 w-16" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mb-6 mt-2 h-4 w-72" />
      <div className="surface mb-6 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-10 w-full rounded-xl" />
      </div>
      <SkeletonSection rows={3} />
    </div>
  );
}
