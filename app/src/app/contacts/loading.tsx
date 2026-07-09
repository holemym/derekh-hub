import { Skeleton, SkeletonSection } from "@/components/Skeleton";

/** Contacts skeleton — back link, title, subtitle, search row, list. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[720px]">
      <Skeleton className="mb-4 h-4 w-16" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mb-6 mt-2 h-4 w-64" />
      <Skeleton className="mb-2.5 h-10 w-full" />
      <SkeletonSection rows={5} />
    </div>
  );
}
