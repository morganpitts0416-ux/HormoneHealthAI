import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCopy, Check, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SOAPNoteProps {
  soapNote: string;
}

export function SOAPNote({ soapNote }: SOAPNoteProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(soapNote);
      setCopied(true);
      toast({
        title: "SOAP Note Copied",
        description: "The SOAP note has been copied to your clipboard. You can now paste it into the patient chart.",
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = soapNote;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      toast({
        title: "SOAP Note Copied",
        description: "The SOAP note has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <Card data-testid="soap-note-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-lg">SOAP Note — Chart Ready</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          data-testid="button-copy-soap-note"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Copied
            </>
          ) : (
            <>
              <ClipboardCopy className="h-4 w-4 mr-1" />
              Copy to Clipboard
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div
          className="bg-muted/50 rounded-md p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap border"
          data-testid="soap-note-content"
        >
          {soapNote}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          AI-generated SOAP note based on lab interpretation results. Review and edit as needed before pasting into the patient chart.
        </p>
      </CardContent>
    </Card>
  );
}
