import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Loader2, Search, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { PharmacyDetails } from "@shared/schema";

export interface PharmacyLookupResult {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  fax: string | null;
  ncpdpId: string | null;
}

export interface PharmacyLookupValue {
  // Free text the user typed (or the saved pharmacy name).
  text: string;
  // Structured details — null when the user has only typed plain text.
  details: PharmacyDetails | null;
}

interface PharmacyLookupProps {
  value: PharmacyLookupValue;
  onChange: (next: PharmacyLookupValue) => void;
  placeholder?: string;
  inputId?: string;
  disabled?: boolean;
  className?: string;
  // When the proxy returns 503 we fall back to plain text and also tell the
  // parent so it can adjust copy if it wants (e.g. portal).
  onLookupUnavailable?: () => void;
}

interface ApiResponse {
  results?: PharmacyLookupResult[];
  error?: string;
  message?: string;
}

export function PharmacyLookup({
  value,
  onChange,
  placeholder = "Search pharmacy by name or city",
  inputId,
  disabled = false,
  className,
  onLookupUnavailable,
}: PharmacyLookupProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PharmacyLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const text = value.text ?? "";
  const trimmed = text.trim();
  const hasStructured = !!(value.details && value.details.pharmacyName);

  // Debounced fetch — only when user has typed 2+ chars and the field is open.
  useEffect(() => {
    if (!open) return;
    if (unavailable) return;
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/pharmacy-lookup?q=${encodeURIComponent(trimmed)}`,
          { credentials: "include", signal: ctrl.signal },
        );
        const data: ApiResponse = await res.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        if (res.status === 503) {
          setUnavailable(true);
          setResults([]);
          setError(null);
          onLookupUnavailable?.();
          return;
        }
        if (!res.ok) {
          setResults([]);
          setError(data?.message || "Pharmacy lookup is unavailable. You can still type a name and save it.");
          return;
        }
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError("Pharmacy lookup is unavailable. You can still type a name and save it.");
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
  }, [trimmed, open, unavailable, onLookupUnavailable]);

  // Close dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleType = (next: string) => {
    setOpen(true);
    // Editing the text after a structured pick clears the structured details so
    // we don't ship stale address/phone for a different pharmacy.
    if (hasStructured && next !== (value.details?.pharmacyName ?? "")) {
      onChange({ text: next, details: null });
    } else {
      onChange({ text: next, details: value.details });
    }
  };

  const handlePick = (result: PharmacyLookupResult) => {
    onChange({
      text: result.name,
      details: {
        pharmacyName: result.name,
        pharmacyAddress: result.address || null,
        pharmacyPhone: result.phone || null,
        pharmacyFax: result.fax || null,
        pharmacyNcpdpId: result.ncpdpId || null,
        pharmacyPlaceId: result.placeId || null,
      },
    });
    setOpen(false);
  };

  const handleClear = () => {
    onChange({ text: "", details: null });
    setResults([]);
    setOpen(false);
  };

  const showDropdown = open && !unavailable && trimmed.length >= 2;
  const showNoMatches = showDropdown && !loading && results.length === 0 && !error;

  const helperText = useMemo(() => {
    if (unavailable) return "Pharmacy lookup is offline — you can still type a name and save it.";
    if (hasStructured) return "Pharmacy selected — full details will appear on the patient profile.";
    if (trimmed.length === 0) return "Start typing a pharmacy name (and optionally a city).";
    if (trimmed.length < 2) return "Keep typing…";
    return null;
  }, [unavailable, hasStructured, trimmed.length]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          value={text}
          onChange={(e) => handleType(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="pl-8 pr-8"
          data-testid="input-pharmacy-lookup"
        />
        {text && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover-elevate"
            aria-label="Clear pharmacy"
            data-testid="button-pharmacy-clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {helperText && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="text-pharmacy-helper">
          {helperText}
        </p>
      )}

      {showDropdown && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          data-testid="list-pharmacy-results"
        >
          {loading && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching pharmacies…
            </div>
          )}

          {!loading && error && (
            <div className="px-2 py-2 text-xs text-muted-foreground" data-testid="text-pharmacy-error">
              {error}
            </div>
          )}

          {!loading && !error && results.map((r) => (
            <button
              key={r.placeId}
              type="button"
              onClick={() => handlePick(r)}
              className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover-elevate"
              data-testid={`option-pharmacy-${r.placeId}`}
            >
              <Building2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{r.name}</div>
                {r.address && (
                  <div className="flex items-start gap-1 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{r.address}</span>
                  </div>
                )}
              </div>
            </button>
          ))}

          {showNoMatches && (
            <div className="px-2 py-2 text-xs text-muted-foreground" data-testid="text-pharmacy-no-matches">
              No matches — your typed text will be saved as plain text when you save.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helpers so callers can build/extract the value cleanly from a Patient or
// PortalMe payload without sprinkling field-by-field defaults everywhere.
export function pharmacyValueFromRecord(record: {
  preferredPharmacy?: string | null;
  pharmacyName?: string | null;
  pharmacyAddress?: string | null;
  pharmacyPhone?: string | null;
  pharmacyFax?: string | null;
  pharmacyNcpdpId?: string | null;
  pharmacyPlaceId?: string | null;
} | null | undefined): PharmacyLookupValue {
  if (!record) return { text: "", details: null };
  if (record.pharmacyName) {
    return {
      text: record.pharmacyName,
      details: {
        pharmacyName: record.pharmacyName,
        pharmacyAddress: record.pharmacyAddress ?? null,
        pharmacyPhone: record.pharmacyPhone ?? null,
        pharmacyFax: record.pharmacyFax ?? null,
        pharmacyNcpdpId: record.pharmacyNcpdpId ?? null,
        pharmacyPlaceId: record.pharmacyPlaceId ?? null,
      },
    };
  }
  return { text: record.preferredPharmacy ?? "", details: null };
}

// Build the PATCH payload the server expects from a PharmacyLookupValue.
// Always sends `preferredPharmacy` (the legacy text mirror) plus all
// structured columns (set to null when the user typed a free-text fallback)
// so the server can transition cleanly between the two modes.
export function pharmacyValueToPatch(v: PharmacyLookupValue) {
  const trimmedText = (v.text ?? "").trim();
  if (v.details && v.details.pharmacyName) {
    return {
      preferredPharmacy: v.details.pharmacyName,
      pharmacyName: v.details.pharmacyName,
      pharmacyAddress: v.details.pharmacyAddress ?? null,
      pharmacyPhone: v.details.pharmacyPhone ?? null,
      pharmacyFax: v.details.pharmacyFax ?? null,
      pharmacyNcpdpId: v.details.pharmacyNcpdpId ?? null,
      pharmacyPlaceId: v.details.pharmacyPlaceId ?? null,
    };
  }
  return {
    preferredPharmacy: trimmedText || null,
    pharmacyName: null,
    pharmacyAddress: null,
    pharmacyPhone: null,
    pharmacyFax: null,
    pharmacyNcpdpId: null,
    pharmacyPlaceId: null,
  };
}
