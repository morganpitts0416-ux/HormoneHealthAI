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
  layoutJson?: { columnWidth?: string } | null;
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

export interface ClinicInfo {
  clinicName: string;
  clinicLogo?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
}

function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u2013/g, '-').replace(/\u2014/g, '--')
    .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"').replace(/\u201D/g, '"')
    .replace(/\u2026/g, '...').replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*').replace(/[^\x00-\xFF]/g, ' ');
}

const DECORATIVE_TYPES = new Set(["heading", "paragraph", "divider", "section_break", "spacer"]);

function isDataField(field: SubmissionField): boolean {
  return !DECORATIVE_TYPES.has(field.fieldType);
}

function hasFieldValue(data: Record<string, any>, field: SubmissionField): boolean {
  if (!isDataField(field)) return false;
  const v = data[field.fieldKey];
  return v !== undefined && v !== null && v !== "";
}

function getColFraction(field: SubmissionField): number {
  const w = field.layoutJson?.columnWidth ?? "full";
  if (w === "half") return 0.5;
  if (w === "third") return 1 / 3;
  return 1;
}

interface FieldRow {
  fields: SubmissionField[];
  fractions: number[];
}

function buildFieldRows(fields: SubmissionField[], data: Record<string, any>): FieldRow[] {
  const dataFields = fields.filter(f => isDataField(f) && hasFieldValue(data, f));
  const rows: FieldRow[] = [];
  let currentRow: SubmissionField[] = [];
  let currentFracs: number[] = [];
  let usedWidth = 0;

  for (const field of dataFields) {
    const frac = getColFraction(field);
    if (usedWidth + frac > 1.01 && currentRow.length > 0) {
      rows.push({ fields: currentRow, fractions: currentFracs });
      currentRow = [];
      currentFracs = [];
      usedWidth = 0;
    }
    currentRow.push(field);
    currentFracs.push(frac);
    usedWidth += frac;
    if (usedWidth >= 0.99) {
      rows.push({ fields: currentRow, fractions: currentFracs });
      currentRow = [];
      currentFracs = [];
      usedWidth = 0;
    }
  }
  if (currentRow.length > 0) {
    rows.push({ fields: currentRow, fractions: currentFracs });
  }
  return rows;
}

