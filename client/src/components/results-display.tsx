import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, AlertCircle, Info, AlertOctagon, Activity, Heart, TrendingUp } from "lucide-react";
import type { LabInterpretation, RedFlag, ASCVDRiskResult, PREVENTRiskResult, AdjustedRiskAssessment } from "@shared/schema";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ResultsDisplayProps {
  interpretations: LabInterpretation[];
  aiRecommendations: string;
  recheckWindow: string;
  redFlags?: RedFlag[];
  ascvdAssessment?: ASCVDRiskResult | null;
  preventAssessment?: PREVENTRiskResult | null;
  adjustedRiskAssessment?: AdjustedRiskAssessment | null;
}

export function ResultsDisplay({ interpretations, aiRecommendations, recheckWindow, redFlags = [], ascvdAssessment = null, preventAssessment = null, adjustedRiskAssessment = null }: ResultsDisplayProps) {
  const getRiskBadge = (category: string) => {
    switch (category) {
      case 'low':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" data-testid="badge-risk-low">Low Risk</Badge>;
      case 'borderline':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800" data-testid="badge-risk-borderline">Borderline</Badge>;
      case 'intermediate':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800" data-testid="badge-risk-intermediate">Intermediate Risk</Badge>;
      case 'high':
        return <Badge variant="destructive" data-testid="badge-risk-high">High Risk</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-risk-unknown">Unknown</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal':
        return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-500" />;
      case 'borderline':
        return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />;
      case 'abnormal':
        return <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-500" />;
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'normal':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">Normal</Badge>;
      case 'borderline':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">Borderline</Badge>;
      case 'abnormal':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">Abnormal</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Group interpretations by category for better organization
  const normalResults = interpretations.filter(i => i.status === 'normal');
  const abnormalResults = interpretations.filter(i => i.status !== 'normal');

  // Helper to check if a lab has a red flag
  const hasRedFlag = (category: string) => {
    return redFlags.some(flag => 
      flag.category.toLowerCase().includes(category.toLowerCase()) || 
      category.toLowerCase().includes(flag.category.toLowerCase())
    );
  };

  return (
    <div className="space-y-6">
      {/* Comprehensive Results Overview Table */}
      <Card data-testid="card-results-overview">
        <CardHeader>
          <CardTitle>Complete Lab Results Overview</CardTitle>
          <CardDescription>
            All lab values with status, interpretation, and clinical recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Lab Test</TableHead>
                  <TableHead className="w-[120px]">Value</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[140px]">Reference Range</TableHead>
                  <TableHead>Interpretation</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="w-[80px] text-center">Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interpretations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No lab results to display
                    </TableCell>
                  </TableRow>
                ) : (
                  interpretations.map((interp, index) => {
                    const isRedFlag = hasRedFlag(interp.category);
                    return (
                      <TableRow 
                        key={index} 
                        data-testid={`table-row-${index}`}
                        className={isRedFlag ? "bg-destructive/5" : ""}
                      >
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(interp.status)}
                            {interp.category}
                          </div>
                        </TableCell>
                        <TableCell>
                          {interp.value !== undefined ? (
                            <span className="font-mono font-semibold">
                              {typeof interp.value === 'number' && interp.unit === '%' 
                                ? interp.value.toFixed(1) 
                                : typeof interp.value === 'number' 
                                ? Number.isInteger(interp.value) ? interp.value : interp.value.toFixed(1)
                                : interp.value} <span className="text-xs text-muted-foreground">{interp.unit}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Not provided</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(interp.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {interp.referenceRange}
                        </TableCell>
                        <TableCell className="text-sm">
                          {interp.interpretation}
                        </TableCell>
                        <TableCell className="text-sm">
                          {interp.recommendation}
                        </TableCell>
                        <TableCell className="text-center">
                          {isRedFlag && (
                            <AlertOctagon 
                              className="w-5 h-5 text-destructive inline-block" 
                              data-testid={`red-flag-${index}`}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* PREVENT Cardiovascular Risk Assessment (2023 AHA Equations) */}
      {preventAssessment && (
        <Card data-testid="card-prevent-assessment">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary" />
                <CardTitle>PREVENT Cardiovascular Risk Assessment</CardTitle>
              </div>
              {getRiskBadge(preventAssessment.riskCategory)}
            </div>
            <CardDescription>
              2023 AHA PREVENT Equations - 10/30-year risk for CVD, ASCVD, and Heart Failure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 10-Year Risks */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                10-Year Risk Predictions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Total CVD Risk</p>
                  <span className="text-3xl font-bold font-mono" data-testid="text-10yr-cvd">
                    {preventAssessment.tenYearCVDPercentage}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Heart attack, stroke & heart failure</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">ASCVD Risk</p>
                  <span className="text-3xl font-bold font-mono" data-testid="text-10yr-ascvd">
                    {preventAssessment.tenYearASCVDPercentage}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Heart attack & stroke only</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Heart Failure Risk</p>
                  <span className="text-3xl font-bold font-mono" data-testid="text-10yr-hf">
                    {preventAssessment.tenYearHFPercentage}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Heart failure alone</p>
                </div>
              </div>
            </div>

            {/* 30-Year Risks (if available) */}
            {preventAssessment.thirtyYearCVDPercentage && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  30-Year Risk Predictions (Ages 30-59)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Total CVD Risk</p>
                    <span className="text-2xl font-bold font-mono" data-testid="text-30yr-cvd">
                      {preventAssessment.thirtyYearCVDPercentage}
                    </span>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">ASCVD Risk</p>
                    <span className="text-2xl font-bold font-mono" data-testid="text-30yr-ascvd">
                      {preventAssessment.thirtyYearASCVDPercentage}
                    </span>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Heart Failure Risk</p>
                    <span className="text-2xl font-bold font-mono" data-testid="text-30yr-hf">
                      {preventAssessment.thirtyYearHFPercentage}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-4">
              {preventAssessment.ldlGoal && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">LDL Cholesterol Goal</p>
                  <p className="text-sm font-semibold" data-testid="text-prevent-ldl-goal">
                    {preventAssessment.ldlGoal}
                  </p>
                </div>
              )}

              {preventAssessment.statinRecommendation && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Statin Therapy Recommendation</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-md" data-testid="text-prevent-statin">
                    {preventAssessment.statinRecommendation}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Recommendations</p>
                <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="text-prevent-recommendations">
                  {preventAssessment.recommendations}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Adjusted Risk Assessment - ApoB and Lp(a) consideration */}
      {adjustedRiskAssessment && (
        <Card data-testid="card-adjusted-risk">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>Adjusted Risk Assessment</CardTitle>
              </div>
              {adjustedRiskAssessment.adjustedCategory === 'reclassified_upward' ? (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800" data-testid="badge-reclassified">
                  Reclassified Upward
                </Badge>
              ) : (
                getRiskBadge(adjustedRiskAssessment.adjustedCategory)
              )}
            </div>
            <CardDescription>
              Risk assessment adjusted for atherogenic markers (ApoB, Lp(a))
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
                    adjustedRiskAssessment.apoBStatus === 'elevated' 
                      ? 'text-orange-600 dark:text-orange-400' 
                      : adjustedRiskAssessment.apoBStatus === 'borderline'
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                  }`} data-testid="text-apob">
                    {adjustedRiskAssessment.apoBValue} mg/dL
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {adjustedRiskAssessment.apoBStatus === 'elevated' 
                      ? 'Elevated (≥130 mg/dL)' 
                      : adjustedRiskAssessment.apoBStatus === 'borderline'
                      ? 'Borderline (90-129 mg/dL)'
                      : 'Normal (<90 mg/dL)'}
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
                    adjustedRiskAssessment.lpaStatus === 'elevated' 
                      ? 'text-orange-600 dark:text-orange-400' 
                      : adjustedRiskAssessment.lpaStatus === 'borderline'
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                  }`} data-testid="text-lpa">
                    {adjustedRiskAssessment.lpaValue} {adjustedRiskAssessment.lpaValue >= 200 ? 'nmol/L' : 'mg/dL'}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {adjustedRiskAssessment.lpaStatus === 'elevated' 
                      ? 'Elevated (≥50 mg/dL)' 
                      : adjustedRiskAssessment.lpaStatus === 'borderline'
                      ? 'Borderline (40-49 mg/dL)'
                      : 'Normal (<40 mg/dL)'}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Clinical Guidance</p>
                <p className="text-sm bg-muted/50 p-3 rounded-md leading-relaxed" data-testid="text-adjusted-guidance">
                  {adjustedRiskAssessment.clinicalGuidance}
                </p>
              </div>

              {adjustedRiskAssessment.cacRecommendation && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">CAC Scoring Recommendation</p>
                  <p className="text-sm" data-testid="text-cac-rec">
                    {adjustedRiskAssessment.cacRecommendation}
                  </p>
                </div>
              )}

              {adjustedRiskAssessment.statinGuidance && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Statin Therapy Guidance</p>
                  <p className="text-sm" data-testid="text-statin-guidance">
                    {adjustedRiskAssessment.statinGuidance}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy ASCVD Cardiovascular Risk Assessment (for male endpoint that still uses it) */}
      {ascvdAssessment && !preventAssessment && (
        <Card data-testid="card-ascvd-assessment">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>Cardiovascular Risk Assessment</CardTitle>
              </div>
              {getRiskBadge(ascvdAssessment.riskCategory)}
            </div>
            <CardDescription>
              10-year ASCVD risk based on 2013 ACC/AHA Pooled Cohort Equations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground" data-testid="label-10year-risk">10-Year Risk of Heart Attack or Stroke</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold font-mono" data-testid="text-ascvd-risk">
                    {ascvdAssessment.riskPercentage}
                  </span>
                </div>
              </div>
              
              {ascvdAssessment.ldlGoal && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground" data-testid="label-ldl-goal">LDL Cholesterol Goal</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold font-mono" data-testid="text-ldl-goal">
                      {ascvdAssessment.ldlGoal}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              {ascvdAssessment.statinRecommendation && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground" data-testid="label-statin-recommendation">Statin Therapy Recommendation</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-md" data-testid="text-statin-recommendation">
                    {ascvdAssessment.statinRecommendation}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground" data-testid="label-clinical-recommendations">Clinical Recommendations</p>
                <p className="text-sm leading-relaxed" data-testid="text-ascvd-recommendations">
                  {ascvdAssessment.recommendations}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lab Results Grid */}
      <Card data-testid="card-lab-results">
        <CardHeader>
          <CardTitle>Lab Results Summary</CardTitle>
          <CardDescription>
            Detailed interpretation of each lab value based on clinical protocols
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {abnormalResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Results Requiring Attention ({abnormalResults.length})
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
                          <p className="text-xs text-muted-foreground mt-1">
                            Reference: {interp.referenceRange}
                          </p>
                        </div>
                      )}
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Interpretation</p>
                          <p className="text-sm">{interp.interpretation}</p>
                        </div>
                        
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Recommendation</p>
                          <p className="text-sm">{interp.recommendation}</p>
                        </div>
                        
                        {interp.recheckTiming && (
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Recheck Timeline</p>
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

          {normalResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Normal Results ({normalResults.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {normalResults.map((interp, index) => (
                  <Card key={index} className="hover-elevate" data-testid={`result-normal-${index}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(interp.status)}
                          <p className="font-semibold text-sm">{interp.category}</p>
                        </div>
                        {getStatusBadge(interp.status)}
                      </div>
                      {interp.value !== undefined && (
                        <div className="mt-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-mono font-semibold">{interp.value}</span>
                            <span className="text-xs text-muted-foreground">{interp.unit}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Ref: {interp.referenceRange}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Recommendations */}
      <Card data-testid="card-ai-recommendations">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            AI-Powered Clinical Recommendations
          </CardTitle>
          <CardDescription>
            Synthesized guidance based on all lab values and clinical protocols
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {aiRecommendations}
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Recommended Recheck Window:</span>
            <Badge variant="outline" className="font-mono">{recheckWindow}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
