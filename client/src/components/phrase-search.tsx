import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Lock } from "lucide-react";
import type { NotePhrase } from "@shared/schema";

interface PhraseSearchProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}

export function usePhraseSearch({ textareaRef, value, onChange }: PhraseSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [slashStart, setSlashStart] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: allPhrases = [] } = useQuery<NotePhrase[]>({
    queryKey: ["/api/note-phrases"],
    enabled: isOpen,
    staleTime: 60000,
  });

  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? allPhrases.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.shortcut ?? "").toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q),
      )
    : allPhrases;
  const results = filtered.slice(0, 30);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setTriggerPosition(null);
    setSelectedIndex(0);
    setSlashStart(-1);
  }, []);

  const insertPhrase = useCallback((p: NotePhrase) => {
    const before = value.substring(0, slashStart);
    const after = value.substring(cursorPos);
    const newValue = before + p.content + after;
    onChange(newValue);
    close();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newPos = slashStart + p.content.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, slashStart, cursorPos, onChange, close, textareaRef]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = (e.target || e.currentTarget) as HTMLTextAreaElement;
    if (!ta || typeof ta.value !== "string") return;
    const pos = ta.selectionStart ?? ta.value.length;
    const text = ta.value;
    setCursorPos(pos);

    const textBefore = text.substring(0, pos);
    const match = textBefore.match(/\/phrase\s*(\S*)$/i);

    if (match) {
      const start = pos - match[0].length;
      setSlashStart(start);
      setSearchQuery(match[1] || "");
      setSelectedIndex(0);
      if (!isOpen) {
        const rect = ta.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
        const lineIndex = textBefore.split("\n").length - 1;
        const top = rect.top + (lineIndex * lineHeight) - ta.scrollTop + lineHeight + 4;
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
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") {
      if (results[selectedIndex]) { e.preventDefault(); insertPhrase(results[selectedIndex]); }
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  }, [isOpen, results, selectedIndex, insertPhrase, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) close();
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
      className="fixed z-[9999] w-[380px] max-h-[320px] overflow-y-auto rounded-md border bg-popover shadow-lg"
      style={{ top: triggerPosition.top, left: triggerPosition.left }}
      data-testid="phrase-search-dropdown"
    >
      <div className="sticky top-0 bg-popover border-b px-3 py-2 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">
          {searchQuery ? `Searching phrases: "${searchQuery}"` : "Type to filter phrases…"}
        </span>
      </div>
      {results.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No phrases yet. Add phrases in Account Settings → Phrase Library.
        </div>
      )}
      {results.map((p, i) => (
        <button
          key={p.id}
          data-index={i}
          data-testid={`phrase-option-${p.id}`}
          className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm cursor-pointer ${
            i === selectedIndex ? "bg-accent" : "hover-elevate"
          }`}
          onMouseDown={(e) => { e.preventDefault(); insertPhrase(p); }}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">{p.title}</span>
              {p.shortcut && (
                <span className="text-[10px] font-mono text-muted-foreground">.{p.shortcut}</span>
              )}
              {!p.isShared && <Lock className="w-3 h-3 text-muted-foreground" />}
            </span>
            <span className="text-[11px] text-muted-foreground line-clamp-2 leading-snug mt-0.5">
              {p.content}
            </span>
          </span>
        </button>
      ))}
      <div className="sticky bottom-0 bg-popover border-t px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">↑↓</kbd> navigate
          {" "}<kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Enter</kbd> insert
          {" "}<kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Esc</kbd> close
        </p>
      </div>
    </div>
  ) : null;

  return { handleInput, handleKeyDown, dropdown, isOpen };
}
