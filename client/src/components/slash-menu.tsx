import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, FileText, MessageSquare, Stethoscope, ListChecks } from "lucide-react";
import type { NoteTemplate, NotePhrase, PatientChart } from "@shared/schema";
import {
  BUILTIN_BLOCKS, BUILTIN_BY_ID, type BuiltinBlockDef,
  buildDefaultChartText, buildBulletSection,
  parseSlashTrigger, parseAutoInsertTrigger,
  renderTemplateBlocks, type TemplateBlockRender,
} from "@shared/note-builtin-blocks";

interface SlashMenuProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  /** Optional: when set, builtin history blocks pull from this patient's chart. */
  patientId?: number | null;
  /** Optional: restrict template suggestions to one note type (default: all). */
  noteType?: "soap_provider" | "nurse" | "phone";
}

type SlashItem =
  | { kind: "builtin"; id: string; label: string; hint: string; def: BuiltinBlockDef }
  | { kind: "template"; id: string; label: string; hint: string; tpl: NoteTemplate }
  | { kind: "phrase"; id: string; label: string; hint: string; phrase: NotePhrase };

/** Universal `/` slash menu for note textareas: built-in clinical blocks +
 *  saved templates + saved phrases. Cedes `/dx` and `/phrase` to their
 *  dedicated dropdowns. */
