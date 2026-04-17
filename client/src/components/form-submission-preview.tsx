import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Download,
  CheckCircle2,
  Check,
  X,
  Loader2,
  RefreshCw,
  Pill,
  Users,
  Activity,
  Shield,
  Scissors,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import jsPDF from "jspdf";
import { RichTextView } from "@/components/rich-text-editor";

function htmlToPlainText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ");
  return withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface SubmissionField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  sectionId: number | null;
  orderIndex: number;
  layoutJson?: { columnWidth?: string } | null;
  optionsJson?: any;
}

interface SubmissionSection {
  id: number;
  title: string;
  orderIndex: number;
}

export interface SubmissionDetail {
  id: number;
  formId: number;
  patientId: number | null;
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
  patient: { id: number; firstName: string; lastName: string; dateOfBirth: string | null } | null;
}

interface SyncPreviewData {
  patientId: number;
  patientName: string | null;
  syncStatus: string;
  domainLabels: Record<string, string>;
  preview: Record<string, Array<{ item: string; duplicate: boolean }>>;
}

const DOMAIN_ICONS: Record<string, any> = {
  medications: Pill,
  allergies: Shield,
  medical_history: FileText,
  surgical_history: Scissors,
  family_history: Users,
  social_history: Activity,
};

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
      let rawDisplay: string;
      if (field.fieldType === "matrix" && field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson)) {
        const cfg = field.optionsJson as { rows: any[]; columns: any[] };
        const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
        const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
        const mv = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value as Record<string, any> : {};
        const lines: string[] = [];
        for (const r of rows) {
          const parts: string[] = [];
          for (const c of cols) {
            const v = mv?.[r.id]?.[c.id];
            if (c.fieldType === "checkbox" || c.fieldType === "radio") {
              if (v) parts.push(c.header || "Yes");
            } else if (v !== undefined && v !== null && String(v).trim()) {
              parts.push(`${c.header}: ${v}`);
            }
          }
          if (parts.length) lines.push(`${r.label}: ${parts.join(", ")}`);
        }
        rawDisplay = lines.length ? lines.join("\n") : "None reported";
      } else if (field.fieldType === "family_history_chart" && typeof value === "object" && !Array.isArray(value)) {
        rawDisplay = Object.entries(value).filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${v}`).join("\n") || "None reported";
      } else if (Array.isArray(value)) {
        rawDisplay = value.filter(Boolean).join("\n");
      } else {
        rawDisplay = String(value);
      }
      const displayValue = sanitizeForPdf(rawDisplay);

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

  function renderHeading(text: string) {
    if (!text.trim()) return;
    const wrapped = doc.splitTextToSize(text, CW);
    const h = wrapped.length * 5 + 2;
    checkPage(h + 4);
    y += 2;
    doc.setFontSize(11);
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    for (const line of wrapped) {
      doc.text(line, M, y + 4);
      y += 5;
    }
    y += 1;
  }

  function renderParagraph(text: string) {
    if (!text.trim()) return;
    const paragraphs = text.split(/\n{2,}/);
    doc.setFontSize(9.5);
    doc.setTextColor("#1c2414");
    doc.setFont("helvetica", "normal");
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, CW);
      const h = lines.length * 4.4 + 2;
      checkPage(h + 2);
      for (const line of lines) {
        doc.text(line, M, y + 3.5);
        y += 4.4;
      }
      y += 2;
    }
  }

  function renderDivider() {
    checkPage(4);
    y += 1;
    doc.setDrawColor("#cccccc");
    doc.setLineWidth(0.2);
    doc.line(M, y, PAGE_W - M, y);
    y += 3;
  }

  function renderSignatureField(field: SubmissionField) {
    const value = data[field.fieldKey];
    checkPage(28);
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor(ACCENT);
    doc.setFont("helvetica", "bold");
    doc.text(sanitizeForPdf(field.label || "SIGNATURE").toUpperCase(), M, y + 2);
    y += 4;
    if (typeof value === "string" && value.startsWith("data:image")) {
      try {
        const fmt = /png/i.test(value.slice(0, 30)) ? "PNG" : "JPEG";
        doc.addImage(value, fmt, M, y, 60, 22);
        y += 24;
      } catch {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(GRAY);
        doc.text("[Signature on file]", M, y + 4);
        y += 8;
      }
    } else {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(GRAY);
      doc.text("No signature provided", M, y + 4);
      y += 8;
    }
    doc.setDrawColor("#cccccc");
    doc.line(M, y, M + 70, y);
    y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.text(`Signed: ${new Date(detail.submittedAt).toLocaleString()}`, M, y);
    y += 5;
  }

  function renderFieldGroup(fields: SubmissionField[]) {
    let pending: SubmissionField[] = [];
    const flushPending = () => {
      if (pending.length === 0) return;
      const rows = buildFieldRows(pending, data);
      for (const row of rows) renderFieldRow(row);
      pending = [];
    };

    for (const field of fields) {
      if (field.fieldType === "heading") {
        flushPending();
        renderHeading(htmlToPlainText(field.label ?? ""));
        continue;
      }
      if (field.fieldType === "paragraph") {
        flushPending();
        renderParagraph(htmlToPlainText(field.label ?? ""));
        continue;
      }
      if (field.fieldType === "divider" || field.fieldType === "section_break") {
        flushPending();
        renderDivider();
        continue;
      }
      if (field.fieldType === "spacer") {
        flushPending();
        y += 4;
        continue;
      }
      if (field.fieldType === "signature") {
        flushPending();
        renderSignatureField(field);
        continue;
      }
      if (hasFieldValue(data, field)) pending.push(field);
    }
    flushPending();
  }

  if (unsectionedFields.length > 0) renderFieldGroup(unsectionedFields);

  for (const section of sortedSections) {
    const sectionFields = sortedFields.filter(f => f.sectionId === section.id);
    if (sectionFields.length === 0) continue;

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

  drawFooter();

  const fileName = `${(detail.form?.name ?? "submission").replace(/\s+/g, "_")}_${detail.id}.pdf`;
  doc.save(fileName);
}

function MatrixReadOnly({ field, value }: { field: SubmissionField; value: any }) {
  const cfg = (field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson))
    ? field.optionsJson as { rows: any[]; columns: any[] }
    : { rows: [], columns: [] };
  const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
  const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
  const matrixVal = (typeof value === "object" && value !== null && !Array.isArray(value))
    ? value as Record<string, Record<string, any>>
    : {};
  if (rows.length === 0 || cols.length === 0) {
    return <p className="text-xs text-muted-foreground italic mt-1">No matrix configured</p>;
  }
  return (
    <div className="border rounded-md overflow-x-auto mt-1" style={{ borderColor: "#e0dccf" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "#f0ece0" }}>
            <th className="px-2 py-1 text-left text-[11px] font-semibold border-b" style={{ color: "#2e3a20", borderColor: "#e0dccf" }}>{field.label}</th>
            {cols.map((c: any) => (
              <th key={c.id} className="px-2 py-1 text-center text-[11px] font-semibold border-b border-l" style={{ color: "#2e3a20", borderColor: "#e0dccf" }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-b last:border-b-0" style={{ borderColor: "#eee8d8" }}>
              <td className="px-2 py-1 text-xs font-medium" style={{ color: "#1c2414" }}>{r.label}</td>
              {cols.map((c: any) => {
                const cellVal = matrixVal?.[r.id]?.[c.id];
                return (
                  <td key={c.id} className="px-2 py-1 border-l text-center align-middle text-xs" style={{ color: "#1c2414", borderColor: "#eee8d8" }}>
                    {c.fieldType === "checkbox" || c.fieldType === "radio" ? (
                      <span className={`inline-flex items-center justify-center h-3.5 w-3.5 border ${c.fieldType === "radio" ? "rounded-full" : "rounded-sm"}`} style={{ borderColor: "#5a7040", backgroundColor: cellVal ? "#5a7040" : "transparent" }}>
                        {cellVal && <span className="text-white text-[8px] leading-none">✓</span>}
                      </span>
                    ) : (
                      <span className="break-words">{cellVal ? String(cellVal) : ""}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewDecorativeBlock({ field }: { field: SubmissionField }) {
  const html = field.label ?? "";
  if (field.fieldType === "divider" || field.fieldType === "section_break") {
    return <div className="my-2 h-px" style={{ backgroundColor: "#d6d2c4" }} />;
  }
  if (field.fieldType === "spacer") {
    return <div className="h-3" />;
  }
  if (field.fieldType === "heading") {
    return (
      <div className="mt-3 mb-1" data-testid={`field-preview-${field.fieldKey}`}>
        <RichTextView
          html={html}
          className="text-base font-bold leading-snug"
        />
      </div>
    );
  }
  return (
    <div className="mb-2" data-testid={`field-preview-${field.fieldKey}`}>
      <RichTextView
        html={html}
        className="text-sm leading-relaxed"
      />
    </div>
  );
}

function PreviewSignature({ field, value }: { field: SubmissionField; value: any }) {
  const isImg = typeof value === "string" && value.startsWith("data:image");
  return (
    <div
      className="rounded-md px-2.5 py-1.5 mb-1.5"
      style={{ backgroundColor: "#f8f7f4", border: "1px solid #eee" }}
      data-testid={`field-preview-${field.fieldKey}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#5a7040" }}>
        {field.label}
      </p>
      {isImg ? (
        <img
          src={value}
          alt="Signature"
          className="mt-1 max-h-24 w-auto bg-white rounded border"
          style={{ borderColor: "#e0ddd6" }}
          data-testid={`img-signature-${field.fieldKey}`}
        />
      ) : (
        <p className="text-sm mt-0.5 italic text-muted-foreground">No signature provided</p>
      )}
    </div>
  );
}

