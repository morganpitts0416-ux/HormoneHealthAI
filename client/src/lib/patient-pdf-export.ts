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

function getLabInsight(category: string, value: number | string, status: string, referenceRange?: string): string {
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
      hemoglobin: { low: 12, high: 16 },
      hematocrit: { low: 36, high: 44 },
      ferritin: { low: 30, high: 150 },
      tsh: { low: 0.45, high: 4.5 },
      "free t4": { low: 0.9, high: 1.7 },
      "free t3": { low: 2.3, high: 4.2 },
      "vitamin d": { low: 30, high: 100 },
      "vitamin b12": { low: 200, high: 900 },
      ldl: { low: 0, high: 100 },
      hdl: { low: 50, high: 200 },
      triglycerides: { low: 0, high: 150 },
      "total cholesterol": { low: 0, high: 200 },
      glucose: { low: 70, high: 100 },
      "a1c": { low: 0, high: 5.7 },
      creatinine: { low: 0.5, high: 1.1 },
      egfr: { low: 60, high: 200 },
      alt: { low: 0, high: 32 },
      ast: { low: 0, high: 32 },
      estradiol: { low: 30, high: 400 },
      progesterone: { low: 1, high: 20 },
      testosterone: { low: 15, high: 70 },
      fsh: { low: 2, high: 25 },
      amh: { low: 1, high: 5 },
      "hs-crp": { low: 0, high: 2 },
      "lp(a)": { low: 0, high: 50 },
      "apolipoprotein b": { low: 0, high: 90 },
      platelets: { low: 150, high: 400 },
      wbc: { low: 4, high: 11 },
      iron: { low: 60, high: 170 },
      folate: { low: 3, high: 20 },
      magnesium: { low: 1.7, high: 2.3 },
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
      what: "Hemoglobin carries oxygen in your blood to all your organs and tissues.",
      normal: "Your oxygen-carrying capacity is healthy, supporting good energy levels.",
      low: "Lower hemoglobin may cause fatigue and shortness of breath. Iron-rich foods and supplements can help.",
      high: "Elevated levels may indicate dehydration or other conditions worth monitoring."
    },
    hematocrit: {
      what: "Hematocrit measures the percentage of red blood cells in your blood.",
      normal: "Your red blood cell percentage is balanced, supporting healthy circulation.",
      low: "Lower levels may indicate anemia. Focus on iron, B12, and folate intake.",
      high: "Higher levels may suggest dehydration or need further evaluation."
    },
    ferritin: {
      what: "Ferritin reflects your body's iron stores, essential for energy and immunity.",
      normal: "Your iron stores are adequate for energy production and immune function.",
      low: "Low iron stores can cause fatigue, hair loss, and weakened immunity. Iron supplementation may help.",
      high: "Elevated ferritin may indicate inflammation or excess iron intake."
    },
    tsh: {
      what: "TSH controls your thyroid, which regulates metabolism, energy, and weight.",
      normal: "Your thyroid function appears balanced, supporting healthy metabolism.",
      low: "Lower TSH may indicate an overactive thyroid, which can cause weight loss and anxiety.",
      high: "Higher TSH may indicate an underactive thyroid, which can cause fatigue and weight gain."
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
      what: "Vitamin D supports bone health, immune function, and mood regulation.",
      normal: "Your vitamin D level supports strong bones, immunity, and positive mood.",
      low: "Low vitamin D is linked to fatigue, weakened bones, and increased illness. Supplementation is often helpful.",
      high: "Vitamin D levels above optimal range - discuss with your provider."
    },
    "vitamin b12": {
      what: "Vitamin B12 is essential for nerve function, energy, and red blood cell production.",
      normal: "Your B12 level supports healthy nerves, energy production, and blood cells.",
      low: "Low B12 can cause fatigue, numbness, and memory issues. B12 supplementation is often beneficial.",
      high: "B12 levels are elevated - typically not harmful but worth monitoring."
    },
    ldl: {
      what: "LDL is 'bad' cholesterol that can build up in artery walls over time.",
      normal: "Your LDL is in a healthy range, reducing heart disease risk.",
      low: "Lower LDL levels are generally heart-protective.",
      high: "Higher LDL increases cardiovascular risk. Diet changes and exercise can help lower it."
    },
    hdl: {
      what: "HDL is 'good' cholesterol that helps remove bad cholesterol from your arteries.",
      normal: "Your HDL level provides good protection for your heart and arteries.",
      low: "Lower HDL reduces heart protection. Exercise and healthy fats can help raise it.",
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
      high: "Higher glucose may indicate prediabetes. Diet and exercise are key interventions."
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
      high: "Elevated creatinine may indicate kidney stress. Hydration and reducing certain supplements may help."
    },
    egfr: {
      what: "eGFR estimates how well your kidneys filter waste from your blood.",
      normal: "Your kidney function is in the healthy range, effectively filtering waste.",
      low: "Lower eGFR suggests reduced kidney function. Discuss with your provider for monitoring.",
      high: "Higher eGFR indicates good kidney filtration capacity."
    },
    alt: {
      what: "ALT is a liver enzyme that can indicate liver health status.",
      normal: "Your liver enzyme levels suggest healthy liver function.",
      low: "Lower ALT is typically not concerning.",
      high: "Elevated ALT may indicate liver stress. Reducing alcohol and certain medications may help."
    },
    ast: {
      what: "AST is an enzyme found in your liver and muscles indicating tissue health.",
      normal: "Your AST level suggests healthy liver and muscle tissue.",
      low: "Lower AST is typically not concerning.",
      high: "Elevated AST may indicate liver or muscle stress. Worth monitoring."
    },
    estradiol: {
      what: "Estradiol is your primary estrogen, vital for bone health, mood, and heart protection.",
      normal: "Your estrogen level is appropriate for your cycle phase and overall health.",
      low: "Lower estrogen may cause hot flashes, mood changes, and bone loss. HRT may be beneficial.",
      high: "Higher estrogen levels should be discussed with your provider in context of your cycle."
    },
    progesterone: {
      what: "Progesterone balances estrogen and is essential for cycle regularity and sleep.",
      normal: "Your progesterone level is appropriate for your cycle phase.",
      low: "Lower progesterone may cause PMS, irregular cycles, and sleep issues. Supplementation may help.",
      high: "Higher progesterone is normal in the luteal phase; otherwise, discuss with your provider."
    },
    testosterone: {
      what: "Testosterone in women supports energy, libido, muscle strength, and mood.",
      normal: "Your testosterone level supports healthy energy, mood, and muscle function.",
      low: "Lower testosterone may cause fatigue, low libido, and decreased muscle mass.",
      high: "Higher testosterone may cause acne or hair changes. Worth discussing with your provider."
    },
    fsh: {
      what: "FSH controls ovarian function and egg development.",
      normal: "Your FSH level is appropriate for your cycle phase and reproductive status.",
      low: "Lower FSH may indicate pituitary issues or early pregnancy.",
      high: "Higher FSH may indicate perimenopause or reduced ovarian reserve."
    },
    amh: {
      what: "AMH reflects your ovarian reserve - the number of eggs remaining in your ovaries.",
      normal: "Your ovarian reserve appears appropriate for your age.",
      low: "Lower AMH suggests diminished ovarian reserve, important for fertility planning.",
      high: "Higher AMH may indicate polycystic ovary syndrome (PCOS) or good ovarian reserve."
    },
    "hs-crp": {
      what: "hs-CRP measures inflammation in your body, linked to heart disease risk.",
      normal: "Your inflammation level is low, which is protective for your heart.",
      low: "Lower inflammation is excellent for cardiovascular and overall health.",
      high: "Higher inflammation increases health risks. Anti-inflammatory diet and lifestyle changes help."
    },
    "lp(a)": {
      what: "Lp(a) is an inherited cholesterol particle that increases heart disease risk.",
      normal: "Your Lp(a) is in a favorable range for heart health.",
      low: "Lower Lp(a) is protective for cardiovascular health.",
      high: "Elevated Lp(a) is genetic and increases heart risk. Aggressive lifestyle measures are important."
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
      high: "Higher platelets may indicate inflammation or a clotting disorder. Further evaluation may be needed."
    },
    wbc: {
      what: "White blood cells fight infections and are part of your immune system.",
      normal: "Your immune cell count is in the healthy range for fighting infections.",
      low: "Lower WBC may indicate weakened immunity. Worth monitoring.",
      high: "Higher WBC may indicate infection or inflammation in your body."
    },
    iron: {
      what: "Iron is essential for oxygen transport, energy, and healthy hair and skin.",
      normal: "Your iron level supports healthy oxygen delivery and energy production.",
      low: "Lower iron may cause fatigue and weakness. Iron-rich foods and supplements can help.",
      high: "Higher iron may indicate excess intake or a storage disorder."
    },
    folate: {
      what: "Folate is essential for cell division, DNA synthesis, and preventing birth defects.",
      normal: "Your folate level supports healthy cell function and DNA synthesis.",
      low: "Lower folate may cause fatigue and is important to address, especially before pregnancy.",
      high: "Higher folate is generally safe from food sources."
    },
    magnesium: {
      what: "Magnesium supports over 300 reactions including muscle function, sleep, and mood.",
      normal: "Your magnesium level supports healthy muscles, nerves, and sleep.",
      low: "Lower magnesium may cause muscle cramps, anxiety, and poor sleep. Supplementation often helps.",
      high: "Higher magnesium is rare from diet alone and usually not concerning."
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
    if (status === 'abnormal' || status === 'critical') return "This result is outside the optimal range. Please discuss with your provider.";
    return "Your provider can explain this result in the context of your overall health.";
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
      if (interp.status === 'critical') {
        statusText = 'Needs Attention';
      } else if (interp.status === 'abnormal') {
        statusText = 'Outside Range';
      } else if (interp.status === 'borderline') {
        statusText = 'Borderline';
      } else {
        statusText = 'Optimal';
      }

      const healthInsight = getLabInsight(interp.category, interp.value ?? 0, interp.status, interp.referenceRange);

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

  // Parse nutrition plan into Goal, Diet, and Foods To Emphasize structure
  const parseNutritionPlan = (text: string): { goal: string; diet: string; foods: string[][] } => {
    const lines = text.split('\n').filter(l => l.trim());
    let goal = '';
    let diet = '';
    const foods: string[][] = [];
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim().replace(/^[-•*\d.]+\s*/, '');
      const lowerLine = trimmed.toLowerCase();
      
      // Detect section headers
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
      
      // Add content to current section
      if (trimmed.length > 10) {
        if (currentSection === 'goal' && !goal) {
          goal = trimmed;
        } else if (currentSection === 'diet' && !diet) {
          diet = trimmed;
        } else if (currentSection === 'foods') {
          // Try to parse "Food - reason" or "Food: reason" format
          const separatorMatch = trimmed.match(/^([^:\-–]+)[\s:\-–]+(.+)/);
          if (separatorMatch && separatorMatch[1].length < 40) {
            foods.push([separatorMatch[1].trim(), separatorMatch[2].trim()]);
          } else {
            foods.push([trimmed.substring(0, 30), trimmed.length > 30 ? trimmed.substring(30) : 'Supports overall health']);
          }
        } else if (!goal && lowerLine.includes('goal')) {
          goal = trimmed;
        } else if (!diet && (lowerLine.includes('diet') || lowerLine.includes('eating'))) {
          diet = trimmed;
        } else if (foods.length < 8 && trimmed.length > 15) {
          // Fallback: treat as food recommendation
          const parts = trimmed.split(/[-–:]/);
          if (parts.length >= 2) {
            foods.push([parts[0].trim(), parts.slice(1).join(' ').trim()]);
          }
        }
      }
    }
    
    // Fallbacks if sections weren't found
    if (!goal) {
      goal = "Optimize your nutrition to support energy, hormone balance, and overall wellness based on your lab results.";
    }
    if (!diet) {
      const dietLine = lines.find(l => l.toLowerCase().includes('mediterranean') || l.toLowerCase().includes('anti-inflammatory') || l.toLowerCase().includes('whole food'));
      diet = dietLine ? sanitizeForPdf(dietLine.replace(/^[-•*\d.]+\s*/, '').trim()) : "A balanced whole-foods approach emphasizing nutrient-dense options tailored to your health needs.";
    }
    if (foods.length === 0) {
      foods.push(['Leafy Greens', 'Rich in iron, folate, and magnesium for energy and hormone support']);
      foods.push(['Fatty Fish', 'Omega-3s reduce inflammation and support heart and brain health']);
      foods.push(['Berries', 'Antioxidants protect cells and support healthy aging']);
      foods.push(['Nuts & Seeds', 'Healthy fats, fiber, and minerals for sustained energy']);
    }
    
    return { goal: sanitizeForPdf(goal), diet: sanitizeForPdf(diet), foods: foods.slice(0, 8).map(f => [sanitizeForPdf(f[0]), sanitizeForPdf(f[1])]) };
  };

  yPosition = addSectionHeader('YOUR PERSONALIZED NUTRITION PLAN', yPosition);
  
  const nutritionParsed = parseNutritionPlan(wellnessPlan.dietPlan);
  
  // Goal section - dynamically sized
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

  // Diet section - dynamically sized
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

  // Foods To Emphasize table
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

  // Metagenics supplement descriptions database
  const supplementDescriptions: Record<string, string> = {
    'magtein': 'Brain-focused magnesium (L-threonate) that crosses the blood-brain barrier to support sleep quality, relaxation, stress resilience, and cognitive function/brain fog.',
    'magnesium l-threonate': 'Brain-focused magnesium that crosses the blood-brain barrier to support sleep quality, relaxation, stress resilience, and cognitive function/brain fog.',
    'magnesium': 'Essential mineral supporting over 300 enzyme reactions including muscle function, nerve signaling, sleep quality, and stress response.',
    'adreset': 'Daytime resilience adaptogen formula with Cordyceps, Panax ginseng, and Rhodiola to support energy, stamina, and stress tolerance.',
    'exhilarin': 'Stress tolerance and cognitive support blend with holy basil, ashwagandha, amla, and bacopa for mood, brain fog, and sleep quality.',
    'coq10': 'Mitochondrial energy and antioxidant support for cellular energy production, cardiovascular health, and fatigue/low stamina.',
    'nutragems coq10': 'Mitochondrial energy and antioxidant support in chewable form for cardiovascular health, statin users, and migraine-prone patients.',
    'omega-3': 'Essential fatty acids (EPA/DHA) for brain function, mood support, cardiovascular health, and reducing inflammation.',
    'omegagenics': 'High DHA/EPA fish oil for brain function, cognition, mood support, and cardiovascular health.',
    'fish oil': 'Essential omega-3 fatty acids supporting brain function, heart health, joint comfort, and healthy inflammatory response.',
    'vitamin d3': 'Essential for bone health, immune function, mood regulation, and hormone balance. Works synergistically with vitamin K.',
    'vitamin d3 10000': 'High-potency vitamin D repletion with vitamin K for bone and vascular health, used for documented deficiency under provider monitoring.',
    'vitamin d': 'Supports bone health, immune function, mood, energy, and hormone balance. Most adults are deficient.',
    'vitamin k2': 'Directs calcium to bones and away from arteries, supporting bone density and cardiovascular health.',
    'vitamin b12': 'Essential for energy production, nerve function, red blood cell formation, and cognitive health.',
    'methylcobalamin': 'Active form of B12 for optimal absorption, supporting energy, nerve function, and methylation.',
    'folate': 'Essential B vitamin for cell division, DNA synthesis, mood support, and preventing neural tube defects.',
    'methylfolate': 'Active form of folate for those with MTHFR variations, supporting mood, energy, and cellular health.',
    'iron': 'Essential mineral for oxygen transport, energy production, and preventing fatigue from iron deficiency.',
    'ferritin': 'Iron storage protein - supplementing iron helps replenish ferritin stores for sustained energy.',
    'probiotic': 'Beneficial bacteria supporting gut health, immune function, nutrient absorption, and mood balance.',
    'ultraflora': 'Targeted probiotic strains for digestive health, immune support, and maintaining healthy gut microbiome.',
    'zinc': 'Essential mineral for immune function, wound healing, hormone production, and taste/smell.',
    'selenium': 'Trace mineral supporting thyroid function, antioxidant defenses, and immune health.',
    'ashwagandha': 'Adaptogenic herb supporting stress resilience, calm energy, thyroid function, and hormone balance.',
    'rhodiola': 'Adaptogen supporting mental clarity, physical endurance, stress resilience, and fatigue reduction.',
    'curcumin': 'Powerful anti-inflammatory from turmeric supporting joint comfort, brain health, and healthy aging.',
    'berberine': 'Plant compound supporting healthy blood sugar, cholesterol metabolism, and metabolic health.',
    'dhea': 'Precursor hormone supporting energy, mood, bone health, and overall hormone balance.',
    'pregnenolone': 'Master precursor hormone supporting cognitive function, memory, mood, and hormone production.',
  };

  // Parse and format supplement protocol into table with descriptions
  const parseSupplements = (text: string): string[][] => {
    const lines = text.split('\n').filter(l => l.trim());
    const rows: string[][] = [];
    
    for (const line of lines) {
      const trimmed = line.trim().replace(/^[-•*\d.]+\s*/, '');
      
      // Look for patterns like "Vitamin D: 2000 IU daily" or "Vitamin D 2000 IU - take with food"
      const match = trimmed.match(/^([A-Za-z0-9\s\-\(\)®]+?)[\s:]+(\d+[\w\s\/\-\.]+?)[\s,\-]+(.*)/i) ||
                   trimmed.match(/^([A-Za-z0-9\s\-\(\)®]+?)[\s:]+(\d+.*?)(morning|evening|daily|with|before|after|$)/i);
      
      if (match) {
        const supplementName = match[1].trim();
        const dose = match[2].trim();
        const timing = match[3]?.trim() || 'Daily';
        
        if (supplementName.length > 2 && dose.length > 1) {
          // Find description from database
          const lowerName = supplementName.toLowerCase().replace(/[®™]/g, '');
          let description = 'Supports overall health and wellness.';
          
          for (const [key, desc] of Object.entries(supplementDescriptions)) {
            if (lowerName.includes(key) || key.includes(lowerName.split(' ')[0])) {
              description = desc;
              break;
            }
          }
          
          const doseAndTiming = timing.length > 2 ? `${dose} - ${timing}` : `${dose} daily`;
          rows.push([supplementName, description, doseAndTiming]);
        }
      } else if (trimmed.length > 10 && trimmed.match(/vitamin|magnesium|iron|omega|probiotic|zinc|b12|folate|d3|k2|fish oil|coq10|ashwagandha/i)) {
        const lowerTrimmed = trimmed.toLowerCase();
        let description = 'Supports overall health and wellness.';
        let name = trimmed.substring(0, 30);
        
        for (const [key, desc] of Object.entries(supplementDescriptions)) {
          if (lowerTrimmed.includes(key)) {
            description = desc;
            break;
          }
        }
        
        rows.push([name, description, 'As directed by provider']);
      }
    }
    
    if (rows.length < 2) {
      const simpleLines = text.split(/[.\n]/).filter(l => l.trim().length > 10).slice(0, 6);
      return simpleLines.map(l => {
        const name = sanitizeForPdf(l.trim().substring(0, 30));
        return [name, 'Supports overall health and wellness.', 'As directed'];
      });
    }
    return rows.slice(0, 10).map(r => [sanitizeForPdf(r[0]), sanitizeForPdf(r[1]), sanitizeForPdf(r[2])]);
  };

  // Start supplement section on new page for clean layout
  doc.addPage();
  addHeader();
  yPosition = 45;

  yPosition = addSectionHeader('YOUR SUPPLEMENT PROTOCOL', yPosition);
  
  const supplementData = parseSupplements(wellnessPlan.supplementProtocol);
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

  // Start lifestyle section on new page for clean layout
  doc.addPage();
  addHeader();
  yPosition = 45;

  // Parse lifestyle recommendations into four categories
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
      
      // Detect category headers
      if (lowerLine.match(/^(physical activity|exercise|movement|workout)/)) {
        currentCategory = 'activity';
        continue;
      } else if (lowerLine.match(/^(sleep|rest|bedtime)/)) {
        currentCategory = 'sleep';
        continue;
      } else if (lowerLine.match(/^(stress|relax|mindful|mental)/)) {
        currentCategory = 'stress';
        continue;
      } else if (lowerLine.match(/^(hydrat|water|fluid)/)) {
        currentCategory = 'hydration';
        continue;
      }
      
      // Categorize by content if no explicit header
      if (trimmed.length > 10) {
        if (currentCategory === 'activity' || (!currentCategory && lowerLine.match(/exercise|walk|gym|cardio|strength|yoga|stretch|active|steps/))) {
          activity += (activity ? ' ' : '') + trimmed;
          currentCategory = 'activity';
        } else if (currentCategory === 'sleep' || (!currentCategory && lowerLine.match(/sleep|bed|rest|hour|night|wake|melatonin/))) {
          sleep += (sleep ? ' ' : '') + trimmed;
          currentCategory = 'sleep';
        } else if (currentCategory === 'stress' || (!currentCategory && lowerLine.match(/stress|relax|meditat|breath|mindful|calm|anxiety/))) {
          stress += (stress ? ' ' : '') + trimmed;
          currentCategory = 'stress';
        } else if (currentCategory === 'hydration' || (!currentCategory && lowerLine.match(/water|hydrat|drink|fluid|oz|liter/))) {
          hydration += (hydration ? ' ' : '') + trimmed;
          currentCategory = 'hydration';
        }
      }
    }
    
    // Provide defaults based on general wellness guidelines
    if (!activity) {
      activity = 'Aim for 150 minutes of moderate activity weekly. Include a mix of cardio (walking, swimming) and strength training 2-3x per week. Start with 10-minute walks and gradually increase.';
    }
    if (!sleep) {
      sleep = 'Target 7-9 hours nightly. Create a consistent bedtime routine. Avoid screens 1 hour before bed. Keep bedroom cool (65-68F) and dark.';
    }
    if (!stress) {
      stress = 'Practice 5-10 minutes of deep breathing or meditation daily. Take short breaks throughout the day. Consider journaling or gentle yoga for relaxation.';
    }
    if (!hydration) {
      hydration = 'Drink at least 64 oz (8 cups) of water daily. Increase intake with exercise or hot weather. Limit caffeine and alcohol which can dehydrate.';
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
  
  // Create horizontal layout with four columns
  autoTable(doc, {
    startY: yPosition,
    head: [['Physical Activity', 'Sleep', 'Stress Management', 'Hydration']],
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

  // Only add new page if not enough room for Action Checklist (need ~120mm for checklist + recommendations)
  if (yPosition > pageHeight - 130) {
    doc.addPage();
    addHeader();
    yPosition = 45;
  }

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

  yPosition += 12;

  // Additional Recommendations section (for provider to write in)
  doc.setTextColor(...brandColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Additional Recommendations:', margin, yPosition);
  yPosition += 6;
  
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  for (let i = 0; i < 4; i++) {
    doc.line(margin, yPosition, margin + contentWidth, yPosition);
    yPosition += 8;
  }
  
  yPosition += 8;

  // Follow-Up Plan section (for provider to write in)
  doc.setTextColor(...brandColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Your Follow-Up Plan:', margin, yPosition);
  yPosition += 6;
  
  // Create a structured follow-up box
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, yPosition, contentWidth, 50, 2, 2, 'F');
  
  doc.setTextColor(...textColor);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  const followUpLabels = [
    { label: 'Next Appointment:', y: yPosition + 8 },
    { label: 'Repeat Labs:', y: yPosition + 20 },
    { label: 'Additional Testing:', y: yPosition + 32 },
    { label: 'Notes:', y: yPosition + 44 },
  ];
  
  followUpLabels.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, margin + 4, item.y);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin + 35, item.y, margin + contentWidth - 4, item.y);
  });
  
  yPosition += 58;

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
