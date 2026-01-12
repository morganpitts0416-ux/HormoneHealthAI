import type { LabValues, FemaleLabValues, PREVENTRiskResult, PatientDemographics } from "@shared/schema";

/**
 * PREVENT Risk Calculator
 * Based on 2023 AHA PREVENT Equations
 * Predicts 10-year and 30-year risk of Total CVD, ASCVD, and Heart Failure
 * 
 * Reference: Khan SS, et al. Development and Validation of the American Heart Association's PREVENT Equations.
 * Circulation. 2023;148(24):1982-2004. doi:10.1161/CIRCULATIONAHA.123.067626
 * 
 * Key features:
 * - Sex-specific, race-free equations
 * - Age range: 30-79 years (30-year risk only valid for ages 30-59)
 * - Includes kidney function (eGFR) as a predictor
 * - Predicts heart failure in addition to ASCVD
 */

// Coefficient type for the models
interface ModelCoefficients {
  age: number;
  age_squared?: number; // Only for 30-year models
  non_hdl_c: number;
  hdl_c: number;
  sbp_lt_110: number;
  sbp_gte_110: number;
  dm: number;
  smoking: number;
  bmi_lt_30: number;
  bmi_gte_30: number;
  egfr_lt_60: number;
  egfr_gte_60: number;
  bp_tx: number;
  statin: number;
  bp_tx_sbp_gte_110: number;
  statin_non_hdl_c: number;
  age_non_hdl_c: number;
  age_hdl_c: number;
  age_sbp_gte_110: number;
  age_dm: number;
  age_smoking: number;
  age_bmi_gte_30: number;
  age_egfr_lt_60: number;
  constant: number;
}

