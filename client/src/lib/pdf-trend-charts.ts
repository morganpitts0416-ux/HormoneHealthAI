import type { jsPDF } from 'jspdf';
import type { LabResult } from '@shared/schema';

interface ChartMarker {
  name: string;
  key: string;
  unit: string;
  color: [number, number, number];
  optimalMax?: number;
}

const pdfMarkers: ChartMarker[] = [
  { name: 'LDL', key: 'ldl', unit: 'mg/dL', color: [220, 50, 50], optimalMax: 100 },
  { name: 'HDL', key: 'hdl', unit: 'mg/dL', color: [34, 197, 94] },
  { name: 'Triglycerides', key: 'triglycerides', unit: 'mg/dL', color: [249, 115, 22], optimalMax: 150 },
  { name: 'Total Cholesterol', key: 'totalCholesterol', unit: 'mg/dL', color: [139, 92, 246], optimalMax: 200 },
  { name: 'ApoB', key: 'apoB', unit: 'mg/dL', color: [236, 72, 153], optimalMax: 90 },
  { name: 'A1c', key: 'a1c', unit: '%', color: [245, 158, 11], optimalMax: 5.7 },
  { name: 'Fasting Glucose', key: 'fastingGlucose', unit: 'mg/dL', color: [217, 119, 6] },
  { name: 'PSA', key: 'psa', unit: 'ng/mL', color: [100, 116, 139], optimalMax: 4.0 },
  { name: 'Testosterone', key: 'testosterone', unit: 'ng/dL', color: [59, 130, 246] },
  { name: 'Free Testosterone', key: 'freeTestosterone', unit: 'pg/mL', color: [99, 102, 241] },
  { name: 'Estradiol', key: 'estradiol', unit: 'pg/mL', color: [236, 72, 153] },
  { name: 'SHBG', key: 'shbg', unit: 'nmol/L', color: [20, 184, 166] },
  { name: 'TSH', key: 'tsh', unit: 'mIU/L', color: [139, 92, 246] },
  { name: 'Free T4', key: 'freeT4', unit: 'ng/dL', color: [168, 85, 247] },
  { name: 'Free T3', key: 'freeT3', unit: 'pg/mL', color: [217, 70, 239] },
  { name: 'hs-CRP', key: 'hsCRP', unit: 'mg/L', color: [239, 68, 68], optimalMax: 1.0 },
  { name: 'Hemoglobin', key: 'hemoglobin', unit: 'g/dL', color: [220, 38, 38] },
  { name: 'Hematocrit', key: 'hematocrit', unit: '%', color: [185, 28, 28] },
  { name: 'Vitamin D', key: 'vitaminD', unit: 'ng/mL', color: [234, 179, 8] },
  { name: 'Ferritin', key: 'ferritin', unit: 'ng/mL', color: [120, 113, 108] },
  { name: 'Vitamin B12', key: 'vitaminB12', unit: 'pg/mL', color: [5, 150, 105] },
];

interface DataPoint {
  dateLabel: string;
  value: number;
}

