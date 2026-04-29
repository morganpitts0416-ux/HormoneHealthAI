import { useState, type ReactElement } from "react";
import { Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EvidenceSuggestion } from "@shared/schema";

const MAJOR_SECTIONS = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT\/PLAN|CARE PLAN|FOLLOW-UP|FOLLOW UP)$/i;
const ASSESSMENT_SECTION = /^(ASSESSMENT\/PLAN|ASSESSMENT)$/i;
const CC_LINE = /^CC\/Reason:\s*(.*)/i;
const SUB_LABEL = /^([A-Z][A-Za-z\s\/\-]+):(\s*.*)$/;
const ROS_HEADER = /^(ROS|REVIEW OF SYSTEMS)\s*:?\s*$/i;
const ROS_SYSTEMS = new Set([
  "constitutional", "heent", "cardiovascular", "respiratory",
  "gastrointestinal", "genitourinary", "musculoskeletal", "skin",
  "neurological", "psychiatric", "endocrine",
  "hematologic/lymphatic", "allergic/immunologic",
]);

const guidelineClassBadge: Record<string, string> = {
  "I":   "bg-emerald-50 border-emerald-200 text-emerald-800",
  "IIa": "bg-blue-50 border-blue-200 text-blue-800",
  "IIb": "bg-amber-50 border-amber-200 text-amber-800",
  "III": "bg-red-50 border-red-200 text-red-800",
};

