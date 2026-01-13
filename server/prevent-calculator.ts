import type { LabValues, FemaleLabValues, PREVENTRiskResult, PatientDemographics, AdjustedRiskAssessment } from "@shared/schema";

/**
 * PREVENT Risk Calculator
 * Based on 2023 AHA PREVENT Equations - OFFICIAL IMPLEMENTATION
 * 
 * Source: AHA PREVENT Stata package (aha_prevent v1.0.0)
 * Authors: Jack Xiaoning Huang, Yingying Sang, Sadiya Khan
 * Northwestern University / Johns Hopkins Bloomberg School of Public Health
 * 
 * Reference: Khan SS, et al. Development and Validation of the American Heart Association's PREVENT Equations.
 * Circulation. 2024;149(6):430-449. doi:10.1161/CIRCULATIONAHA.123.067626
 * 
 * Key features:
 * - Sex-specific, race-free equations using logistic regression
 * - Age range: 30-79 years (30-year risk only valid for ages 30-59)
 * - Includes kidney function (eGFR) as a predictor
 * - Predicts heart failure in addition to ASCVD
 * 
 * Formula: Risk = exp(linear_predictor) / (1 + exp(linear_predictor))
 */

// Official AHA PREVENT coefficients extracted from prevent_beta10_2024.dta and prevent_beta30_2024.dta
// Covariate order for CVD/ASCVD 10yr: age, nhdl, hdl, sbp_1, sbp_2, dm, smoke, egfr_1, egfr_2, bptreat, statin, bptreat*sbp_2, statin*nhdl, age*nhdl, age*hdl, age*sbp_2, age*dm, age*smoke, age*egfr_1, constant
// Covariate order for CVD/ASCVD 30yr: age, age2, nhdl, hdl, sbp_1, sbp_2, dm, smoke, egfr_1, egfr_2, bptreat, statin, bptreat*sbp_2, statin*nhdl, age*nhdl, age*hdl, age*sbp_2, age*dm, age*smoke, age*egfr_1, constant
// Covariate order for HF 10yr: age, sbp_1, sbp_2, dm, smoke, bmi_1, bmi_2, egfr_1, egfr_2, bptreat, bptreat*sbp_2, age*sbp_2, age*dm, age*smoke, age*bmi_2, age*egfr_1, constant
// Covariate order for HF 30yr: age, age2, sbp_1, sbp_2, dm, smoke, bmi_1, bmi_2, egfr_1, egfr_2, bptreat, bptreat*sbp_2, age*sbp_2, age*dm, age*smoke, age*bmi_2, age*egfr_1, constant

// FEMALE 10-YEAR COEFFICIENTS (beta11_* columns from prevent_beta10_2024.dta)
const FEMALE_10YR_CVD = [0.793933, 0.030524, -0.160686, -0.239400, 0.360078, 0.866760, 0.536074, 0.604592, 0.043377, 0.315167, -0.147765, -0.066361, 0.119788, -0.081972, 0.030677, -0.094635, -0.270570, -0.078715, -0.163781, -3.307728];
const FEMALE_10YR_ASCVD = [0.719883, 0.117697, -0.151185, -0.083536, 0.359285, 0.834858, 0.483108, 0.486462, 0.039778, 0.226531, -0.059237, -0.039576, 0.084442, -0.056784, 0.032569, -0.103598, -0.241754, -0.079114, -0.167149, -3.819975];
const FEMALE_10YR_HF = [0.899823, -0.455977, 0.357650, 1.038346, 0.583916, -0.007229, 0.299771, 0.745164, 0.055709, 0.353444, -0.098151, -0.094666, -0.358104, -0.115945, -0.003878, -0.188429, -4.310409];

