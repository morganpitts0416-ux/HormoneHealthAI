import jsPDF from 'jspdf';
import { resolveBranding, PLATFORM_DEFAULT_BRANDING, type PartialBranding } from "@/lib/branding";

interface SoapPdfOptions {
  soapText: string;
  patientName: string;
  visitDate: string;
  providerName: string;
  providerTitle: string;
  providerNpi?: string | null;
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicLogo?: string | null;
  signedAt?: string | null;
  signedBy?: string | null;
  signatureImage?: string | null;
  isAmended?: boolean;
  /** Clinic-level brand colors. Falls back to platform navy if null. */
  branding?: PartialBranding | null;
  /** Document title rendered on the PDF. Defaults to "CLINICAL ENCOUNTER — SOAP NOTE". */
  noteTypeLabel?: string;
  /** Filename prefix (no extension). Defaults to "SOAP". */
  noteFilenamePrefix?: string;
  /** Optional custom footer text. When set, replaces the default clinic footer line. */
  footerText?: string | null;
}

/**
 * Serialize nurse-note blocks (from NurseNoteBuilder) into plain text for PDF rendering.
 * Handles all block types: vitals, text, dropdown, radio, checkbox, short_text.
 */
export function nurseBlocksToText(blocks: any[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    // Strip trailing colons/spaces so templates whose labels end with ":"
    // (e.g. "PATIENT'S LABS ARE:") don't produce double-colon artifacts like
    // "PATIENT'S LABS ARE:: Up to date" when the renderer appends ": value".
    const rawLabel = (block.label ?? "").trim().replace(/:+\s*$/, "").trim();
    // Only use the user-supplied label — never fall back to the type name.
    // This prevents the raw type key (e.g. "free_text") from appearing as
    // "FREE_TEXT" in the rendered note when no custom label was set.
    const label = rawLabel ? rawLabel.toUpperCase() : "";

    if (block.type === "vitals") {
      lines.push("VITAL SIGNS");
      const v = block.vitals ?? {};
      const parts: string[] = [];
      if (v.systolicBp && v.diastolicBp) parts.push(`BP: ${v.systolicBp}/${v.diastolicBp} mmHg`);
      else if (v.systolicBp) parts.push(`BP: ${v.systolicBp}/— mmHg`);
      if (v.heartRate) parts.push(`HR: ${v.heartRate} bpm`);
      if (v.respiratoryRate) parts.push(`RR: ${v.respiratoryRate} rpm`);
      if (v.temperature) parts.push(`Temp: ${v.temperature}°F`);
      if (v.oxygenSaturation) parts.push(`SpO2: ${v.oxygenSaturation}%`);
      if (v.painScore !== undefined && v.painScore !== "") parts.push(`Pain: ${v.painScore}/10`);
      if (v.heightInches) parts.push(`Ht: ${v.heightInches} in`);
      if (v.weightLbs) parts.push(`Wt: ${v.weightLbs} lbs`);
      if (v.bmi) parts.push(`BMI: ${v.bmi}`);
      lines.push(parts.length > 0 ? parts.join("  |  ") : "");
      lines.push("");
    } else if (block.type === "dropdown" || block.type === "radio") {
      if (block.selected) {
        lines.push(label ? `${label}: ${block.selected}` : block.selected);
      } else if (label) {
        lines.push(label);
      }
      lines.push("");
    } else if (block.type === "checkbox") {
      const vals = block.checkedValues?.length ? block.checkedValues.join(", ") : "";
      if (vals) {
        lines.push(label ? `${label}: ${vals}` : vals);
      } else if (label) {
        lines.push(label);
      }
      lines.push("");
    } else if (block.type === "short_text") {
      const content = (block.content ?? "").trim();
      if (content) {
        lines.push(label ? `${label}: ${content}` : content);
      } else if (label) {
        lines.push(label);
      }
      lines.push("");
    } else {
      // free_text, long_text, chief_complaint, assessment, intervention, etc.
      let text: string = block.content ?? "";
      if (block.fillValues?.length && text.includes("{{blank}}")) {
        let idx = 0;
        text = text.replace(/\{\{[^}]*\}\}/g, () => block.fillValues[idx++] ?? "");
      }
      // Only emit a heading line when the user explicitly set a label.
      // Free-text blocks without a label render content directly with no heading.
      if (label) {
        lines.push(label);
        lines.push("");
      }
      if (text.trim()) lines.push(text.trim());
      lines.push("");
    }
  }
  return lines.join("\n");
}

