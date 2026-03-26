import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LabValues, InterpretationResult, LabResult } from '@shared/schema';
import { generateTrendInsights } from '@/lib/clinical-trend-insights';

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
  clinicName: string = "Men's Hormone & Primary Care Clinic",
  labHistory?: LabResult[]
): Promise<void> {
  // Load ReAlign logo for PDF branding
  let logoData: string | null = null;
  try {
    const res = await fetch('/realign-health-logo.png');
    const blob = await res.blob();
    logoData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {}

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: true,
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  // Header: ReAlign logo on left, clinic info on right
  if (logoData) {
    doc.addImage(logoData, 'PNG', 14, 8, 52, 22);
  }
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 78, 121);
  doc.text('Lab Interpretation Report', pageWidth - 14, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(sanitizeForPdf(clinicName), pageWidth - 14, 20, { align: 'right' });
  doc.text(`Powered by ReAlign Health`, pageWidth - 14, 26, { align: 'right' });
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

    const tableData = interpretation.interpretations.map((interp) => {
      let statusText = '';
      if (interp.status === 'critical') statusText = '[!] ';
      else if (interp.status === 'abnormal') statusText = '[HIGH] ';
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

  if (interpretation.patientSummary) {
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
    const sanitizedSummary = sanitizeForPdf(interpretation.patientSummary);
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

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = patientName
    ? `lab-report-${patientName.replace(/\s+/g, '-')}-${timestamp}.pdf`
    : `lab-report-${timestamp}.pdf`;
  
  doc.save(filename);
}