// FEMALE 30-YEAR COEFFICIENTS (beta11_* columns from prevent_beta30_2024.dta)
const FEMALE_30YR_CVD = [0.550308, -0.092837, 0.040979, -0.166331, -0.162865, 0.329950, 0.679389, 0.319611, 0.185710, 0.055353, 0.289400, -0.075688, -0.056367, 0.107102, -0.075144, 0.030179, -0.099878, -0.320617, -0.160786, -0.145079, -1.318827];
const FEMALE_30YR_ASCVD = [0.466920, -0.089312, 0.125690, -0.154225, -0.001809, 0.322949, 0.629671, 0.268292, 0.100106, 0.049966, 0.187529, 0.015248, -0.027612, 0.073615, -0.052196, 0.031692, -0.104610, -0.272779, -0.153091, -0.129915, -1.974074];
const FEMALE_30YR_HF = [0.625437, -0.098304, -0.391924, 0.314229, 0.833079, 0.343865, 0.059487, 0.252554, 0.298164, 0.066716, 0.333921, -0.089318, -0.097430, -0.404855, -0.198299, -0.003562, -0.156421, -2.205379];

// MALE 10-YEAR COEFFICIENTS (beta10_* columns from prevent_beta10_2024.dta)
const MALE_10YR_CVD = [0.768853, 0.073617, -0.095443, -0.434735, 0.336266, 0.769286, 0.438687, 0.537898, 0.016483, 0.288879, -0.133735, -0.047592, 0.150273, -0.051787, 0.019117, -0.104948, -0.225195, -0.089507, -0.154370, -3.031168];
const MALE_10YR_ASCVD = [0.709985, 0.165866, -0.114429, -0.283721, 0.323998, 0.718960, 0.395697, 0.369007, 0.020362, 0.203652, -0.086558, -0.032292, 0.114563, -0.030000, 0.023275, -0.092702, -0.201852, -0.097053, -0.121708, -3.500655];
const MALE_10YR_HF = [0.897264, -0.681147, 0.363446, 0.923776, 0.502374, -0.048584, 0.372693, 0.692692, 0.025183, 0.298092, -0.049773, -0.128920, -0.304092, -0.140169, 0.006813, -0.179778, -3.946391];

// MALE 30-YEAR COEFFICIENTS (beta10_* columns from prevent_beta30_2024.dta)
const MALE_30YR_CVD = [0.462731, -0.098428, 0.083609, -0.102982, -0.214035, 0.290432, 0.533128, 0.214191, 0.115556, 0.060378, 0.232714, -0.027211, -0.038449, 0.134192, -0.051176, 0.016587, -0.110144, -0.258594, -0.156641, -0.116678, -1.148204];
const MALE_30YR_ASCVD = [0.399410, -0.093748, 0.174464, -0.120203, -0.066512, 0.275304, 0.479026, 0.178263, -0.021879, 0.060255, 0.142118, 0.013600, -0.021826, 0.101315, -0.031262, 0.020673, -0.092093, -0.215995, -0.154881, -0.071255, -1.736444];
const MALE_30YR_HF = [0.568154, -0.104839, -0.476156, 0.303240, 0.684034, 0.265627, 0.083311, 0.269990, 0.254180, 0.063892, 0.258363, -0.039194, -0.126912, -0.327357, -0.204302, -0.018283, -0.134262, -1.957510];

export class PREVENTCalculator {
  
