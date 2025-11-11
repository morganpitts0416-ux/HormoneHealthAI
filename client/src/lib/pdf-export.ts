import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LabValues, InterpretationResult } from '@shared/schema';

export function generateLabReportPDF(
  labValues: LabValues,
  interpretation: InterpretationResult,
  patientName?: string
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
  doc.text("Men's Hormone & Primary Care Clinic", pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 12;

  if (patientName) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Patient: ${patientName}`, 14, yPosition);
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
      doc.text(`${flag.severity.toUpperCase()}: ${flag.category}`, 14, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 5;

      doc.setFont('helvetica', 'normal');
      const messageLines = doc.splitTextToSize(flag.message, pageWidth - 28);
      doc.text(messageLines, 18, yPosition);
      yPosition += messageLines.length * 4 + 1;

      const actionLines = doc.splitTextToSize(`Action: ${flag.action}`, pageWidth - 28);
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
        interp.category,
        `${interp.value} ${interp.unit}`,
        interp.referenceRange || 'N/A',
        statusText + interp.status.toUpperCase(),
        interp.interpretation,
        interp.recommendation,
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
    const recLines = doc.splitTextToSize(interpretation.aiRecommendations, pageWidth - 28);
    doc.text(recLines, 14, yPosition);
    yPosition += recLines.length * 4 + 8;
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
    const summaryLines = doc.splitTextToSize(interpretation.patientSummary, pageWidth - 28);
    doc.text(summaryLines, 14, yPosition);
    yPosition += summaryLines.length * 4 + 8;
  }

  if (interpretation.recheckWindow) {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Recommended Recheck Window: ${interpretation.recheckWindow}`, 14, yPosition);
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = patientName
    ? `lab-report-${patientName.replace(/\s+/g, '-')}-${timestamp}.pdf`
    : `lab-report-${timestamp}.pdf`;
  
  doc.save(filename);
}
