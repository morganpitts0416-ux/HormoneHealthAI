import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LabValues, InterpretationResult, LabResult } from '@shared/schema';
import { generateTrendInsights } from '@/lib/clinical-trend-insights';
import { hexToRgb, resolveBranding, type PartialBranding } from "@/lib/branding";
import { toLocalDateStr } from '@/lib/date-utils';

// Sanitize text to replace Unicode characters that cause PDF spacing issues
// Converts to ASCII-safe equivalents while preserving medical meaning
function sanitizeForPdf(text: string): string {
  return text
    // Replace smart quotes with regular quotes
    .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes → "
    .replace(/[\u2018\u2019]/g, "'")  // Smart single quotes → '
    .replace(/[\u201E\u201F]/g, '"')  // Other quote variants → "
    .replace(/[\u2039\u203A]/g, "'")  // Single angle quotes → '
    // Replace em/en dashes with regular dash
    .replace(/[\u2013\u2014]/g, '-')  // Em dash, en dash → -
    // Replace bullet points with asterisk
    .replace(/[\u2022\u2023\u25E6\u2043\u25AA\u25AB]/g, '*')
    // Replace mathematical symbols with ASCII equivalents
    .replace(/[\u2265]/g, '>=')  // ≥ → >=
    .replace(/[\u2264]/g, '<=')  // ≤ → <=
    .replace(/[\u00B1]/g, '+/-') // ± → +/-
    .replace(/[\u00D7]/g, 'x')   // × → x (multiplication)
    .replace(/[\u00F7]/g, '/')   // ÷ → /
    .replace(/[\u2192]/g, '->')  // → (arrow) → ->
    .replace(/[\u2190]/g, '<-')  // ← → <-
    // Replace degree symbol (may cause issues)
    .replace(/[\u00B0]/g, ' deg')  // ° → deg
    // Replace micro (µ) - this is critical for medical units
    .replace(/[\u00B5\u03BC]/g, 'u')  // µ → u (micro)
    // Replace ellipsis
    .replace(/[\u2026]/g, '...')
    // Replace non-breaking spaces and other whitespace
    .replace(/[\u00A0\u202F]/g, ' ')
    // Remove any remaining problematic Unicode characters
    .replace(/[^\x20-\x7E\n\r\t]/g, '');
}

