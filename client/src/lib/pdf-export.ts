import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LabValues, InterpretationResult } from '@shared/schema';

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

export function generateLabReportPDF(
  labValues: LabValues,
  interpretation: InterpretationResult,
  patientName?: string,
  clinicName: string = "Men's Hormone & Primary Care Clinic"
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: true,
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = 20;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Lab Interpretation Report', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(clinicName, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 12;

  if (patientName) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Patient: ${sanitizeForPdf(patientName)}`, 14, yPosition);
    yPosition += 6;
  }

  doc.setFont('helvetica', 'normal');
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
