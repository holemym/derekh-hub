import { IconPlane } from "./icons";
import type { TransportLeg } from "@/lib/types";

/** Transit indicator — VIE ··· ✈ ··· TLV dashed route line. */
export default function TransitLine({ leg }: { leg: TransportLeg }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-semibold tracking-wide">{leg.from}</span>
      <span className="relative flex flex-1 items-center">
        <span className="w-full border-t border-dashed border-muted/60" />
        <span className="absolute left-1/2 -translate-x-1/2 bg-card px-1.5 text-muted">
          <IconPlane size={16} />
        </span>
      </span>
      <span className="font-semibold tracking-wide">{leg.to}</span>
      {leg.flightOrAwb ? (
        <span className="text-xs text-muted">{leg.flightOrAwb}</span>
      ) : null}
    </div>
  );
}