export async function generateLabReportPDF(
  labValues: LabValues,
  interpretation: InterpretationResult,
  patientName?: string,
  clinicName?: string,
  labHistory?: LabResult[],
  /** Clinic-level brand colors. Falls back to historic navy if null. */
  branding?: PartialBranding | null,
  /** Clinic logo data URL or remote URL; shown top-left when provided. */
  clinicLogo?: string | null,
  /** Canonical clinician-facing Patient Communication Summary for this lab. */
  patientCommunicationSummary?: string | null,
): Promise<void> {
  const displayClinicName = clinicName || "Your Health Clinic";
  // Effective heading color: clinic primary if set, else historic navy.
  const HEADING_RGB: [number, number, number] = branding?.primaryColor
    ? hexToRgb(resolveBranding(null, branding).primaryColor)
    : [31, 78, 121];
  // Load clinic logo for PDF — composite over white to avoid jsPDF alpha-channel corruption
  let logoData: string | null = null;
  let logoNaturalW = 0;
  let logoNaturalH = 0;
  try {
    const src = clinicLogo || null;
    if (src) {
      logoData = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          logoNaturalW = img.naturalWidth || 400;
          logoNaturalH = img.naturalHeight || 200;
          const canvas = document.createElement('canvas');
          canvas.width = logoNaturalW;
          canvas.height = logoNaturalH;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = src;
      });
    }
  } catch {}

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: true,
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Clinic logo on left, report title and clinic info on right
  if (logoData) {
    const MAX_LOGO_W = 52; const MAX_LOGO_H = 22;
    const logoAspect = logoNaturalW / (logoNaturalH || 1);
    let lw = MAX_LOGO_W; let lh = lw / logoAspect;
    if (lh > MAX_LOGO_H) { lh = MAX_LOGO_H; lw = lh * logoAspect; }
    doc.addImage(logoData, 'JPEG', 14, 8 + (MAX_LOGO_H - lh) / 2, lw, lh);
  }
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...HEADING_RGB);
  doc.text('Lab Interpretation Report', pageWidth - 14, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(sanitizeForPdf(displayClinicName), pageWidth - 14, 20, { align: 'right' });
  doc.text('Powered by ClinIQ', pageWidth - 14, 26, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Horizontal rule under header
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 34, pageWidth - 14, 34);
  yPosition = 42;

  if (patientName) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Patient: ${sanitizeForPdf(patientName)}`, 14, yPosition);
    yPosition += 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, yPosition);
  yPosition += 12;

  if (interpretation.redFlags && interpretation.redFlags.length > 0) {
    doc.setFillColor(220, 38, 38);
    doc.rect(14, yPosition - 5, pageWidth - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CRITICAL RED FLAGS - PHYSICIAN NOTIFICATION REQUIRED', pageWidth / 2, yPosition, {
      align: 'center',
    });
    doc.setTextColor(0, 0, 0);
    yPosition += 10;

    interpretation.redFlags.forEach((flag) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      
      let severityColor: [number, number, number] = [0, 0, 0];
      if (flag.severity === 'critical') severityColor = [220, 38, 38];
      else if (flag.severity === 'urgent') severityColor = [234, 88, 12];
      else severityColor = [234, 179, 8];
      
      doc.setTextColor(...severityColor);
      doc.text(`${flag.severity.toUpperCase()}: ${sanitizeForPdf(flag.category)}`, 14, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 5;

      doc.setFont('helvetica', 'normal');
      const sanitizedMessage = sanitizeForPdf(flag.message);
      const messageLines = doc.splitTextToSize(sanitizedMessage, pageWidth - 28);
      doc.text(messageLines, 18, yPosition);
      yPosition += messageLines.length * 4 + 1;

      const sanitizedAction = sanitizeForPdf(flag.action);
      const actionLines = doc.splitTextToSize(`Action: ${sanitizedAction}`, pageWidth - 28);
      doc.text(actionLines, 18, yPosition);
      yPosition += actionLines.length * 4 + 6;

      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
    });
  }

  if (interpretation.interpretations && interpretation.interpretations.length > 0) {
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Lab Results Summary', 14, yPosition);
    yPosition += 7;

    // Determine whether an abnormal value is HIGH or LOW by comparing against the
    // reference range string (e.g. "20-60 nmol/L (optimal 25-50)") then falling
    // back to keyword scanning of the interpretation text.
    const getAbnormalDirection = (interp: { value?: number; referenceRange?: string; interpretation?: string }): 'HIGH' | 'LOW' => {
      const val = interp.value;
      if (val !== undefined && interp.referenceRange) {
        const m = interp.referenceRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
        if (m) {
          const lo = parseFloat(m[1]);
          const hi = parseFloat(m[2]);
          if (val < lo) return 'LOW';
          if (val > hi) return 'HIGH';
        }
        // Pattern like ">= 60" or "< 100"
        const gtM = interp.referenceRange.match(/>=?\s*([\d.]+)/);
        if (gtM && val < parseFloat(gtM[1])) return 'LOW';
        const ltM = interp.referenceRange.match(/<=?\s*([\d.]+)/);
        if (ltM && val > parseFloat(ltM[1])) return 'HIGH';
      }
      // Keyword fallback from interpretation text
      const txt = (interp.interpretation ?? '').toLowerCase();
      if (/\blow\b|deficien|suboptimal|suppressed|insufficien/.test(txt)) return 'LOW';
      return 'HIGH';
    };

    const tableData = interpretation.interpretations.map((interp) => {
      let statusText = '';
      if (interp.status === 'critical') statusText = '[!] ';
      else if (interp.status === 'abnormal') statusText = `[${getAbnormalDirection(interp)}] `;
      else if (interp.status === 'borderline') statusText = '[BORDERLINE] ';
      else statusText = '[NORMAL] ';
      
      return [
        sanitizeForPdf(interp.category),
        sanitizeForPdf(`${interp.value} ${interp.unit}`),
        sanitizeForPdf(interp.referenceRange || 'N/A'),
        statusText + interp.status.toUpperCase(),
        sanitizeForPdf(interp.interpretation),
        sanitizeForPdf(interp.recommendation),
      ];
    });

    autoTable(doc, {
      startY: yPosition,
      head: [['Lab', 'Value', 'Reference', 'Status', 'Interpretation', 'Recommendation']],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [37, 99, 235], 
        fontSize: 9, 
        fontStyle: 'bold',
        font: 'helvetica',
      },
      bodyStyles: { 
        fontSize: 8,
        font: 'helvetica',
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 20 },
        4: { cellWidth: 38 },
        5: { cellWidth: 48 },
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
        font: 'helvetica',
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const status = interpretation.interpretations[data.row.index].status;
          if (status === 'critical') data.cell.styles.textColor = [220, 38, 38];
          else if (status === 'abnormal') data.cell.styles.textColor = [234, 88, 12];
          else if (status === 'borderline') data.cell.styles.textColor = [234, 179, 8];
          else data.cell.styles.textColor = [22, 163, 74];
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 12;
  }

  // Advanced Lipid Markers (ApoB and Lp(a)) — only renders when at least one marker was recorded
  if (interpretation.adjustedRisk) {
    const ar = interpretation.adjustedRisk;
    const hasApoB = ar.apoBValue !== undefined;
    const hasLpa  = ar.lpaValue  !== undefined;
    if (hasApoB || hasLpa) {
      if (yPosition > 240) {
        doc.addPage();
        yPosition = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...HEADING_RGB);
      doc.text('Advanced Lipid Markers (ApoB & Lp(a))', 14, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 6;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      const markerSubtitle = `Base 10-yr ASCVD: ${ar.baseASCVDRisk === 0 ? 'N/A (PREVENT not calculated)' : ar.baseASCVDRisk.toFixed(1) + '%'}  |  Adjusted category: ${ar.adjustedCategory.replace('_', ' ')}`;
      doc.text(markerSubtitle, 14, yPosition);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      yPosition += 7;

      const markerRows: string[][] = [];
      if (hasApoB) {
        const apoBStatus = ar.apoBStatus === 'elevated' ? 'Elevated (≥130)' : ar.apoBStatus === 'borderline' ? 'Borderline (90–129)' : 'Optimal (<90)';
        markerRows.push(['ApoB', `${ar.apoBValue} mg/dL`, apoBStatus, ar.apoBStatus === 'elevated' ? 'Risk Enhancer' : ar.apoBStatus === 'borderline' ? 'Risk-Enhancing' : 'Normal']);
      }
      if (hasLpa) {
        const isNmol = ar.lpaUnit === 'nmol/L';
        const lpaUnit = isNmol ? 'nmol/L' : 'mg/dL';
        const lpaStatus = ar.lpaStatus === 'elevated'
          ? (isNmol ? 'Elevated (≥125 nmol/L)' : 'Elevated (≥50 mg/dL)')
          : ar.lpaStatus === 'borderline'
          ? (isNmol ? 'Borderline (75–124)' : 'Borderline (30–49)')
          : (isNmol ? 'Optimal (<75 nmol/L)' : 'Optimal (<30 mg/dL)');
        markerRows.push(['Lp(a)', `${ar.lpaValue} ${lpaUnit}`, lpaStatus, ar.lpaStatus === 'elevated' ? 'Risk Enhancer' : ar.lpaStatus === 'borderline' ? 'Risk-Enhancing' : 'Normal']);
      }

      (doc as any).autoTable({
        head: [['Marker', 'Value', 'Status', 'Classification']],
        body: markerRows,
        startY: yPosition,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: HEADING_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 32 },
          2: { cellWidth: 60 },
          3: { cellWidth: 40 },
        },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 3) {
            const val = data.cell.raw as string;
            if (val === 'Risk Enhancer') data.cell.styles.textColor = [185, 28, 28];
            else if (val === 'Risk-Enhancing') data.cell.styles.textColor = [180, 100, 0];
          }
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 8;

      if (ar.clinicalGuidance) {
        if (yPosition > 260) { doc.addPage(); yPosition = 20; }
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Clinical Guidance:', 14, yPosition);
        yPosition += 4;
        doc.setFont('helvetica', 'normal');
        const guidanceLines = doc.splitTextToSize(sanitizeForPdf(ar.clinicalGuidance), pageWidth - 28);
        guidanceLines.forEach((line: string) => {
          if (yPosition > 270) { doc.addPage(); yPosition = 20; }
          doc.text(line, 14, yPosition);
          yPosition += 4;
        });
        yPosition += 4;
      }
    }
  }

  if (interpretation.aiRecommendations) {
    if (yPosition > 240) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('AI-Powered Clinical Recommendations', 14, yPosition);
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const sanitizedRecs = sanitizeForPdf(interpretation.aiRecommendations);
    const recLines = doc.splitTextToSize(sanitizedRecs, pageWidth - 28);
    
    // Handle pagination for long text
    recLines.forEach((line: string, index: number) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 14, yPosition);
      yPosition += 4;
    });
    yPosition += 4;
  }

  const patientSummary = patientCommunicationSummary ?? interpretation.patientSummary;
  if (patientSummary) {
    if (yPosition > 240) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Patient-Friendly Summary', 14, yPosition);
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const sanitizedSummary = sanitizeForPdf(patientSummary);
    const summaryLines = doc.splitTextToSize(sanitizedSummary, pageWidth - 28);
    
    // Handle pagination for long text
    summaryLines.forEach((line: string, index: number) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 14, yPosition);
      yPosition += 4;
    });
    yPosition += 4;
  }

  if (interpretation.soapNote) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SOAP Note - Chart Ready', 14, yPosition);
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const sanitizedSOAP = sanitizeForPdf(interpretation.soapNote);
    const soapLines = doc.splitTextToSize(sanitizedSOAP, pageWidth - 28);

    soapLines.forEach((line: string) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      const trimmed = line.trim();
      if (trimmed === 'SUBJECTIVE:' || trimmed === 'OBJECTIVE:' || trimmed === 'ASSESSMENT:' || trimmed === 'PLAN:' ||
          trimmed.startsWith('S:') || trimmed.startsWith('O:') || trimmed.startsWith('A:') || trimmed.startsWith('P:')) {
        doc.setFont('helvetica', 'bold');
        doc.text(line, 14, yPosition);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text(line, 14, yPosition);
      }
      yPosition += 4;
    });
    yPosition += 4;
  }

  if (labHistory && labHistory.length >= 2) {
    const trendInsights = generateTrendInsights(labHistory);
    if (trendInsights.length > 0) {
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Lab Trend Analysis', 14, yPosition);
      yPosition += 6;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`Based on ${labHistory.length} lab results on record`, 14, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 7;

      const improved = trendInsights.filter(i => i.direction === 'improved');
      const worsened = trendInsights.filter(i => i.direction === 'worsened');
      const stable = trendInsights.filter(i => i.direction === 'stable');

      const addTrendGroup = (title: string, items: typeof trendInsights, color: [number, number, number]) => {
        if (items.length === 0) return;
        if (yPosition > 255) {
          doc.addPage();
          yPosition = 20;
        }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...color);
        doc.text(title, 14, yPosition);
        doc.setTextColor(0, 0, 0);
        yPosition += 5;

        items.forEach(insight => {
          if (yPosition > 265) {
            doc.addPage();
            yPosition = 20;
          }
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(`${insight.markerName} (${insight.unit}): ${insight.currentValue} -> was ${insight.previousValue}`, 18, yPosition);
          yPosition += 4;

          if (insight.clinicianInsight) {
            doc.setFont('helvetica', 'normal');
            const ctxLines = doc.splitTextToSize(sanitizeForPdf(insight.clinicianInsight), pageWidth - 36);
            ctxLines.forEach((line: string) => {
              if (yPosition > 265) {
                doc.addPage();
                yPosition = 20;
              }
              doc.text(line, 20, yPosition);
              yPosition += 4;
            });
          }
          yPosition += 2;
        });
        yPosition += 3;
      };

      addTrendGroup('Improved Markers', improved, [22, 101, 52]);
      addTrendGroup('Areas of Concern', worsened, [185, 28, 28]);
      addTrendGroup('Stable Markers', stable, [100, 100, 100]);
      yPosition += 4;
    }
  }

  if (interpretation.recheckWindow) {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Recommended Recheck Window: ${sanitizeForPdf(interpretation.recheckWindow)}`, 14, yPosition);
  }

  const timestamp = toLocalDateStr(new Date());
  const filename = patientName
    ? `lab-report-${patientName.replace(/\s+/g, '-')}-${timestamp}.pdf`
    : `lab-report-${timestamp}.pdf`;
  
  doc.save(filename);
}