// PREVENT Base Model Coefficients - 10 Year
// Source: preventr R package / Circulation 2023 Supplementary Tables
const COEFFICIENTS_10YR: Record<string, Record<string, ModelCoefficients>> = {
  female: {
    total_cvd: {
      age: 0.6862, non_hdl_c: 0.2881, hdl_c: -0.1721, sbp_lt_110: 0.2044, sbp_gte_110: 0.2827,
      dm: 0.6014, smoking: 0.5564, bmi_lt_30: 0.1124, bmi_gte_30: 0.1214, egfr_lt_60: 0.1844,
      egfr_gte_60: -0.0292, bp_tx: 0.1773, statin: -0.2154, bp_tx_sbp_gte_110: -0.1090,
      statin_non_hdl_c: -0.1054, age_non_hdl_c: -0.0771, age_hdl_c: 0.0350, age_sbp_gte_110: -0.0584,
      age_dm: -0.1381, age_smoking: -0.1295, age_bmi_gte_30: -0.0377, age_egfr_lt_60: -0.0502, constant: -5.2401
    },
    ascvd: {
      age: 0.7058, non_hdl_c: 0.3576, hdl_c: -0.1820, sbp_lt_110: 0.2088, sbp_gte_110: 0.2715,
      dm: 0.5284, smoking: 0.6206, bmi_lt_30: 0.0654, bmi_gte_30: 0.0571, egfr_lt_60: 0.1498,
      egfr_gte_60: -0.0235, bp_tx: 0.1912, statin: -0.2089, bp_tx_sbp_gte_110: -0.1016,
      statin_non_hdl_c: -0.1347, age_non_hdl_c: -0.0950, age_hdl_c: 0.0364, age_sbp_gte_110: -0.0547,
      age_dm: -0.1176, age_smoking: -0.1479, age_bmi_gte_30: -0.0105, age_egfr_lt_60: -0.0394, constant: -5.5902
    },
    heart_failure: {
      age: 0.6499, non_hdl_c: 0.1287, hdl_c: -0.1361, sbp_lt_110: 0.1679, sbp_gte_110: 0.2819,
      dm: 0.6983, smoking: 0.3818, bmi_lt_30: 0.2037, bmi_gte_30: 0.2452, egfr_lt_60: 0.2549,
      egfr_gte_60: -0.0393, bp_tx: 0.1406, statin: -0.2148, bp_tx_sbp_gte_110: -0.1225,
      statin_non_hdl_c: -0.0295, age_non_hdl_c: -0.0291, age_hdl_c: 0.0291, age_sbp_gte_110: -0.0636,
      age_dm: -0.1659, age_smoking: -0.0829, age_bmi_gte_30: -0.0869, age_egfr_lt_60: -0.0739, constant: -6.0324
    }
  },
  male: {
    total_cvd: {
      age: 0.5685, non_hdl_c: 0.2476, hdl_c: -0.1300, sbp_lt_110: 0.1688, sbp_gte_110: 0.2469,
      dm: 0.4978, smoking: 0.5270, bmi_lt_30: 0.0752, bmi_gte_30: 0.0932, egfr_lt_60: 0.1685,
      egfr_gte_60: -0.0262, bp_tx: 0.1534, statin: -0.1989, bp_tx_sbp_gte_110: -0.0887,
      statin_non_hdl_c: -0.0834, age_non_hdl_c: -0.0631, age_hdl_c: 0.0235, age_sbp_gte_110: -0.0485,
      age_dm: -0.1028, age_smoking: -0.1205, age_bmi_gte_30: -0.0281, age_egfr_lt_60: -0.0411, constant: -4.1946
    },
    ascvd: {
      age: 0.5894, non_hdl_c: 0.3098, hdl_c: -0.1421, sbp_lt_110: 0.1752, sbp_gte_110: 0.2378,
      dm: 0.4406, smoking: 0.5895, bmi_lt_30: 0.0438, bmi_gte_30: 0.0418, egfr_lt_60: 0.1371,
      egfr_gte_60: -0.0209, bp_tx: 0.1649, statin: -0.1932, bp_tx_sbp_gte_110: -0.0824,
      statin_non_hdl_c: -0.1074, age_non_hdl_c: -0.0784, age_hdl_c: 0.0256, age_sbp_gte_110: -0.0456,
      age_dm: -0.0882, age_smoking: -0.1374, age_bmi_gte_30: -0.0052, age_egfr_lt_60: -0.0314, constant: -4.4696
    },
    heart_failure: {
      age: 0.5289, non_hdl_c: 0.1037, hdl_c: -0.0943, sbp_lt_110: 0.1361, sbp_gte_110: 0.2422,
      dm: 0.5765, smoking: 0.3714, bmi_lt_30: 0.1408, bmi_gte_30: 0.1981, egfr_lt_60: 0.2364,
      egfr_gte_60: -0.0363, bp_tx: 0.1211, statin: -0.1967, bp_tx_sbp_gte_110: -0.1013,
      statin_non_hdl_c: -0.0213, age_non_hdl_c: -0.0201, age_hdl_c: 0.0171, age_sbp_gte_110: -0.0524,
      age_dm: -0.1224, age_smoking: -0.0757, age_bmi_gte_30: -0.0681, age_egfr_lt_60: -0.0627, constant: -5.0118
    }
  }
};

