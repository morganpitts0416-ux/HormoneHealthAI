import type { LabValues, FemaleLabValues, PREVENTRiskResult, PatientDemographics } from "@shared/schema";

/**
 * PREVENT Risk Calculator
 * Based on 2023 AHA PREVENT Equations
 * Predicts 10-year and 30-year risk of Total CVD, ASCVD, and Heart Failure
 * 
 * Reference: Khan SS, et al. Development and Validation of the American Heart Association's PREVENT Equations.
 * Circulation. 2024;149(6):430-449. doi:10.1161/CIRCULATIONAHA.123.067626
 * 
 * Key features:
 * - Sex-specific, race-free equations using Cox proportional hazards
 * - Age range: 30-79 years (30-year risk only valid for ages 30-59)
 * - Includes kidney function (eGFR) as a predictor
 * - Predicts heart failure in addition to ASCVD
 * 
 * Formula: Risk = 1 - S₀(t)^exp(linear_predictor)
 * Where S₀(t) is the baseline survival at time t
 */

interface ModelCoefficients {
  intercept: number;
  age: number;
  age_squared: number;
  non_hdl_c: number;
  hdl_c: number;
  sbp_below_110: number;
  sbp_above_110: number;
  diabetes: number;
  smoking: number;
  bmi_below_30: number;
  bmi_above_30: number;
  egfr_below_60: number;
  egfr_above_60: number;
  bp_tx: number;
  statin: number;
  bp_tx_x_sbp_above_110: number;
  statin_x_non_hdl_c: number;
  age_x_non_hdl_c: number;
  age_x_hdl_c: number;
  age_x_sbp_above_110: number;
  age_x_diabetes: number;
  age_x_smoking: number;
  age_x_bmi_above_30: number;
  age_x_egfr_below_60: number;
}

interface BaselineSurvival {
  s10: number;
  s30: number;
}

const FEMALE_COEFFICIENTS: Record<string, ModelCoefficients> = {
  total_cvd: {
    intercept: 0,
    age: 0.5958,
    age_squared: 0.0283,
    non_hdl_c: 0.2372,
    hdl_c: -0.1551,
    sbp_below_110: 0.1700,
    sbp_above_110: 0.2367,
    diabetes: 0.5277,
    smoking: 0.4763,
    bmi_below_30: 0.0895,
    bmi_above_30: 0.1047,
    egfr_below_60: 0.1570,
    egfr_above_60: -0.0239,
    bp_tx: 0.1393,
    statin: -0.1763,
    bp_tx_x_sbp_above_110: -0.0861,
    statin_x_non_hdl_c: -0.0827,
    age_x_non_hdl_c: -0.0596,
    age_x_hdl_c: 0.0283,
    age_x_sbp_above_110: -0.0447,
    age_x_diabetes: -0.1054,
    age_x_smoking: -0.0988,
    age_x_bmi_above_30: -0.0303,
    age_x_egfr_below_60: -0.0381
  },
  ascvd: {
    intercept: 0,
    age: 0.6139,
    age_squared: 0.0295,
    non_hdl_c: 0.2969,
    hdl_c: -0.1665,
    sbp_below_110: 0.1753,
    sbp_above_110: 0.2302,
    diabetes: 0.4666,
    smoking: 0.5319,
    bmi_below_30: 0.0518,
    bmi_above_30: 0.0510,
    egfr_below_60: 0.1277,
    egfr_above_60: -0.0191,
    bp_tx: 0.1511,
    statin: -0.1711,
    bp_tx_x_sbp_above_110: -0.0797,
    statin_x_non_hdl_c: -0.1067,
    age_x_non_hdl_c: -0.0735,
    age_x_hdl_c: 0.0296,
    age_x_sbp_above_110: -0.0420,
    age_x_diabetes: -0.0904,
    age_x_smoking: -0.1129,
    age_x_bmi_above_30: -0.0087,
    age_x_egfr_below_60: -0.0297
  },
  heart_failure: {
    intercept: 0,
    age: 0.5569,
    age_squared: 0.0261,
    non_hdl_c: 0.0977,
    hdl_c: -0.1184,
    sbp_below_110: 0.1376,
    sbp_above_110: 0.2295,
    diabetes: 0.6098,
    smoking: 0.3272,
    bmi_below_30: 0.1620,
    bmi_above_30: 0.2034,
    egfr_below_60: 0.2209,
    egfr_above_60: -0.0324,
    bp_tx: 0.1067,
    statin: -0.1726,
    bp_tx_x_sbp_above_110: -0.0949,
    statin_x_non_hdl_c: -0.0212,
    age_x_non_hdl_c: -0.0210,
    age_x_hdl_c: 0.0233,
    age_x_sbp_above_110: -0.0495,
    age_x_diabetes: -0.1260,
    age_x_smoking: -0.0663,
    age_x_bmi_above_30: -0.0681,
    age_x_egfr_below_60: -0.0567
  }
};

