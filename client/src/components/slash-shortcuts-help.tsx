import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Sparkles, FileText, MessageSquare, Stethoscope, ListChecks } from "lucide-react";
import type { NoteTemplate, NotePhrase } from "@shared/schema";
import {
  BUILTIN_BLOCKS, type BuiltinBlockDef,
} from "@shared/note-builtin-blocks";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SlashShortcutsHelpProps {
  /** When set, only templates of this note type are listed. */
  noteType?: "soap_provider" | "nurse" | "phone";
  /** Optional element to use as the popover trigger (wrapped in PopoverTrigger
   *  via asChild). When omitted, a small ghost "?" icon button is rendered. */
  trigger?: React.ReactNode;
  /** Test id for the trigger button (only used for the default trigger). */
  triggerTestId?: string;
}

function builtinHint(b: BuiltinBlockDef): string {
  if (b.chart) return `Insert ${b.label.toLowerCase()} chart`;
  if (b.list) return `Insert ${b.label.toLowerCase()} (pulls from chart when available)`;
  return `Insert ${b.label.toLowerCase()} section`;
}

/** Quick-reference popover that lists every available `/` shortcut grouped by
 *  Built-in / Templates / Phrases. Only items that have an explicit shortcut
 *  trigger are listed — templates and phrases without a shortcut are still
 *  discoverable by typing `/` and searching by name. */
export function SlashShortcutsHelp({ noteType, trigger, triggerTestId }: SlashShortcutsHelpProps) {
  const { data: templates = [] } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates"],
    staleTime: 60_000,
  });
  const { data: phrases = [] } = useQuery<NotePhrase[]>({
    queryKey: ["/api/note-phrases"],
    staleTime: 60_000,
  });

  const filteredTemplates = (noteType
    ? templates.filter(t => t.noteType === noteType)
    : templates
  ).filter(t => !!t.shortcut);

  const phrasesWithShortcut = phrases.filter(p => !!p.shortcut);

  const triggerEl = trigger ?? (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-5 w-5"
      data-testid={triggerTestId ?? "button-slash-shortcuts-help"}
      aria-label="Show available slash shortcuts"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{triggerEl}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[420px] max-h-[480px] overflow-y-auto p-0"
        data-testid="popover-slash-shortcuts"
      >
        <div className="sticky top-0 bg-popover border-b px-3 py-2 flex items-center gap-2 z-10">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-semibold">Slash shortcuts</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Type <code className="font-mono">/</code> in any note field
          </span>
        </div>

        <Section
          icon={<Stethoscope className="w-3.5 h-3.5 text-muted-foreground" />}
          title="Built-in clinical blocks"
        >
          {BUILTIN_BLOCKS.map(b => (
            <ShortcutRow
              key={`builtin-${b.id}`}
              triggers={b.triggers}
              label={b.label}
              hint={builtinHint(b)}
              testId={`shortcut-builtin-${b.id}`}
            />
          ))}
          <ShortcutRow
            triggers={["dx"]}
            label="Diagnosis search"
            hint="Search ICD-10 diagnoses (dedicated picker)"
            testId="shortcut-builtin-dx"
          />
          <ShortcutRow
            triggers={["phrase"]}
            label="Phrase search"
            hint="Search saved phrases (dedicated picker)"
            testId="shortcut-builtin-phrase"
          />
        </Section>

        <Section
          icon={<FileText className="w-3.5 h-3.5 text-muted-foreground" />}
          title={`Templates${noteType ? " (this note type)" : ""}`}
          empty={
            filteredTemplates.length === 0
              ? "No templates with a shortcut yet — add one in Templates. (Templates without a shortcut are still searchable by typing / and the template name.)"
              : null
          }
        >
          {filteredTemplates.map(t => (
            <ShortcutRow
              key={`tpl-${t.id}`}
              triggers={[t.shortcut as string]}
              label={t.name}
              hint={
                t.description?.trim() ||
                `${(t.blocks?.length ?? 0)} block${(t.blocks?.length ?? 0) === 1 ? "" : "s"}`
              }
              testId={`shortcut-template-${t.id}`}
            />
          ))}
        </Section>

        <Section
          icon={<MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />}
          title="Phrases"
          empty={
            phrasesWithShortcut.length === 0
              ? "No phrases with a shortcut yet — add one in Phrases. (Phrases without a shortcut are still searchable by typing / and the phrase title.)"
              : null
          }
        >
          {phrasesWithShortcut.map(p => (
            <ShortcutRow
              key={`ph-${p.id}`}
              triggers={[p.shortcut as string]}
              label={p.title}
              hint={p.content.replace(/\s+/g, " ").slice(0, 90)}
              testId={`shortcut-phrase-${p.id}`}
            />
          ))}
        </Section>

        <div className="sticky bottom-0 bg-popover border-t px-3 py-2 z-10">
          <p className="text-[10px] text-muted-foreground leading-snug flex items-start gap-1">
            <ListChecks className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>
              Type <code className="font-mono">/word</code> to filter, then{" "}
              <kbd className="px-1 py-0.5 rounded border bg-muted text-[9px] font-mono">Enter</kbd>.
              Type <code className="font-mono">/word </code> (with a space) to insert a unique
              shortcut instantly.
            </span>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({
  icon, title, children, empty,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  empty?: string | null;
}) {
  return (
    <div className="px-2 py-2 border-b last:border-b-0">
      <div className="flex items-center gap-1.5 px-1 pb-1.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      {empty ? (
        <p className="px-1 py-1 text-[11px] text-muted-foreground italic">{empty}</p>
      ) : (
        <div className="space-y-0.5">{children}</div>
      )}
    </div>
  );
}

function ShortcutRow({
  triggers, label, hint, testId,
}: {
  triggers: string[];
  label: string;
  hint: string;
  testId: string;
}) {
  return (
    <div
      className="flex items-start gap-2 px-1 py-1 rounded-sm"
      data-testid={testId}
    >
      <div className="flex flex-wrap gap-1 flex-shrink-0 w-[120px]">
        {triggers.map(t => (
          <code
            key={t}
            className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono"
          >
            /{t}
          </code>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{label}</div>
        <div className="text-[10px] text-muted-foreground line-clamp-1 leading-snug">{hint}</div>
      </div>
    </div>
  );
}