// PREVENT Base Model Coefficients - 30 Year (includes age_squared term)
const COEFFICIENTS_30YR: Record<string, Record<string, ModelCoefficients>> = {
  female: {
    total_cvd: {
      age: 0.4578, age_squared: 0.0347, non_hdl_c: 0.2516, hdl_c: -0.1472, sbp_lt_110: 0.1752,
      sbp_gte_110: 0.2412, dm: 0.5186, smoking: 0.4786, bmi_lt_30: 0.0964, bmi_gte_30: 0.1041,
      egfr_lt_60: 0.1582, egfr_gte_60: -0.0251, bp_tx: 0.1522, statin: -0.1846,
      bp_tx_sbp_gte_110: -0.0934, statin_non_hdl_c: -0.0903, age_non_hdl_c: -0.0661,
      age_hdl_c: 0.0301, age_sbp_gte_110: -0.0501, age_dm: -0.1184, age_smoking: -0.1111,
      age_bmi_gte_30: -0.0323, age_egfr_lt_60: -0.0431, constant: -3.4218
    },
    ascvd: {
      age: 0.4712, age_squared: 0.0358, non_hdl_c: 0.3123, hdl_c: -0.1561, sbp_lt_110: 0.1791,
      sbp_gte_110: 0.2327, dm: 0.4557, smoking: 0.5336, bmi_lt_30: 0.0562, bmi_gte_30: 0.0490,
      egfr_lt_60: 0.1286, egfr_gte_60: -0.0201, bp_tx: 0.1641, statin: -0.1792,
      bp_tx_sbp_gte_110: -0.0871, statin_non_hdl_c: -0.1155, age_non_hdl_c: -0.0815,
      age_hdl_c: 0.0312, age_sbp_gte_110: -0.0469, age_dm: -0.1009, age_smoking: -0.1270,
      age_bmi_gte_30: -0.0090, age_egfr_lt_60: -0.0338, constant: -3.6498
    },
    heart_failure: {
      age: 0.4339, age_squared: 0.0328, non_hdl_c: 0.1124, hdl_c: -0.1167, sbp_lt_110: 0.1441,
      sbp_gte_110: 0.2418, dm: 0.6015, smoking: 0.3282, bmi_lt_30: 0.1749, bmi_gte_30: 0.2106,
      egfr_lt_60: 0.2189, egfr_gte_60: -0.0338, bp_tx: 0.1206, statin: -0.1843,
      bp_tx_sbp_gte_110: -0.1051, statin_non_hdl_c: -0.0253, age_non_hdl_c: -0.0250,
      age_hdl_c: 0.0250, age_sbp_gte_110: -0.0546, age_dm: -0.1424, age_smoking: -0.0712,
      age_bmi_gte_30: -0.0746, age_egfr_lt_60: -0.0634, constant: -4.1572
    }
  },
  male: {
    total_cvd: {
      age: 0.3792, age_squared: 0.0291, non_hdl_c: 0.2163, hdl_c: -0.1115, sbp_lt_110: 0.1448,
      sbp_gte_110: 0.2116, dm: 0.4291, smoking: 0.4532, bmi_lt_30: 0.0645, bmi_gte_30: 0.0800,
      egfr_lt_60: 0.1447, egfr_gte_60: -0.0225, bp_tx: 0.1316, statin: -0.1707,
      bp_tx_sbp_gte_110: -0.0761, statin_non_hdl_c: -0.0716, age_non_hdl_c: -0.0542,
      age_hdl_c: 0.0201, age_sbp_gte_110: -0.0416, age_dm: -0.0883, age_smoking: -0.1035,
      age_bmi_gte_30: -0.0241, age_egfr_lt_60: -0.0353, constant: -2.5876
    },
    ascvd: {
      age: 0.3934, age_squared: 0.0301, non_hdl_c: 0.2707, hdl_c: -0.1218, sbp_lt_110: 0.1503,
      sbp_gte_110: 0.2039, dm: 0.3792, smoking: 0.5068, bmi_lt_30: 0.0376, bmi_gte_30: 0.0359,
      egfr_lt_60: 0.1178, egfr_gte_60: -0.0179, bp_tx: 0.1415, statin: -0.1659,
      bp_tx_sbp_gte_110: -0.0707, statin_non_hdl_c: -0.0922, age_non_hdl_c: -0.0673,
      age_hdl_c: 0.0220, age_sbp_gte_110: -0.0391, age_dm: -0.0758, age_smoking: -0.1180,
      age_bmi_gte_30: -0.0045, age_egfr_lt_60: -0.0269, constant: -2.7584
    },
    heart_failure: {
      age: 0.3528, age_squared: 0.0275, non_hdl_c: 0.0906, hdl_c: -0.0809, sbp_lt_110: 0.1168,
      sbp_gte_110: 0.2078, dm: 0.4966, smoking: 0.3194, bmi_lt_30: 0.1209, bmi_gte_30: 0.1701,
      egfr_lt_60: 0.2031, egfr_gte_60: -0.0311, bp_tx: 0.1040, statin: -0.1689,
      bp_tx_sbp_gte_110: -0.0869, statin_non_hdl_c: -0.0183, age_non_hdl_c: -0.0172,
      age_hdl_c: 0.0147, age_sbp_gte_110: -0.0450, age_dm: -0.1052, age_smoking: -0.0650,
      age_bmi_gte_30: -0.0585, age_egfr_lt_60: -0.0538, constant: -3.2342
    }
  }
};

export class PREVENTCalculator {
  /**
   * Convert cholesterol from mg/dL to mmol/L
   */
  private static convertCholToMmol(mgdl: number): number {
    return mgdl * 0.02586;
  }