const PAGE_W = 215.9; // Letter width mm
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
// Use the platform default navy so all PDF types share the same fallback color
// when no clinic branding is configured (eliminates the old per-PDF-type defaults).
const SOAP_DEFAULT_PRIMARY = PLATFORM_DEFAULT_BRANDING.primaryColor; // #1f4e79

/**
 * Strip Markdown formatting syntax so it does not appear as literal characters
 * in the rendered PDF. Targets only multi-character formatting markers
 * (** __ ## ---) that AI-generated SOAP notes sometimes produce.
 * Single asterisks adjacent to numbers are left untouched (medical notation
 * like "*10^3/uL").
 */
function stripMarkdown(text: string): string {
  return text
    // Horizontal rules: line of 3+ dashes / underscores / asterisks
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '')
    // ATX headings: # ## ### etc. at start of line
    .replace(/^#{1,6}\s+/gm, '')
    // Bold + italic: ***text*** or ___text___
    .replace(/\*{3}([^*\n]+)\*{3}/g, '$1')
    .replace(/_{3}([^_\n]+)_{3}/g, '$1')
    // Bold: **text** or __text__
    .replace(/\*{2}([^*\n]+)\*{2}/g, '$1')
    .replace(/_{2}([^_\n]+)_{2}/g, '$1')
    // Italic with underscores: _word_ (not adjacent to word chars, preserves identifiers)
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
    // Blockquote markers at line start
    .replace(/^>\s?/gm, '')
    // Trailing double-space hard line breaks → single newline
    .replace(/ {2,}$/gm, '')
    // Collapse 3+ consecutive blank lines to 2
    .replace(/\n{3,}/g, '\n\n');
}

// Parse a date string safely — treats date-only strings (YYYY-MM-DD) as local
// noon so no timezone shift pushes them into the previous day.
function parseDateOnly(value: string | null | undefined): Date {
  if (!value) return new Date();
  // ISO date-only: "2026-05-07" → parse as local noon to avoid UTC shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return new Date(value.trim() + 'T12:00:00');
  }
  return new Date(value);
}

function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u00B0/g, ' deg')
    .replace(/\u00B5/g, 'u')
    .replace(/\u03BC/g, 'u')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00B1/g, '+/-')
    .replace(/\u2012/g, '-')
    .replace(/\u2015/g, '-')
    .replace(/\u00BD/g, '1/2')
    .replace(/\u00BC/g, '1/4')
    .replace(/\u00BE/g, '3/4')
    .replace(/[^\x00-\xFF]/g, ' ');
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawHRule(doc: jsPDF, y: number, color = '#cccccc'): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

