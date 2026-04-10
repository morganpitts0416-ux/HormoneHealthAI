import jsPDF from 'jspdf';

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
}

const PAGE_W = 215.9; // Letter width mm
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_GREEN = '#2e3a20';

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

  let y = MARGIN;

  // ── Letterhead ──────────────────────────────────────────────────────────────
  // Logo (left side)
  let logoEndX = MARGIN;
  if (opts.clinicLogo) {
    try {
      const ext = opts.clinicLogo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.clinicLogo, ext, MARGIN, y, 36, 18, undefined, 'FAST');
      logoEndX = MARGIN + 40;
    } catch (_) {
      // logo failed to render — skip it
    }
  }

  // Clinic text block (right-aligned)
  const textX = PAGE_W - MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(HEADER_GREEN);
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
  drawHRule(doc, y, HEADER_GREEN);
  y += 6;

  // ── Document title row ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#111111');
  doc.text('CLINICAL ENCOUNTER — SOAP NOTE', MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#444444');
  try {
    const dateStr = new Date(opts.visitDate).toLocaleDateString('en-US', {
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
  const MAJOR_RE = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT\/PLAN|ASSESSMENT|PLAN|CARE PLAN|FOLLOW-UP|FOLLOW UP)$/i;
  const SUB_LABEL_RE = /^([A-Z][A-Za-z\s\/\-]+):(\s*.+)$/;
  const LINE_H_BODY = 5;
  const LINE_H_MAJOR = 6;

  const lines = (opts.soapText || '').split('\n');
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

    if (MAJOR_RE.test(line.trim())) {
      checkNewPage(y + LINE_H_MAJOR + 2);
      if (line.trim() !== lines[0]?.trimEnd().trim()) y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(HEADER_GREEN);
      doc.text(line.trim().toUpperCase(), MARGIN, y);
      y += LINE_H_MAJOR;
      // thin underline
      doc.setDrawColor('#aaaaaa');
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y - 1, MARGIN + 60, y - 1);
      continue;
    }

    if (line.trim() === '') {
      y += 2.5;
      continue;
    }

    const subMatch = SUB_LABEL_RE.exec(line.trim());
    if (subMatch) {
      checkNewPage(y + LINE_H_BODY + 2);
      const labelText = subMatch[1] + ': ';
      const restText = subMatch[2].trim();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor('#333333');
      const labelWidth = doc.getTextWidth(labelText);

      doc.text(labelText, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#111111');

      if (labelWidth + doc.getTextWidth(restText) < CONTENT_W) {
        doc.text(restText, MARGIN + labelWidth, y);
        y += LINE_H_BODY;
      } else {
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

    // Regular line (body / list items)
    const indent = line.startsWith('   ') || line.startsWith('\t') ? 6 : 0;
    const trimmed = line.trim();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#111111');

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
    doc.text(
      `${opts.clinicName}  ·  CONFIDENTIAL — FOR AUTHORIZED USE ONLY  ·  Page ${i} of ${pageCount}`,
      PAGE_W / 2,
      PAGE_H - 8,
      { align: 'center' },
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const safeName = opts.patientName.replace(/[^a-z0-9]/gi, '_');
  const safeDate = opts.visitDate.replace(/\//g, '-');
  doc.save(`SOAP_${safeName}_${safeDate}.pdf`);
}