async function generateSubmissionPdf(detail: SubmissionDetail, clinic: ClinicInfo) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const PAGE_W = 215.9;
  const PAGE_H = 279.4;
  const M = 18;
  const CW = PAGE_W - M * 2;
  const GREEN = "#2e3a20";
  const ACCENT = "#5a7040";
  const GRAY = "#666666";
  const LIGHT_GRAY = "#999999";
  const FIELD_BG = "#f8f7f4";
  let y = M;
  let pageNum = 1;

  function checkPage(need: number) {
    if (y + need > PAGE_H - 20) {
      drawFooter();
      doc.addPage();
      pageNum++;
      y = M;
    }
  }

  function drawFooter() {
    doc.setFontSize(7);
    doc.setTextColor(LIGHT_GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${pageNum}`, PAGE_W / 2, PAGE_H - 10, { align: "center" });
    doc.text(clinic.clinicName || "ClinIQ", M, PAGE_H - 10);
    doc.text(new Date(detail.submittedAt).toLocaleDateString(), PAGE_W - M, PAGE_H - 10, { align: "right" });
  }

  if (clinic.clinicLogo) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = clinic.clinicLogo!;
      });
      const maxH = 14;
      const maxW = 40;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      doc.addImage(img, "PNG", M, y, w, h);
      const textStartX = M + w + 4;

      doc.setFontSize(16);
      doc.setTextColor(GREEN);
      doc.setFont("helvetica", "bold");
      doc.text(sanitizeForPdf(clinic.clinicName || "ClinIQ"), textStartX, y + 5);

      const contactParts: string[] = [];
      if (clinic.phone) contactParts.push(sanitizeForPdf(clinic.phone));
      if (clinic.address) contactParts.push(sanitizeForPdf(clinic.address));
      if (clinic.email) contactParts.push(sanitizeForPdf(clinic.email));
      if (contactParts.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(GRAY);
        doc.setFont("helvetica", "normal");
        doc.text(contactParts.join("  |  "), textStartX, y + 10);
      }
      y += Math.max(h, 14) + 3;
    } catch {
      doc.setFontSize(16);
      doc.setTextColor(GREEN);
      doc.setFont("helvetica", "bold");
      doc.text(sanitizeForPdf(clinic.clinicName || "ClinIQ"), M, y + 5);
      y += 10;
      const contactParts: string[] = [];
      if (clinic.phone) contactParts.push(sanitizeForPdf(clinic.phone));
      if (clinic.address) contactParts.push(sanitizeForPdf(clinic.address));
      if (contactParts.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(GRAY);
        doc.setFont("helvetica", "normal");
        doc.text(contactParts.join("  |  "), M, y);
        y += 5;
      }
    }
  } else {
    doc.setFontSize(16);
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    doc.text(sanitizeForPdf(clinic.clinicName || "ClinIQ"), M, y + 5);
    y += 10;
    const contactParts: string[] = [];
    if (clinic.phone) contactParts.push(sanitizeForPdf(clinic.phone));
    if (clinic.address) contactParts.push(sanitizeForPdf(clinic.address));
    if (clinic.email) contactParts.push(sanitizeForPdf(clinic.email));
    if (contactParts.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(GRAY);
      doc.setFont("helvetica", "normal");
      doc.text(contactParts.join("  |  "), M, y);
      y += 5;
    }
  }

  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.6);
  doc.line(M, y, PAGE_W - M, y);
  y += 6;

  doc.setFontSize(13);
  doc.setTextColor(GREEN);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizeForPdf(detail.form?.name ?? "Form Submission"), M, y);
  y += 6;

  doc.setFontSize(8.5);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  const submittedDate = new Date(detail.submittedAt).toLocaleString();
  const metaParts: string[] = [`Date: ${submittedDate}`];
  if (detail.submitterName) metaParts.push(`Patient: ${sanitizeForPdf(detail.submitterName)}`);
  if (detail.submitterEmail) metaParts.push(`Email: ${sanitizeForPdf(detail.submitterEmail)}`);
  doc.text(metaParts.join("   |   "), M, y);
  y += 8;

  doc.setDrawColor("#dddddd");
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 6;

  const sortedSections = [...(detail.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedFields = [...(detail.fields ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const unsectionedFields = sortedFields.filter(f => !f.sectionId);
  const data = detail.rawSubmissionJson ?? {};

  function renderFieldRow(row: FieldRow) {
    const GAP = 3;
    const totalGap = GAP * (row.fields.length - 1);
    const usableWidth = CW - totalGap;
    const colWidths = row.fractions.map((f) => f * usableWidth);

    let maxRowH = 0;
    const fieldData: { label: string; lines: string[]; height: number }[] = [];

    for (let i = 0; i < row.fields.length; i++) {
      const field = row.fields[i];
      const value = data[field.fieldKey];
      const displayValue = sanitizeForPdf(Array.isArray(value) ? value.join(", ") : String(value));

      const lines = doc.splitTextToSize(displayValue, colWidths[i] - 4);
      const h = 4 + lines.length * 4 + 3;
      maxRowH = Math.max(maxRowH, h);
      fieldData.push({ label: field.label.toUpperCase(), lines, height: h });
    }

    checkPage(maxRowH + 2);

    let x = M;
    for (let i = 0; i < row.fields.length; i++) {
      const w = colWidths[i];
      const fd = fieldData[i];

      doc.setFillColor(FIELD_BG);
      doc.roundedRect(x, y, w, maxRowH, 1, 1, "F");

      doc.setFontSize(6.5);
      doc.setTextColor(ACCENT);
      doc.setFont("helvetica", "bold");
      doc.text(sanitizeForPdf(fd.label), x + 2, y + 3.5);

      doc.setFontSize(9);
      doc.setTextColor("#1c2414");
      doc.setFont("helvetica", "normal");
      let textY = y + 7.5;
      for (const line of fd.lines) {
        doc.text(line, x + 2, textY);
        textY += 4;
      }

      x += w + GAP;
    }
    y += maxRowH + 2;
  }

  function renderFieldGroup(fields: SubmissionField[]) {
    const rows = buildFieldRows(fields, data);
    for (const row of rows) {
      renderFieldRow(row);
    }
  }

  if (unsectionedFields.length > 0) renderFieldGroup(unsectionedFields);

  for (const section of sortedSections) {
    const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
    const hasAnswered = sectionFields.some(f => hasFieldValue(data, f));
    if (!hasAnswered) continue;

    checkPage(14);
    y += 3;
    doc.setFontSize(11);
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    doc.text(sanitizeForPdf(section.title), M, y);
    y += 2;
    doc.setDrawColor(ACCENT);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + doc.getTextWidth(sanitizeForPdf(section.title)) + 2, y);
    y += 4;

    renderFieldGroup(sectionFields);
  }

  if (detail.rawSubmissionJson?.["signature_data"]) {
    checkPage(30);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.setFont("helvetica", "bold");
    doc.text("SIGNATURE", M, y);
    y += 3;
    try {
      doc.addImage(detail.rawSubmissionJson["signature_data"], "PNG", M, y, 50, 18);
      y += 20;
    } catch {
      doc.setFont("helvetica", "italic");
      doc.text("[Signature on file]", M, y + 5);
      y += 8;
    }
    doc.setDrawColor("#cccccc");
    doc.line(M, y, M + 60, y);
    y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.text(`Signed: ${new Date(detail.submittedAt).toLocaleString()}`, M, y);
    y += 5;
  }

  drawFooter();

  const fileName = `${(detail.form?.name ?? "submission").replace(/\s+/g, "_")}_${detail.id}.pdf`;
  doc.save(fileName);
}

function PreviewFieldGroup({ fields, data }: { fields: SubmissionField[]; data: Record<string, any> }) {
  const rows = buildFieldRows(fields, data);

  return (
    <>
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-2 mb-1.5" style={{ flexWrap: "wrap" }}>
          {row.fields.map((field, fi) => {
            const frac = getColFraction(field);
            const gapTotal = (row.fields.length - 1) * 8;
            const widthCalc = `calc(${(frac * 100).toFixed(1)}% - ${Math.round(gapTotal * frac)}px)`;
            const value = data[field.fieldKey];
            const displayValue = Array.isArray(value) ? value.join(", ") : String(value);

            return (
              <div
                key={field.id}
                className="rounded-md px-2.5 py-1.5"
                style={{
                  flex: `0 0 ${widthCalc}`,
                  minWidth: 0,
                  backgroundColor: "#f8f7f4",
                  border: "1px solid #eee",
                }}
                data-testid={`field-preview-${field.fieldKey}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#5a7040" }}>
                  {field.label}
                </p>
                <p className="text-sm mt-0.5 break-words" style={{ color: "#1c2414" }}>
                  {displayValue}
                </p>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function FormSubmissionPreviewDialog({
  submissionId,
  onClose,
  clinic,
}: {
  submissionId: number | null;
  onClose: () => void;
  clinic: ClinicInfo;
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
                  onClick={() => generateSubmissionPdf(detail, clinic)}
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
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e0ddd6", backgroundColor: "#fff" }}>
              <div className="px-5 py-4" style={{ backgroundColor: "#f5f2ed", borderBottom: "2px solid #5a7040" }}>
                <div className="flex items-center gap-3 flex-wrap">
                  {clinic.clinicLogo && (
                    <img
                      src={clinic.clinicLogo}
                      alt="Clinic logo"
                      className="h-10 w-auto object-contain"
                      data-testid="img-clinic-logo"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold" style={{ color: "#2e3a20" }}>
                      {clinic.clinicName || "ClinIQ"}
                    </h2>
                    {(clinic.phone || clinic.address) && (
                      <p className="text-[11px]" style={{ color: "#7a8a64" }}>
                        {[clinic.phone, clinic.address].filter(Boolean).join("  |  ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3" style={{ backgroundColor: "#fafaf7", borderBottom: "1px solid #eee" }}>
                <h3 className="text-sm font-bold" style={{ color: "#2e3a20" }}>
                  {detail.form?.name ?? "Form Submission"}
                </h3>
                <div className="flex items-center gap-4 flex-wrap text-[11px] mt-0.5" style={{ color: "#888" }}>
                  <span>Submitted: {new Date(detail.submittedAt).toLocaleString()}</span>
                  {detail.submitterName && <span>Patient: <strong style={{ color: "#1c2414" }}>{detail.submitterName}</strong></span>}
                  {detail.submitterEmail && <span>{detail.submitterEmail}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge variant={detail.reviewStatus === "reviewed" ? "default" : "secondary"} data-testid="badge-review-status">
                    {detail.reviewStatus}
                  </Badge>
                  <Badge variant={detail.syncStatus === "synced" ? "default" : "outline"} data-testid="badge-sync-status">
                    {detail.syncStatus === "synced" ? "Synced" : "Not synced"}
                  </Badge>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">
                {unsectionedFields.length > 0 && (
                  <PreviewFieldGroup fields={unsectionedFields} data={data} />
                )}

                {sortedSections.map(section => {
                  const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
                  const hasValues = sectionFields.some(f => hasFieldValue(data, f));
                  if (!hasValues) return null;
                  return (
                    <div key={section.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#2e3a20" }}>
                          {section.title}
                        </h4>
                        <div className="flex-1 h-px" style={{ backgroundColor: "#e0ddd6" }} />
                      </div>
                      <PreviewFieldGroup fields={sectionFields} data={data} />
                    </div>
                  );
                })}
              </div>

              {detail.syncEvents?.length > 0 && (
                <div className="px-5 py-3" style={{ borderTop: "1px solid #eee", backgroundColor: "#fafaf7" }}>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "#2e3a20" }}>Sync Log</h4>
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
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="py-12 text-center text-sm" style={{ color: "#999" }}>Submission not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
