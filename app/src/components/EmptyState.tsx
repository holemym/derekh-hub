import type { ReactNode } from "react";

/** Hairline empty-state card for sections other workstreams will fill. */
export default function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-card px-5 py-8 text-center">
      {icon ? (
        <div className="mb-3 flex justify-center text-muted">{icon}</div>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {body ? (
        <p className="mx-auto mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-muted">
          {body}
        </p>
      ) : null}
    </div>
  );
}
