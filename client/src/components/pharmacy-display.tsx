import { Building2 } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

interface PharmacyDisplayProps {
  // Legacy free-text value (preferredPharmacy column).
  legacyText?: string | null;
  // Structured fields (populated when a pharmacy was picked from the lookup).
  pharmacyName?: string | null;
  pharmacyAddress?: string | null;
  pharmacyPhone?: string | null;
  pharmacyFax?: string | null;
  pharmacyNcpdpId?: string | null;
  // Visual style — `inline` matches the existing demographics row.
  variant?: "inline" | "block";
  // Whether to render the leading building icon. Defaults to true.
  showIcon?: boolean;
  className?: string;
}

const EM_DASH = "—";

function fieldOrDash(value: string | null | undefined): string {
  if (!value) return EM_DASH;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : EM_DASH;
}

export function PharmacyDisplay({
  legacyText,
  pharmacyName,
  pharmacyAddress,
  pharmacyPhone,
  pharmacyFax,
  pharmacyNcpdpId,
  variant = "inline",
  showIcon = true,
  className,
}: PharmacyDisplayProps) {
  // Prefer the structured pharmacy name when available; fall back to the
  // legacy free-text value for patients that haven't been "upgraded" yet.
  const hasStructured = !!(pharmacyName && pharmacyName.trim().length > 0);
  const displayName = hasStructured ? pharmacyName!.trim() : (legacyText?.trim() ?? "");
  if (!displayName) return null;

  const isInline = variant === "inline";

  // Plain text mode for legacy free-text patients — no popover, matches the
  // existing inline pharmacy row exactly.
  if (!hasStructured) {
    return (
      <span
        className={cn(
          isInline ? "inline-flex items-center gap-1 text-xs text-muted-foreground" : "flex items-center gap-1.5 text-sm text-foreground",
          className,
        )}
        data-testid="text-pharmacy-display"
      >
        {showIcon && <Building2 className={cn(isInline ? "w-3 h-3" : "w-4 h-4", "text-muted-foreground")} />}
        {isInline && <>Pharmacy: </>}
        <span className={cn(isInline ? "font-medium text-foreground" : "font-medium")} data-testid="text-pharmacy-name">
          {displayName}
        </span>
      </span>
    );
  }

  // Structured mode — visible label is the same name; popover reveals details.
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            isInline
              ? "inline-flex items-center gap-1 text-xs text-muted-foreground rounded-sm px-1 -mx-1 hover-elevate focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "inline-flex items-center gap-1.5 text-sm text-foreground rounded-sm px-1 -mx-1 hover-elevate focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          data-testid="button-pharmacy-display"
        >
          {showIcon && <Building2 className={cn(isInline ? "w-3 h-3" : "w-4 h-4", "text-muted-foreground")} />}
          {isInline && <>Pharmacy: </>}
          <span className={cn(isInline ? "font-medium text-foreground" : "font-medium")} data-testid="text-pharmacy-name">
            {displayName}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72" data-testid="popover-pharmacy-details">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground" data-testid="text-pharmacy-popover-name">
                {displayName}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Address</dt>
            <dd className="text-foreground" data-testid="text-pharmacy-popover-address">{fieldOrDash(pharmacyAddress)}</dd>

            <dt className="text-muted-foreground">Phone</dt>
            <dd className="text-foreground" data-testid="text-pharmacy-popover-phone">{fieldOrDash(pharmacyPhone)}</dd>

            <dt className="text-muted-foreground">Fax</dt>
            <dd className="text-foreground" data-testid="text-pharmacy-popover-fax">{fieldOrDash(pharmacyFax)}</dd>

            <dt className="text-muted-foreground">NCPDP ID</dt>
            <dd className="text-foreground" data-testid="text-pharmacy-popover-ncpdp">{fieldOrDash(pharmacyNcpdpId)}</dd>
          </dl>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
