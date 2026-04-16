import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

interface DiagnosisResult {
  code: string;
  name: string;
  aliases?: string[];
}

interface DiagnosisSearchProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}

export function useDiagnosisSearch({ textareaRef, value, onChange }: DiagnosisSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [slashDxStart, setSlashDxStart] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery<DiagnosisResult[]>({
    queryKey: ["/api/diagnoses/search", searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/diagnoses/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setTriggerPosition(null);
    setSelectedIndex(0);
    setSlashDxStart(-1);
  }, []);

  const insertDiagnosis = useCallback((dx: DiagnosisResult) => {
    const insertText = `${dx.name} (${dx.code})`;
    const before = value.substring(0, slashDxStart);
    const after = value.substring(cursorPos);
    const newValue = before + insertText + after;
    onChange(newValue);
    close();

    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newPos = slashDxStart + insertText.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, slashDxStart, cursorPos, onChange, close, textareaRef]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget as HTMLTextAreaElement;
    const pos = ta.selectionStart ?? 0;
    const text = ta.value;
    setCursorPos(pos);

    const textBefore = text.substring(0, pos);
    const match = textBefore.match(/\/dx\s*(\S*)$/i);

    if (match) {
      const dxStart = pos - match[0].length;
      setSlashDxStart(dxStart);
      const query = match[1] || "";
      setSearchQuery(query);
      setSelectedIndex(0);

      if (!isOpen) {
        const rect = ta.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
        const textBeforeLines = textBefore.split("\n");
        const lineIndex = textBeforeLines.length - 1;
        const scrollTop = ta.scrollTop;

        const top = rect.top + (lineIndex * lineHeight) - scrollTop + lineHeight + 4;
        const left = rect.left + 16;

        setTriggerPosition({
          top: Math.min(top, window.innerHeight - 320),
          left: Math.min(left, window.innerWidth - 380),
        });
        setIsOpen(true);
      }
    } else if (isOpen) {
      close();
    }
  }, [isOpen, close]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || !results.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (results[selectedIndex]) {
        e.preventDefault();
        insertDiagnosis(results[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }, [isOpen, results, selectedIndex, insertDiagnosis, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const item = dropdownRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  const dropdown = isOpen && triggerPosition ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] w-[360px] max-h-[280px] overflow-y-auto rounded-md border bg-popover shadow-lg"
      style={{ top: triggerPosition.top, left: triggerPosition.left }}
      data-testid="diagnosis-search-dropdown"
    >
      <div className="sticky top-0 bg-popover border-b px-3 py-2 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">
          {searchQuery ? `Searching: "${searchQuery}"` : "Type to search diagnoses..."}
        </span>
        {isFetching && (
          <span className="text-[10px] text-muted-foreground ml-auto">loading...</span>
        )}
      </div>
      {results.length === 0 && !isFetching && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No diagnoses found. Try a different term.
        </div>
      )}
      {results.map((dx, i) => (
        <button
          key={`${dx.code}-${i}`}
          data-index={i}
          data-testid={`diagnosis-option-${dx.code}`}
          className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors cursor-pointer ${
            i === selectedIndex ? "bg-accent" : "hover-elevate"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            insertDiagnosis(dx);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="font-mono text-xs font-semibold text-primary/80 mt-0.5 flex-shrink-0 min-w-[60px]">
            {dx.code}
          </span>
          <span className="text-xs text-foreground leading-snug">{dx.name}</span>
        </button>
      ))}
      <div className="sticky bottom-0 bg-popover border-t px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">↑↓</kbd> navigate
          {" "}<kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Enter</kbd> select
          {" "}<kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Esc</kbd> close
        </p>
      </div>
    </div>
  ) : null;

  return {
    handleInput,
    handleKeyDown,
    dropdown,
    isOpen,
  };
}