function PreviewFieldGroup({ fields, data }: { fields: SubmissionField[]; data: Record<string, any> }) {
  // Walk fields in order; collect runs of "value" data fields into rows, but flush
  // those runs whenever a decorative or signature field appears so layout order is preserved.
  const elements: React.ReactNode[] = [];
  let pending: SubmissionField[] = [];

  const flushPending = (keyPrefix: string) => {
    if (pending.length === 0) return;
    const rows = buildFieldRows(pending, data);
    rows.forEach((row, rowIdx) => {
      elements.push(
        <div key={`${keyPrefix}-row-${rowIdx}`} className="flex gap-2 mb-1.5" style={{ flexWrap: "wrap" }}>
          {row.fields.map((field, fi) => {
            const frac = getColFraction(field);
            const gapTotal = (row.fields.length - 1) * 8;
            const widthCalc = `calc(${(frac * 100).toFixed(1)}% - ${Math.round(gapTotal * frac)}px)`;
            const value = data[field.fieldKey];
            const isFamChart = field.fieldType === "family_history_chart" && typeof value === "object" && !Array.isArray(value);
            const isList = (field.fieldType === "medication_list" || field.fieldType === "allergy_list" || field.fieldType === "medical_history_list" || field.fieldType === "surgical_history_list") && Array.isArray(value);
            const isMatrix = field.fieldType === "matrix" && field.optionsJson && typeof field.optionsJson === "object" && !Array.isArray(field.optionsJson);
            const displayValue = isMatrix
              ? ""
              : isFamChart
              ? Object.entries(value).filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${v}`).join("; ")
              : isList
                ? value.filter(Boolean).join("; ")
                : Array.isArray(value) ? value.join(", ") : String(value);

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
                {isMatrix ? (
                  <MatrixReadOnly field={field} value={value} />
                ) : isList ? (
                  <ul className="text-sm mt-0.5 space-y-0.5" style={{ color: "#1c2414" }}>
                    {(value as string[]).filter(Boolean).map((item: string, ii: number) => (
                      <li key={ii} className="flex items-start gap-1.5">
                        <span className="text-muted-foreground mt-1">-</span>
                        <span className="break-words">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : isFamChart ? (
                  <div className="text-sm mt-0.5 space-y-0.5" style={{ color: "#1c2414" }}>
                    {Object.entries(value).filter(([, v]) => v && String(v).trim()).map(([member, conditions]) => (
                      <div key={member} className="flex items-start gap-1.5">
                        <span className="font-medium text-xs min-w-[100px]" style={{ color: "#5a7040" }}>{member}:</span>
                        <span className="break-words">{String(conditions)}</span>
                      </div>
                    ))}
                    {Object.entries(value).filter(([, v]) => v && String(v).trim()).length === 0 && (
                      <span className="text-muted-foreground italic text-xs">None reported</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm mt-0.5 break-words" style={{ color: "#1c2414" }}>
                    {displayValue}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      );
    });
    pending = [];
  };

  fields.forEach((field, idx) => {
    if (DECORATIVE_TYPES.has(field.fieldType)) {
      flushPending(`pre-${idx}`);
      elements.push(<PreviewDecorativeBlock key={`dec-${field.id}`} field={field} />);
      return;
    }
    if (field.fieldType === "signature") {
      flushPending(`pre-${idx}`);
      elements.push(<PreviewSignature key={`sig-${field.id}`} field={field} value={data[field.fieldKey]} />);
      return;
    }
    if (hasFieldValue(data, field)) {
      pending.push(field);
    }
  });
  flushPending("end");

  return <>{elements}</>;
}

function SyncReviewDialog({
  submissionId,
  open,
  onOpenChange,
}: {
  submissionId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: preview, isLoading, isError } = useQuery<SyncPreviewData>({
    queryKey: ["/api/form-submissions", submissionId, "sync-preview"],
    queryFn: async () => {
      const r = await fetch(`/api/form-submissions/${submissionId}/sync-preview`);
      if (!r.ok) throw new Error("Failed to load sync preview");
      return r.json();
    },
    enabled: open && !!submissionId,
  });

  const [checkedItems, setCheckedItems] = useState<Record<string, Record<number, boolean>>>({});

  const hasSyncableItems = preview && Object.values(preview.preview).some(items => items.some(i => !i.duplicate));

  const toggleItem = (domain: string, idx: number, checked: boolean) => {
    setCheckedItems(prev => ({
      ...prev,
      [domain]: { ...prev[domain], [idx]: checked },
    }));
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const approvedItems: Record<string, string[]> = {};
      for (const [domain, items] of Object.entries(preview.preview)) {
        const approved = items
          .filter((item, idx) => !item.duplicate && checkedItems[domain]?.[idx] !== false)
          .map(i => i.item);
        if (approved.length > 0) approvedItems[domain] = approved;
      }
      const res = await apiRequest("POST", `/api/form-submissions/${submissionId}/sync`, { approvedItems });
      return res.json();
    },
    onSuccess: (data: any) => {
      const added = data?.results?.filter((r: any) => r.action === "added").length ?? 0;
      toast({ title: "Synced to Patient Chart", description: `${added} item${added !== 1 ? "s" : ""} added to the patient chart.` });
      queryClient.invalidateQueries({ queryKey: ["/api/form-submissions", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/all"] });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Could not sync data to the patient chart.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-sync-review">
        <DialogHeader>
          <DialogTitle style={{ color: "#2e3a20" }}>Review & Sync to Patient Profile</DialogTitle>
        </DialogHeader>
        {preview?.patientName && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2" style={{ backgroundColor: "#f5f2ed", border: "1px solid #e0ddd6" }}>
            <UserCheck className="h-4 w-4 flex-shrink-0" style={{ color: "#5a7040" }} />
            <span className="text-sm">
              Syncing to <strong style={{ color: "#2e3a20" }}>{preview.patientName}</strong>
            </span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Check the items you'd like to add to the patient chart. Items already in the chart are shown as duplicates.
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#7a8a64" }} />
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Could not load syncable data. The patient may not be linked to this submission.
          </div>
        ) : preview ? (
          <div className="space-y-5">
            {Object.entries(preview.preview).map(([domain, items]) => {
              const Icon = DOMAIN_ICONS[domain] ?? FileText;
              const label = preview.domainLabels[domain] ?? domain;
              return (
                <div key={domain}>
                  <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: "#5a7040" }}>
                    <Icon className="w-3 h-3" />{label}
                    <span className="font-normal normal-case tracking-normal text-muted-foreground">({items.length} extracted)</span>
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">None extracted</p>
                  ) : (
                    <div className="space-y-1.5">
                      {items.map((entry, idx) => {
                        const isChecked = checkedItems[domain]?.[idx] !== false;
                        return (
                          <label
                            key={idx}
                            className={`flex items-start gap-2.5 rounded-md px-3 py-2 cursor-pointer ${entry.duplicate ? "opacity-50 cursor-default" : "hover:bg-muted/40"}`}
                            data-testid={`sync-item-${domain}-${idx}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked && !entry.duplicate}
                              disabled={entry.duplicate}
                              onChange={e => toggleItem(domain, idx, e.target.checked)}
                              className="mt-0.5 flex-shrink-0"
                              data-testid={`checkbox-sync-${domain}-${idx}`}
                            />
                            <span className="text-sm">{entry.item}</span>
                            {entry.duplicate && (
                              <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">already in chart</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
        <DialogFooter className="mt-6 gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-sync">Cancel</Button>
          <Button
            style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !hasSyncableItems}
            data-testid="button-approve-sync"
          >
            {syncMutation.isPending
              ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Syncing...</>
              : <><ArrowRight className="w-3.5 h-3.5 mr-1.5" />Approve & Sync to Chart</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const { toast } = useToast();
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
    <>
      <Dialog open={!!submissionId && !syncReviewOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
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
                  {detail.patientId && detail.syncStatus !== "synced" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSyncReviewOpen(true)}
                      data-testid="button-sync-to-profile"
                      style={{ borderColor: "#5a7040", color: "#2e3a20" }}
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1.5" style={{ color: "#5a7040" }} /> Sync to Profile
                    </Button>
                  )}
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
                  {detail.patient && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px]" style={{ color: "#5a7040" }}>
                      <UserCheck className="h-3 w-3" />
                      <span>
                        Linked to <strong>{detail.patient.firstName} {detail.patient.lastName}</strong>
                        {detail.patient.dateOfBirth && ` (DOB: ${new Date(detail.patient.dateOfBirth).toLocaleDateString()})`}
                      </span>
                    </div>
                  )}
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
                    if (sectionFields.length === 0) return null;
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

      {submissionId && (
        <SyncReviewDialog
          submissionId={submissionId}
          open={syncReviewOpen}
          onOpenChange={setSyncReviewOpen}
        />
      )}
    </>
  );
}
