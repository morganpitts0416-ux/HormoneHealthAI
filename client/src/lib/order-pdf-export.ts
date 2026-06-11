import jsPDF from 'jspdf';
import { resolveBranding, type PartialBranding } from "@/lib/branding";

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_W = 215.9;   // Letter width (mm)
const PAGE_H = 279.4;   // Letter height (mm)
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface OrderPdfPatient {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  mrn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  insuranceCarrier?: string | null;
  insuranceMemberId?: string | null;
}

export interface OrderPdfOrder {
  orderType: string;
  subtype: string;
  referringTo?: string | null;
  facilityAddress?: string | null;
  facilityFax?: string | null;
  reason?: string | null;
  priority: string;
  targetDate?: string | null;
  diagnosisCode?: string | null;
  diagnosisName?: string | null;
  cptCode?: string | null;
  cptDescription?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface OrderPdfOptions {
  order: OrderPdfOrder;
  patient: OrderPdfPatient;
  providerName: string;
  providerTitle?: string | null;
  providerNpi?: string | null;
  signatureImage?: string | null;
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicLogo?: string | null;
  footerText?: string | null;
  branding?: PartialBranding | null;
  medications?: string[] | null;
  medicalHistory?: string[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(text: string): string {
  return text
    .replace(/\u2013/g, '-').replace(/\u2014/g, '--')
    .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"').replace(/\u201D/g, '"')
    .replace(/\u2026/g, '...').replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*').replace(/\u00B0/g, ' deg')
    .replace(/[^\x00-\xFF]/g, ' ');
}

function drawHRule(doc: jsPDF, y: number, color = '#cccccc'): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
}

function formatDob(dob: string | null | undefined): string {
  if (!dob) return '';
  try {
    const d = /^\d{4}-\d{2}-\d{2}/.test(dob)
      ? new Date(dob + (dob.length === 10 ? 'T12:00:00' : ''))
      : new Date(dob);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch { return dob; }
}

function calcAge(dob: string | null | undefined): string {
  if (!dob) return '';
  try {
    const birth = /^\d{4}-\d{2}-\d{2}/.test(dob)
      ? new Date(dob + (dob.length === 10 ? 'T12:00:00' : ''))
      : new Date(dob);
    const age = Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    return isNaN(age) ? '' : `${age} yrs`;
  } catch { return ''; }
}

function formatOrderDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return dateStr; }
}

function orderTypeTitle(type: string): string {
  switch (type) {
    case 'referral': return 'REFERRAL ORDER';
    case 'imaging': return 'IMAGING ORDER';
    case 'health_maintenance': return 'HEALTH MAINTENANCE ORDER';
    default: return 'CLINICAL ORDER';
  }
}

function labelFor(type: string, field: 'facility' | 'test'): string {
  if (field === 'facility') {
    switch (type) {
      case 'referral': return 'Referring To:';
      case 'imaging': return 'Imaging Center:';
      default: return 'Facility:';
    }
  }
  switch (type) {
    case 'referral': return 'Specialty / Service:';
    case 'imaging': return 'Study / Test:';
    default: return 'Screening / Service:';
  }
}

function facilityLabel(type: string): string {
  switch (type) {
    case 'referral': return 'REFERRING TO';
    case 'imaging': return 'IMAGING CENTER';
    default: return 'FACILITY';
  }
}

// ── Letterhead ─────────────────────────────────────────────────────────────────
async function drawLetterhead(
  doc: jsPDF,
  opts: OrderPdfOptions,
  resolved: ReturnType<typeof resolveBranding>,
  y: number,
): Promise<number> {
  const HEADER_PRIMARY = resolved.primaryColor;
  const HEADER_ACCENT = resolved.accentColor;

  let logoEndX = MARGIN;
  if (opts.clinicLogo) {
    try {
      const ext = opts.clinicLogo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.clinicLogo, ext, MARGIN, y, 36, 18, undefined, 'FAST');
      logoEndX = MARGIN + 40;
    } catch (_) { /* skip */ }
  }

