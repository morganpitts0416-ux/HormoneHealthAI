import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, AlertCircle, Info, AlertOctagon, Clock, ChevronDown, ChevronRight, Sparkles, Eye, EyeOff } from "lucide-react";
import type { LabInterpretation, RedFlag } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SCREENING_CATEGORY_PREFIXES = [
  'PREVENT',
  'Sleep Apnea Risk',
  'Insulin Resistance Screening',
  '10-Year',
  '30-Year',
];

// Pattern/assessment categories that belong in dedicated hormone assessment cards,
// not in the main lab value marker table.
const HORMONE_PATTERN_PREFIXES = [
  'Testosterone Pattern',
  'Perimenopause Assessment:',
  'Hormone Pattern:',
];

function isScreeningRow(category: string): boolean {
  return SCREENING_CATEGORY_PREFIXES.some(prefix =>
    category.startsWith(prefix) || category.includes('(PREVENT)') || category.includes('STOP-BANG')
  );
}

function isHormonePatternRow(category: string): boolean {
  return HORMONE_PATTERN_PREFIXES.some(prefix => category.startsWith(prefix));
}

// Markers that have rich dedicated assessment sections elsewhere on the page.
// In the summary table we only show a brief one-liner; full detail lives in the
// Detailed Clinical Assessment cards and the hormone/thyroid assessment panels.
const DEDICATED_SECTION_MARKERS = [
  'Testosterone', 'Free Testosterone', 'Bioavailable Testosterone',
  'Estradiol', 'Progesterone', 'LH', 'FSH', 'Prolactin', 'SHBG', 'AMH',
  'DHEA-S', 'DHEA', 'TSH', 'Free T4', 'Free T3', 'Total T3',
  'TPO Antibodies', 'Anti-Thyroglobulin',
  'Iron Saturation', 'TIBC', 'Ferritin', 'Serum Iron',
];

function hasDedicatedSection(category: string): boolean {
  return DEDICATED_SECTION_MARKERS.some(marker =>
    category === marker ||
    category.startsWith(marker + ' (') ||
    category.startsWith(marker + ':')
  );
}

/** First sentence of text, capped at maxLen chars. */
function firstSentence(text: string, maxLen = 120): string {
  if (!text) return text;
  const m = text.match(/^[^.!?]+[.!?]+/);
  const s = m ? m[0].trim() : text.substring(0, maxLen).trim();
  return s.length < text.length ? s : s;
}

function formatClinicalManagement(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/PROVIDER RECOMMENDATION:\s*/gi, '');
  const patientEdIndex = cleaned.search(/PATIENT EDUCATION:/i);
  if (patientEdIndex !== -1) {
    cleaned = cleaned.substring(0, patientEdIndex).trimEnd();
  }
  return cleaned.trim();
}

/** Abbreviated management text for use in the summary table. */
function tableManagement(text: string, category: string): string {
  const full = formatClinicalManagement(text);
  if (!full || !hasDedicatedSection(category)) return full;
  return firstSentence(full);
}

/** Abbreviated interpretation text for use in the summary table. */
function tableInterpretation(text: string, category: string): string {
  if (!text || !hasDedicatedSection(category)) return text;
  return firstSentence(text);
}

function briefFollowUpSummary(aiText: string, recheckWindow: string): string {
  if (!aiText) return recheckWindow;
  const sentences = aiText.match(/[^.!?]+[.!?]+/g) ?? [];
  const followUpKeywords = /follow.?up|recheck|repeat|monitor|schedule|refer|return|next visit|interval/i;
  const relevant = sentences.filter(s => followUpKeywords.test(s)).slice(0, 3);
  if (relevant.length > 0) return relevant.join(' ').trim();
  return sentences.slice(0, 2).join(' ').trim() || aiText.substring(0, 250).trim();
}

interface ResultsDisplayProps {
  interpretations: LabInterpretation[];
  aiRecommendations: string;
  recheckWindow: string;
  redFlags?: RedFlag[];
  hiddenCategories?: string[];
  onToggleCategory?: (category: string) => void;
}

