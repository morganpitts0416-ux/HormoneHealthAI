import jsPDF from 'jspdf';
import { resolveBranding, type PartialBranding } from "@/lib/branding";
import type { PatientMedication } from "@/components/add-medication-dialog";
import { formatMedSig } from "@/components/add-medication-dialog";

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PRIMARY = '#1e3a1e';

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function drawSectionHeader(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(PRIMARY);
  doc.text(title, MARGIN, y);
  y += 2;
  drawHRule(doc, y + 2, '#e5e7eb');
  y += 8;
  return y;
}

function drawFieldRow(doc: jsPDF, label: string, value: string, y: number): number {
  if (!value?.trim()) return y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor('#374151');
  doc.text(sanitize(label), MARGIN + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#111827');
  const wrapped = doc.splitTextToSize(sanitize(value), CONTENT_W - 54);
  doc.text(wrapped, MARGIN + 50, y);
  y += wrapped.length * 4.8 + 1;
  return y;
}

function maybeNewPage(doc: jsPDF, y: number, logoBase64?: string | null, clinicName?: string): number {
  if (y > PAGE_H - 35) {
    doc.addPage();
    y = MARGIN + 8;
  }
  return y;
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface DemographicsPatient {
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
  driversLicense?: string | null;
  ssn?: string | null;
  race?: string | null;
  ethnicity?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  primaryProvider?: string | null;
}

export interface DemographicsPdfOptions {
  patient: DemographicsPatient;
  providerName?: string | null;
  providerTitle?: string | null;
  providerNpi?: string | null;
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicFax?: string | null;
  clinicLogo?: string | null;
  footerText?: string | null;
  branding?: PartialBranding | null;
  structuredMeds?: PatientMedication[];
  legacyMeds?: string[];
}

// ── Main Generator ─────────────────────────────────────────────────────────────
export async function generateDemographicsPDF(opts: DemographicsPdfOptions): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const resolved = resolveBranding(opts.branding ?? null);
  const p = opts.patient;
  const patientFullName = `${p.firstName} ${p.lastName}`.trim();

  let dy = MARGIN;

  // ── Letterhead ──────────────────────────────────────────────────────────────
  let logoEndX = MARGIN;
  if (opts.clinicLogo) {
    try {
      const ext = opts.clinicLogo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(opts.clinicLogo, ext, MARGIN, dy, 36, 18, undefined, 'FAST');
      logoEndX = MARGIN + 40;
    } catch (_) { /* skip */ }
  }

  const textX = PAGE_W - MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(resolved.primaryColor);
  doc.text(sanitize(opts.clinicName), textX, dy + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#555555');
  let lineY = dy + 10;
  if (opts.clinicAddress) { doc.text(sanitize(opts.clinicAddress), textX, lineY, { align: 'right' }); lineY += 4.5; }
  if (opts.clinicPhone)   { doc.text(`Tel: ${sanitize(opts.clinicPhone)}`, textX, lineY, { align: 'right' }); lineY += 4.5; }
  if (opts.clinicFax)     { doc.text(`Fax: ${sanitize(opts.clinicFax)}`, textX, lineY, { align: 'right' }); lineY += 4.5; }

  if (opts.providerName) {
    const provParts = [opts.providerTitle, opts.providerName, opts.providerNpi ? `NPI: ${opts.providerNpi}` : null].filter(Boolean);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#333333');
    doc.text(sanitize(provParts.join('  ·  ')), logoEndX, dy + 22);
  }
  dy += 28;

  // Thin rule under letterhead
  drawHRule(doc, dy, resolved.accentColor);
  dy += 6;

  // ── Document title ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(PRIMARY);
  doc.text('PATIENT DEMOGRAPHICS SHEET', PAGE_W / 2, dy, { align: 'center' });
  dy += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#6b7280');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, PAGE_W / 2, dy + 3, { align: 'center' });
  dy += 10;
  drawHRule(doc, dy, '#e5e7eb');
  dy += 8;

  // ── Core demographics ──────────────────────────────────────────────────────
  dy = drawSectionHeader(doc, 'PATIENT INFORMATION', dy);

  const coreRows: [string, string][] = [
    ['Patient Name:', patientFullName],
    ['Date of Birth:', formatDob(p.dateOfBirth)],
    ['Age:', calcAge(p.dateOfBirth)],
    ['Sex:', p.gender ? (p.gender.charAt(0).toUpperCase() + p.gender.slice(1)) : ''],
    ['MRN:', p.mrn ?? ''],
    ['Phone:', p.phone ?? ''],
    ['Email:', p.email ?? ''],
    ['Address:', p.address ?? ''],
    ['Primary Provider:', p.primaryProvider ?? ''],
  ].filter(([, v]) => v.trim() !== '') as [string, string][];

  const coreBoxH = coreRows.length * 5.8 + 8;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor('#e5e7eb');
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, dy - 2, CONTENT_W, coreBoxH, 2, 2, 'FD');
  dy += 4;
  for (const [label, value] of coreRows) {
    dy = drawFieldRow(doc, label, value, dy);
  }
  dy += 8;

  // ── Additional Demographics ────────────────────────────────────────────────
  const addlRows: [string, string][] = [
    ['Race:', p.race ?? ''],
    ['Ethnicity:', p.ethnicity ?? ''],
    ['Marital Status:', p.maritalStatus ?? ''],
    ['Occupation:', p.occupation ?? ''],
  ].filter(([, v]) => v.trim() !== '') as [string, string][];

  if (addlRows.length > 0) {
    dy = maybeNewPage(doc, dy);
    dy = drawSectionHeader(doc, 'ADDITIONAL DEMOGRAPHICS', dy);
    const addlBoxH = addlRows.length * 5.8 + 8;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor('#e5e7eb');
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, dy - 2, CONTENT_W, addlBoxH, 2, 2, 'FD');
    dy += 4;
    for (const [label, value] of addlRows) {
      dy = drawFieldRow(doc, label, value, dy);
    }
    dy += 8;
  }

  // ── Emergency Contact ──────────────────────────────────────────────────────
  const ecRows: [string, string][] = [
    ['Name:', p.emergencyContactName ?? ''],
    ['Relationship:', p.emergencyContactRelationship ?? ''],
    ['Phone:', p.emergencyContactPhone ?? ''],
  ].filter(([, v]) => v.trim() !== '') as [string, string][];

  if (ecRows.length > 0) {
    dy = maybeNewPage(doc, dy);
    dy = drawSectionHeader(doc, 'EMERGENCY CONTACT', dy);
    const ecBoxH = ecRows.length * 5.8 + 8;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor('#e5e7eb');
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, dy - 2, CONTENT_W, ecBoxH, 2, 2, 'FD');
    dy += 4;
    for (const [label, value] of ecRows) {
      dy = drawFieldRow(doc, label, value, dy);
    }
    dy += 8;
  }

  // ── Insurance ──────────────────────────────────────────────────────────────
  const insRows: [string, string][] = [
    ['Insurance Carrier:', p.insuranceCarrier ?? ''],
    ['Member ID:', p.insuranceMemberId ?? ''],
    ["Driver's License:", p.driversLicense ?? ''],
  ].filter(([, v]) => v.trim() !== '') as [string, string][];

  if (insRows.length > 0) {
    dy = maybeNewPage(doc, dy);
    dy = drawSectionHeader(doc, 'INSURANCE & ID', dy);
    const insBoxH = insRows.length * 5.8 + 8;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor('#e5e7eb');
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, dy - 2, CONTENT_W, insBoxH, 2, 2, 'FD');
    dy += 4;
    for (const [label, value] of insRows) {
      dy = drawFieldRow(doc, label, value, dy);
    }
    dy += 8;
  }

  // ── Structured Medications ─────────────────────────────────────────────────
  const activeMeds = (opts.structuredMeds ?? []).filter(m => m.status === 'active');
  if (activeMeds.length > 0) {
    dy = maybeNewPage(doc, dy);
    dy = drawSectionHeader(doc, 'CURRENT MEDICATIONS', dy);
    for (const med of activeMeds) {
      dy = maybeNewPage(doc, dy);
      const sig = formatMedSig(med);
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor('#1e3a1e');
      const sigWrapped = doc.splitTextToSize(sanitize(sig), CONTENT_W - 8);
      doc.text(sigWrapped, MARGIN + 4, dy);
      dy += sigWrapped.length * 4.8;
      if (med.indication) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor('#6b7280');
        doc.text(sanitize(`Indication: ${med.indication}`), MARGIN + 4, dy);
        dy += 4.5;
      }
      if (!med.reviewedByProvider) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor('#b45309');
        doc.text('Patient-reported', MARGIN + 4, dy);
        dy += 4.5;
      }
      dy += 1;
    }
    dy += 4;
  }

  // ── Legacy Medication List ─────────────────────────────────────────────────
  const legacyMeds = (opts.legacyMeds ?? []).filter(Boolean);
  if (legacyMeds.length > 0) {
    dy = maybeNewPage(doc, dy);
    const legacyTitle = activeMeds.length > 0 ? 'LEGACY MEDICATION LIST' : 'CURRENT MEDICATIONS';
    dy = drawSectionHeader(doc, legacyTitle, dy);
    for (const med of legacyMeds) {
      dy = maybeNewPage(doc, dy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor('#111827');
      doc.text('\u2022', MARGIN + 2, dy);
      const wrapped = doc.splitTextToSize(sanitize(med), CONTENT_W - 10);
      doc.text(wrapped, MARGIN + 8, dy);
      dy += wrapped.length * 4.8 + 1;
    }
    dy += 4;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footY = PAGE_H - 10;
    drawHRule(doc, footY - 4, '#e5e7eb');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor('#9ca3af');
    const footLeft = opts.footerText ? sanitize(opts.footerText) : sanitize(opts.clinicName);
    doc.text(footLeft, MARGIN, footY);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, footY, { align: 'right' });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const safeName = patientFullName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  doc.save(`${safeName}_Demographics_Sheet.pdf`);
}