  // Clinic name + contact (right-aligned)
  const textX = PAGE_W - MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(HEADER_PRIMARY);
  doc.text(sanitize(opts.clinicName), textX, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#555555');
  let lineY = y + 10;
  if (opts.clinicAddress) { doc.text(sanitize(opts.clinicAddress), textX, lineY, { align: 'right' }); lineY += 4.5; }
  if (opts.clinicPhone)   { doc.text(sanitize(opts.clinicPhone),   textX, lineY, { align: 'right' }); lineY += 4.5; }

  // Provider line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#333333');
  const parts = [opts.providerTitle, opts.providerName, opts.providerNpi ? `NPI: ${opts.providerNpi}` : null].filter(Boolean);
  doc.text(sanitize(parts.join('  ·  ')), logoEndX, y + 22);

  y += 28;
  drawHRule(doc, y, HEADER_ACCENT);
  return y + 6;
}

// ── Footer (stamped on every page after generation) ───────────────────────────
function stampFooters(doc: jsPDF, opts: OrderPdfOptions): void {
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor('#aaaaaa');
    const center = opts.footerText
      ? sanitize(opts.footerText)
      : `${sanitize(opts.clinicName)}  ·  CONFIDENTIAL`;
    doc.text(`${center}  ·  Page ${i} of ${count}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
  }
}

// ── Bullet list helper (used on page 2) ───────────────────────────────────────
async function drawBulletList(
  doc: jsPDF,
  items: string[],
  opts: OrderPdfOptions,
  resolved: ReturnType<typeof resolveBranding>,
  dy: number,
): Promise<number> {
  for (const item of items) {
    if (dy > PAGE_H - 30) {
      doc.addPage();
      dy = MARGIN;
      dy = await drawLetterhead(doc, opts, resolved, dy);
    }
    const lines = doc.splitTextToSize(sanitize(item), CONTENT_W - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#111827');
    doc.text('\u2022', MARGIN + 2, dy);
    doc.text(lines, MARGIN + 7, dy);
    dy += lines.length * 4.8 + 1.5;
  }
  return dy;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateOrderPDF(opts: OrderPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const resolved = resolveBranding(null, opts.branding ?? null);
  const ACCENT = resolved.accentColor;
  const PRIMARY = resolved.primaryColor;

  const { order, patient } = opts;
  const patientFullName = sanitize(`${patient.firstName} ${patient.lastName}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — ORDER FORM
  // ═══════════════════════════════════════════════════════════════════════════
  let y = MARGIN;
  y = await drawLetterhead(doc, opts, resolved, y);

  // ── Document title row ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(PRIMARY);
  doc.text(orderTypeTitle(order.orderType), MARGIN, y);

  // Date (right-aligned)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#555555');
  doc.text(formatOrderDate(order.createdAt), PAGE_W - MARGIN, y, { align: 'right' });

  // Priority badge (if not routine)
  if (order.priority !== 'routine') {
    y += 5;
    const priorityLabel = order.priority === 'stat' ? 'STAT' : 'URGENT';
    const pColor = order.priority === 'stat' ? '#dc2626' : '#d97706';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(pColor);
    doc.text(`Priority: ${priorityLabel}`, MARGIN, y);
  }
  y += 8;

  // ── Patient info block ────────────────────────────────────────────────────
  // Calculate how many info lines we have so the box sizes correctly
  const dobStr = formatDob(patient.dateOfBirth);
  const genderStr = patient.gender ? (patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)) : '';
  const ageStr = calcAge(patient.dateOfBirth);
  const hasLine2 = !!(dobStr || genderStr);
  const phoneMrnParts = [
    patient.mrn   ? `MRN: ${patient.mrn}`           : null,
    patient.phone ? `Tel: ${sanitize(patient.phone)}` : null,
    patient.email ? sanitize(patient.email)            : null,
  ].filter(Boolean);
  const hasLine3 = phoneMrnParts.length > 0;
  const hasLine4 = !!(patient.address);
  const infoLineCount = (hasLine2 ? 1 : 0) + (hasLine3 ? 1 : 0) + (hasLine4 ? 1 : 0);
  const patBoxH = 12 + infoLineCount * 5.5;

  doc.setFillColor(247, 248, 250);
  doc.setDrawColor('#e2e8f0');
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, patBoxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor('#111827');
  doc.text('Patient:', MARGIN + 4, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(patientFullName, MARGIN + 22, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#374151');

  let infoY = y + 13;
  if (hasLine2) {
    const dobLine = ['D.O.B.:', dobStr, ageStr ? `(${ageStr})` : '', genderStr ? `\u2014 ${genderStr}` : ''].filter(Boolean).join(' ');
    doc.text(dobLine, MARGIN + 4, infoY);
    infoY += 5.5;
  }
  if (hasLine3) {
    doc.text(phoneMrnParts.join('   '), MARGIN + 4, infoY);
    infoY += 5.5;
  }
  if (hasLine4) {
    doc.text(sanitize(patient.address!), MARGIN + 4, infoY);
  }

  y += patBoxH + 8;

  // ── Facility / Referring-to box ──────────────────────────────────────────
  // Shown when any facility info is present — blue-tinted, distinct from patient box
  const hasFacility = !!(order.referringTo || order.facilityAddress || order.facilityFax);
  if (hasFacility) {
    // Pre-calculate address line count for box height
    const addrLines = order.facilityAddress
      ? doc.splitTextToSize(sanitize(order.facilityAddress), CONTENT_W - 10)
      : [];
    const facilityLineCount =
      (order.referringTo ? 1 : 0) +
      (addrLines.length > 0 ? addrLines.length : 0) +
      (order.facilityFax ? 1 : 0);
    const facBoxH = 10 + facilityLineCount * 5.5 + 2;

    doc.setFillColor(239, 246, 255);
    doc.setDrawColor('#bfdbfe');
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, facBoxH, 2, 2, 'FD');

    let fy = y + 6;

    // Section header label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor('#1d4ed8');
    doc.text(facilityLabel(order.orderType), MARGIN + 4, fy);
    fy += 5.5;

    if (order.referringTo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor('#1e3a8a');
      doc.text(sanitize(order.referringTo), MARGIN + 4, fy);
      fy += 5.5;
    }
    if (addrLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#374151');
      doc.text(addrLines, MARGIN + 4, fy);
      fy += addrLines.length * 5 + 0.5;
    }
    if (order.facilityFax) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#374151');
      doc.text(`Fax: ${sanitize(order.facilityFax)}`, MARGIN + 4, fy);
    }

    y += facBoxH + 6;
  }

  // ── Order content (test, CPT, reason, target date, notes) ─────────────────
  const hasIcd = !!(order.diagnosisCode);
  const leftW = hasIcd ? CONTENT_W * 0.62 : CONTENT_W;
  const rightX = MARGIN + leftW + 4;
  const rightW = CONTENT_W - leftW - 4;

  function labeledRow(label: string, value: string) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#1f2937');
    doc.text(sanitize(label), MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#374151');
    const wrapped = doc.splitTextToSize(sanitize(value), leftW - 2);
    doc.text(wrapped, MARGIN, y + 4.5);
    y += 4.5 + wrapped.length * 4.5 + 3;
  }

  const startY = y;

  // Test / Study
  labeledRow(labelFor(order.orderType, 'test'), order.subtype);

  // CPT
  if (order.cptCode) {
    const cptLine = order.cptDescription ? `${order.cptCode} \u2014 ${order.cptDescription}` : order.cptCode;
    labeledRow('CPT Code:', cptLine);
  }

  // Reason
  if (order.reason) {
    labeledRow('Reason / Clinical Indication:', order.reason);
  }

  // Target date
  if (order.targetDate) {
    const tDate = new Date(order.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    labeledRow('Requested By:', tDate);
  }

  // ── ICD-10 box (right column) ──────────────────────────────────────────────
  if (hasIcd) {
    const icdBoxX = rightX;
    const icdBoxY = startY - 2;
    const icdBoxW = rightW;

    doc.setFillColor(239, 246, 255);
    doc.setDrawColor('#bfdbfe');
    doc.setLineWidth(0.4);
    doc.roundedRect(icdBoxX, icdBoxY, icdBoxW, 8, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor('#1d4ed8');
    doc.text('ICD-10 Diagnosis', icdBoxX + icdBoxW / 2, icdBoxY + 5, { align: 'center' });

    const codeBoxY = icdBoxY + 10;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor('#dbeafe');
    doc.roundedRect(icdBoxX, codeBoxY, icdBoxW, 22, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor('#1e40af');
    doc.text(sanitize(order.diagnosisCode!), icdBoxX + 3, codeBoxY + 7);

    if (order.diagnosisName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor('#374151');
      const nameLines = doc.splitTextToSize(sanitize(order.diagnosisName), icdBoxW - 6);
      doc.text(nameLines.slice(0, 3), icdBoxX + 3, codeBoxY + 13);
    }
  }

  // ── Ordering Provider / Signature ──────────────────────────────────────────
  y += 4;
  drawHRule(doc, y, '#e5e7eb');
  y += 6;

  const provLine = [opts.providerTitle, opts.providerName].filter(Boolean).join(' ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#374151');
  doc.text(`Ordered by: ${sanitize(provLine)}`, MARGIN, y);
  y += 5;

  y += 4;
  drawHRule(doc, y, '#4ade80');
  y += 6;

  if (opts.signatureImage) {
    try {
      const ext = opts.signatureImage.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.signatureImage, ext, MARGIN, y, 55, 18, undefined, 'FAST');
      y += 21;
    } catch (_) { /* skip */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor('#166534');
  doc.text('Signed electronically by:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(` ${sanitize(provLine)}`, MARGIN + 38, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#555555');
  doc.text(`on ${formatOrderDate(order.createdAt)}`, MARGIN, y);
  if (opts.providerNpi) {
    y += 4.5;
    doc.text(`NPI: ${opts.providerNpi}`, MARGIN, y);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — PATIENT DEMOGRAPHICS SHEET
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  let dy = MARGIN;
  dy = await drawLetterhead(doc, opts, resolved, dy);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(PRIMARY);
  doc.text('PATIENT DEMOGRAPHIC SHEET', MARGIN, dy);
  dy += 3;
  drawHRule(doc, dy + 2, ACCENT);
  dy += 10;

  // Subtitle
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor('#6b7280');
  doc.text('Provided as a convenience for the receiving facility. Please verify directly with patient.', MARGIN, dy);
  dy += 9;

  // ── Demographics table ─────────────────────────────────────────────────────
  function demoRow(label: string, value: string) {
    if (!value.trim()) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor('#374151');
    doc.text(sanitize(label), MARGIN + 4, dy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#111827');
    const wrapped = doc.splitTextToSize(sanitize(value), CONTENT_W - 50);
    doc.text(wrapped, MARGIN + 46, dy);
    dy += wrapped.length * 4.8 + 1;
  }

  const demoRows: [string, string][] = [
    ['Patient Name:',  patientFullName],
    ['Date of Birth:', formatDob(patient.dateOfBirth)],
    ['Age:',           calcAge(patient.dateOfBirth)],
    ['Sex:',           patient.gender ? (patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)) : ''],
    ['MRN:',           patient.mrn ?? ''],
    ['Phone:',         patient.phone ?? ''],
    ['Email:',         patient.email ?? ''],
    ['Address:',       patient.address ?? ''],
  ].filter(([, v]) => v.trim() !== '') as [string, string][];

  const demoBoxH = demoRows.length * 6 + 8;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor('#e5e7eb');
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, dy - 2, CONTENT_W, demoBoxH, 2, 2, 'FD');
  dy += 4;

  for (const [label, value] of demoRows) {
    demoRow(label, value);
  }
  dy += 8;

  // ── Insurance block ────────────────────────────────────────────────────────
  if (patient.insuranceCarrier || patient.insuranceMemberId) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PRIMARY);
    doc.text('INSURANCE INFORMATION', MARGIN, dy);
    dy += 2;
    drawHRule(doc, dy + 2, '#e5e7eb');
    dy += 8;

    const insRows: [string, string][] = [
      ['Insurance Carrier:', patient.insuranceCarrier ?? ''],
      ['Member ID:',         patient.insuranceMemberId ?? ''],
    ].filter(([, v]) => v.trim() !== '') as [string, string][];

    const insBoxH = insRows.length * 6 + 8;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor('#e5e7eb');
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, dy - 2, CONTENT_W, insBoxH, 2, 2, 'FD');
    dy += 4;

    for (const [label, value] of insRows) {
      demoRow(label, value);
    }
    dy += 8;
  }

  // ── Current Medications ────────────────────────────────────────────────────
  const meds = (opts.medications ?? []).filter(Boolean);
  if (meds.length > 0) {
    if (dy > PAGE_H - 35) {
      doc.addPage();
      dy = MARGIN;
      dy = await drawLetterhead(doc, opts, resolved, dy);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PRIMARY);
    doc.text('CURRENT MEDICATIONS', MARGIN, dy);
    dy += 2;
    drawHRule(doc, dy + 2, '#e5e7eb');
    dy += 9;
    dy = await drawBulletList(doc, meds, opts, resolved, dy);
    dy += 6;
  }

  // ── Medical History ────────────────────────────────────────────────────────
  const history = (opts.medicalHistory ?? []).filter(Boolean);
  if (history.length > 0) {
    if (dy > PAGE_H - 35) {
      doc.addPage();
      dy = MARGIN;
      dy = await drawLetterhead(doc, opts, resolved, dy);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(PRIMARY);
    doc.text('MEDICAL HISTORY', MARGIN, dy);
    dy += 2;
    drawHRule(doc, dy + 2, '#e5e7eb');
    dy += 9;
    dy = await drawBulletList(doc, history, opts, resolved, dy);
    dy += 6;
  }

  // ── Ordering provider summary ──────────────────────────────────────────────
  if (dy > PAGE_H - 40) {
    doc.addPage();
    dy = MARGIN;
    dy = await drawLetterhead(doc, opts, resolved, dy);
  }
  dy += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(PRIMARY);
  doc.text('ORDERING PROVIDER', MARGIN, dy);
  dy += 2;
  drawHRule(doc, dy + 2, '#e5e7eb');
  dy += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor('#374151');
  const orderingLine = [opts.providerTitle, opts.providerName, opts.providerNpi ? `NPI: ${opts.providerNpi}` : null].filter(Boolean).join('  \u00b7  ');
  doc.text(sanitize(orderingLine), MARGIN, dy);
  dy += 5;
  doc.setFontSize(8);
  doc.setTextColor('#6b7280');
  doc.text(opts.clinicName, MARGIN, dy);
  if (opts.clinicPhone) { dy += 4.5; doc.text(sanitize(opts.clinicPhone), MARGIN, dy); }

  // Stamp footers on all pages
  stampFooters(doc, opts);

  // Save
  const safeName = patientFullName.replace(/[^a-z0-9]/gi, '_');
  const typeSlug = order.orderType === 'health_maintenance' ? 'HealthMaint' : order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1);
  doc.save(`${typeSlug}_Order_${safeName}.pdf`);
}