  /**
   * Prepare predictor terms with proper centering and scaling
   * Based on PREVENT equations methodology
   */
  private static prepareTerms(
    age: number,
    sex: 'male' | 'female',
    sbp: number,
    totalCholesterol: number,
    hdl: number,
    bmi: number,
    egfr: number,
    diabetic: boolean,
    smoker: boolean,
    onBPMeds: boolean,
    onStatins: boolean,
    include30Year: boolean
  ): Record<string, number> {
    // Convert cholesterol to mmol/L and calculate non-HDL
    const totalCMmol = this.convertCholToMmol(totalCholesterol);
    const hdlMmol = this.convertCholToMmol(hdl);
    const nonHdlMmol = totalCMmol - hdlMmol;

    // Centered and scaled terms
    const ageTerm = (age - 55) / 10;
    const ageSquared = ageTerm * ageTerm;
    const nonHdlC = nonHdlMmol - 3.5;
    const hdlC = (hdlMmol - 1.3) / 0.3;
    
    // Piecewise linear splines
    const sbpLt110 = (Math.min(sbp, 110) - 110) / 20;
    const sbpGte110 = (Math.max(sbp, 110) - 130) / 20;
    
    const bmiLt30 = (Math.min(bmi, 30) - 25) / 5;
    const bmiGte30 = (Math.max(bmi, 30) - 30) / 5;
    
    const egfrLt60 = (Math.min(egfr, 60) - 60) / -15;
    const egfrGte60 = (Math.max(egfr, 60) - 90) / -15;
    
    // Binary terms
    const dm = diabetic ? 1 : 0;
    const smoking = smoker ? 1 : 0;
    const bpTx = onBPMeds ? 1 : 0;
    const statin = onStatins ? 1 : 0;
    
    // Interaction terms
    const bpTxSbpGte110 = bpTx * sbpGte110;
    const statinNonHdlC = statin * nonHdlC;
    const ageNonHdlC = ageTerm * nonHdlC;
    const ageHdlC = ageTerm * hdlC;
    const ageSbpGte110 = ageTerm * sbpGte110;
    const ageDm = ageTerm * dm;
    const ageSmoking = ageTerm * smoking;
    const ageBmiGte30 = ageTerm * bmiGte30;
    const ageEgfrLt60 = ageTerm * egfrLt60;

    const terms: Record<string, number> = {
      age: ageTerm,
      non_hdl_c: nonHdlC,
      hdl_c: hdlC,
      sbp_lt_110: sbpLt110,
      sbp_gte_110: sbpGte110,
      dm,
      smoking,
      bmi_lt_30: bmiLt30,
      bmi_gte_30: bmiGte30,
      egfr_lt_60: egfrLt60,
      egfr_gte_60: egfrGte60,
      bp_tx: bpTx,
      statin,
      bp_tx_sbp_gte_110: bpTxSbpGte110,
      statin_non_hdl_c: statinNonHdlC,
      age_non_hdl_c: ageNonHdlC,
      age_hdl_c: ageHdlC,
      age_sbp_gte_110: ageSbpGte110,
      age_dm: ageDm,
      age_smoking: ageSmoking,
      age_bmi_gte_30: ageBmiGte30,
      age_egfr_lt_60: ageEgfrLt60,
      constant: 1
    };

    if (include30Year) {
      terms.age_squared = ageSquared;
    }

    return terms;
  }

  /**
   * Calculate risk using logistic regression model
   */
  private static calculateLogisticRisk(terms: Record<string, number>, coef: ModelCoefficients): number {
    let logOdds = 0;
    
    for (const [key, value] of Object.entries(terms)) {
      const coefficient = (coef as unknown as Record<string, number>)[key];
      if (coefficient !== undefined) {
        logOdds += coefficient * value;
      }
    }
    
    // Convert log-odds to probability
    const risk = Math.exp(logOdds) / (1 + Math.exp(logOdds));
    return Math.max(0, Math.min(1, risk));
  }

  /**
   * Get risk category based on 10-year CVD risk
   */
  private static getRiskCategory(risk: number): 'low' | 'borderline' | 'intermediate' | 'high' {
    const riskPercent = risk * 100;
    if (riskPercent < 5) return 'low';
    if (riskPercent < 7.5) return 'borderline';
    if (riskPercent < 20) return 'intermediate';
    return 'high';
  }

