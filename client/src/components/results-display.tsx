import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { LabInterpretation } from "@shared/schema";
import { Separator } from "@/components/ui/separator";

interface ResultsDisplayProps {
  interpretations: LabInterpretation[];
  aiRecommendations: string;
  recheckWindow: string;
}

export function ResultsDisplay({ interpretations, aiRecommendations, recheckWindow }: ResultsDisplayProps) {
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

  return (
    <div className="space-y-6">
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
