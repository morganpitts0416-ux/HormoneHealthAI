import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  CheckCircle2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import jsPDF from "jspdf";

interface SubmissionField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  sectionId: number | null;
  orderIndex: number;
}

interface SubmissionSection {
  id: number;
  title: string;
  orderIndex: number;
}

export interface SubmissionDetail {
  id: number;
  formId: number;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: string;
  reviewStatus: string;
  syncStatus: string;
  rawSubmissionJson: Record<string, any>;
  form: { name: string; category: string; description: string | null } | null;
  fields: SubmissionField[];
  sections: SubmissionSection[];
  syncEvents: any[];
}

function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u2013/g, '-').replace(/\u2014/g, '--')
    .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"').replace(/\u201D/g, '"')
    .replace(/\u2026/g, '...').replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*').replace(/[^\x00-\xFF]/g, ' ');
}

function generateSubmissionPdf(detail: SubmissionDetail, clinicName: string) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const PAGE_W = 215.9;
  const PAGE_H = 279.4;
  const M = 20;
  const CW = PAGE_W - M * 2;
  const GREEN = "#2e3a20";
  let y = M;

  function checkPage(need: number) {
    if (y + need > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
  }

  doc.setFontSize(18);
  doc.setTextColor(GREEN);
  doc.setFont("helvetica", "bold");
  doc.text(clinicName || "ClinIQ", M, y);
  y += 8;

  doc.setFontSize(14);
  doc.text(detail.form?.name ?? "Form Submission", M, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor("#666666");
  doc.setFont("helvetica", "normal");
  const submittedDate = new Date(detail.submittedAt).toLocaleString();
  doc.text(`Submitted: ${submittedDate}`, M, y);
  y += 5;
  if (detail.submitterName) {
    doc.text(`Patient: ${sanitizeForPdf(detail.submitterName)}`, M, y);
    y += 5;
  }
  if (detail.submitterEmail) {
    doc.text(`Email: ${sanitizeForPdf(detail.submitterEmail)}`, M, y);
    y += 5;
  }

  doc.setDrawColor("#cccccc");
  doc.setLineWidth(0.4);
  doc.line(M, y, PAGE_W - M, y);
  y += 8;

  const sortedSections = [...(detail.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedFields = [...(detail.fields ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const unsectionedFields = sortedFields.filter(f => !f.sectionId);
  const data = detail.rawSubmissionJson ?? {};

  function renderFields(fields: SubmissionField[]) {
    for (const field of fields) {
      const value = data[field.fieldKey];
      if (value === undefined || value === null || value === "") continue;
      const displayValue = sanitizeForPdf(Array.isArray(value) ? value.join(", ") : String(value));

      checkPage(14);
      doc.setFontSize(8);
      doc.setTextColor("#888888");
      doc.setFont("helvetica", "bold");
      doc.text(field.label.toUpperCase(), M, y);
      y += 4;

      doc.setFontSize(10);
      doc.setTextColor("#1c2414");
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(displayValue, CW);
      for (const line of lines) {
        checkPage(6);
        doc.text(line, M, y);
        y += 5;
      }
      y += 3;
    }
  }

  if (unsectionedFields.length > 0) renderFields(unsectionedFields);

  for (const section of sortedSections) {
    const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
    const hasValues = sectionFields.some(f => {
      const v = data[f.fieldKey];
      return v !== undefined && v !== null && v !== "";
    });
    if (!hasValues) continue;

    checkPage(16);
    doc.setDrawColor("#cccccc");
    doc.setLineWidth(0.3);
    doc.line(M, y, PAGE_W - M, y);
    y += 6;

    doc.setFontSize(12);
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    doc.text(sanitizeForPdf(section.title), M, y);
    y += 7;

    renderFields(sectionFields);
  }

  const fileName = `${(detail.form?.name ?? "submission").replace(/\s+/g, "_")}_${detail.id}.pdf`;
  doc.save(fileName);
}

export function FormSubmissionPreviewDialog({
  submissionId,
  onClose,
  clinicName,
}: {
  submissionId: number | null;
  onClose: () => void;
  clinicName: string;
}) {
  const { data: detail, isLoading } = useQuery<SubmissionDetail>({
    queryKey: ["/api/form-submissions", submissionId],
    queryFn: () => fetch(`/api/form-submissions/${submissionId}`).then(r => r.json()),
    enabled: !!submissionId,
  });

  const markReviewedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/intake-forms/submissions/${submissionId}/review`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-submissions", submissionId] });
      onClose();
    },
  });

  const sortedSections = [...(detail?.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedFields = [...(detail?.fields ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const unsectionedFields = sortedFields.filter(f => !f.sectionId);
  const data = detail?.rawSubmissionJson ?? {};

  function renderFieldGroup(fields: SubmissionField[]) {
    return fields.map(field => {
      const value = data[field.fieldKey];
      if (value === undefined || value === null || value === "") return null;
      return (
        <div key={field.id} className="py-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#7a8a64" }}>{field.label}</p>
          <p className="text-sm mt-0.5" style={{ color: "#1c2414" }}>
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </p>
        </div>
      );
    });
  }

  return (
    <Dialog open={!!submissionId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-submission-preview">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" style={{ color: "#2e3a20" }} />
              <DialogTitle className="text-lg" style={{ color: "#2e3a20" }}>
                {detail?.form?.name ?? "Form Submission"}
              </DialogTitle>
            </div>
            {detail && (
              <div className="flex items-center gap-2 flex-wrap">
                {detail.reviewStatus === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markReviewedMutation.mutate()}
                    disabled={markReviewedMutation.isPending}
                    data-testid="button-mark-reviewed"
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" /> Mark Reviewed
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateSubmissionPdf(detail, clinicName)}
                  data-testid="button-download-submission-pdf"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7a8a64" }} />
          </div>
        ) : detail ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-1 pb-2">
              <div className="flex items-center gap-4 flex-wrap text-sm" style={{ color: "#666" }}>
                <span>Submitted: {new Date(detail.submittedAt).toLocaleString()}</span>
                {detail.submitterName && <span>Patient: <strong style={{ color: "#1c2414" }}>{detail.submitterName}</strong></span>}
              </div>
              {detail.submitterEmail && (
                <p className="text-xs" style={{ color: "#999" }}>{detail.submitterEmail}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={detail.reviewStatus === "reviewed" ? "default" : "secondary"} data-testid="badge-review-status">
                  {detail.reviewStatus}
                </Badge>
                <Badge variant={detail.syncStatus === "synced" ? "default" : "outline"} data-testid="badge-sync-status">
                  {detail.syncStatus === "synced" ? "Synced" : "Not synced"}
                </Badge>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-1">
              {unsectionedFields.length > 0 && renderFieldGroup(unsectionedFields)}

              {sortedSections.map(section => {
                const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
                const hasValues = sectionFields.some(f => {
                  const v = data[f.fieldKey];
                  return v !== undefined && v !== null && v !== "";
                });
                if (!hasValues) return null;
                return (
                  <div key={section.id} className="pt-3">
                    <h3 className="text-sm font-bold mb-2" style={{ color: "#2e3a20" }}>{section.title}</h3>
                    <Separator className="mb-2" />
                    {renderFieldGroup(sectionFields)}
                  </div>
                );
              })}
            </div>

            {detail.syncEvents?.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: "#2e3a20" }}>Sync Log</h3>
                  <div className="space-y-1">
                    {detail.syncEvents.map((e: any) => (
                      <div key={e.id} className="text-xs flex items-center gap-2">
                        {e.resultStatus === "success"
                          ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                          : <X className="h-3 w-3 text-amber-500" />}
                        <span style={{ color: "#888" }}>{e.targetDomain}:</span>
                        <span>{(e.detailsJson as any)?.item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </ScrollArea>
        ) : (
          <div className="py-12 text-center text-sm" style={{ color: "#999" }}>Submission not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