export function EvidenceCard({ sug }: { sug: EvidenceSuggestion }) {
  const strengthColors: Record<string, string> = {
    strong:       "bg-emerald-50 text-emerald-700 border-emerald-200",
    moderate:     "bg-blue-50 text-blue-700 border-blue-200",
    limited:      "bg-amber-50 text-amber-700 border-amber-200",
    mixed:        "bg-orange-50 text-orange-700 border-orange-200",
    insufficient: "bg-slate-50 text-slate-600 border-slate-200",
  };
  const alignmentIcons: Record<string, string> = {
    aligned:            "Aligned",
    gap_identified:     "Gap identified",
    potential_conflict: "Potential conflict",
    not_applicable:     "Not applicable",
  };
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug">{sug.title}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {sug.guideline_class && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${guidelineClassBadge[sug.guideline_class] ?? guidelineClassBadge["III"]}`}>
              Class {sug.guideline_class}
            </span>
          )}
          {sug.level_of_evidence && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-muted-foreground/30 text-muted-foreground">
              LOE {sug.level_of_evidence}
            </span>
          )}
        </div>
      </div>

      {sug.strength_of_support && (
        <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded border ${strengthColors[sug.strength_of_support] ?? strengthColors.limited}`}>
          {sug.strength_of_support.charAt(0).toUpperCase() + sug.strength_of_support.slice(1)} evidence
        </span>
      )}

      <p className="text-xs text-foreground/80 leading-relaxed">{sug.summary}</p>

      {sug.plan_alignment && sug.plan_alignment !== "not_applicable" && (
        <p className={`text-[10px] font-medium ${sug.plan_alignment === "aligned" ? "text-emerald-600" : sug.plan_alignment === "potential_conflict" ? "text-red-600" : "text-amber-600"}`}>
          {alignmentIcons[sug.plan_alignment]}
          {sug.plan_alignment_note ? ` — ${sug.plan_alignment_note}` : ""}
        </p>
      )}

      {sug.cautions?.length > 0 && (
        <div className="rounded bg-amber-50/60 border border-amber-100 px-2 py-1.5">
          {sug.cautions.map((c: string, i: number) => (
            <p key={i} className="text-[10px] text-amber-800 leading-snug">{c}</p>
          ))}
        </div>
      )}

      {sug.citations?.length > 0 && (
        <div className="space-y-0.5 pt-0.5 border-t border-muted/40">
          {sug.citations.map((cit: any, i: number) => (
            <p key={i} className="text-[10px] text-muted-foreground leading-snug">
              {cit.source}{cit.year ? ` (${cit.year})` : ""}
              {cit.doi ? (
                <a href={`https://doi.org/${cit.doi}`} target="_blank" rel="noopener noreferrer"
                  className="ml-1 text-primary/70 hover:text-primary underline-offset-2 hover:underline">DOI</a>
              ) : null}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceFlagButton({ suggestions }: { suggestions: EvidenceSuggestion[] }) {
  const [open, setOpen] = useState(false);
  const count = suggestions.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="evidence-flag-btn"
          className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-semibold cursor-pointer align-middle select-none border border-primary/25 bg-primary/8 text-primary/75 hover:bg-primary/15 hover:border-primary/40 hover:text-primary transition-all duration-150"
          style={{ verticalAlign: "middle", lineHeight: 1 }}
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        >
          <Sparkles className="w-2.5 h-2.5 flex-shrink-0" />
          {count > 1 ? `${count} citations` : "Evidence"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-0 shadow-lg"
        side="right"
        align="start"
        sideOffset={8}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/5">
          <Sparkles className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Clinical Evidence</p>
            <p className="text-[10px] text-muted-foreground">Informational — not auto-inserted into chart</p>
          </div>
        </div>
        <div className="divide-y divide-muted/40 max-h-[420px] overflow-y-auto">
          {suggestions.map((sug, i) => (
            <div key={i} className="px-3 py-2.5">
              <EvidenceCard sug={sug} />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EvidenceCallout({ sug }: { sug: EvidenceSuggestion }) {
  return (
    <div className="ml-4 mr-1 my-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
      <EvidenceCard sug={sug} />
    </div>
  );
}

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !["about","which","these","their","there","should","would","could","after","before","since","where","while","other","every","using","based"].includes(w));
}

export function SoapNoteViewer({ text, evidence, mode = "flags" }: {
  text: string;
  evidence?: EvidenceSuggestion[];
  mode?: "flags" | "callouts";
}) {
  const lines = text.split("\n");
  const nodes: ReactElement[] = [];
  let inAssessmentPlan = false;
  let inNumberedItem = false;
  const usedIndices = new Set<number>();

  function matchEvidence(lineText: string): EvidenceSuggestion[] {
    if (!evidence?.length) return [];
    const words = extractKeywords(lineText);
    const matched: EvidenceSuggestion[] = [];
    evidence.forEach((sug, idx) => {
      if (usedIndices.has(idx)) return;
      const haystack = extractKeywords(sug.title + " " + sug.relevance_to_visit + " " + sug.summary);
      if (words.some(w => haystack.includes(w))) {
        usedIndices.add(idx);
        matched.push(sug);
      }
    });
    return matched;
  }

  function renderEvidenceFor(lineText: string, key: string): ReactElement[] {
    const matched = matchEvidence(lineText);
    if (!matched.length) return [];
    if (mode === "flags") {
      return [<EvidenceFlagButton key={`${key}-flag`} suggestions={matched} />];
    }
    return matched.map((sug, si) => <EvidenceCallout key={`${key}-${si}`} sug={sug} />);
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) { nodes.push(<div key={i} className="h-1" />); continue; }

    const ccMatch = trimmed.match(CC_LINE);
    if (ccMatch) {
      nodes.push(
        <div key={i} className="soap-cc">
          <span className="soap-label">Chief Complaint / Reason for Visit — </span>
          {ccMatch[1]}
        </div>
      );
      continue;
    }

    if (MAJOR_SECTIONS.test(trimmed)) {
      inAssessmentPlan = ASSESSMENT_SECTION.test(trimmed);
      inNumberedItem = false;
      nodes.push(<span key={i} className="soap-section-major">{trimmed}</span>);
      continue;
    }

    // Detect ROS header — render the following system rows as a true 2-column chart.
    if (ROS_HEADER.test(trimmed)) {
      nodes.push(
        <p key={`${i}-ros-label`} className="soap-body">
          <span className="soap-label">ROS</span>
        </p>
      );
      const rows: { system: string; findings: string }[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const rawNext = lines[j];
        const next = rawNext.trim();
        if (!next) { j++; continue; }
        if (MAJOR_SECTIONS.test(next)) break;
        const m = next.match(SUB_LABEL);
        if (!m) break;
        const sysName = m[1].trim();
        if (!ROS_SYSTEMS.has(sysName.toLowerCase())) break;
        rows.push({ system: sysName, findings: m[2].trim() });
        j++;
      }
      if (rows.length > 0) {
        nodes.push(
          <div
            key={`${i}-ros-grid`}
            className="soap-ros-grid grid grid-cols-[minmax(140px,180px)_1fr] gap-x-3 gap-y-1.5 my-1.5 border border-border/50 rounded-md overflow-hidden"
            data-testid="ros-chart"
          >
            {rows.map((r, ri) => (
              <div key={`ros-row-${ri}`} className="contents">
                <div
                  className={`soap-label text-xs px-2.5 py-1.5 bg-muted/30 ${ri < rows.length - 1 ? "border-b border-border/40" : ""}`}
                  data-testid={`ros-system-${r.system.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                  {r.system}
                </div>
                <div
                  className={`text-xs px-2.5 py-1.5 ${ri < rows.length - 1 ? "border-b border-border/40" : ""} ${/not addressed at this visit/i.test(r.findings) ? "text-muted-foreground italic" : "text-foreground"}`}
                  data-testid={`ros-findings-${r.system.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                  {r.findings || "—"}
                </div>
              </div>
            ))}
          </div>
        );
        i = j - 1; // advance past consumed rows
        continue;
      }
      // No system rows followed — fall through to default rendering.
    }

    const subMatch = trimmed.match(SUB_LABEL);
    if (subMatch && subMatch[1].length < 32) {
      nodes.push(
        <p key={i} className="soap-body">
          <span className="soap-label">{subMatch[1]}: </span>
          {subMatch[2].trim()}
        </p>
      );
      continue;
    }

    if (trimmed.startsWith("-") || trimmed.startsWith("•")) {
      const bulletText = trimmed.slice(1).trim();
      const evNodes = (inAssessmentPlan && inNumberedItem) ? renderEvidenceFor(bulletText, `b${i}`) : [];
      nodes.push(
        <p key={i} className="soap-body pl-4">
          <span className="text-primary/60 mr-1 select-none">·</span>
          {bulletText}
          {mode === "flags" && evNodes}
        </p>
      );
      if (mode === "callouts") nodes.push(...evNodes);
      continue;
    }

    if (/^\d+\./.test(trimmed)) {
      inNumberedItem = true;
      const evNodes = inAssessmentPlan ? renderEvidenceFor(trimmed, `n${i}`) : [];
      nodes.push(
        <p key={i} className="soap-body font-semibold mt-1">
          {trimmed}
          {mode === "flags" && evNodes}
        </p>
      );
      if (mode === "callouts") nodes.push(...evNodes);
      continue;
    }

    const evNodes = (inAssessmentPlan && inNumberedItem) ? renderEvidenceFor(trimmed, `p${i}`) : [];
    nodes.push(
      <p key={i} className="soap-body">
        {trimmed}
        {mode === "flags" && evNodes}
      </p>
    );
    if (mode === "callouts") nodes.push(...evNodes);
  }

  if (evidence?.length) {
    const unmatched = evidence.filter((_, idx) => !usedIndices.has(idx));
    if (unmatched.length) {
      if (mode === "callouts") {
        nodes.push(
          <div key="ev-unmatched-header" className="mt-3 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Additional Evidence</span>
          </div>
        );
        unmatched.forEach((sug, i) =>
          nodes.push(<EvidenceCallout key={`ev-um-${i}`} sug={sug} />)
        );
      }
    }
  }

  return <div className="soap-rendered">{nodes}</div>;
}
