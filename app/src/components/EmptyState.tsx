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
    <div className="surface px-5 py-8 text-center">
      {icon ? (
        <div className="mb-3 flex justify-center text-muted">{icon}</div>
      ) : null}
      <p className="t-heading">{title}</p>
      {body ? (
        <p className="mx-auto mt-1.5 max-w-[42ch] t-meta text-muted">{body}</p>
      ) : null}
    </div>
  );
}
