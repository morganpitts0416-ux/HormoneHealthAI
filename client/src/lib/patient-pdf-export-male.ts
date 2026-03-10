import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LabValues, InterpretationResult, LabInterpretation, LabResult } from '@shared/schema';
import { addTrendChartsToWellnessPDF } from '@/lib/pdf-trend-charts';

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

export interface MaleWellnessPlan {
  dietPlan: string;
  supplementProtocol: string;
  lifestyleRecommendations: string;
  educationalContent: string;
}

function getMaleLabInsight(category: string, value: number | string, status: string, referenceRange?: string): string {
  const cat = category.toLowerCase();
  const val = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  
  const determineDirection = (category: string, value: number, refRange?: string): 'low' | 'high' | 'normal' => {
    if (status === 'normal') return 'normal';
    
    if (refRange) {
      const rangeParts = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
      if (rangeParts) {
        const lowBound = parseFloat(rangeParts[1]);
        const highBound = parseFloat(rangeParts[2]);
        if (value < lowBound) return 'low';
        if (value > highBound) return 'high';
      }
    }
    
    const thresholds: Record<string, { low: number; high: number }> = {
      hemoglobin: { low: 14, high: 18 },
      hematocrit: { low: 41, high: 53 },
      tsh: { low: 0.4, high: 4.5 },
      "free t4": { low: 0.9, high: 1.7 },
      "free t3": { low: 2.3, high: 4.2 },
      "vitamin d": { low: 60, high: 80 },
      ldl: { low: 0, high: 100 },
      hdl: { low: 40, high: 200 },
      triglycerides: { low: 0, high: 150 },
      "total cholesterol": { low: 0, high: 200 },
      glucose: { low: 70, high: 100 },
      "a1c": { low: 0, high: 5.7 },
      creatinine: { low: 0.7, high: 1.3 },
      egfr: { low: 60, high: 200 },
      alt: { low: 0, high: 45 },
      ast: { low: 0, high: 45 },
      testosterone: { low: 700, high: 1100 },
      "free testosterone": { low: 15, high: 25 },
      estradiol: { low: 20, high: 50 },
      psa: { low: 0, high: 4 },
      "hs-crp": { low: 0, high: 1 },
      "lp(a)": { low: 0, high: 29 },
      "apolipoprotein b": { low: 0, high: 90 },
      platelets: { low: 150, high: 400 },
      wbc: { low: 4, high: 11 },
      rbc: { low: 4.5, high: 5.5 },
    };
    
    for (const key of Object.keys(thresholds)) {
      if (cat.includes(key) || key.includes(cat)) {
        const threshold = thresholds[key];
        if (value < threshold.low) return 'low';
        if (value > threshold.high) return 'high';
        return 'normal';
      }
    }
    
    return 'high';
  };

  const direction = determineDirection(cat, val, referenceRange);
  
  const insights: Record<string, { what: string; normal: string; low: string; high: string }> = {
    hemoglobin: {
      what: "Hemoglobin carries oxygen in your blood to all your organs and muscles.",
      normal: "Your oxygen-carrying capacity is healthy, supporting good energy and workout performance.",
      low: "Lower hemoglobin may cause fatigue and reduced exercise capacity. Iron-rich foods and supplements can help.",
      high: "Elevated levels may be related to testosterone therapy or dehydration. Your provider will monitor this."
    },
    hematocrit: {
      what: "Hematocrit measures the percentage of red blood cells in your blood.",
      normal: "Your red blood cell percentage is balanced, supporting healthy circulation.",
      low: "Lower levels may indicate anemia. Focus on iron, B12, and folate intake.",
      high: "Higher levels are common with testosterone therapy and may require blood donation or therapy adjustment."
    },
    tsh: {
      what: "TSH controls your thyroid, which regulates metabolism, energy, and weight.",
      normal: "Your thyroid function appears balanced, supporting healthy metabolism.",
      low: "Lower TSH may indicate an overactive thyroid, which can cause weight loss and anxiety.",
      high: "Higher TSH may indicate an underactive thyroid, which can cause fatigue, weight gain, and low testosterone."
    },
    "free t4": {
      what: "Free T4 is your main thyroid hormone that controls energy and metabolism.",
      normal: "Your active thyroid hormone level supports normal energy and metabolism.",
      low: "Lower levels may contribute to fatigue, cold intolerance, and weight gain.",
      high: "Higher levels may cause anxiety, rapid heartbeat, and weight loss."
    },
    "free t3": {
      what: "Free T3 is your most active thyroid hormone affecting every cell in your body.",
      normal: "Your active thyroid hormone is at a healthy level for cellular function.",
      low: "Lower T3 can contribute to fatigue, brain fog, and difficulty losing weight.",
      high: "Higher T3 may cause anxiety, tremors, and rapid heart rate."
    },
    "vitamin d": {
      what: "Vitamin D supports testosterone production, bone health, immune function, and mood.",
      normal: "Your vitamin D level is optimal (60-80 ng/mL), supporting testosterone, strong bones, and immunity.",
      low: "Low vitamin D is linked to low testosterone, fatigue, weakened bones, and depression. Vitamin D3 supplementation is recommended.",
      high: "Vitamin D levels above optimal range (60-80 ng/mL) - monitoring recommended."
    },
    ldl: {
      what: "LDL is 'bad' cholesterol that can build up in artery walls over time.",
      normal: "Your LDL is in a healthy range, reducing heart disease risk.",
      low: "Lower LDL levels are generally heart-protective.",
      high: "Higher LDL increases cardiovascular risk. Diet, exercise, and possibly medication can help."
    },
    hdl: {
      what: "HDL is 'good' cholesterol that helps remove bad cholesterol from your arteries.",
      normal: "Your HDL level provides good protection for your heart and arteries.",
      low: "Lower HDL reduces heart protection. Exercise, omega-3s, and healthy fats can help raise it.",
      high: "Higher HDL is generally protective for heart health."
    },
    triglycerides: {
      what: "Triglycerides are blood fats that can contribute to artery disease when elevated.",
      normal: "Your triglyceride level supports healthy arteries and heart function.",
      low: "Lower triglycerides are generally healthy for your cardiovascular system.",
      high: "Elevated triglycerides increase heart risk. Reducing sugar, alcohol, and refined carbs helps."
    },
    "total cholesterol": {
      what: "Total cholesterol is the sum of all cholesterol types in your blood.",
      normal: "Your overall cholesterol balance supports cardiovascular health.",
      low: "Lower total cholesterol is generally heart-healthy.",
      high: "Elevated total cholesterol may require diet and lifestyle modifications."
    },
    glucose: {
      what: "Glucose is blood sugar, your body's main energy source.",
      normal: "Your blood sugar regulation is healthy, supporting steady energy levels.",
      low: "Lower glucose may cause fatigue and shakiness. Regular balanced meals help.",
      high: "Higher glucose may indicate prediabetes. Diet, exercise, and weight management are key."
    },
    "a1c": {
      what: "A1C reflects your average blood sugar over the past 2-3 months.",
      normal: "Your long-term blood sugar control is excellent, reducing diabetes risk.",
      low: "Lower A1C indicates good blood sugar control.",
      high: "Elevated A1C suggests higher blood sugar levels. Lifestyle changes can significantly improve this."
    },
    creatinine: {
      what: "Creatinine is a waste product that indicates how well your kidneys are filtering.",
      normal: "Your kidney filtration function appears healthy.",
      low: "Lower creatinine is typically not concerning and may reflect lower muscle mass.",
      high: "Elevated creatinine may indicate kidney stress or high protein intake. Hydration is important."
    },
    egfr: {
      what: "eGFR estimates how well your kidneys filter waste from your blood.",
      normal: "Your kidney function is in the healthy range, effectively filtering waste.",
      low: "Lower eGFR suggests reduced kidney function. Continued monitoring is recommended.",
      high: "Higher eGFR indicates good kidney filtration capacity."
    },
    alt: {
      what: "ALT is a liver enzyme that can indicate liver health status.",
      normal: "Your liver enzyme levels suggest healthy liver function.",
      low: "Lower ALT is typically not concerning.",
      high: "Elevated ALT may indicate liver stress from supplements, medications, or alcohol."
    },
    ast: {
      what: "AST is an enzyme found in your liver and muscles indicating tissue health.",
      normal: "Your AST level suggests healthy liver and muscle tissue.",
      low: "Lower AST is typically not concerning.",
      high: "Elevated AST may indicate liver or muscle stress from intense exercise or other factors."
    },
    "fib-4 score (liver fibrosis)": {
      what: "FIB-4 is a calculated score that helps assess liver health by combining your age with liver enzyme and platelet levels.",
      normal: "Your FIB-4 score suggests a low likelihood of significant liver scarring (fibrosis). This is reassuring for your liver health.",
      low: "A lower FIB-4 score is favorable and suggests healthy liver tissue without significant scarring.",
      high: "Your FIB-4 score suggests the possibility of liver changes that may benefit from additional evaluation. This does not mean you have liver disease, but your provider may recommend further testing such as an imaging study to get a clearer picture. Your provider will discuss the best next steps for you."
    },
    testosterone: {
      what: "Testosterone is your primary male hormone affecting energy, muscle, mood, and libido.",
      normal: "Your testosterone level is optimized (700-1100 ng/dL), supporting vitality, muscle, and overall male health.",
      low: "Lower testosterone causes fatigue, low libido, muscle loss, and mood changes. Testosterone optimization therapy can help.",
      high: "Testosterone is above the target range. Your provider may adjust dosing to optimize levels."
    },
    "free testosterone": {
      what: "Free testosterone is the active, unbound form your body can readily use.",
      normal: "Your free testosterone is at an optimal level for cellular function and vitality.",
      low: "Lower free testosterone may cause symptoms despite normal total testosterone. SHBG may be elevated.",
      high: "Higher free testosterone - your provider will review in context of total testosterone."
    },
    estradiol: {
      what: "Estradiol in men supports bone health, brain function, and cardiovascular health.",
      normal: "Your estradiol level is balanced (20-50 pg/mL), supporting bone and brain health without causing issues.",
      low: "Lower estradiol may affect bone density and mood. Your provider will assess if intervention is needed.",
      high: "Elevated estradiol may cause water retention or other symptoms. Aromatase inhibitor therapy may be considered."
    },
    psa: {
      what: "PSA is a prostate health marker important for cancer screening in men.",
      normal: "Your PSA level is within normal limits, suggesting healthy prostate function.",
      low: "Lower PSA is generally favorable for prostate health.",
      high: "Elevated PSA requires monitoring. It can be elevated from exercise, prostate inflammation, or other factors."
    },
    "hs-crp": {
      what: "hs-CRP measures inflammation in your body, linked to heart disease and metabolic issues.",
      normal: "Your inflammation level is low, which is protective for your heart and overall health.",
      low: "Lower inflammation is excellent for cardiovascular and overall health.",
      high: "Higher inflammation increases health risks. Anti-inflammatory diet, exercise, and fish oil help."
    },
    "lp(a)": {
      what: "Lp(a) is an inherited cholesterol particle that increases heart disease risk.",
      normal: "Your Lp(a) is in a favorable range for heart health.",
      low: "Lower Lp(a) is protective for cardiovascular health.",
      high: "Elevated Lp(a) is genetic and increases heart risk. Aggressive lifestyle measures and possibly medication are important."
    },
    "apolipoprotein b": {
      what: "ApoB counts the number of harmful cholesterol particles in your blood.",
      normal: "Your ApoB level suggests a healthy number of cholesterol particles.",
      low: "Lower ApoB is protective for your arteries and heart.",
      high: "Elevated ApoB increases plaque buildup risk. Diet, exercise, and possibly medication can help."
    },
    platelets: {
      what: "Platelets help your blood clot to stop bleeding when you're injured.",
      normal: "Your platelet count supports healthy blood clotting.",
      low: "Lower platelets may increase bleeding risk and should be monitored.",
      high: "Higher platelets may indicate inflammation. Further evaluation may be needed."
    },
    wbc: {
      what: "White blood cells fight infections and are part of your immune system.",
      normal: "Your immune cell count is in the healthy range for fighting infections.",
      low: "Lower WBC may indicate weakened immunity. Worth monitoring.",
      high: "Higher WBC may indicate infection, inflammation, or stress response."
    },
    rbc: {
      what: "Red blood cells carry oxygen throughout your body to support energy and vitality.",
      normal: "Your red blood cell count supports healthy oxygen delivery.",
      low: "Lower RBC may indicate anemia. Iron and B12 status should be evaluated.",
      high: "Higher RBC is common with testosterone therapy. May require periodic blood donation."
    }
  };

  let matchedKey = '';
  for (const key of Object.keys(insights)) {
    if (cat.includes(key) || key.includes(cat)) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) {
    if (status === 'normal') return "This result is within the healthy reference range.";
    if (status === 'borderline') return "This value is near the edge of normal. Lifestyle changes may help optimize it.";
    if (status === 'abnormal' || status === 'critical') return "This result is outside the optimal range and is addressed in your treatment plan.";
    return "This result has been reviewed in the context of your overall health.";
  }

  const insight = insights[matchedKey];
  let explanation = insight.what + " ";
  
  if (direction === 'normal') {
    explanation += insight.normal;
  } else if (direction === 'low') {
    explanation += insight.low;
  } else {
    explanation += insight.high;
  }

  return explanation;
}