const MALE_COEFFICIENTS: Record<string, ModelCoefficients> = {
  total_cvd: {
    intercept: 0,
    age: 0.4989,
    age_squared: 0.0237,
    non_hdl_c: 0.2075,
    hdl_c: -0.1197,
    sbp_below_110: 0.1411,
    sbp_above_110: 0.2072,
    diabetes: 0.4448,
    smoking: 0.4492,
    bmi_below_30: 0.0620,
    bmi_above_30: 0.0788,
    egfr_below_60: 0.1449,
    egfr_above_60: -0.0219,
    bp_tx: 0.1250,
    statin: -0.1615,
    bp_tx_x_sbp_above_110: -0.0736,
    statin_x_non_hdl_c: -0.0698,
    age_x_non_hdl_c: -0.0513,
    age_x_hdl_c: 0.0193,
    age_x_sbp_above_110: -0.0389,
    age_x_diabetes: -0.0864,
    age_x_smoking: -0.0984,
    age_x_bmi_above_30: -0.0227,
    age_x_egfr_below_60: -0.0337
  },
  ascvd: {
    intercept: 0,
    age: 0.5170,
    age_squared: 0.0248,
    non_hdl_c: 0.2606,
    hdl_c: -0.1301,
    sbp_below_110: 0.1465,
    sbp_above_110: 0.2007,
    diabetes: 0.3925,
    smoking: 0.5016,
    bmi_below_30: 0.0358,
    bmi_above_30: 0.0367,
    egfr_below_60: 0.1180,
    egfr_above_60: -0.0175,
    bp_tx: 0.1354,
    statin: -0.1570,
    bp_tx_x_sbp_above_110: -0.0680,
    statin_x_non_hdl_c: -0.0892,
    age_x_non_hdl_c: -0.0633,
    age_x_hdl_c: 0.0210,
    age_x_sbp_above_110: -0.0366,
    age_x_diabetes: -0.0740,
    age_x_smoking: -0.1115,
    age_x_bmi_above_30: -0.0043,
    age_x_egfr_below_60: -0.0257
  },
  heart_failure: {
    intercept: 0,
    age: 0.4604,
    age_squared: 0.0217,
    non_hdl_c: 0.0832,
    hdl_c: -0.0871,
    sbp_below_110: 0.1137,
    sbp_above_110: 0.2007,
    diabetes: 0.5177,
    smoking: 0.3140,
    bmi_below_30: 0.1167,
    bmi_above_30: 0.1650,
    egfr_below_60: 0.2055,
    egfr_above_60: -0.0299,
    bp_tx: 0.0973,
    statin: -0.1583,
    bp_tx_x_sbp_above_110: -0.0819,
    statin_x_non_hdl_c: -0.0173,
    age_x_non_hdl_c: -0.0163,
    age_x_hdl_c: 0.0139,
    age_x_sbp_above_110: -0.0424,
    age_x_diabetes: -0.1036,
    age_x_smoking: -0.0612,
    age_x_bmi_above_30: -0.0548,
    age_x_egfr_below_60: -0.0510
  }
};

const BASELINE_SURVIVAL: Record<string, Record<string, BaselineSurvival>> = {
  female: {
    total_cvd: { s10: 0.9655, s30: 0.8236 },
    ascvd: { s10: 0.9764, s30: 0.8741 },
    heart_failure: { s10: 0.9808, s30: 0.8962 }
  },
  male: {
    total_cvd: { s10: 0.9408, s30: 0.7233 },
    ascvd: { s10: 0.9555, s30: 0.7877 },
    heart_failure: { s10: 0.9661, s30: 0.8466 }
  }
};

