import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { LabValues } from "@shared/schema";

interface PatientSummaryProps {
  summary: string;
  labValues: LabValues;
  labId?: number | null;
  patientId?: number | null;
}

export function PatientSummary({ summary, labValues, labId, patientId }: PatientSummaryProps) {
  const [editableSummary, setEditableSummary] = useState(summary);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

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

  const saveToPortalMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/patients/${patientId}/labs/${labId}/patient-summary`, {
        patientSummary: editableSummary,
      });
    },
    onSuccess: () => {
      toast({
        title: "Saved to portal",
        description: "The patient's Health Assessment has been updated in their portal.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Could not update the portal health assessment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSaveToPortal = !!(labId && patientId);

  return (
    <Card data-testid="card-patient-summary">
      <CardHeader>
        <CardTitle>Patient Communication Summary</CardTitle>
        <CardDescription>
          Edit this patient-friendly summary as needed. Save to portal to update the patient's Health Assessment section.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={editableSummary}
          onChange={(e) => setEditableSummary(e.target.value)}
          className="min-h-[200px] font-sans text-sm leading-relaxed"
          data-testid="textarea-patient-summary"
        />
        
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {editableSummary.length} characters
          </p>
          <div className="flex items-center gap-2">
            {canSaveToPortal && (
              <Button
                onClick={() => saveToPortalMutation.mutate()}
                variant="outline"
                disabled={saveToPortalMutation.isPending}
                data-testid="button-save-summary-to-portal"
              >
                <Send className="w-4 h-4 mr-2" />
                {saveToPortalMutation.isPending ? "Saving…" : "Save to Portal"}
              </Button>
            )}
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
          </div>
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