export async function generateMalePatientWellnessPDF(
  labValues: LabValues,
  interpretation: InterpretationResult,
  wellnessPlan: MaleWellnessPlan,
  patientName?: string,
  patientLabs?: LabResult[]
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

  const brandColor: [number, number, number] = [31, 78, 121];
  const accentColor: [number, number, number] = [70, 130, 180];
  const textColor: [number, number, number] = [51, 51, 51];
  const lightBg: [number, number, number] = [240, 248, 255];

  const addHeader = () => {
    doc.setFillColor(...brandColor);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("MVP", margin, 18);
    doc.setFontSize(22);
    doc.text("Men's Clinic", margin + 22, 18);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Hormone Optimization & Primary Care', margin, 26);

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
    doc.text("MVP Men's Clinic | Your Partner in Health Optimization", pageWidth / 2, pageHeight - 8, { align: 'center' });
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  };

  const ensureSpace = (heightNeeded: number, currentY: number): number => {
    const usableBottom = pageHeight - 25;
    if (currentY + heightNeeded > usableBottom) {
      doc.addPage();
      addHeader();
      return 45;
    }
    return currentY;
  };

  const addSectionHeader = (title: string, y: number): number => {
    y = ensureSpace(30, y);
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
    const lineHeight = 4;
    const footerBuffer = 8;
    
    for (let i = 0; i < lines.length; i++) {
      y = ensureSpace(lineHeight + footerBuffer, y);
      doc.text(lines[i], margin, y);
      y += lineHeight;
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
  const introText = "Thank you for trusting MVP Men's Clinic with your health optimization. This personalized wellness report is designed to help you understand your lab results and provides actionable steps to optimize your testosterone, energy, and overall vitality. We've created a comprehensive plan tailored specifically to your unique needs.";
  const introLines = doc.splitTextToSize(introText, contentWidth);
  doc.text(introLines, margin, yPosition);
  yPosition += introLines.length * 4 + 8;

  yPosition = addSectionHeader('YOUR LAB RESULTS AT A GLANCE', yPosition);

  if (interpretation.interpretations && interpretation.interpretations.length > 0) {
    const tableData = interpretation.interpretations.map((interp: LabInterpretation) => {
      let statusText = '';
      
      const catLower = interp.category.toLowerCase();
      if ((catLower.includes('vitamin d') || catLower === 'vitamin d (25-oh)') && interp.value !== undefined) {
        if (interp.value <= 30) {
          statusText = 'Deficient';
        } else if (interp.value <= 40) {
          statusText = 'Insufficient';
        } else if (interp.value >= 60 && interp.value <= 80) {
          statusText = 'Optimal';
        } else if (interp.value > 80) {
          statusText = 'Elevated';
        } else {
          statusText = 'Suboptimal';
        }
      } else if (catLower.includes('testosterone') && !catLower.includes('free') && interp.value !== undefined) {
        if (interp.value < 300) {
          statusText = 'Low';
        } else if (interp.value < 500) {
          statusText = 'Suboptimal';
        } else if (interp.value >= 700 && interp.value <= 1100) {
          statusText = 'Optimal';
        } else if (interp.value > 1100) {
          statusText = 'Elevated';
        } else {
          statusText = 'Borderline';
        }
      } else if (interp.status === 'critical') {
        statusText = 'Needs Attention';
      } else if (interp.status === 'abnormal') {
        statusText = 'Outside Range';
      } else if (interp.status === 'borderline') {
        statusText = 'Borderline';
      } else {
        statusText = 'Optimal';
      }

      const healthInsight = getMaleLabInsight(interp.category, interp.value ?? 0, interp.status, interp.referenceRange);

      return [
        sanitizeForPdf(interp.category),
        sanitizeForPdf(`${interp.value} ${interp.unit}`),
        sanitizeForPdf(interp.referenceRange || 'N/A'),
        statusText,
        sanitizeForPdf(healthInsight),
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
        0: { cellWidth: 28 },
        1: { cellWidth: 22 },
        2: { cellWidth: 26 },
        3: { cellWidth: 22 },
        4: { cellWidth: 80 },
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
        font: 'helvetica',
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const status = data.cell.raw as string;
          if (status === 'Needs Attention' || status === 'Low' || status === 'Deficient') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'Outside Range' || status === 'Elevated') {
            data.cell.styles.textColor = [234, 88, 12];
            data.cell.styles.fontStyle = 'bold';
          } else if (status === 'Borderline' || status === 'Insufficient' || status === 'Suboptimal') {
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

  if (interpretation.preventRisk) {
    const preventRisk = interpretation.preventRisk;
    yPosition = ensureSpace(90, yPosition);
    yPosition = addSectionHeader('YOUR HEART HEALTH ASSESSMENT', yPosition);
    
    const getRiskDescription = (category: string): { text: string; color: [number, number, number] } => {
      switch (category) {
        case 'low':
          return { text: 'Low Risk', color: [34, 139, 34] };
        case 'borderline':
          return { text: 'Borderline', color: [180, 130, 20] };
        case 'intermediate':
          return { text: 'Moderate Risk', color: [234, 88, 12] };
        case 'high':
          return { text: 'Higher Risk', color: [220, 38, 38] };
        default:
          return { text: 'See Provider', color: [100, 100, 100] };
      }
    };

    const getRiskInterpretation = (riskType: string, percentage: string, timeframe: string): string => {
      const pct = parseFloat(percentage);
      if (isNaN(pct)) return 'Risk calculation not available for your age range.';
      
      if (riskType === 'CVD') {
        if (pct < 5) return `Your ${timeframe} risk of any cardiovascular event is low. Keep up the good work!`;
        if (pct < 10) return `Your ${timeframe} combined heart risk is moderate. Lifestyle optimization can reduce this.`;
        return `Your ${timeframe} total cardiovascular risk is elevated. Your provider will discuss targeted interventions.`;
      } else if (riskType === 'ASCVD') {
        if (pct < 5) return `Your ${timeframe} risk of heart attack or stroke is low - excellent for your vitality!`;
        if (pct < 7.5) return `Your ${timeframe} ASCVD risk is borderline. Exercise, diet, and supplements can help.`;
        if (pct < 20) return `Your ${timeframe} heart attack/stroke risk is moderate. Discuss statin therapy with your provider.`;
        return `Your ${timeframe} ASCVD risk is elevated. Aggressive lifestyle and medication interventions are recommended.`;
      } else {
        if (pct < 2) return `Your ${timeframe} heart failure risk is low - your heart is in great shape!`;
        if (pct < 5) return `Your ${timeframe} heart failure risk is manageable. Maintain healthy weight and blood pressure.`;
        return `Your ${timeframe} heart failure risk is notable. Weight control and cardiovascular exercise are key.`;
      }
    };

    const riskInfo = getRiskDescription(preventRisk.riskCategory);
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, yPosition, contentWidth, 16, 2, 2, 'F');
    doc.setTextColor(...brandColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Cardiovascular Risk Category:', margin + 4, yPosition + 7);
    doc.setTextColor(...riskInfo.color);
    doc.setFontSize(12);
    doc.text(riskInfo.text, margin + 75, yPosition + 7);
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Based on the 2023 AHA PREVENT Equations - a modern, validated heart risk calculator', margin + 4, yPosition + 13);
    yPosition += 20;

    doc.setTextColor(...brandColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Your 10-Year Heart Health Predictions', margin, yPosition + 4);
    yPosition += 8;

    const tenYearData = [
      ['Total Cardiovascular Disease', preventRisk.tenYearCVDPercentage || 'N/A', getRiskInterpretation('CVD', preventRisk.tenYearCVDPercentage || '0', '10-year')],
      ['Heart Attack & Stroke (ASCVD)', preventRisk.tenYearASCVDPercentage || 'N/A', getRiskInterpretation('ASCVD', preventRisk.tenYearASCVDPercentage || '0', '10-year')],
      ['Heart Failure', preventRisk.tenYearHFPercentage || 'N/A', getRiskInterpretation('HF', preventRisk.tenYearHFPercentage || '0', '10-year')],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [['Risk Type', 'Your Risk', 'What This Means For You']],
      body: tenYearData,
      theme: 'grid',
      headStyles: {
        fillColor: brandColor,
        fontSize: 9,
        fontStyle: 'bold',
        textColor: [255, 255, 255],
      },
      bodyStyles: {
        fontSize: 8,
        textColor: textColor,
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 111 },
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
      },
    });

    yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
    yPosition += 6;

    if (preventRisk.thirtyYearCVDPercentage) {
      yPosition = ensureSpace(50, yPosition);
      doc.setTextColor(...brandColor);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Your 30-Year Heart Health Predictions (Long-Term Outlook)', margin, yPosition + 4);
      yPosition += 8;

      const thirtyYearData = [
        ['Total Cardiovascular Disease', preventRisk.thirtyYearCVDPercentage || 'N/A', getRiskInterpretation('CVD', preventRisk.thirtyYearCVDPercentage || '0', '30-year')],
        ['Heart Attack & Stroke (ASCVD)', preventRisk.thirtyYearASCVDPercentage || 'N/A', getRiskInterpretation('ASCVD', preventRisk.thirtyYearASCVDPercentage || '0', '30-year')],
        ['Heart Failure', preventRisk.thirtyYearHFPercentage || 'N/A', getRiskInterpretation('HF', preventRisk.thirtyYearHFPercentage || '0', '30-year')],
      ];

      autoTable(doc, {
        startY: yPosition,
        head: [['Risk Type', 'Your Risk', 'What This Means For You']],
        body: thirtyYearData,
        theme: 'grid',
        headStyles: {
          fillColor: accentColor,
          fontSize: 9,
          fontStyle: 'bold',
          textColor: [255, 255, 255],
        },
        bodyStyles: {
          fontSize: 8,
          textColor: textColor,
        },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 111 },
        },
        styles: {
          overflow: 'linebreak',
          cellPadding: 2,
        },
      });

      yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
      yPosition += 6;
    }

    yPosition = ensureSpace(30, yPosition);
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, yPosition, contentWidth, 22, 2, 2, 'F');
    doc.setTextColor(...brandColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Heart-Healthy Lifestyle Tips for Men:', margin + 4, yPosition + 6);
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const heartTips = 'Strength training 3-4x/week, 150+ minutes cardio weekly, Mediterranean diet, optimize testosterone levels, manage stress, quality sleep 7-8 hours, limit alcohol. These factors significantly reduce cardiovascular risk.';
    const heartTipLines = doc.splitTextToSize(heartTips, contentWidth - 8);
    doc.text(heartTipLines, margin + 4, yPosition + 12);
    yPosition += 28;
  }

  // Smoking Cessation Education Section (only for current smokers)
  if (labValues.demographics?.smoker === true) {
    yPosition = ensureSpace(55, yPosition);
    yPosition = addSectionHeader('SMOKING CESSATION: YOUR PATH TO BETTER HEALTH', yPosition);

    // Educational content box
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, yPosition, contentWidth, 42, 2, 2, 'F');
    
    doc.setTextColor(...brandColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Why Quitting Matters for Your Health', margin + 4, yPosition + 6);
    
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const smokingInfo = 'Smoking is one of the most significant modifiable risk factors for heart disease, stroke, and many cancers. The good news: your body begins healing almost immediately after quitting. Within 20 minutes, heart rate drops. Within 1 year, heart disease risk drops by half. Within 5-15 years, stroke risk equals that of a non-smoker.';
    const smokingLines = doc.splitTextToSize(smokingInfo, contentWidth - 8);
    doc.text(smokingLines, margin + 4, yPosition + 12);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Resources to Help You Quit:', margin + 4, yPosition + 28);
    doc.setFont('helvetica', 'normal');
    const resources = 'Talk to your provider about nicotine replacement therapy (patches, gum, lozenges), prescription medications, or counseling support. The national Quitline (1-800-QUIT-NOW) offers free coaching. Your provider will work with you to create a personalized quit plan that fits your needs.';
    const resourceLines = doc.splitTextToSize(resources, contentWidth - 8);
    doc.text(resourceLines, margin + 4, yPosition + 34);
    
    yPosition += 48;
  }

  if (interpretation.adjustedRisk) {
    const adjustedRisk = interpretation.adjustedRisk;
    yPosition = ensureSpace(60, yPosition);
    yPosition = addSectionHeader('ADVANCED LIPID MARKERS ASSESSMENT', yPosition);

    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, yPosition, contentWidth, 20, 2, 2, 'F');
    doc.setTextColor(...brandColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('What are ApoB and Lp(a)?', margin + 4, yPosition + 6);
    doc.setTextColor(...textColor);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const markerExplanation = 'ApoB measures the number of particles that can deposit cholesterol in artery walls - a better predictor than LDL alone. Lp(a) is a genetic marker that independently increases heart risk. These advanced markers help optimize your cardiovascular protection.';
    const markerLines = doc.splitTextToSize(markerExplanation, contentWidth - 8);
    doc.text(markerLines, margin + 4, yPosition + 12);
    yPosition += 24;

    const markerData: string[][] = [];
    if (adjustedRisk.apoBValue !== undefined) {
      const apoBStatusText = adjustedRisk.apoBStatus === 'elevated' ? 'Elevated' 
        : adjustedRisk.apoBStatus === 'borderline' ? 'Borderline' : 'Normal';
      const apoBExplanation = adjustedRisk.apoBStatus === 'elevated' 
        ? 'Your ApoB is above 130 mg/dL, indicating higher particle count. Lifestyle and medication may be recommended.'
        : adjustedRisk.apoBStatus === 'borderline'
        ? 'Your ApoB is borderline (90-129 mg/dL). Diet, exercise, and fish oil can help.'
        : 'Your ApoB level is within the healthy range (<90 mg/dL).';
      markerData.push([
        'ApoB',
        `${adjustedRisk.apoBValue} mg/dL`,
        apoBStatusText,
        apoBExplanation
      ]);
    }
    if (adjustedRisk.lpaValue !== undefined) {
      const isNmolL = adjustedRisk.lpaValue >= 200;
      const lpaUnit = isNmolL ? 'nmol/L' : 'mg/dL';
      const lpaStatusText = adjustedRisk.lpaStatus === 'elevated' ? 'Elevated' 
        : adjustedRisk.lpaStatus === 'borderline' ? 'Borderline' : 'Normal';
      
      // Unit-specific explanations per clinic protocol (shortened to fit table)
      // mg/dL: ≥29 elevated, ≥50 risk enhancer; nmol/L: ≥75 elevated, ≥125 risk enhancer
      let lpaExplanation: string;
      if (isNmolL) {
        if (adjustedRisk.lpaValue >= 125) {
          lpaExplanation = 'Genetic marker. Elevated level increases CVD risk.';
        } else if (adjustedRisk.lpaValue >= 75) {
          lpaExplanation = 'Elevated genetic marker. Focus on LDL reduction.';
        } else {
          lpaExplanation = 'Within healthy range.';
        }
      } else {
        if (adjustedRisk.lpaValue >= 50) {
          lpaExplanation = 'Genetic marker. Elevated level increases CVD risk.';
        } else if (adjustedRisk.lpaValue >= 29) {
          lpaExplanation = 'Elevated genetic marker. Focus on LDL reduction.';
        } else {
          lpaExplanation = 'Within healthy range.';
        }
      }
      
      markerData.push([
        'Lp(a)',
        `${adjustedRisk.lpaValue} ${lpaUnit}`,
        lpaStatusText,
        lpaExplanation
      ]);
    }

    if (markerData.length > 0) {
      autoTable(doc, {
        startY: yPosition,
        head: [['Marker', 'Your Value', 'Status', 'What This Means']],
        body: markerData,
        theme: 'grid',
        headStyles: {
          fillColor: brandColor,
          fontSize: 9,
          fontStyle: 'bold',
          textColor: [255, 255, 255],
        },
        bodyStyles: {
          fontSize: 8,
          textColor: textColor,
        },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 28 },
          2: { cellWidth: 20 },
          3: { cellWidth: 108 },
        },
        styles: {
          overflow: 'linebreak',
          cellPadding: 2,
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            const status = data.cell.raw as string;
            if (status === 'Elevated') {
              data.cell.styles.textColor = [234, 88, 12];
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'Borderline') {
              data.cell.styles.textColor = [180, 130, 0];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [34, 139, 34];
            }
          }
        },
      });

      yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
      yPosition += 6;
    }
  }

  yPosition = ensureSpace(120, yPosition);

  const parseNutritionPlan = (text: string): { goal: string; diet: string; foods: string[][] } => {
    const lines = text.split('\n').filter(l => l.trim());
    let goal = '';
    let diet = '';
    const foods: string[][] = [];
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim().replace(/^[-•*\d.]+\s*/, '');
      const lowerLine = trimmed.toLowerCase();
      
      if (lowerLine.match(/^(goal|objective|aim|focus|purpose)/)) {
        currentSection = 'goal';
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0 && colonIdx < trimmed.length - 5) {
          goal = trimmed.substring(colonIdx + 1).trim();
        }
        continue;
      } else if (lowerLine.match(/^(diet|eating pattern|nutrition approach|recommended diet)/)) {
        currentSection = 'diet';
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0 && colonIdx < trimmed.length - 5) {
          diet = trimmed.substring(colonIdx + 1).trim();
        }
        continue;
      } else if (lowerLine.match(/^(foods? to emphasize|key foods|focus foods|beneficial foods|foods? to include)/)) {
        currentSection = 'foods';
        continue;
      }
      
      if (trimmed.length > 10) {
        if (currentSection === 'goal' && !goal) {
          goal = trimmed;
        } else if (currentSection === 'diet' && !diet) {
          diet = trimmed;
        } else if (currentSection === 'foods') {
          const dashSplit = trimmed.split(/\s+[-–]\s+/);
          if (dashSplit.length >= 2) {
            let foodName = dashSplit[0].trim();
            const description = dashSplit.slice(1).join(' - ').trim();
            if (foodName.length > 35) {
              foodName = foodName.substring(0, 35).trim();
            }
            foods.push([foodName, description]);
          } else {
            const colonSplit = trimmed.split(/:\s+/);
            if (colonSplit.length >= 2 && colonSplit[0].length <= 40) {
              foods.push([colonSplit[0].trim(), colonSplit.slice(1).join(': ').trim()]);
            }
          }
        } else if (!goal && lowerLine.includes('goal')) {
          goal = trimmed;
        } else if (!diet && (lowerLine.includes('diet') || lowerLine.includes('eating'))) {
          diet = trimmed;
        } else if (foods.length < 8 && trimmed.length > 15) {
          const parts = trimmed.split(/[-–:]/);
          if (parts.length >= 2) {
            foods.push([parts[0].trim(), parts.slice(1).join(' ').trim()]);
          }
        }
      }
    }
    
    if (!goal) {
      goal = "Optimize your nutrition to support testosterone production, muscle building, cardiovascular health, and sustained energy levels.";
    }
    if (!diet) {
      diet = "A high-protein, nutrient-dense approach emphasizing whole foods, healthy fats, and testosterone-supporting nutrients.";
    }
    if (foods.length === 0) {
      foods.push(['Lean Proteins', 'Beef, chicken, fish, eggs - essential for muscle building and testosterone production']);
      foods.push(['Fatty Fish', 'Salmon, mackerel - omega-3s for heart health, inflammation reduction, and hormone balance']);
      foods.push(['Cruciferous Vegetables', 'Broccoli, cauliflower - supports estrogen metabolism and detoxification']);
      foods.push(['Nuts & Seeds', 'Almonds, walnuts, pumpkin seeds - zinc, healthy fats for testosterone support']);
      foods.push(['Berries', 'Blueberries, strawberries - antioxidants for cardiovascular and brain health']);
    }
    
    return { goal: sanitizeForPdf(goal), diet: sanitizeForPdf(diet), foods: foods.slice(0, 8).map(f => [sanitizeForPdf(f[0]), sanitizeForPdf(f[1])]) };
  };

  if (interpretation.insulinResistance && interpretation.insulinResistance.likelihood !== 'none') {
    const ir = interpretation.insulinResistance;
    yPosition = addSectionHeader('METABOLIC HEALTH ASSESSMENT', yPosition);
    
    yPosition = ensureSpace(20, yPosition);
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, yPosition, contentWidth, 14, 2, 2, 'F');
    doc.setTextColor(...brandColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const likelihoodText = ir.likelihood === 'high' ? 'High Likelihood of Insulin Resistance' : 'Moderate Likelihood of Insulin Resistance';
    doc.text(likelihoodText, margin + 4, yPosition + 6);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${ir.positiveCount} of 6 screening markers positive`, margin + 4, yPosition + 11);
    yPosition += 18;

    if (ir.phenotypes.length > 0) {
      for (const phenotype of ir.phenotypes) {
        const explanationText = sanitizeForPdf(phenotype.patientExplanation);
        const expLines = doc.splitTextToSize(explanationText, contentWidth - 10);
        const blockHeight = 10 + (expLines.length * 4);
        yPosition = ensureSpace(blockHeight, yPosition);
        
        doc.setTextColor(...brandColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(phenotype.name, margin, yPosition);
        yPosition += 5;
        
        doc.setTextColor(...textColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        for (let i = 0; i < expLines.length; i++) {
          yPosition = ensureSpace(4, yPosition);
          doc.text(expLines[i], margin + 2, yPosition);
          yPosition += 4;
        }
        yPosition += 4;
      }
    } else {
      const defaultText = sanitizeForPdf('Some of your metabolic markers suggest your body may not be processing insulin as efficiently as it should. We recommend confirmation testing with fasting insulin and fasting glucose to guide next steps.');
      const defaultLines = doc.splitTextToSize(defaultText, contentWidth - 10);
      for (let i = 0; i < defaultLines.length; i++) {
        yPosition = ensureSpace(4, yPosition);
        doc.setTextColor(...textColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(defaultLines[i], margin + 2, yPosition);
        yPosition += 4;
      }
      yPosition += 4;
    }
    yPosition += 4;
  }

  yPosition = addSectionHeader('YOUR PERSONALIZED NUTRITION PLAN', yPosition);
  
  const nutritionParsed = parseNutritionPlan(wellnessPlan.dietPlan);
  
  doc.setFontSize(9);
  const goalLines = doc.splitTextToSize(nutritionParsed.goal, contentWidth - 10);
  const goalBoxHeight = 14 + (goalLines.length * 4);
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, yPosition, contentWidth, goalBoxHeight, 2, 2, 'F');
  doc.setTextColor(...brandColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Your Nutrition Goal', margin + 4, yPosition + 7);
  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(goalLines, margin + 4, yPosition + 14);
  yPosition += goalBoxHeight + 4;

  doc.setFontSize(9);
  const dietLines = doc.splitTextToSize(nutritionParsed.diet, contentWidth - 10);
  const dietBoxHeight = 14 + (dietLines.length * 4);
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, yPosition, contentWidth, dietBoxHeight, 2, 2, 'F');
  doc.setTextColor(...brandColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Recommended Diet', margin + 4, yPosition + 7);
  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(dietLines, margin + 4, yPosition + 14);
  yPosition += dietBoxHeight + 6;

  doc.setTextColor(...brandColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Foods To Emphasize', margin, yPosition + 4);
  yPosition += 8;

  autoTable(doc, {
    startY: yPosition,
    head: [['Food', 'Why It Helps You']],
    body: nutritionParsed.foods,
    theme: 'striped',
    headStyles: {
      fillColor: brandColor,
      fontSize: 9,
      fontStyle: 'bold',
      textColor: [255, 255, 255],
    },
    bodyStyles: {
      fontSize: 8,
      textColor: textColor,
      valign: 'top',
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 55 },
    },
    styles: {
      overflow: 'linebreak',
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: lightBg,
    },
  });
  yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
  yPosition += 10;

  const metagenicsProducts: Array<{
    name: string;
    aliases: string[];
    description: string;
    defaultDose: string;
    category: string;
  }> = [
    {
      name: 'Testralin',
      aliases: ['testralin', 'testosterone support', 'test support', 'male vitality'],
      description: 'Botanical and nutrient formula supporting healthy testosterone levels, male vitality, energy, and reproductive function. Contains key testosterone-supporting nutrients.',
      defaultDose: '2 tablets twice daily with meals',
      category: 'testosterone'
    },
    {
      name: 'UltraFlora Complete Probiotic',
      aliases: ['ultraflora', 'probiotic', 'gut health', 'digestive'],
      description: 'Multi-strain probiotic for digestive health, immune support, nutrient absorption, and gut-brain axis function. Foundation for overall wellness.',
      defaultDose: '1 capsule daily',
      category: 'probiotic'
    },
    {
      name: 'Vitamin D3 10,000 + K',
      aliases: ['d3 10000', 'd3 10,000', 'vitamin d 10000', 'high dose d'],
      description: 'High-potency vitamin D3 with vitamin K2 for bone health, testosterone support, immune function, and mood. For documented deficiency (<30 ng/mL).',
      defaultDose: '1 softgel daily with meal',
      category: 'vitamind-high'
    },
    {
      name: 'Vitamin D3 5,000 + K',
      aliases: ['d3 5000', 'd3 5,000', 'vitamin d', 'd3', 'vitamin d3'],
      description: 'Vitamin D3 with vitamin K2 for deficiency/insufficiency repletion (21-40 ng/mL). Supports testosterone, bones, immunity, and cardiovascular health.',
      defaultDose: '1 softgel daily with meal',
      category: 'vitamind'
    },
    {
      name: 'D3 2000 Complex',
      aliases: ['d3 2000', 'vitamin d 2000', 'd3 complex', 'vitamin d maintenance'],
      description: 'Comprehensive vitamin D3 with cofactors for suboptimal levels (41-59 ng/mL). Supports reaching optimal range (≥60 ng/mL) for testosterone and immune health.',
      defaultDose: '1 tablet daily with meal',
      category: 'vitamind-maintenance'
    },
    {
      name: 'Magtein Magnesium L-Threonate',
      aliases: ['magtein', 'magnesium', 'mag l-threonate', 'brain magnesium'],
      description: 'Clinically studied magnesium that crosses the blood-brain barrier. Supports sleep quality, cognitive function, stress resilience, and testosterone production.',
      defaultDose: '1 capsule morning, 2 capsules before sleep',
      category: 'magnesium'
    },
    {
      name: 'Adreset',
      aliases: ['adreset', 'adrenal', 'cordyceps', 'ginseng', 'rhodiola', 'adaptogen'],
      description: 'Adaptogen formula with Cordyceps, Asian Ginseng, and Rhodiola for stress resilience, energy, stamina, and supporting healthy testosterone levels.',
      defaultDose: '2 capsules twice daily',
      category: 'adrenal'
    },
    {
      name: 'Exhilarin',
      aliases: ['exhilarin', 'ashwagandha', 'holy basil', 'mood support'],
      description: 'Ayurvedic adaptogen blend for stress tolerance, mood balance, mental clarity, and supporting healthy cortisol levels for testosterone optimization.',
      defaultDose: '2 tablets daily',
      category: 'mood'
    },
    {
      name: 'NutraGems CoQ10 300',
      aliases: ['nutragems', 'coq10', 'coenzyme q10', 'ubiquinone'],
      description: 'Chewable 300mg CoQ10 for cardiovascular health, cellular energy production, exercise performance, and antioxidant protection.',
      defaultDose: '1 chewable gel daily',
      category: 'cardiovascular'
    },
    {
      name: 'OmegaGenics Fish Oil Neuro 1000',
      aliases: ['omegagenics', 'fish oil', 'omega-3', 'dha', 'epa'],
      description: 'High-DHA omega-3 fish oil for brain health, cardiovascular support, inflammation reduction, and joint comfort. Supports testosterone-to-estrogen balance.',
      defaultDose: '1-2 softgels daily with meal',
      category: 'omega'
    },
  ];

  if (yPosition > pageHeight - 100) {
    doc.addPage();
    addHeader();
    yPosition = 45;
  }

  yPosition = addSectionHeader('YOUR SUPPLEMENT PROTOCOL', yPosition);
  
  const buildSupplementTable = (): string[][] => {
    const normalizeName = (name: string): string => 
      name.toLowerCase().replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
    
    if (interpretation.supplements && interpretation.supplements.length > 0) {
      return interpretation.supplements.map(s => {
        const normalizedName = normalizeName(s.name);
        let description = s.rationale || s.indication || 'Supports overall health and performance.';
        
        let matchedProduct = metagenicsProducts.find(product => {
          const normalizedProduct = normalizeName(product.name);
          return normalizedName.includes(normalizedProduct) || 
                 normalizedProduct.includes(normalizedName.split(' ').slice(0, 2).join(' '));
        });
        
        if (!matchedProduct) {
          matchedProduct = metagenicsProducts.find(product =>
            product.aliases.some(alias => 
              alias.length >= 3 && normalizedName.includes(alias)
            )
          );
        }
        
        if (matchedProduct) {
          description = matchedProduct.description;
        }
        
        return [
          sanitizeForPdf(s.name),
          sanitizeForPdf(description),
          sanitizeForPdf(s.dose || 'As directed')
        ];
      });
    }
    
    return [];
  };
  
  const supplementData = buildSupplementTable();
  
  if (supplementData.length > 0) {
    autoTable(doc, {
      startY: yPosition,
      head: [['Supplement', 'What It Does', 'Dose & Timing']],
      body: supplementData,
      theme: 'striped',
      headStyles: {
        fillColor: brandColor,
        fontSize: 9,
        fontStyle: 'bold',
        textColor: [255, 255, 255],
      },
      bodyStyles: {
        fontSize: 8,
        textColor: textColor,
      },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: 'bold' },
        1: { cellWidth: 95 },
        2: { cellWidth: contentWidth - 130 },
      },
      styles: {
        overflow: 'linebreak',
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: lightBg,
      },
    });
    yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
  } else {
    yPosition = addTextSection(wellnessPlan.supplementProtocol, yPosition, contentWidth);
  }
  yPosition += 10;

  yPosition = ensureSpace(80, yPosition);

  const parseLifestyle = (text: string): { activity: string; sleep: string; stress: string; hydration: string } => {
    const lines = text.split('\n').filter(l => l.trim());
    let activity = '';
    let sleep = '';
    let stress = '';
    let hydration = '';
    let currentCategory = '';
    
    for (const line of lines) {
      const trimmed = line.trim().replace(/^[-•*\d.]+\s*/, '');
      const lowerLine = trimmed.toLowerCase();
      
      if (lowerLine.match(/^(physical activity|exercise|movement|workout|training)/)) {
        currentCategory = 'activity';
        continue;
      } else if (lowerLine.match(/^(sleep|rest|recovery)/)) {
        currentCategory = 'sleep';
        continue;
      } else if (lowerLine.match(/^(stress|relax|mindful|mental)/)) {
        currentCategory = 'stress';
        continue;
      } else if (lowerLine.match(/^(hydrat|water|fluid)/)) {
        currentCategory = 'hydration';
        continue;
      }
      
      if (trimmed.length > 10) {
        if (currentCategory === 'activity' || (!currentCategory && lowerLine.match(/exercise|walk|gym|cardio|strength|weight|lift|training|workout|active|steps/))) {
          activity += (activity ? ' ' : '') + trimmed;
          currentCategory = 'activity';
        } else if (currentCategory === 'sleep' || (!currentCategory && lowerLine.match(/sleep|bed|rest|hour|night|wake|recovery/))) {
          sleep += (sleep ? ' ' : '') + trimmed;
          currentCategory = 'sleep';
        } else if (currentCategory === 'stress' || (!currentCategory && lowerLine.match(/stress|relax|meditat|breath|mindful|calm/))) {
          stress += (stress ? ' ' : '') + trimmed;
          currentCategory = 'stress';
        } else if (currentCategory === 'hydration' || (!currentCategory && lowerLine.match(/water|hydrat|drink|fluid|oz|liter/))) {
          hydration += (hydration ? ' ' : '') + trimmed;
          currentCategory = 'hydration';
        }
      }
    }
    
    if (!activity) {
      activity = 'Strength training 3-4x per week targeting major muscle groups. Add 150+ minutes of cardio weekly (walking, swimming, cycling). Compound exercises (squats, deadlifts, bench) boost testosterone.';
    }
    if (!sleep) {
      sleep = 'Target 7-8 hours nightly - critical for testosterone production. Keep bedroom cool (65-68F), dark, and screen-free 1 hour before bed. Consistent sleep schedule optimizes hormones.';
    }
    if (!stress) {
      stress = 'High cortisol suppresses testosterone. Practice stress management: deep breathing, cold exposure, time in nature, and limit work stress. Consider meditation or journaling.';
    }
    if (!hydration) {
      hydration = 'Drink at least 100 oz (3L) of water daily, more with exercise. Proper hydration supports workout performance, recovery, and testosterone production. Limit alcohol.';
    }
    
    return {
      activity: sanitizeForPdf(activity),
      sleep: sanitizeForPdf(sleep),
      stress: sanitizeForPdf(stress),
      hydration: sanitizeForPdf(hydration)
    };
  };

  yPosition = addSectionHeader('LIFESTYLE RECOMMENDATIONS', yPosition);
  
  const lifestyle = parseLifestyle(wellnessPlan.lifestyleRecommendations);
  
  autoTable(doc, {
    startY: yPosition,
    head: [['Training & Exercise', 'Sleep & Recovery', 'Stress Management', 'Hydration']],
    body: [[lifestyle.activity, lifestyle.sleep, lifestyle.stress, lifestyle.hydration]],
    theme: 'grid',
    headStyles: {
      fillColor: brandColor,
      fontSize: 9,
      fontStyle: 'bold',
      textColor: [255, 255, 255],
      halign: 'center',
      cellPadding: 3,
      minCellHeight: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: textColor,
      valign: 'top',
      minCellHeight: 30,
    },
    columnStyles: {
      0: { cellWidth: contentWidth / 4 },
      1: { cellWidth: contentWidth / 4 },
      2: { cellWidth: contentWidth / 4 },
      3: { cellWidth: contentWidth / 4 },
    },
    styles: {
      overflow: 'linebreak',
      cellPadding: 4,
    },
  });
  yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yPosition;
  yPosition += 10;

  yPosition = addSectionHeader('UNDERSTANDING YOUR RESULTS', yPosition);
  yPosition = addTextSection(wellnessPlan.educationalContent, yPosition, contentWidth);
  yPosition += 8;

  yPosition = ensureSpace(90, yPosition);
  yPosition = addSectionHeader('YOUR ACTION CHECKLIST', yPosition);

  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const checklistItems = [
    'Review this wellness report and identify your priority focus areas',
    'Start implementing dietary changes - add one testosterone-boosting food per week',
    'Purchase recommended supplements from our clinic or quality source',
    'Set up a consistent supplement schedule (morning and evening routines)',
    'Schedule your workout plan - prioritize strength training for testosterone',
    'Optimize your sleep environment for 7-8 hours quality rest',
    'Track your progress - energy, mood, libido, workout performance',
    'Schedule your follow-up lab work in 60-90 days to monitor progress',
    'Contact MVP Men\'s Clinic with any questions - we\'re here to optimize your health!',
  ];

  checklistItems.forEach((item, index) => {
    yPosition = ensureSpace(10, yPosition);
    doc.setTextColor(...textColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...brandColor);
    doc.rect(margin, yPosition - 3, 4, 4);
    doc.text(`${index + 1}. ${item}`, margin + 7, yPosition);
    yPosition += 7;
  });

  yPosition += 8;

  if (patientLabs && patientLabs.length >= 2) {
    yPosition = addTrendChartsToWellnessPDF(
      doc, patientLabs, yPosition, margin, contentWidth, pageHeight,
      brandColor, textColor,
      () => { doc.addPage(); addHeader(); return 45; }
    );
    yPosition += 4;
  }

  yPosition = ensureSpace(35, yPosition);
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, yPosition, contentWidth, 28, 3, 3, 'F');
  doc.setDrawColor(...brandColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, yPosition, contentWidth, 28, 3, 3, 'S');
  doc.setTextColor(...brandColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text("We're Here For Your Success", margin + 4, yPosition + 8);
  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const supportText = "At MVP Men's Clinic, your health optimization is our mission. This report is just the beginning of your journey. Our team is here to answer questions, adjust your protocol, and ensure you achieve your health goals. Don't hesitate to reach out!";
  const supportLines = doc.splitTextToSize(supportText, contentWidth - 8);
  doc.text(supportLines, margin + 4, yPosition + 14);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }

  const fileName = patientName 
    ? `MVP_Mens_Clinic_Wellness_Report_${sanitizeForPdf(patientName).replace(/\s+/g, '_')}.pdf`
    : `MVP_Mens_Clinic_Wellness_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  
  doc.save(fileName);
}