export class PREVENTCalculator {
  private static convertCholToMmol(mgdl: number): number {
    return mgdl * 0.02586;
  }

  private static calculateLinearPredictor(
    coef: ModelCoefficients,
    age: number,
    nonHdlCMmol: number,
    hdlCMmol: number,
    sbp: number,
    bmi: number,
    egfr: number,
    diabetes: boolean,
    smoking: boolean,
    bpTx: boolean,
    statin: boolean
  ): number {
    const ageTerm = (age - 55) / 10;
    const ageSquared = ageTerm * ageTerm;
    
    const nonHdlC = nonHdlCMmol - 3.5;
    const hdlC = (hdlCMmol - 1.3) / 0.3;
    
    const sbpBelow110 = (Math.min(sbp, 110) - 110) / 20;
    const sbpAbove110 = (Math.max(sbp, 110) - 130) / 20;
    
    const bmiBelow30 = (Math.min(bmi, 30) - 25) / 5;
    const bmiAbove30 = (Math.max(bmi, 30) - 30) / 5;
    
    const egfrBelow60 = (Math.min(egfr, 60) - 60) / -15;
    const egfrAbove60 = (Math.max(egfr, 60) - 90) / -15;
    
    const dm = diabetes ? 1 : 0;
    const smk = smoking ? 1 : 0;
    const bp = bpTx ? 1 : 0;
    const stat = statin ? 1 : 0;
    
    let lp = coef.intercept;
    lp += coef.age * ageTerm;
    lp += coef.age_squared * ageSquared;
    lp += coef.non_hdl_c * nonHdlC;
    lp += coef.hdl_c * hdlC;
    lp += coef.sbp_below_110 * sbpBelow110;
    lp += coef.sbp_above_110 * sbpAbove110;
    lp += coef.diabetes * dm;
    lp += coef.smoking * smk;
    lp += coef.bmi_below_30 * bmiBelow30;
    lp += coef.bmi_above_30 * bmiAbove30;
    lp += coef.egfr_below_60 * egfrBelow60;
    lp += coef.egfr_above_60 * egfrAbove60;
    lp += coef.bp_tx * bp;
    lp += coef.statin * stat;
    
    lp += coef.bp_tx_x_sbp_above_110 * bp * sbpAbove110;
    lp += coef.statin_x_non_hdl_c * stat * nonHdlC;
    lp += coef.age_x_non_hdl_c * ageTerm * nonHdlC;
    lp += coef.age_x_hdl_c * ageTerm * hdlC;
    lp += coef.age_x_sbp_above_110 * ageTerm * sbpAbove110;
    lp += coef.age_x_diabetes * ageTerm * dm;
    lp += coef.age_x_smoking * ageTerm * smk;
    lp += coef.age_x_bmi_above_30 * ageTerm * bmiAbove30;
    lp += coef.age_x_egfr_below_60 * ageTerm * egfrBelow60;
    
    return lp;
  }

  private static calculateRiskFromSurvival(s0: number, linearPredictor: number): number {
    const survival = Math.pow(s0, Math.exp(linearPredictor));
    const risk = 1 - survival;
    return Math.max(0, Math.min(1, risk));
  }

  private static getRiskCategory(risk: number): 'low' | 'borderline' | 'intermediate' | 'high' {
    const riskPercent = risk * 100;
    if (riskPercent < 5) return 'low';
    if (riskPercent < 7.5) return 'borderline';
    if (riskPercent < 20) return 'intermediate';
    return 'high';
  }

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