export function ResultsDisplay({
  interpretations,
  aiRecommendations,
  recheckWindow,
  redFlags = [],
  hiddenCategories = [],
  onToggleCategory,
}: ResultsDisplayProps) {
  const [synthesisOpen, setSynthesisOpen] = useState(false);

  const tableRows = interpretations.filter(i => !isScreeningRow(i.category) && !isHormonePatternRow(i.category));
  const abnormalResults = tableRows.filter(i => i.status !== 'normal');

  const hasRedFlag = (category: string) =>
    redFlags.some(f =>
      f.category.toLowerCase().includes(category.toLowerCase()) ||
      category.toLowerCase().includes(f.category.toLowerCase())
    );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-500" />;
      case 'borderline': return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />;
      case 'abnormal': return <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-500" />;
      case 'critical': return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'normal': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">Normal</Badge>;
      case 'borderline': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Borderline</Badge>;
      case 'abnormal': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">Abnormal</Badge>;
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const followUpText = briefFollowUpSummary(aiRecommendations, recheckWindow);

  return (
    <div className="space-y-6">
      {/* ── Marker Table ────────────────────────────────────────────────────── */}
      <Card data-testid="card-results-overview">
        <CardHeader>
          <CardTitle>Clinical Interpretation Summary</CardTitle>
          <CardDescription>
            All submitted lab values assessed against optimized clinical ranges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Marker</TableHead>
                  <TableHead className="w-[120px]">Value</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[140px]">Reference Range</TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Management</TableHead>
                  <TableHead className="w-[60px] text-center">Alert</TableHead>
                  {onToggleCategory && <TableHead className="w-[36px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={onToggleCategory ? 8 : 7} className="text-center text-muted-foreground py-8">
                      No lab results to display
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((interp, index) => {
                    const isRedFlag = hasRedFlag(interp.category);
                    const isHidden = hiddenCategories.includes(interp.category);
                    return (
                      <TableRow
                        key={index}
                        data-testid={`table-row-${index}`}
                        className={cn(
                          isRedFlag ? 'bg-destructive/5' : '',
                          isHidden ? 'opacity-40 bg-amber-50/30 dark:bg-amber-950/10' : ''
                        )}
                      >
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(interp.status)}
                            <span className={cn(isHidden && 'line-through text-muted-foreground')}>{interp.category}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {interp.value !== undefined ? (
                            <span className="font-mono font-semibold">
                              {typeof interp.value === 'number' && interp.unit === '%'
                                ? interp.value.toFixed(1)
                                : typeof interp.value === 'number'
                                ? Number.isInteger(interp.value) ? interp.value : interp.value.toFixed(1)
                                : interp.value}{' '}
                              <span className="text-xs text-muted-foreground">{interp.unit}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(interp.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{interp.referenceRange}</TableCell>
                        <TableCell className="text-sm">{tableInterpretation(interp.interpretation, interp.category)}</TableCell>
                        <TableCell className="text-sm">{tableManagement(interp.recommendation, interp.category)}</TableCell>
                        <TableCell className="text-center">
                          {isRedFlag && (
                            <AlertOctagon className="w-5 h-5 text-destructive inline-block" data-testid={`red-flag-${index}`} />
                          )}
                        </TableCell>
                        {onToggleCategory && (
                          <TableCell className="text-center p-1">
                            <button
                              type="button"
                              onClick={() => onToggleCategory(interp.category)}
                              title={isHidden ? 'Show to patient' : 'Hide from patient'}
                              className={cn(
                                "p-1 rounded transition-colors",
                                isHidden
                                  ? "text-amber-600 hover:text-amber-700 dark:text-amber-400"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Detailed Clinical Assessment ─────────────────────────────────── */}
      <Card data-testid="card-lab-results">
        <CardHeader>
          <CardTitle>Detailed Clinical Assessment</CardTitle>
          <CardDescription>
            Findings requiring clinical attention with protocol-based management guidance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {abnormalResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No findings require action at this time. All submitted markers are within acceptable ranges.</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Findings Requiring Action ({abnormalResults.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {abnormalResults.map((interp, index) => (
                  <Card key={index} className="hover-elevate" data-testid={`result-abnormal-${index}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(interp.status)}
                          <CardTitle className="text-base">{interp.category}</CardTitle>
                        </div>
                        {getStatusBadge(interp.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {interp.value !== undefined && (
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-mono font-semibold">{interp.value}</span>
                            <span className="text-sm text-muted-foreground">{interp.unit}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Ref: {interp.referenceRange}</p>
                        </div>
                      )}
                      <Separator />
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Assessment</p>
                          <p className="text-sm">{interp.interpretation}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Management</p>
                          <p className="text-sm">{formatClinicalManagement(interp.recommendation)}</p>
                        </div>
                        {interp.recheckTiming && (
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Follow-up</p>
                            <p className="text-sm font-medium text-primary">{interp.recheckTiming}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* AI Clinical Synthesis — collapsed by default */}
          {aiRecommendations && (
            <>
              <Separator />
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSynthesisOpen(v => !v)}
                  className="w-full flex items-center justify-between gap-2 group"
                  data-testid="button-toggle-ai-synthesis"
                >
                  <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    AI Clinical Synthesis
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {synthesisOpen ? (
                      <><ChevronDown className="w-3.5 h-3.5" />Collapse</>
                    ) : (
                      <><ChevronRight className="w-3.5 h-3.5" />Read full synthesis</>
                    )}
                  </span>
                </button>
                {synthesisOpen && (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-md p-4" data-testid="section-ai-synthesis">
                    {aiRecommendations}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Follow-up Recommendations ─────────────────────────────────────── */}
      <Card data-testid="card-followup-plan">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <CardTitle>Follow-up Recommendations</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">Monitoring Interval:</span>
            <Badge variant="outline" className="font-mono text-sm">{recheckWindow}</Badge>
          </div>
          {followUpText && followUpText !== recheckWindow && (
            <p className="text-sm leading-relaxed text-muted-foreground">{followUpText}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