  /**
   * Prepare variable transformations according to official AHA PREVENT Stata code
   */
  private static prepareTransformations(
    age: number,
    totalCholesterol: number,
    hdl: number,
    systolicBP: number,
    bmi: number,
    egfr: number,
    diabetic: boolean,
    smoker: boolean,
    bpTreat: boolean,
    statin: boolean
  ): {
    age: number;
    age2: number;
    nhdl: number;
    hdlTrans: number;
    sbp1: number;
    sbp2: number;
    dm: number;
    smoke: number;
    bmi1: number;
    bmi2: number;
    egfr1: number;
    egfr2: number;
    bptreat: number;
    statinFlag: number;
  } {
    // Age transformation: (age - 55) / 10
    const ageTrans = (age - 55) / 10;
    const age2 = ageTrans * ageTrans;
    
    // Non-HDL cholesterol in mmol/L, centered at 3.5
    // TC and HDL are in mg/dL, convert to mmol/L: mg/dL * 0.02586
    const tcMmol = totalCholesterol * 0.02586;
    const hdlMmol = hdl * 0.02586;
    const nhdl = tcMmol - hdlMmol - 3.5;
    
    // HDL transformation: (hdl_mmol - 1.3) / 0.3
    const hdlTrans = (hdlMmol - 1.3) / 0.3;
    
    // SBP transformation with spline at 110
    // prevent_sbp = (sbp - 110) / 20
    // mkspline creates sbp_1 (<=0) and sbp_2 (>0)
    // sbp_2 is then adjusted: sbp_2 = sbp_2 - 1
    const sbpTrans = (systolicBP - 110) / 20;
    const sbp1 = Math.min(sbpTrans, 0);  // <=0 part
    const sbp2Raw = Math.max(sbpTrans, 0);  // >0 part
    const sbp2 = sbp2Raw - 1;  // subtract 1 as per Stata code
    
    // BMI transformation: (bmi - 25) / 5, then spline at 1
    const bmiTrans = (bmi - 25) / 5;
    const bmi1 = Math.min(bmiTrans, 1);  // <=1 part
    const bmi2 = Math.max(bmiTrans - 1, 0);  // >1 part
    
    // eGFR transformation with spline at 60
    // egfr_1 = -egfr/15 + 4 for values <=60
    // egfr_2 = -(egfr-60)/15 + 2 for values >60
    // Note: This creates a descending scale where higher eGFR = lower risk
    let egfr1: number, egfr2: number;
    if (egfr <= 60) {
      egfr1 = -egfr / 15 + 4;
      egfr2 = 0;  // No contribution from >60 segment
    } else {
      egfr1 = -60 / 15 + 4;  // Fixed value at knot (=0)
      egfr2 = -(egfr - 60) / 15;  // Stata code: egfr_2 = -egfr_2/15 + 2, but after spline adjustment
    }
    // Actually re-reading the Stata code more carefully:
    // mkspline `prevent_egfr_1' 60 `prevent_egfr_2'=`egfr'
    // qui replace `prevent_egfr_1'=-`prevent_egfr_1'/15+4
    // qui replace `prevent_egfr_2'=-`prevent_egfr_2'/15+2
    // This means:
    // - mkspline creates: egfr_1 = min(egfr, 60), egfr_2 = max(egfr - 60, 0)
    // - Then: egfr_1 = -egfr_1/15 + 4 and egfr_2 = -egfr_2/15 + 2
    const egfrSpline1 = Math.min(egfr, 60);
    const egfrSpline2 = Math.max(egfr - 60, 0);
    egfr1 = -egfrSpline1 / 15 + 4;
    egfr2 = -egfrSpline2 / 15 + 2;
    
    return {
      age: ageTrans,
      age2,
      nhdl,
      hdlTrans,
      sbp1,
      sbp2,
      dm: diabetic ? 1 : 0,
      smoke: smoker ? 1 : 0,
      bmi1,
      bmi2,
      egfr1,
      egfr2,
      bptreat: bpTreat ? 1 : 0,
      statinFlag: statin ? 1 : 0
    };
  }

  /**
   * Calculate 10-year CVD/ASCVD risk using official AHA coefficients
   */
  private static calculate10YearCVD_ASCVD(
    coef: number[],
    trans: ReturnType<typeof PREVENTCalculator.prepareTransformations>
  ): number {
    // Covariate order: age, nhdl, hdl, sbp_1, sbp_2, dm, smoke, egfr_1, egfr_2, bptreat, statin, 
    //                  bptreat*sbp_2, statin*nhdl, age*nhdl, age*hdl, age*sbp_2, age*dm, age*smoke, age*egfr_1, constant
    const xb = 
      coef[0] * trans.age +
      coef[1] * trans.nhdl +
      coef[2] * trans.hdlTrans +
      coef[3] * trans.sbp1 +
      coef[4] * trans.sbp2 +
      coef[5] * trans.dm +
      coef[6] * trans.smoke +
      coef[7] * trans.egfr1 +
      coef[8] * trans.egfr2 +
      coef[9] * trans.bptreat +
      coef[10] * trans.statinFlag +
      coef[11] * (trans.bptreat * trans.sbp2) +
      coef[12] * (trans.statinFlag * trans.nhdl) +
      coef[13] * (trans.age * trans.nhdl) +
      coef[14] * (trans.age * trans.hdlTrans) +
      coef[15] * (trans.age * trans.sbp2) +
      coef[16] * (trans.age * trans.dm) +
      coef[17] * (trans.age * trans.smoke) +
      coef[18] * (trans.age * trans.egfr1) +
      coef[19];  // constant
    
    return Math.exp(xb) / (1 + Math.exp(xb));
  }