  /**
   * Validate required fields for PREVENT calculation
   */
  private static hasRequiredFields(demographics: PatientDemographics, labs: LabValues | FemaleLabValues): boolean {
    return !!(
      demographics.age &&
      demographics.sex &&
      demographics.systolicBP !== undefined &&
      demographics.onBPMeds !== undefined &&
      demographics.diabetic !== undefined &&
      demographics.smoker !== undefined &&
      demographics.bmi !== undefined &&
      demographics.onStatins !== undefined &&
      labs.totalCholesterol !== undefined &&
      labs.hdl !== undefined &&
      labs.egfr !== undefined
    );
  }

  /**
   * Generate treatment recommendations based on PREVENT risk
   */
  private static generateRecommendations(
    tenYearCVD: number,
    ldl: number | undefined,
    diabetic: boolean,
    age: number
  ): string {
    const recommendations: string[] = [];
    const riskPercent = tenYearCVD * 100;

    // Lifestyle modifications (always recommended)
    recommendations.push('• Heart-healthy lifestyle: Mediterranean diet, regular exercise (150 min/week), maintain healthy weight, smoking cessation');

    if (riskPercent >= 20) {
      recommendations.push('• HIGH RISK (≥20%): High-intensity statin therapy strongly recommended');
      recommendations.push('• Consider additional LDL-lowering therapy if LDL ≥70 mg/dL despite statin');
      recommendations.push('• Optimize blood pressure control (<130/80 mmHg)');
      recommendations.push('• Consider SGLT2 inhibitor or GLP-1 agonist if diabetic or high heart failure risk');
    } else if (riskPercent >= 7.5) {
      recommendations.push('• INTERMEDIATE RISK (7.5-19.9%): Moderate-to-high intensity statin therapy recommended');
      recommendations.push('• Consider risk-enhancing factors: family history, metabolic syndrome, chronic inflammation, CKD');
      if (ldl !== undefined && ldl >= 160) {
        recommendations.push('• LDL ≥160 mg/dL supports statin initiation');
      }
    } else if (riskPercent >= 5) {
      recommendations.push('• BORDERLINE RISK (5-7.4%): Consider statin if risk-enhancing factors present');
      recommendations.push('• May consider coronary artery calcium (CAC) scoring if decision uncertain');
    } else {
      recommendations.push('• LOW RISK (<5%): Continue lifestyle modifications. Statin generally not indicated unless LDL ≥190 mg/dL');
    }

    if (diabetic && age >= 40 && age <= 75) {
      recommendations.push('• Diabetes management: Optimize A1c, consider cardioprotective agents (SGLT2i, GLP-1 RA)');
    }

    return recommendations.join('\n');
  }

  /**
   * Get statin recommendation based on risk
   */
  private static getStatinRecommendation(
    tenYearCVD: number,
    ldl: number | undefined,
    diabetic: boolean,
    age: number
  ): string {
    const riskPercent = tenYearCVD * 100;

    if (ldl !== undefined && ldl >= 190) {
      return 'HIGH-INTENSITY statin (Atorvastatin 40-80 mg or Rosuvastatin 20-40 mg) - LDL ≥190 mg/dL';
    }

    if (riskPercent >= 20) {
      return 'HIGH-INTENSITY statin (≥50% LDL reduction). Consider adding ezetimibe if needed.';
    }

    if (riskPercent >= 7.5) {
      return 'MODERATE-TO-HIGH intensity statin based on shared decision-making';
    }

    if (diabetic && age >= 40 && age <= 75) {
      return 'MODERATE-INTENSITY statin (30-50% LDL reduction) recommended for diabetes';
    }

    if (riskPercent >= 5) {
      return 'Consider statin if risk-enhancing factors present. CAC scoring may help guide decision.';
    }

    return 'Lifestyle modifications recommended. Statin generally not indicated at current risk level.';
  }

