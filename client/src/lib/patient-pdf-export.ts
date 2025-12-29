import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FemaleLabValues, InterpretationResult, LabInterpretation } from '@shared/schema';

function sanitizeForPdf(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201E\u201F]/g, '"')
    .replace(/[\u2039\u203A]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2022\u2023\u25E6\u2043\u25AA\u25AB]/g, '*')
    .replace(/[\u2265]/g, '>=')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u00B1]/g, '+/-')
    .replace(/[\u00D7]/g, 'x')
    .replace(/[\u00F7]/g, '/')
    .replace(/[\u2192]/g, '->')
    .replace(/[\u2190]/g, '<-')
    .replace(/[\u00B0]/g, ' deg')
    .replace(/[\u00B5\u03BC]/g, 'u')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[^\x20-\x7E\n\r\t]/g, '');
}

interface WellnessPlan {
  dietPlan: string;
  supplementProtocol: string;
  lifestyleRecommendations: string;
  educationalContent: string;
}

export async function generatePatientWellnessPDF(
  labValues: FemaleLabValues,
  interpretation: InterpretationResult,
  wellnessPlan: WellnessPlan,
  patientName?: string
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = 15;

  const brandColor: [number, number, number] = [163, 136, 121];
  const textColor: [number, number, number] = [51, 51, 51];
  const lightBg: [number, number, number] = [250, 248, 246];

  const addHeader = () => {
    doc.setFillColor(...brandColor);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("Women's", margin, 18);
    doc.setFontSize(22);
    doc.text("Wellness", margin + 35, 18);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Hormone & Primary Care', margin, 26);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Your Personal Wellness Report', pageWidth - margin, 20, { align: 'right' });
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - margin, 27, { align: 'right' });
  };

  const addFooter = (pageNum: number, totalPages: number) => {
    doc.setFillColor(...lightBg);
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    doc.setTextColor(...brandColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text("Women's Wellness | Your Partner in Health", pageWidth / 2, pageHeight - 8, { align: 'center' });
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  };

  const addSectionHeader = (title: string, y: number): number => {
    if (y > pageHeight - 50) {
      doc.addPage();
      addHeader();
      y = 45;
    }
    doc.setFillColor(...brandColor);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 4, y + 5.5);
    return y + 12;
  };

  const addTextSection = (text: string, startY: number, maxWidth: number): number => {
    doc.setTextColor(...textColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const lines = doc.splitTextToSize(sanitizeForPdf(text), maxWidth);
    let y = startY;
    
    for (let i = 0; i < lines.length; i++) {
      if (y > pageHeight - 25) {
        doc.addPage();
        addHeader();
        y = 45;
      }
      doc.text(lines[i], margin, y);
      y += 4;
    }
    return y;
  };

  addHeader();
  yPosition = 45;

  if (patientName) {
    doc.setTextColor(...textColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Welcome, ${sanitizeForPdf(patientName)}`, margin, yPosition);
    yPosition += 8;
  }

  doc.setTextColor(...textColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const introText = "Thank you for trusting Women's Wellness with your care. This personalized wellness report is designed to help you understand your lab results and provides actionable steps to optimize your health. We've created a comprehensive plan tailored specifically to your unique needs.";
  const introLines = doc.splitTextToSize(introText, contentWidth);
  doc.text(introLines, margin, yPosition);
  yPosition += introLines.length * 4 + 8;

  yPosition = addSectionHeader('YOUR LAB RESULTS AT A GLANCE', yPosition);

  if (interpretation.interpretations && interpretation.interpretations.length > 0) {
    const tableData = interpretation.interpretations.map((interp: LabInterpretation) => {
      let statusText = '';
      let statusExplanation = '';
      if (interp.status === 'critical') {
        statusText = 'Needs Attention';
        statusExplanation = 'Please discuss with your provider';
      } else if (interp.status === 'abnormal') {
        statusText = 'Outside Range';
        statusExplanation = 'Room for improvement';
      } else if (interp.status === 'borderline') {
        statusText = 'Borderline';
        statusExplanation = 'Worth monitoring';
      } else {
        statusText = 'Optimal';
        statusExplanation = 'Great job!';
      }

      return [
        sanitizeForPdf(interp.category),
        sanitizeForPdf(`${interp.value} ${interp.unit}`),
        sanitizeForPdf(interp.referenceRange || 'N/A'),
        statusText,
        statusExplanation,
      ];
    });

    autoTable(doc, {
      startY: yPosition,
      head: [['Test', 'Your Value', 'Target Range', 'Status', 'What This Means']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: brandColor,
        fontSize: 9,
        fontStyle: 'bold',
        font: 'helvetica',
        textColor: [255, 255, 255],
      },
      bodyStyles: {
        fontSize: 8,
        font: 'helvetica',
        textColor: textColor,
      },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: 28 },
        4: { cellWidth: 60 },
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
        font: 'helvetica',
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const status = data.cell.raw as string;
          if (status === 'Needs Attention') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'Outside Range') {
            data.cell.styles.textColor = [234, 88, 12];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'Borderline') {
            data.cell.styles.textColor = [180, 130, 20];
          } else {
            data.cell.styles.textColor = [34, 139, 34];
          }
        }
      },
    });

    yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
    yPosition += 10;
  }

  doc.addPage();
  addHeader();
  yPosition = 45;

  yPosition = addSectionHeader('YOUR PERSONALIZED NUTRITION PLAN', yPosition);
  yPosition = addTextSection(wellnessPlan.dietPlan, yPosition, contentWidth);
  yPosition += 8;

  yPosition = addSectionHeader('YOUR SUPPLEMENT PROTOCOL', yPosition);
  yPosition = addTextSection(wellnessPlan.supplementProtocol, yPosition, contentWidth);
  yPosition += 8;

  doc.addPage();
  addHeader();
  yPosition = 45;

  yPosition = addSectionHeader('LIFESTYLE RECOMMENDATIONS', yPosition);
  yPosition = addTextSection(wellnessPlan.lifestyleRecommendations, yPosition, contentWidth);
  yPosition += 8;

  yPosition = addSectionHeader('UNDERSTANDING YOUR RESULTS', yPosition);
  yPosition = addTextSection(wellnessPlan.educationalContent, yPosition, contentWidth);
  yPosition += 8;

  doc.addPage();
  addHeader();
  yPosition = 45;

  yPosition = addSectionHeader('YOUR ACTION CHECKLIST', yPosition);

  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const checklistItems = [
    'Review this wellness report and highlight areas to focus on first',
    'Start implementing dietary changes gradually - one new habit per week',
    'Purchase recommended supplements from a quality source',
    'Set up a supplement schedule (use a pill organizer if helpful)',
    'Create a weekly meal prep plan using the meal ideas provided',
    'Schedule time for exercise - even 10 minutes daily makes a difference',
    'Track your progress - energy levels, sleep quality, mood',
    'Schedule your follow-up lab work as recommended by your provider',
    'Reach out to our clinic with any questions - we are here to help!',
  ];

  checklistItems.forEach((item, index) => {
    if (yPosition > pageHeight - 30) {
      doc.addPage();
      addHeader();
      yPosition = 45;
    }
    doc.setDrawColor(...brandColor);
    doc.rect(margin, yPosition - 3, 4, 4);
    doc.text(`${index + 1}. ${item}`, margin + 7, yPosition);
    yPosition += 7;
  });

  yPosition += 10;

  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, yPosition, contentWidth, 30, 3, 3, 'F');
  doc.setTextColor(...brandColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text("We're Here For You", margin + 4, yPosition + 8);
  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const supportText = "Your health journey is unique, and we are honored to be part of it. If you have questions about your results or wellness plan, please don't hesitate to contact our clinic. Small, consistent changes lead to remarkable results over time.";
  const supportLines = doc.splitTextToSize(supportText, contentWidth - 8);
  doc.text(supportLines, margin + 4, yPosition + 14);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = patientName
    ? `WomensWellness_${sanitizeForPdf(patientName).replace(/\s+/g, '_')}_${dateStr}.pdf`
    : `WomensWellness_Report_${dateStr}.pdf`;

  doc.save(fileName);
}