  /**
   * Calculate 30-year CVD/ASCVD risk using official AHA coefficients
   */
  private static calculate30YearCVD_ASCVD(
    coef: number[],
    trans: ReturnType<typeof PREVENTCalculator.prepareTransformations>
  ): number {
    // Covariate order: age, age2, nhdl, hdl, sbp_1, sbp_2, dm, smoke, egfr_1, egfr_2, bptreat, statin,
    //                  bptreat*sbp_2, statin*nhdl, age*nhdl, age*hdl, age*sbp_2, age*dm, age*smoke, age*egfr_1, constant
    const xb = 
      coef[0] * trans.age +
      coef[1] * trans.age2 +
      coef[2] * trans.nhdl +
      coef[3] * trans.hdlTrans +
      coef[4] * trans.sbp1 +
      coef[5] * trans.sbp2 +
      coef[6] * trans.dm +
      coef[7] * trans.smoke +
      coef[8] * trans.egfr1 +
      coef[9] * trans.egfr2 +
      coef[10] * trans.bptreat +
      coef[11] * trans.statinFlag +
      coef[12] * (trans.bptreat * trans.sbp2) +
      coef[13] * (trans.statinFlag * trans.nhdl) +
      coef[14] * (trans.age * trans.nhdl) +
      coef[15] * (trans.age * trans.hdlTrans) +
      coef[16] * (trans.age * trans.sbp2) +
      coef[17] * (trans.age * trans.dm) +
      coef[18] * (trans.age * trans.smoke) +
      coef[19] * (trans.age * trans.egfr1) +
      coef[20];  // constant
    
    return Math.exp(xb) / (1 + Math.exp(xb));
  }

  /**
   * Calculate 10-year Heart Failure risk using official AHA coefficients
   */
  private static calculate10YearHF(
    coef: number[],
    trans: ReturnType<typeof PREVENTCalculator.prepareTransformations>
  ): number {
    // Covariate order for HF: age, sbp_1, sbp_2, dm, smoke, bmi_1, bmi_2, egfr_1, egfr_2, bptreat,
    //                         bptreat*sbp_2, age*sbp_2, age*dm, age*smoke, age*bmi_2, age*egfr_1, constant
    const xb = 
      coef[0] * trans.age +
      coef[1] * trans.sbp1 +
      coef[2] * trans.sbp2 +
      coef[3] * trans.dm +
      coef[4] * trans.smoke +
      coef[5] * trans.bmi1 +
      coef[6] * trans.bmi2 +
      coef[7] * trans.egfr1 +
      coef[8] * trans.egfr2 +
      coef[9] * trans.bptreat +
      coef[10] * (trans.bptreat * trans.sbp2) +
      coef[11] * (trans.age * trans.sbp2) +
      coef[12] * (trans.age * trans.dm) +
      coef[13] * (trans.age * trans.smoke) +
      coef[14] * (trans.age * trans.bmi2) +
      coef[15] * (trans.age * trans.egfr1) +
      coef[16];  // constant
    
    return Math.exp(xb) / (1 + Math.exp(xb));
  }

  /**
   * Calculate 30-year Heart Failure risk using official AHA coefficients
   */
  private static calculate30YearHF(
    coef: number[],
    trans: ReturnType<typeof PREVENTCalculator.prepareTransformations>
  ): number {
    // Covariate order for HF 30yr: age, age2, sbp_1, sbp_2, dm, smoke, bmi_1, bmi_2, egfr_1, egfr_2, bptreat,
    //                              bptreat*sbp_2, age*sbp_2, age*dm, age*smoke, age*bmi_2, age*egfr_1, constant
    const xb = 
      coef[0] * trans.age +
      coef[1] * trans.age2 +
      coef[2] * trans.sbp1 +
      coef[3] * trans.sbp2 +
      coef[4] * trans.dm +
      coef[5] * trans.smoke +
      coef[6] * trans.bmi1 +
      coef[7] * trans.bmi2 +
      coef[8] * trans.egfr1 +
      coef[9] * trans.egfr2 +
      coef[10] * trans.bptreat +
      coef[11] * (trans.bptreat * trans.sbp2) +
      coef[12] * (trans.age * trans.sbp2) +
      coef[13] * (trans.age * trans.dm) +
      coef[14] * (trans.age * trans.smoke) +
      coef[15] * (trans.age * trans.bmi2) +
      coef[16] * (trans.age * trans.egfr1) +
      coef[17];  // constant
    
    return Math.exp(xb) / (1 + Math.exp(xb));
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
    } else if (riskPercent >= 7.5) {
      recommendations.push('INTERMEDIATE-HIGH RISK (7.5-20%): Moderate-to-high intensity statin recommended');
      recommendations.push('Risk-enhancing factors may favor more aggressive therapy');
    } else if (riskPercent >= 5) {
      recommendations.push('BORDERLINE RISK (5-7.5%): Consider coronary artery calcium (CAC) scoring');
      recommendations.push('Statin therapy based on shared decision-making if risk-enhancing factors present');
    } else {
      recommendations.push('LOW RISK (<5%): Focus on lifestyle modifications');
      recommendations.push('Reassess risk in 4-6 years');
    }