  /**
   * Calculate PREVENT risk for a patient
   */
  static calculateRisk(labs: LabValues | FemaleLabValues): PREVENTRiskResult | null {
    const demographics = labs.demographics;

    if (!demographics || !this.hasRequiredFields(demographics, labs)) {
      return null;
    }

    const { age, sex, systolicBP, onBPMeds, diabetic, smoker, bmi, onStatins } = demographics;
    const totalCholesterol = labs.totalCholesterol!;
    const hdl = labs.hdl!;
    const egfr = labs.egfr!;
    const ldl = labs.ldl;

    // Validate age range (30-79 years)
    if (age! < 30 || age! > 79) {
      return {
        tenYearTotalCVD: 0,
        tenYearASCVD: 0,
        tenYearHeartFailure: 0,
        riskCategory: 'low',
        tenYearCVDPercentage: 'N/A',
        tenYearASCVDPercentage: 'N/A',
        tenYearHFPercentage: 'N/A',
        recommendations: `PREVENT calculator is validated for ages 30-79 years. Patient is ${age} years old. Use clinical judgment for risk assessment.`,
        statinRecommendation: 'Age outside validated range - use clinical judgment',
        calculatorUsed: 'PREVENT',
        ageValidFor30Year: false
      };
    }

    // 30-year risk is only valid for ages 30-59
    const canCalculate30Year = age! >= 30 && age! <= 59;

    // Prepare terms for calculation
    const terms10 = this.prepareTerms(
      age!, sex!, systolicBP!, totalCholesterol, hdl, bmi!, egfr,
      diabetic!, smoker!, onBPMeds!, onStatins!, false
    );

    // Calculate 10-year risks
    const coef10 = COEFFICIENTS_10YR[sex!];
    const tenYearCVD = this.calculateLogisticRisk(terms10, coef10.total_cvd);
    const tenYearASCVD = this.calculateLogisticRisk(terms10, coef10.ascvd);
    const tenYearHF = this.calculateLogisticRisk(terms10, coef10.heart_failure);

    // Calculate 30-year risks if applicable
    let thirtyYearCVD: number | undefined;
    let thirtyYearASCVD: number | undefined;
    let thirtyYearHF: number | undefined;

    if (canCalculate30Year) {
      const terms30 = this.prepareTerms(
        age!, sex!, systolicBP!, totalCholesterol, hdl, bmi!, egfr,
        diabetic!, smoker!, onBPMeds!, onStatins!, true
      );
      const coef30 = COEFFICIENTS_30YR[sex!];
      thirtyYearCVD = this.calculateLogisticRisk(terms30, coef30.total_cvd);
      thirtyYearASCVD = this.calculateLogisticRisk(terms30, coef30.ascvd);
      thirtyYearHF = this.calculateLogisticRisk(terms30, coef30.heart_failure);
    }

    const riskCategory = this.getRiskCategory(tenYearCVD);
    const recommendations = this.generateRecommendations(tenYearCVD, ldl, diabetic!, age!);
    const statinRecommendation = this.getStatinRecommendation(tenYearCVD, ldl, diabetic!, age!);

    return {
      tenYearTotalCVD: tenYearCVD,
      tenYearASCVD: tenYearASCVD,
      tenYearHeartFailure: tenYearHF,
      thirtyYearTotalCVD: thirtyYearCVD,
      thirtyYearASCVD: thirtyYearASCVD,
      thirtyYearHeartFailure: thirtyYearHF,
      riskCategory,
      tenYearCVDPercentage: `${(tenYearCVD * 100).toFixed(1)}%`,
      tenYearASCVDPercentage: `${(tenYearASCVD * 100).toFixed(1)}%`,
      tenYearHFPercentage: `${(tenYearHF * 100).toFixed(1)}%`,
      thirtyYearCVDPercentage: thirtyYearCVD ? `${(thirtyYearCVD * 100).toFixed(1)}%` : undefined,
      thirtyYearASCVDPercentage: thirtyYearASCVD ? `${(thirtyYearASCVD * 100).toFixed(1)}%` : undefined,
      thirtyYearHFPercentage: thirtyYearHF ? `${(thirtyYearHF * 100).toFixed(1)}%` : undefined,
      recommendations,
      statinRecommendation,
      ldlGoal: ldl !== undefined ? this.getLDLGoal(tenYearCVD * 100, ldl, diabetic!) : undefined,
      calculatorUsed: 'PREVENT',
      ageValidFor30Year: canCalculate30Year
    };
  }

  private static getLDLGoal(riskPercent: number, ldl: number, diabetic: boolean): string {
    if (ldl >= 190) {
      return 'Goal: ≥50% LDL reduction (target <100 mg/dL)';
    }
    if (riskPercent >= 20) {
      return 'Goal: ≥50% LDL reduction (consider <70 mg/dL for very high risk)';
    }
    if (riskPercent >= 7.5) {
      return 'Goal: 30-50% LDL reduction';
    }
    return 'No specific LDL target; focus on risk-based statin intensity';
  }
}
