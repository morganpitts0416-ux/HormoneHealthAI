import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, User, Loader2 } from "lucide-react";
import type { Patient } from "@shared/schema";

interface PatientSearchBarProps {
  placeholder?: string;
  className?: string;
}

export function PatientSearchBar({
  placeholder = "Search patients by name…",
  className = "",
}: PatientSearchBarProps) {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = searchTerm.trim();

  const { data: results = [], isFetching } = useQuery<Patient[]>({
    queryKey: [`/api/patients/search?q=${encodeURIComponent(trimmed)}`],
    enabled: trimmed.length >= 2,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightIdx(0);
  }, [searchTerm]);

  const goToPatient = (p: Patient) => {
    setSearchTerm("");
    setShowDropdown(false);
    setLocation(`/patient-profiles?patient=${p.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = results[highlightIdx];
      if (p) goToPatient(p);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const formatDob = (dob: Date | string | null | undefined) => {
    if (!dob) return null;
    const d = new Date(dob as any);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const showEmpty = showDropdown && trimmed.length >= 2 && !isFetching && results.length === 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-9 pr-9"
          data-testid="input-patient-search-bar"
          aria-label="Search patients"
        />
        {isFetching && trimmed.length >= 2 && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg max-h-80 overflow-y-auto"
          data-testid="dropdown-patient-search-bar"
        >
          {results.map((p, idx) => {
            const dob = formatDob(p.dateOfBirth);
            const isHighlighted = idx === highlightIdx;
            return (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  goToPatient(p);
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 hover-elevate ${
                  isHighlighted ? "bg-accent" : ""
                }`}
                data-testid={`button-patient-search-result-${p.id}`}
              >
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {p.firstName} {p.lastName}
                    </span>
                    {p.gender && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {p.gender}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[dob ? `DOB ${dob}` : null, p.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showEmpty && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg px-3 py-3 text-sm text-muted-foreground"
          data-testid="text-patient-search-empty"
        >
          No patients matching "{trimmed}".
        </div>
      )}
    </div>
  );
}
