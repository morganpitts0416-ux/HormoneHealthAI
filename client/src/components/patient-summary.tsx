import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { LabValues } from "@shared/schema";

interface PatientSummaryProps {
  summary: string;
  labValues: LabValues;
}

export function PatientSummary({ summary, labValues }: PatientSummaryProps) {
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

  return (
    <Card data-testid="card-patient-summary">
      <CardHeader>
        <CardTitle>Patient Communication Summary</CardTitle>
        <CardDescription>
          Edit this patient-friendly summary as needed, then copy to send to the patient
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={editableSummary}
          onChange={(e) => setEditableSummary(e.target.value)}
          className="min-h-[200px] font-sans text-sm leading-relaxed"
          data-testid="textarea-patient-summary"
        />
        
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {editableSummary.length} characters
          </p>
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
