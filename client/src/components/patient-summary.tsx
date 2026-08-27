import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { LabValues, PatientSummaryGenerationStatus } from "@shared/schema";

interface PatientSummaryProps {
  summary: string;
  labValues: LabValues;
  onSummaryChange?: (val: string) => void;
  saveStatus?: 'saved' | 'saving' | 'unsaved';
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  generationStatus?: PatientSummaryGenerationStatus;
}

export function PatientSummary({
  summary,
  labValues,
  onSummaryChange,
  saveStatus,
  onRegenerate,
  isRegenerating = false,
  generationStatus,
}: PatientSummaryProps) {
  const [editableSummary, setEditableSummary] = useState(summary);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setEditableSummary(summary);
  }, [summary]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableSummary);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "Patient summary has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card data-testid="card-patient-summary">
      <CardHeader>
        <CardTitle>Patient Communication Summary</CardTitle>
        <CardDescription>
          Edit this patient-friendly summary as needed. It will be published as the Health Assessment in the patient portal when you publish this lab to the portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {generationStatus === "fallback_due_to_error" && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
            data-testid="alert-patient-summary-fallback"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>AI draft could not be generated. Showing fallback text.</span>
          </div>
        )}
        <Textarea
          value={editableSummary}
          onChange={(e) => { setEditableSummary(e.target.value); onSummaryChange?.(e.target.value); }}
          className="min-h-[200px] font-sans text-sm leading-relaxed"
          data-testid="textarea-patient-summary"
        />
        
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">{editableSummary.length} characters</p>
            {saveStatus && (
              <span className={cn(
                "text-xs",
                saveStatus === 'saved' ? "text-green-600 dark:text-green-400" :
                saveStatus === 'saving' ? "text-muted-foreground" :
                "text-amber-600 dark:text-amber-400"
              )}>
                {saveStatus === 'saved' ? "Saved" : saveStatus === 'saving' ? "Saving..." : "Unsaved"}
              </span>
            )}
          </div>
          <Button 
            onClick={handleCopy}
            variant="default"
            data-testid="button-copy-summary"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
          {onRegenerate && (
            <Button
              onClick={onRegenerate}
              variant="outline"
              disabled={isRegenerating}
              data-testid="button-regenerate-patient-communication"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isRegenerating && "animate-spin")} />
              {isRegenerating ? "Regenerating..." : "Regenerate AI Draft"}
            </Button>
          )}
        </div>

        <div className="p-4 rounded-md bg-muted/50 border">
          <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
            Standard Patient Education Message
          </p>
          <p className="text-sm italic">
            "Your labs help us keep testosterone therapy safe and effective. We aim for a mid-normal testosterone level, keep blood counts in range, and watch cholesterol, liver, kidney, and prostate health to prevent long-term issues."
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