    if (diabetic && age >= 40 && age <= 75) {
      recommendations.push('DIABETES: Moderate-intensity statin recommended regardless of calculated risk');
    }

    if (ldl !== undefined && ldl >= 190) {
      recommendations.push('SEVERE HYPERCHOLESTEROLEMIA: High-intensity statin therapy indicated (LDL >=190 mg/dL)');
    }

    return recommendations.join('\n\n');
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

    // Prepare variable transformations
    const trans = this.prepareTransformations(
      age!, totalCholesterol, hdl, systolicBP!, bmi!, egfr,
      diabetic!, smoker!, onBPMeds!, onStatins!
    );

    // Select coefficients based on sex
    const isFemale = sex === 'female';
    
    // Calculate 10-year risks
    const tenYearCVD = this.calculate10YearCVD_ASCVD(
      isFemale ? FEMALE_10YR_CVD : MALE_10YR_CVD, trans
    );
    const tenYearASCVD = this.calculate10YearCVD_ASCVD(
      isFemale ? FEMALE_10YR_ASCVD : MALE_10YR_ASCVD, trans
    );
    const tenYearHF = this.calculate10YearHF(
      isFemale ? FEMALE_10YR_HF : MALE_10YR_HF, trans
    );

    // Calculate 30-year risks if applicable
    let thirtyYearCVD: number | undefined;
    let thirtyYearASCVD: number | undefined;
    let thirtyYearHF: number | undefined;