export function useSlashMenu({ textareaRef, value, onChange, patientId, noteType }: SlashMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [slashStart, setSlashStart] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Templates and phrases are fetched on mount (not gated by isOpen) so the
  // unique-shortcut direct-insert path works on first keystroke even on a
  // cold cache. Both endpoints are small (per-clinician lists) and cached
  // for 60s, so the prefetch cost is negligible.
  const { data: templates = [] } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates"],
    staleTime: 60_000,
  });
  const { data: phrases = [] } = useQuery<NotePhrase[]>({
    queryKey: ["/api/note-phrases"],
    staleTime: 60_000,
  });
  const { data: chart = null } = useQuery<PatientChart | null>({
    queryKey: ["/api/patients", patientId, "chart"],
    queryFn: async () => {
      if (!patientId) return null;
      const res = await fetch(`/api/patients/${patientId}/chart`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isOpen && !!patientId,
    staleTime: 60_000,
  });

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    setTriggerPosition(null);
    setSelectedIndex(0);
    setSlashStart(-1);
  }, []);

  // ── item assembly ─────────────────────────────────────────────────────
  const allItems = useMemo<SlashItem[]>(() => {
    const items: SlashItem[] = [];

    for (const b of BUILTIN_BLOCKS) {
      const triggerHint = `/${b.triggers[0]}`;
      const hint = b.chart
        ? `Insert ${b.label.toLowerCase()} chart`
        : b.list
          ? (chart && b.chartKey && (chart[b.chartKey] as string[] | undefined)?.length
              ? `Pull ${b.label.toLowerCase()} from chart`
              : `Insert ${b.label.toLowerCase()} section`)
          : `Insert ${b.label.toLowerCase()} section`;
      items.push({
        kind: "builtin",
        id: `builtin-${b.id}`,
        label: `${b.label} (${triggerHint})`,
        hint,
        def: b,
      });
    }

    const filteredTemplates = noteType
      ? templates.filter(t => t.noteType === noteType)
      : templates;
    for (const t of filteredTemplates) {
      const triggerHint = t.shortcut ? `/${t.shortcut}` : `Template`;
      items.push({
        kind: "template",
        id: `tpl-${t.id}`,
        label: `${t.name} (${triggerHint})`,
        hint: t.description ?? `${(t.blocks?.length ?? 0)} block${(t.blocks?.length ?? 0) === 1 ? "" : "s"}`,
        tpl: t,
      });
    }

    for (const p of phrases) {
      const triggerHint = p.shortcut ? `/${p.shortcut}` : `Phrase`;
      items.push({
        kind: "phrase",
        id: `ph-${p.id}`,
        label: `${p.title} (${triggerHint})`,
        hint: p.content.replace(/\s+/g, " ").slice(0, 80),
        phrase: p,
      });
    }

    return items;
  }, [templates, phrases, chart, noteType]);

  const results = useMemo<SlashItem[]>(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      // Default ordering: built-ins first, then templates, then phrases.
      return allItems.slice(0, 30);
    }
    // Score items: exact trigger/shortcut match wins, then prefix match,
    // then includes match. Builtins beat templates which beat phrases on ties.
    const ranked = allItems
      .map(item => {
        let score = 0;
        if (item.kind === "builtin") {
          if (item.def.triggers.includes(q)) score = 100;
          else if (item.def.triggers.some(t => t.startsWith(q))) score = 60;
          else if (item.def.label.toLowerCase().includes(q)) score = 30;
        } else if (item.kind === "template") {
          const sc = (item.tpl.shortcut ?? "").toLowerCase();
          if (sc && sc === q) score = 90;
          else if (sc && sc.startsWith(q)) score = 55;
          else if (item.tpl.name.toLowerCase().includes(q)) score = 25;
        } else {
          const sc = (item.phrase.shortcut ?? "").toLowerCase();
          if (sc && sc === q) score = 80;
          else if (sc && sc.startsWith(q)) score = 50;
          else if (item.phrase.title.toLowerCase().includes(q)) score = 20;
        }
        return { item, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    return ranked.map(r => r.item);
  }, [allItems, searchQuery]);

  // ── insertion ────────────────────────────────────────────────────────
  const insertText = useCallback((text: string) => {
    const before = value.substring(0, slashStart);
    const after = value.substring(cursorPos);
    // Add a leading newline if the previous char isn't already a newline so
    // multi-line section text always lands on its own line.
    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
    const insert = needsLeadingNewline ? "\n" + text : text;
    const newValue = before + insert + after;
    onChange(newValue);
    close();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newPos = before.length + insert.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, slashStart, cursorPos, onChange, close, textareaRef]);

  const insertItem = useCallback((item: SlashItem) => {
    if (item.kind === "builtin") {
      const b = item.def;
      if (b.chart) {
        insertText(buildDefaultChartText(b.id as "ros" | "physical_exam"));
        return;
      }
      if (b.list) {
        const items = chart && b.chartKey
          ? ((chart[b.chartKey] as string[] | undefined) ?? [])
          : [];
        insertText(buildBulletSection(b.shortLabel, items));
        return;
      }
      insertText(`${b.shortLabel}:\n`);
      return;
    }
    if (item.kind === "template") {
      const tplBlocks = (item.tpl.blocks ?? []) as TemplateBlockRender[];
      insertText(renderTemplateBlocks(tplBlocks, chart));
      return;
    }
    if (item.kind === "phrase") {
      insertText(item.phrase.content);
      return;
    }
  }, [insertText, chart]);

  // ── unique-shortcut direct insert ───────────────────────────────────
  // Used by the keystroke-driven path: the user types `/uri` and we insert
  // immediately when "uri" matches exactly one canonical trigger/shortcut
  // AND no other shortcut would extend the match (so further typing can't
  // disambiguate). The trailing-space path uses just findUniqueExactMatch.
  const allShortcuts = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const it of allItems) {
      if (it.kind === "builtin") it.def.triggers.forEach(t => set.add(t));
      else if (it.kind === "template" && it.tpl.shortcut) set.add(it.tpl.shortcut.toLowerCase());
      else if (it.kind === "phrase" && it.phrase.shortcut) set.add(it.phrase.shortcut.toLowerCase());
    }
    return Array.from(set);
  }, [allItems]);

  const findUniqueExactMatch = useCallback((q: string): SlashItem | null => {
    const matches = allItems.filter(it => {
      if (it.kind === "builtin") return it.def.triggers.includes(q);
      if (it.kind === "template") return (it.tpl.shortcut ?? "").toLowerCase() === q;
      return (it.phrase.shortcut ?? "").toLowerCase() === q;
    });
    return matches.length === 1 ? matches[0] : null;
  }, [allItems]);

  /** True iff some shortcut starts with `q` and is strictly longer than `q`. */
  const hasLongerPrefixMatch = useCallback((q: string): boolean => {
    return allShortcuts.some(s => s !== q && s.startsWith(q));
  }, [allShortcuts]);

  // Synchronous insertion used by the space-trigger path. We can't call
  // insertItem because it relies on cursor/slashStart state that hasn't been
  // committed yet.
  const insertItemAt = useCallback((item: SlashItem, slashIndex: number, endIndex: number) => {
    let payload = "";
    if (item.kind === "builtin") {
      const b = item.def;
      if (b.chart) payload = buildDefaultChartText(b.id as "ros" | "physical_exam");
      else if (b.list) {
        const items = chart && b.chartKey ? ((chart[b.chartKey] as string[] | undefined) ?? []) : [];
        payload = buildBulletSection(b.shortLabel, items);
      } else payload = `${b.shortLabel}:\n`;
    } else if (item.kind === "template") {
      const tplBlocks = (item.tpl.blocks ?? []) as TemplateBlockRender[];
      payload = renderTemplateBlocks(tplBlocks, chart);
    } else {
      payload = item.phrase.content;
    }
    const before = value.substring(0, slashIndex);
    const after = value.substring(endIndex);
    const needsLeadingNewline = before.length > 0 && !before.endsWith("\n");
    const insert = needsLeadingNewline ? "\n" + payload : payload;
    const newValue = before + insert + after;
    onChange(newValue);
    close();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newPos = before.length + insert.length;
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, chart, onChange, close, textareaRef]);

  // ── input handling ───────────────────────────────────────────────────
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = (e.target || e.currentTarget) as HTMLTextAreaElement;
    if (!ta || typeof ta.value !== "string") return;
    const pos = ta.selectionStart ?? ta.value.length;
    const text = ta.value;
    setCursorPos(pos);

    const textBefore = text.substring(0, pos);

    // Trailing-space path: user just typed a space after `/<word>` that
    // uniquely identifies an item. Swallow the space and insert.
    const auto = parseAutoInsertTrigger(textBefore);
    if (auto) {
      const exact = findUniqueExactMatch(auto.word);
      if (exact) {
        insertItemAt(exact, auto.slashIndex, pos);
        return;
      }
    }

    const trigger = parseSlashTrigger(textBefore);
    if (!trigger) {
      if (isOpen) close();
      return;
    }
    // Cede to /dx and /phrase dedicated dropdowns.
    if (trigger.isReserved) {
      if (isOpen) close();
      return;
    }

    // Direct-insert path: typing `/uri` triggers immediately when "uri" is a
    // unique exact match AND no longer shortcut starts with it (so further
    // typing can't disambiguate).
    if (trigger.query) {
      const exact = findUniqueExactMatch(trigger.query);
      if (exact && !hasLongerPrefixMatch(trigger.query)) {
        insertItemAt(exact, trigger.slashIndex, pos);
        return;
      }
    }

    setSlashStart(trigger.slashIndex);
    setSearchQuery(trigger.query);
    setSelectedIndex(0);

    if (!isOpen) {
      const rect = ta.getBoundingClientRect();
      const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
      const lineIndex = textBefore.split("\n").length - 1;
      const top = rect.top + (lineIndex * lineHeight) - ta.scrollTop + lineHeight + 4;
      const left = rect.left + 16;
      setTriggerPosition({
        top: Math.min(top, window.innerHeight - 360),
        left: Math.min(left, window.innerWidth - 420),
      });
      setIsOpen(true);
    }
  }, [isOpen, close, findUniqueExactMatch, hasLongerPrefixMatch, insertItemAt]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") {
      if (results[selectedIndex]) { e.preventDefault(); insertItem(results[selectedIndex]); }
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  }, [isOpen, results, selectedIndex, insertItem, close]);

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
      className="fixed z-[9999] w-[420px] max-h-[360px] overflow-y-auto rounded-md border bg-popover shadow-lg"
      style={{ top: triggerPosition.top, left: triggerPosition.left }}
      data-testid="slash-menu-dropdown"
    >
      <div className="sticky top-0 bg-popover border-b px-3 py-2 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">
          {searchQuery ? `Searching: "/${searchQuery}"` : "Type to filter — built-ins, templates, phrases"}
        </span>
      </div>
      {results.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No matches. Try /dx for diagnoses or /phrase for snippets.
        </div>
      ) : (
        results.map((item, i) => {
          const Icon = item.kind === "builtin" ? (item.def.chart ? Stethoscope : ListChecks)
                     : item.kind === "template" ? FileText
                     : MessageSquare;
          return (
            <button
              key={item.id}
              data-index={i}
              data-testid={`slash-menu-option-${item.id}`}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm cursor-pointer ${
                i === selectedIndex ? "bg-accent" : "hover-elevate"
              }`}
              onMouseDown={(e) => { e.preventDefault(); insertItem(item); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-foreground block truncate">
                  {item.label}
                </span>
                <span className="text-[11px] text-muted-foreground line-clamp-1 leading-snug">
                  {item.hint}
                </span>
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 mt-0.5 flex-shrink-0">
                {item.kind === "builtin" ? "Built-in" : item.kind}
              </span>
            </button>
          );
        })
      )}
      <div className="sticky bottom-0 bg-popover border-t px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">↑↓</kbd> navigate
          {" "}<kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Enter</kbd> insert
          {" "}<kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Esc</kbd> close
          {" "}· <code className="text-[9px] font-mono">/dx</code> &amp; <code className="text-[9px] font-mono">/phrase</code> still work
        </p>
      </div>
    </div>
  ) : null;

  return { handleInput, handleKeyDown, dropdown, isOpen };
}
