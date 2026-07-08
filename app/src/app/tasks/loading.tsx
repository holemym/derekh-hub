import { Skeleton, SkeletonSection } from "@/components/Skeleton";

/** Tasks skeleton — back link, title, subtitle, list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[720px]">
      <Skeleton className="mb-4 h-4 w-16" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mb-6 mt-2 h-4 w-64" />
      <SkeletonSection rows={4} />
    </div>
  );
}