  private static generateRecommendations(
    tenYearCVD: number,
    ldl: number | undefined,
    diabetic: boolean,
    age: number
  ): string {
    const recommendations: string[] = [];
    const riskPercent = tenYearCVD * 100;

    recommendations.push('Heart-healthy lifestyle: Mediterranean diet, regular exercise (150 min/week), maintain healthy weight, smoking cessation');

    if (riskPercent >= 20) {
      recommendations.push('HIGH RISK (>=20%): High-intensity statin therapy strongly recommended');
      recommendations.push('Consider additional LDL-lowering therapy if LDL >=70 mg/dL despite statin');
      recommendations.push('Optimize blood pressure control (<130/80 mmHg)');
      recommendations.push('Consider SGLT2 inhibitor or GLP-1 agonist if diabetic or high heart failure risk');
    } else if (riskPercent >= 7.5) {
      recommendations.push('INTERMEDIATE RISK (7.5-19.9%): Moderate-to-high intensity statin therapy recommended');
      recommendations.push('Consider risk-enhancing factors: family history, metabolic syndrome, chronic inflammation, CKD');
      if (ldl !== undefined && ldl >= 160) {
        recommendations.push('LDL >=160 mg/dL supports statin initiation');
      }
    } else if (riskPercent >= 5) {
      recommendations.push('BORDERLINE RISK (5-7.4%): Consider statin if risk-enhancing factors present');
      recommendations.push('May consider coronary artery calcium (CAC) scoring if decision uncertain');
    } else {
      recommendations.push('LOW RISK (<5%): Continue lifestyle modifications. Statin generally not indicated unless LDL >=190 mg/dL');
    }

    if (diabetic && age >= 40 && age <= 75) {
      recommendations.push('Diabetes management: Optimize A1c, consider cardioprotective agents (SGLT2i, GLP-1 RA)');
    }

    return recommendations.map(r => `• ${r}`).join('\n');
  }

  private static getStatinRecommendation(
    tenYearCVD: number,
    ldl: number | undefined,
    diabetic: boolean,
    age: number
  ): string {
    const riskPercent = tenYearCVD * 100;

    if (ldl !== undefined && ldl >= 190) {
      return 'HIGH-INTENSITY statin (Atorvastatin 40-80 mg or Rosuvastatin 20-40 mg) - LDL >=190 mg/dL';
    }

    if (riskPercent >= 20) {
      return 'HIGH-INTENSITY statin (>=50% LDL reduction). Consider adding ezetimibe if needed.';
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

  private static getLDLGoal(riskPercent: number, ldl: number, diabetic: boolean): string {
    if (ldl >= 190) {
      return 'Goal: >=50% LDL reduction (target <100 mg/dL)';
    }
    if (riskPercent >= 20) {
      return 'Goal: >=50% LDL reduction (consider <70 mg/dL for very high risk)';
    }
    if (riskPercent >= 7.5) {
      return 'Goal: 30-50% LDL reduction';
    }
    return 'No specific LDL target; focus on risk-based statin intensity';
  }

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

    const canCalculate30Year = age! >= 30 && age! <= 59;

    const totalCMmol = this.convertCholToMmol(totalCholesterol);
    const hdlMmol = this.convertCholToMmol(hdl);
    const nonHdlCMmol = totalCMmol - hdlMmol;

    const coefficients = sex === 'female' ? FEMALE_COEFFICIENTS : MALE_COEFFICIENTS;
    const baselines = BASELINE_SURVIVAL[sex!];

    const lpCVD = this.calculateLinearPredictor(
      coefficients.total_cvd, age!, nonHdlCMmol, hdlMmol, systolicBP!, bmi!,
      egfr, diabetic!, smoker!, onBPMeds!, onStatins!
    );
    const lpASCVD = this.calculateLinearPredictor(
      coefficients.ascvd, age!, nonHdlCMmol, hdlMmol, systolicBP!, bmi!,
      egfr, diabetic!, smoker!, onBPMeds!, onStatins!
    );
    const lpHF = this.calculateLinearPredictor(
      coefficients.heart_failure, age!, nonHdlCMmol, hdlMmol, systolicBP!, bmi!,
      egfr, diabetic!, smoker!, onBPMeds!, onStatins!
    );

    const tenYearCVD = this.calculateRiskFromSurvival(baselines.total_cvd.s10, lpCVD);
    const tenYearASCVD = this.calculateRiskFromSurvival(baselines.ascvd.s10, lpASCVD);
    const tenYearHF = this.calculateRiskFromSurvival(baselines.heart_failure.s10, lpHF);

    let thirtyYearCVD: number | undefined;
    let thirtyYearASCVD: number | undefined;
    let thirtyYearHF: number | undefined;

    if (canCalculate30Year) {
      thirtyYearCVD = this.calculateRiskFromSurvival(baselines.total_cvd.s30, lpCVD);
      thirtyYearASCVD = this.calculateRiskFromSurvival(baselines.ascvd.s30, lpASCVD);
      thirtyYearHF = this.calculateRiskFromSurvival(baselines.heart_failure.s30, lpHF);
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
}
