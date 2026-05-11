import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Heart, TrendingUp, Activity, Zap, Moon, Dna, AlertTriangle, CheckCircle, AlertCircle, Info,
} from "lucide-react";
import type {
  PREVENTRiskResult, AdjustedRiskAssessment, InsulinResistanceScreening,
  StopBangResult, MaleHormonePattern,
} from "@shared/schema";

function formatClinicalManagement(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/PROVIDER RECOMMENDATION:\s*/gi, '');
  const idx = cleaned.search(/PATIENT EDUCATION:/i);
  if (idx !== -1) cleaned = cleaned.substring(0, idx).trimEnd();
  return cleaned.trim();
}

// ─── Risk badge helper ─────────────────────────────────────────────────────
function RiskBadge({ category }: { category: string }) {
  switch (category) {
    case 'low': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">Low Risk</Badge>;
    case 'borderline': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Borderline</Badge>;
    case 'intermediate': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">Intermediate Risk</Badge>;
    case 'high': return <Badge variant="destructive">High Risk</Badge>;
    default: return <Badge variant="outline">{category}</Badge>;
  }
}

// ─── PREVENT Cardiovascular Assessment Card ────────────────────────────────
export function PreventAssessmentCard({ preventAssessment }: { preventAssessment: PREVENTRiskResult }) {
  return (
    <Card data-testid="card-prevent-assessment">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            <CardTitle>PREVENT Cardiovascular Risk Assessment</CardTitle>
          </div>
          <RiskBadge category={preventAssessment.riskCategory} />
        </div>
        <CardDescription>
          2023 AHA PREVENT Equations — 10/30-year risk for Total CVD, ASCVD, and Heart Failure
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            10-Year Risk Predictions
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 border">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Total CVD Risk</p>
              <span className="text-3xl font-bold font-mono" data-testid="text-10yr-cvd">{preventAssessment.tenYearCVDPercentage}</span>
              <p className="text-xs text-muted-foreground mt-1">Heart attack, stroke &amp; heart failure</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">ASCVD Risk</p>
              <span className="text-3xl font-bold font-mono" data-testid="text-10yr-ascvd">{preventAssessment.tenYearASCVDPercentage}</span>
              <p className="text-xs text-muted-foreground mt-1">Atherosclerotic CVD only</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Heart Failure Risk</p>
              <span className="text-3xl font-bold font-mono" data-testid="text-10yr-hf">{preventAssessment.tenYearHFPercentage}</span>
              <p className="text-xs text-muted-foreground mt-1">Heart failure alone</p>
            </div>
          </div>
        </div>

        {preventAssessment.thirtyYearCVDPercentage && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              30-Year Risk Predictions (Ages 30–59)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Total CVD Risk', value: preventAssessment.thirtyYearCVDPercentage, testid: 'text-30yr-cvd' },
                { label: 'ASCVD Risk', value: preventAssessment.thirtyYearASCVDPercentage, testid: 'text-30yr-ascvd' },
                { label: 'Heart Failure Risk', value: preventAssessment.thirtyYearHFPercentage, testid: 'text-30yr-hf' },
              ].map(({ label, value, testid }) => (
                <div key={label} className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{label}</p>
                  <span className="text-2xl font-bold font-mono" data-testid={testid}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="space-y-4">
          {preventAssessment.ldlGoal && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">LDL Target</p>
              <p className="text-sm font-semibold" data-testid="text-prevent-ldl-goal">{preventAssessment.ldlGoal}</p>
            </div>
          )}
          {preventAssessment.statinRecommendation && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Statin Therapy</p>
              <p className="text-sm bg-muted/50 p-3 rounded-md" data-testid="text-prevent-statin">
                {formatClinicalManagement(preventAssessment.statinRecommendation)}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Considerations</p>
            <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-prevent-recommendations">
              {formatClinicalManagement(preventAssessment.recommendations)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Advanced Lipids / Atherogenic Risk Adjustment Card ───────────────────
export function AdvancedLipidsCard({ adjustedRiskAssessment }: { adjustedRiskAssessment: AdjustedRiskAssessment }) {
  return (
    <Card data-testid="card-adjusted-risk">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <CardTitle>Atherogenic Marker Risk Adjustment</CardTitle>
          </div>
          {adjustedRiskAssessment.adjustedCategory === 'reclassified_upward' ? (
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800" data-testid="badge-reclassified">
              Risk Reclassified Upward
            </Badge>
          ) : (
            <RiskBadge category={adjustedRiskAssessment.adjustedCategory} />
          )}
        </div>
        <CardDescription>
          PREVENT risk adjusted for atherogenic markers — ApoB and Lp(a) reclassification
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/30 border">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Base 10yr ASCVD</p>
            <span className="text-2xl font-bold font-mono" data-testid="text-base-ascvd">
              {adjustedRiskAssessment.baseASCVDRisk.toFixed(1)}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">From PREVENT calculator</p>
          </div>
          {adjustedRiskAssessment.apoBValue !== undefined && (
            <div className={`p-4 rounded-lg border ${
              adjustedRiskAssessment.apoBStatus === 'elevated'
                ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                : adjustedRiskAssessment.apoBStatus === 'borderline'
                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                : 'bg-muted/30'
            }`}>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">ApoB</p>
              <span className={`text-2xl font-bold font-mono ${
                adjustedRiskAssessment.apoBStatus === 'elevated' ? 'text-orange-600 dark:text-orange-400' :
                adjustedRiskAssessment.apoBStatus === 'borderline' ? 'text-amber-600 dark:text-amber-400' : ''
              }`} data-testid="text-apob">
                {adjustedRiskAssessment.apoBValue} mg/dL
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {adjustedRiskAssessment.apoBStatus === 'elevated' ? 'Elevated (≥130 mg/dL)' :
                 adjustedRiskAssessment.apoBStatus === 'borderline' ? 'Borderline (90–129 mg/dL)' : 'Optimal (<90 mg/dL)'}
              </p>
            </div>
          )}
          {adjustedRiskAssessment.lpaValue !== undefined && (
            <div className={`p-4 rounded-lg border ${
              adjustedRiskAssessment.lpaStatus === 'elevated'
                ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
                : adjustedRiskAssessment.lpaStatus === 'borderline'
                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                : 'bg-muted/30'
            }`}>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Lp(a)</p>
              <span className={`text-2xl font-bold font-mono ${
                adjustedRiskAssessment.lpaStatus === 'elevated' ? 'text-orange-600 dark:text-orange-400' :
                adjustedRiskAssessment.lpaStatus === 'borderline' ? 'text-amber-600 dark:text-amber-400' : ''
              }`} data-testid="text-lpa">
                {adjustedRiskAssessment.lpaValue} {adjustedRiskAssessment.lpaValue >= 200 ? 'nmol/L' : 'mg/dL'}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {adjustedRiskAssessment.lpaStatus === 'elevated' ? 'Elevated (≥50 mg/dL)' :
                 adjustedRiskAssessment.lpaStatus === 'borderline' ? 'Borderline (40–49 mg/dL)' : 'Optimal (<40 mg/dL)'}
              </p>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Guidance</p>
            <p className="text-sm bg-muted/50 p-3 rounded-md leading-relaxed" data-testid="text-adjusted-guidance">
              {formatClinicalManagement(adjustedRiskAssessment.clinicalGuidance)}
            </p>
          </div>
          {adjustedRiskAssessment.cacRecommendation && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">CAC Scoring</p>
              <p className="text-sm" data-testid="text-cac-rec">
                {formatClinicalManagement(adjustedRiskAssessment.cacRecommendation)}
              </p>
            </div>
          )}
          {adjustedRiskAssessment.statinGuidance && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Statin Therapy</p>
              <p className="text-sm" data-testid="text-statin-guidance">
                {formatClinicalManagement(adjustedRiskAssessment.statinGuidance)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── STOP-BANG Sleep Apnea Assessment Card ─────────────────────────────────
export function StopBangCard({ stopBangRisk }: { stopBangRisk: StopBangResult }) {
  const riskColors = {
    low: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800',
    intermediate: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  };
  const riskLabel = {
    low: 'Low Risk',
    intermediate: 'Intermediate Risk',
    high: 'High Risk',
  };

  return (
    <Card data-testid="card-stopbang-assessment">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-primary" />
            <CardTitle>STOP-BANG Sleep Apnea Screening</CardTitle>
          </div>
          <Badge variant="outline" className={riskColors[stopBangRisk.riskCategory]} data-testid="badge-stopbang-risk">
            {riskLabel[stopBangRisk.riskCategory]}
          </Badge>
        </div>
        <CardDescription>
          Validated 8-point screening tool for obstructive sleep apnea — score: {stopBangRisk.score}/8
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-lg bg-muted/30 border text-center min-w-[80px]">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Score</p>
            <span className="text-4xl font-bold font-mono" data-testid="text-stopbang-score">{stopBangRisk.score}</span>
            <p className="text-xs text-muted-foreground mt-1">out of 8</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium mb-1" data-testid="text-stopbang-description">{stopBangRisk.riskDescription}</p>
            <p className="text-xs text-muted-foreground">
              {stopBangRisk.riskCategory === 'low' && 'Score 0–2: Low probability of moderate-to-severe OSA (~7%)'}
              {stopBangRisk.riskCategory === 'intermediate' && 'Score 3–4: Intermediate probability of moderate-to-severe OSA (~25%)'}
              {stopBangRisk.riskCategory === 'high' && 'Score 5–8: High probability of moderate-to-severe OSA (~54%)'}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Recommendations</p>
            <p className="text-sm leading-relaxed" data-testid="text-stopbang-recommendations">
              {stopBangRisk.recommendations}
            </p>
          </div>
          {stopBangRisk.clinicalGuidance && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Guidance</p>
              <p className="text-sm bg-muted/50 p-3 rounded-md leading-relaxed" data-testid="text-stopbang-guidance">
                {stopBangRisk.clinicalGuidance}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Male Hormone Assessment Card ─────────────────────────────────────────
export function MaleHormoneAssessmentCard({ patterns }: { patterns: MaleHormonePattern[] }) {
  const confidenceStyles = {
    high: 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800',
    moderate: 'border-indigo-200 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-800',
    low: 'border-muted bg-muted/20',
  };
  const confidenceBadgeStyles = {
    high: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    moderate: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
    low: 'bg-muted text-muted-foreground',
  };

  return (
    <Card data-testid="card-male-hormone-assessment">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Dna className="w-5 h-5 text-primary" />
          <CardTitle>Male Hormone Assessment</CardTitle>
        </div>
        <CardDescription>
          Pattern-recognition framework for testosterone optimization and male hormone evaluation.{' '}
          <span className="text-muted-foreground">
            Patterns are clinical guides — not standalone diagnoses. Always incorporate symptoms, repeat morning testing, age, medications, and overall clinical context.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {patterns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hormone patterns detected from the submitted lab values. Submit testosterone, LH, SHBG, free testosterone, or estradiol to enable pattern recognition.
          </p>
        ) : (
          patterns.map((pattern, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border space-y-3 ${confidenceStyles[pattern.confidence]}`}
              data-testid={`male-hormone-pattern-${idx}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h4 className="font-semibold text-sm">{pattern.name}</h4>
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${confidenceBadgeStyles[pattern.confidence]}`}>
                  {pattern.confidence} confidence
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Matched Findings</p>
                  <ul className="space-y-0.5">
                    {pattern.matchedFindings.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Common Clinical Features</p>
                  <p>{pattern.clinicalFeatures}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Interpretation</p>
                  <p>{pattern.interpretation}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Considerations</p>
                  <p className="text-muted-foreground">{pattern.clinicalConsiderations}</p>
                </div>
              </div>
            </div>
          ))
        )}

        <div className="text-xs text-muted-foreground border-t pt-3 mt-2">
          These phenotypes work best when paired with AI-driven pattern recognition that evaluates symptoms, labs, metabolic markers, medications, sleep, and longitudinal trends simultaneously — not isolated testosterone values alone.
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Female Hormone / Clinical Phenotype Assessment Card ──────────────────
interface ClinicalPhenotype {
  name: string;
  confidence: 'high' | 'moderate' | 'low';
  description: string;
  supportingFindings: string[];
}

export function FemaleHormoneAssessmentCard({ phenotypes }: { phenotypes: ClinicalPhenotype[] }) {
  const confidenceStyles = {
    high: 'border-purple-300 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800',
    moderate: 'border-indigo-200 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-800',
    low: 'border-muted bg-muted/20',
  };
  const confidenceBadgeStyles = {
    high: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    moderate: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
    low: 'bg-muted text-muted-foreground',
  };

  return (
    <Card data-testid="card-female-hormone-assessment">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Dna className="w-5 h-5 text-purple-600" />
          <CardTitle>Hormone Assessment</CardTitle>
        </div>
        <CardDescription>
          Detected clinical phenotypes driving hormone interpretation, supplement, and treatment recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {phenotypes.map((phenotype, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${confidenceStyles[phenotype.confidence]}`}
              data-testid={`clinical-phenotype-${index}`}
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h4 className="font-semibold text-sm">{phenotype.name}</h4>
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${confidenceBadgeStyles[phenotype.confidence]}`}>
                  {phenotype.confidence} confidence
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{phenotype.description}</p>
              <div className="flex flex-wrap gap-1">
                {phenotype.supportingFindings.map((finding, fIdx) => (
                  <span key={fIdx} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {finding}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Insulin Resistance / Phenotype Assessment Card ───────────────────────
export function InsulinResistanceCard({ insulinResistance }: { insulinResistance: InsulinResistanceScreening }) {
  if (insulinResistance.likelihood === 'none') return null;

  return (
    <Card data-testid="card-insulin-resistance">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <CardTitle>Phenotype Assessment — Insulin Resistance Screening</CardTitle>
          </div>
          {insulinResistance.likelihood === 'high' ? (
            <Badge variant="destructive" data-testid="badge-ir-high">High Likelihood</Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800" data-testid="badge-ir-moderate">Moderate Likelihood</Badge>
          )}
        </div>
        <CardDescription>
          {insulinResistance.positiveCount} of 6 screening markers positive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold mb-3">Screening Markers</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {insulinResistance.markers.map((marker, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${marker.positive ? 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' : 'bg-muted/30'}`}
                data-testid={`ir-marker-${idx}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">{marker.name}</p>
                  {marker.positive
                    ? <AlertCircle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                    : <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />}
                </div>
                <span className={`text-lg font-bold font-mono ${marker.positive ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                  {marker.value}
                </span>
                <p className="text-xs text-muted-foreground mt-1">Threshold: {marker.threshold}</p>
              </div>
            ))}
          </div>
        </div>

        {insulinResistance.phenotypes.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Identified Phenotype(s)</h4>
              {insulinResistance.phenotypes.map((phenotype, idx) => (
                <div key={idx} className="space-y-3 p-4 rounded-lg bg-muted/30 border" data-testid={`ir-phenotype-${idx}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{phenotype.name}</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Diagnostic Criteria Met</p>
                    <ul className="text-sm space-y-0.5">
                      {phenotype.matchedCriteria.map((c, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Pathophysiology</p>
                    <p className="text-sm">{phenotype.pathophysiology}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Treatment Plan</p>
                    <ul className="text-sm space-y-0.5">
                      {phenotype.treatmentRecommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-primary mt-0.5 shrink-0">–</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Monitoring</p>
                    <p className="text-sm">{phenotype.monitoringPlan}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {insulinResistance.confirmationTests && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Confirmatory Testing</p>
              <p className="text-sm bg-muted/50 p-3 rounded-md" data-testid="text-ir-confirmation">
                {insulinResistance.confirmationTests}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