export async function exportSoapPdf(opts: SoapPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  // Effective brand colors: use clinic values when set, else platform defaults.
  const resolved = resolveBranding(null, opts.branding ?? null);
  const HEADER_PRIMARY = resolved.primaryColor;
  const HEADER_ACCENT = resolved.accentColor;

  let y = MARGIN;

  // ── Letterhead ──────────────────────────────────────────────────────────────
  // Logo (left side)
  let logoEndX = MARGIN;
  if (opts.clinicLogo) {
    try {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const nw = img.naturalWidth || 400;
          const nh = img.naturalHeight || 200;
          const MAX_LOGO_W = 36; const MAX_LOGO_H = 18;
          const aspect = nw / (nh || 1);
          let lw = MAX_LOGO_W; let lh = lw / aspect;
          if (lh > MAX_LOGO_H) { lh = MAX_LOGO_H; lw = lh * aspect; }
          // Composite over white so transparent PNGs don't render with black fill
          const canvas = document.createElement('canvas');
          canvas.width = nw; canvas.height = nh;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, nw, nh);
          ctx.drawImage(img, 0, 0);
          try {
            doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', MARGIN, y + (MAX_LOGO_H - lh) / 2, lw, lh, undefined, 'FAST');
            logoEndX = MARGIN + lw + 4;
          } catch (_) {}
          resolve();
        };
        img.onerror = () => resolve();
        img.src = opts.clinicLogo!;
      });
    } catch (_) {
      // logo failed to render — skip it
    }
  }

  // Clinic text block (right-aligned)
  const textX = PAGE_W - MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(HEADER_PRIMARY);
  doc.text(opts.clinicName, textX, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#555555');
  let clinicLineY = y + 10;
  if (opts.clinicAddress) {
    doc.text(opts.clinicAddress, textX, clinicLineY, { align: 'right' });
    clinicLineY += 4.5;
  }
  if (opts.clinicPhone) {
    doc.text(opts.clinicPhone, textX, clinicLineY, { align: 'right' });
    clinicLineY += 4.5;
  }

  // Provider line below logo / above rule
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#333333');
  const providerLine = [
    opts.providerTitle,
    opts.providerName,
    opts.providerNpi ? `NPI: ${opts.providerNpi}` : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(providerLine, logoEndX, y + 22);

  y += 28;
  drawHRule(doc, y, HEADER_ACCENT);
  y += 6;

  // ── Document title row ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#111111');
  doc.text(opts.noteTypeLabel ?? 'CLINICAL ENCOUNTER — SOAP NOTE', MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#444444');
  try {
    // Signed notes: use the signing date as the official note date.
    // Unsigned drafts: fall back to the encounter visit date.
    const dateSource = opts.signedAt ? new Date(opts.signedAt) : parseDateOnly(opts.visitDate);
    const dateStr = dateSource.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    doc.text(`Date: ${dateStr}`, PAGE_W - MARGIN, y, { align: 'right' });
  } catch (_) {
    doc.text(`Date: ${opts.visitDate}`, PAGE_W - MARGIN, y, { align: 'right' });
  }

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor('#222222');
  doc.text(`Patient: ${opts.patientName}`, MARGIN, y);
  y += 7;

  drawHRule(doc, y);
  y += 7;

  // ── SOAP note body ───────────────────────────────────────────────────────────
  // Primary SOAP section headers (SUBJECTIVE, OBJECTIVE, etc.)
  const MAJOR_RE = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT\/PLAN|ASSESSMENT|PLAN|CARE PLAN|FOLLOW-UP|FOLLOW UP)$/i;

  // All-caps section labels emitted by nurse/phone note blocks (no lowercase letters at all).
  // These are structural headings like "PATIENT PRESENTS TO CLINIC TODAY FOR:" or "VITAL SIGNS".
  const ALL_CAPS_LABEL_RE = /^[^a-z]+$/;

  // Inline "Label: value" — label starts with uppercase and is at most ~120 chars,
  // followed by ": " + value.  Apostrophes, commas, numbers, parens all allowed in label.
  const INLINE_KV_RE = /^([A-Z][^:]{0,119}):\s+(.+)$/;

  const LINE_H_BODY = 5;
  const LINE_H_MAJOR = 6;
  const LINE_H_LABEL = 5.5;

  const lines = sanitizeForPdf(stripMarkdown(opts.soapText || '')).split('\n');
  const PAGE_H = 279.4;
  const FOOTER_RESERVE = opts.signedAt ? 40 : 20;

  function checkNewPage(neededY: number) {
    if (neededY > PAGE_H - FOOTER_RESERVE - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // ── Empty line → vertical whitespace ────────────────────────────────────
    if (trimmed === '') {
      y += 2.5;
      continue;
    }

    // ── Primary SOAP section (SUBJECTIVE / OBJECTIVE / ASSESSMENT / PLAN) ───
    if (MAJOR_RE.test(trimmed)) {
      checkNewPage(y + LINE_H_MAJOR + 2);
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(HEADER_PRIMARY);
      doc.text(trimmed.toUpperCase(), MARGIN, y);
      y += LINE_H_MAJOR;
      doc.setDrawColor('#aaaaaa');
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y - 1, MARGIN + 60, y - 1);
      continue;
    }

    // ── All-caps section header (nurse/phone note block labels) ─────────────
    // Must have no lowercase letters (pure ALL-CAPS content).
    // Rendered bold dark — visually distinct from plain body text but lighter
    // than the primary-colored SOAP headers above.
    if (ALL_CAPS_LABEL_RE.test(trimmed) && trimmed.length > 1) {
      checkNewPage(y + LINE_H_LABEL + 2);
      y += 1.5; // small top gap before each section label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor('#1a1a1a');
      // Strip a lone trailing colon so it doesn't look like "VITAL SIGNS:"
      const displayLabel = trimmed.replace(/:$/, '');
      doc.text(displayLabel, MARGIN, y);
      y += LINE_H_LABEL;
      continue;
    }

    // ── Inline key: value pair ───────────────────────────────────────────────
    // E.g. "PATIENT'S LABS ARE: Up to date" or "Start weight: 155".
    // Bold label + normal value, both on the same line when it fits.
    const kvMatch = INLINE_KV_RE.exec(trimmed);
    if (kvMatch) {
      checkNewPage(y + LINE_H_BODY + 2);
      const labelText = kvMatch[1].trim() + ': ';
      const restText = kvMatch[2].trim();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor('#1a1a1a');
      const labelWidth = doc.getTextWidth(labelText);
      doc.text(labelText, MARGIN, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#222222');

      const inlineLines = doc.splitTextToSize(restText, CONTENT_W - labelWidth);
      if (inlineLines.length === 1) {
        doc.text(inlineLines[0], MARGIN + labelWidth, y);
        y += LINE_H_BODY;
      } else {
        // Value is too long — wrap it on the next line(s) with slight indent
        y += LINE_H_BODY;
        const wrappedLines = doc.splitTextToSize(restText, CONTENT_W - 4);
        for (const wl of wrappedLines) {
          checkNewPage(y + LINE_H_BODY);
          doc.text(wl, MARGIN + 4, y);
          y += LINE_H_BODY;
        }
      }
      continue;
    }

    // ── Regular body text ────────────────────────────────────────────────────
    const indent = line.startsWith('   ') || line.startsWith('\t') ? 6 : 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#222222');
    const wrappedLines = doc.splitTextToSize(trimmed, CONTENT_W - indent);
    for (const wl of wrappedLines) {
      checkNewPage(y + LINE_H_BODY);
      doc.text(wl, MARGIN + indent, y);
      y += LINE_H_BODY;
    }
  }

  // ── Signature block ──────────────────────────────────────────────────────────
  if (opts.signedAt) {
    y += 8;
    checkNewPage(y + 35);

    drawHRule(doc, y, '#4ade80');
    y += 6;

    // Signature image
    if (opts.signatureImage) {
      try {
        const ext = opts.signatureImage.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(opts.signatureImage, ext, MARGIN, y, 60, 20, undefined, 'FAST');
        y += 23;
      } catch (_) {
        // skip if image fails
      }
    }

    // Signature text block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#166534');
    const statusLabel = opts.isAmended ? 'Amended and Electronically Signed' : 'Electronically Signed';
    doc.text(statusLabel, MARGIN, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#333333');
    doc.text(`Signed by: ${opts.signedBy ?? opts.providerName}`, MARGIN, y);
    y += 4.5;

    try {
      const signedDate = new Date(opts.signedAt).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      doc.text(`Signed on: ${signedDate}`, MARGIN, y);
    } catch (_) {
      doc.text(`Signed on: ${opts.signedAt}`, MARGIN, y);
    }
    y += 4.5;

    doc.setFontSize(7.5);
    doc.setTextColor('#777777');
    doc.text(
      'This document has been electronically signed and constitutes a legally valid clinical record.',
      MARGIN, y,
    );
  }

  // ── Footer (every page) ──────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor('#aaaaaa');
    const footerCenter = opts.footerText
      ? sanitizeForPdf(opts.footerText)
      : `${opts.clinicName}  ·  CONFIDENTIAL — FOR AUTHORIZED USE ONLY`;
    doc.text(
      `${footerCenter}  ·  Page ${i} of ${pageCount}`,
      PAGE_W / 2,
      PAGE_H - 8,
      { align: 'center' },
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const safeName = opts.patientName.replace(/[^a-z0-9]/gi, '_');
  const safeDate = opts.visitDate.replace(/\//g, '-');
  const prefix = opts.noteFilenamePrefix ?? 'SOAP';
  doc.save(`${prefix}_${safeName}_${safeDate}.pdf`);
}