    if (canCalculate30Year) {
      thirtyYearCVD = this.calculate30YearCVD_ASCVD(
        isFemale ? FEMALE_30YR_CVD : MALE_30YR_CVD, trans
      );
      thirtyYearASCVD = this.calculate30YearCVD_ASCVD(
        isFemale ? FEMALE_30YR_ASCVD : MALE_30YR_ASCVD, trans
      );
      thirtyYearHF = this.calculate30YearHF(
        isFemale ? FEMALE_30YR_HF : MALE_30YR_HF, trans
      );
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

  /**
   * Calculate Adjusted Risk Assessment based on ApoB and Lp(a)
   * This supplements the PREVENT risk with atherogenic marker assessment
   * 
   * Thresholds:
   * - Lp(a) ≥ 50 mg/dL or ≥125 nmol/L → elevated concern
   * - ApoB ≥ 130 mg/dL → elevated concern
   */
  static calculateAdjustedRisk(
    tenYearASCVD: number,
    apoB?: number,
    lpa?: number
  ): AdjustedRiskAssessment | null {
    // Must have at least one marker to provide adjusted assessment
    if (apoB === undefined && lpa === undefined) {
      return null;
    }

    const baseRiskPercent = tenYearASCVD * 100;
    
    // Determine if markers are elevated
    // Lp(a) ≥ 50 mg/dL or ≥125 nmol/L (assume mg/dL if < 200, nmol/L if >= 200)
    const lpaElevated = lpa !== undefined && (lpa >= 50 || (lpa >= 125 && lpa >= 200));
    // ApoB ≥ 130 mg/dL
    const apoBElevated = apoB !== undefined && apoB >= 130;
    
    const hasElevatedMarkers = lpaElevated || apoBElevated;
    
    // Get base risk category
    let riskCategory: 'low' | 'borderline' | 'intermediate' | 'high';
    if (baseRiskPercent < 5) riskCategory = 'low';
    else if (baseRiskPercent < 7.5) riskCategory = 'borderline';
    else if (baseRiskPercent < 20) riskCategory = 'intermediate';
    else riskCategory = 'high';

    // Determine adjusted category and clinical guidance
    let adjustedCategory: 'low' | 'borderline' | 'intermediate' | 'high' | 'reclassified_upward';
    let clinicalGuidance: string;
    let cacRecommendation: string | undefined;
    let statinGuidance: string | undefined;

    if (baseRiskPercent >= 20) {
      // High risk (≥20%)
      adjustedCategory = 'high';
      clinicalGuidance = 'High risk: treat as high risk (statin) regardless; ApoB/Lp(a) further support intensity.';
      statinGuidance = 'High-intensity statin therapy strongly indicated. Elevated atherogenic markers support aggressive treatment.';
      if (hasElevatedMarkers) {
        cacRecommendation = 'CAC not needed for treatment decision; already high risk warranting statin therapy.';
      }
    } else if (baseRiskPercent >= 7.5) {
      // Intermediate risk (7.5-20%)
      if (hasElevatedMarkers) {
        adjustedCategory = 'reclassified_upward';
        clinicalGuidance = 'Statin strongly favored; CAC optional if patient hesitant.';
        statinGuidance = 'Moderate-to-high intensity statin recommended. Elevated ApoB/Lp(a) supports treatment initiation.';
        cacRecommendation = 'CAC scoring optional if patient hesitant about statin therapy; can help with shared decision-making.';
      } else {
        adjustedCategory = riskCategory;
        clinicalGuidance = 'Intermediate risk without elevated atherogenic markers. Standard shared decision-making for statin therapy.';
        statinGuidance = 'Moderate-intensity statin reasonable based on shared decision-making.';
      }
    } else if (baseRiskPercent >= 5) {
      // Borderline risk (5-7.5%)
      if (hasElevatedMarkers) {
        adjustedCategory = 'reclassified_upward';
        clinicalGuidance = 'Reclassified upward: statin favored OR CAC to adjudicate.';
        statinGuidance = 'Statin therapy favored given elevated atherogenic markers. Consider CAC if patient prefers more information.';
        cacRecommendation = 'CAC scoring recommended to help adjudicate treatment decision. If CAC > 0, strongly favors statin.';
      } else {
        adjustedCategory = riskCategory;
        clinicalGuidance = 'Borderline risk without elevated atherogenic markers. Lifestyle modifications primary; consider CAC if risk-enhancing factors present.';
      }
    } else {
      // Low risk (<5%)
      if (hasElevatedMarkers) {
        adjustedCategory = 'borderline';
        clinicalGuidance = 'Low short-term risk, but elevated atherogenic risk markers; consider CAC if strong family history / patient wants clearer risk signal.';
        cacRecommendation = 'CAC scoring may help clarify risk, especially with family history of premature ASCVD.';
        statinGuidance = 'Statin not routinely indicated at this risk level, but elevated markers warrant discussion about long-term risk.';
      } else {
        adjustedCategory = riskCategory;
        clinicalGuidance = 'Low risk with normal atherogenic markers. Focus on lifestyle modifications; reassess in 4-6 years.';
      }
    }

    // Build marker-specific notes
    const markerNotes: string[] = [];
    if (lpaElevated) {
      markerNotes.push(`Lp(a) ${lpa} ${lpa! >= 200 ? 'nmol/L' : 'mg/dL'} - elevated (genetic risk factor)`);
    }
    if (apoBElevated) {
      markerNotes.push(`ApoB ${apoB} mg/dL - elevated atherogenic particle burden`);
    }
    
    if (markerNotes.length > 0) {
      clinicalGuidance = `${markerNotes.join('; ')}. ${clinicalGuidance}`;
    }

    return {
      hasElevatedLpa: lpaElevated,
      hasElevatedApoB: apoBElevated,
      lpaValue: lpa,
      apoBValue: apoB,
      baseASCVDRisk: baseRiskPercent,
      riskCategory,
      adjustedCategory,
      clinicalGuidance,
      cacRecommendation,
      statinGuidance
    };
  }
}