function getChartableMarkers(labs: LabResult[]): Array<{ marker: ChartMarker; data: DataPoint[] }> {
  const sorted = [...labs].sort((a, b) => new Date(a.labDate).getTime() - new Date(b.labDate).getTime());
  const results: Array<{ marker: ChartMarker; data: DataPoint[] }> = [];

  for (const marker of pdfMarkers) {
    const points: DataPoint[] = [];
    for (const lab of sorted) {
      const vals = lab.labValues as any;
      const val = vals?.[marker.key];
      if (val !== undefined && val !== null && val !== '') {
        const numVal = Number(val);
        if (Number.isFinite(numVal)) {
          points.push({
            dateLabel: new Date(lab.labDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            value: numVal,
          });
        }
      }
    }
    if (points.length >= 2) {
      results.push({ marker, data: points });
    }
  }
  return results;
}

function drawMiniChart(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  marker: ChartMarker,
  data: DataPoint[],
  brandColor: [number, number, number]
) {
  const chartTop = y + 14;
  const chartHeight = height - 22;
  const chartLeft = x + 12;
  const chartWidth = width - 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandColor);
  doc.text(marker.name, x + 2, y + 5);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`(${marker.unit})`, x + 2 + doc.getTextWidth(marker.name) + 2, y + 5);

  const latestVal = data[data.length - 1].value;
  const prevVal = data[data.length - 2].value;
  const change = latestVal - prevVal;
  const arrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192';
  const changeStr = `${latestVal} ${arrow}`;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 51, 51);
  doc.text(changeStr, x + width - 2, y + 5, { align: 'right' });

  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.15 || maxVal * 0.1 || 1;
  const yMin = Math.max(0, minVal - padding);
  const yMax = maxVal + padding;
  const yRange = yMax - yMin || 1;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(chartLeft, chartTop, chartLeft + chartWidth, chartTop);
  doc.line(chartLeft, chartTop + chartHeight, chartLeft + chartWidth, chartTop + chartHeight);
  doc.line(chartLeft, chartTop + chartHeight / 2, chartLeft + chartWidth, chartTop + chartHeight / 2);

  doc.setFontSize(6);
  doc.setTextColor(150, 150, 150);
  doc.text(yMax.toFixed(yMax >= 10 ? 0 : 1), x + 1, chartTop + 2);
  doc.text(yMin.toFixed(yMin >= 10 ? 0 : 1), x + 1, chartTop + chartHeight + 1);

  if (marker.optimalMax && marker.optimalMax >= yMin && marker.optimalMax <= yMax) {
    const goalY = chartTop + chartHeight - ((marker.optimalMax - yMin) / yRange) * chartHeight;
    doc.setDrawColor(34, 197, 94);
    doc.setLineWidth(0.3);
    const dashLen = 1.5;
    for (let dx = chartLeft; dx < chartLeft + chartWidth; dx += dashLen * 2) {
      doc.line(dx, goalY, Math.min(dx + dashLen, chartLeft + chartWidth), goalY);
    }
    doc.setFontSize(5);
    doc.setTextColor(34, 197, 94);
    doc.text('goal', chartLeft + chartWidth + 1, goalY + 1);
  }

  const points: Array<{ px: number; py: number }> = [];
  const stepX = chartWidth / (data.length - 1);
  for (let i = 0; i < data.length; i++) {
    const px = chartLeft + i * stepX;
    const py = chartTop + chartHeight - ((data[i].value - yMin) / yRange) * chartHeight;
    points.push({ px, py });
  }

  doc.setDrawColor(...marker.color);
  doc.setLineWidth(0.8);
  for (let i = 1; i < points.length; i++) {
    doc.line(points[i - 1].px, points[i - 1].py, points[i].px, points[i].py);
  }

  for (const pt of points) {
    doc.setFillColor(255, 255, 255);
    doc.circle(pt.px, pt.py, 1.2, 'F');
    doc.setFillColor(...marker.color);
    doc.circle(pt.px, pt.py, 0.8, 'F');
  }

  doc.setFontSize(5.5);
  doc.setTextColor(130, 130, 130);
  for (let i = 0; i < data.length; i++) {
    const px = chartLeft + i * stepX;
    doc.text(data[i].dateLabel, px, chartTop + chartHeight + 5, { align: 'center' });
  }
}

export function addTrendChartsToWellnessPDF(
  doc: jsPDF,
  labs: LabResult[],
  startY: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  brandColor: [number, number, number],
  textColor: [number, number, number],
  addNewPage: () => number
): number {
  const chartableMarkers = getChartableMarkers(labs);
  if (chartableMarkers.length === 0) return startY;

  let yPosition = startY;

  if (yPosition + 20 > pageHeight - 20) {
    yPosition = addNewPage();
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandColor);
  doc.text('Your Lab Trends Over Time', margin, yPosition);
  yPosition += 4;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('These charts show how your key lab values have changed across your visits.', margin, yPosition);
  yPosition += 6;

  const chartWidth = (contentWidth - 4) / 2;
  const chartHeight = 42;
  let col = 0;

  for (const { marker, data } of chartableMarkers) {
    if (yPosition + chartHeight + 8 > pageHeight - 20) {
      yPosition = addNewPage();
    }

    const xPos = margin + col * (chartWidth + 4);
    
    doc.setFillColor(248, 248, 250);
    doc.roundedRect(xPos, yPosition - 2, chartWidth, chartHeight + 4, 2, 2, 'F');

    drawMiniChart(doc, xPos, yPosition, chartWidth, chartHeight, marker, data, brandColor);

    col++;
    if (col >= 2) {
      col = 0;
      yPosition += chartHeight + 8;
    }
  }

  if (col > 0) {
    yPosition += chartHeight + 8;
  }

  return yPosition;
}
