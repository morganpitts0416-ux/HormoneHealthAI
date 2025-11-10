import type { LabValues, ASCVDRiskResult, PatientDemographics } from "@shared/schema";

/**
 * ASCVD Risk Calculator
 * Based on 2013 ACC/AHA Pooled Cohort Equations
 * Calculates 10-year risk of first hard ASCVD event (MI, CHD death, stroke)
 * 
 * Reference: Goff DC Jr, Lloyd-Jones DM, Bennett G, et al. 2013 ACC/AHA guideline on the assessment
 * of cardiovascular risk: a report of the American College of Cardiology/American Heart Association
 * Task Force on Clinical Practice Guidelines. Circulation. 2014;129(25 Suppl 2):S49-S73.
 */

export class ASCVDCalculator {
  /**
   * Calculate 10-year ASCVD risk using the Pooled Cohort Equations
   */
  static calculateRisk(labs: LabValues): ASCVDRiskResult | null {
    const demographics = labs.demographics;
    
    // Validate required fields
    if (!demographics || !this.hasRequiredFields(demographics, labs)) {
      return null;
    }

    const { age, sex, race, systolicBP, onBPMeds, diabetic, smoker } = demographics;
    const totalCholesterol = labs.totalCholesterol!;
    const hdl = labs.hdl!;
    const ldl = labs.ldl;

    // Age validation (calculator designed for 40-79 years)
    if (age! < 40 || age! > 79) {
      return {
        tenYearRisk: 0,
        riskCategory: 'low',
        riskPercentage: 'N/A',
        recommendations: `ASCVD calculator is validated for ages 40-79 years. Patient is ${age} years old. Use clinical judgment for risk assessment.`,
        statinRecommendation: age! < 40 ? 'Consider if LDL ≥190 mg/dL or familial hypercholesterolemia' : 'Consider cardiovascular risk assessment using alternative tools',
      };
    }

    // Calculate 10-year risk based on race and sex
    let riskPercentage: number;
    
    if (race === 'african_american' && sex === 'female') {
      riskPercentage = this.calculateAfricanAmericanFemaleRisk(
        age!, totalCholesterol, hdl, systolicBP!, onBPMeds!, diabetic!, smoker!
      );
    } else if (race === 'african_american' && sex === 'male') {
      riskPercentage = this.calculateAfricanAmericanMaleRisk(
        age!, totalCholesterol, hdl, systolicBP!, onBPMeds!, diabetic!, smoker!
      );
    } else if (sex === 'female') {
      // White or other race females use white equations
      riskPercentage = this.calculateWhiteFemaleRisk(
        age!, totalCholesterol, hdl, systolicBP!, onBPMeds!, diabetic!, smoker!
      );
    } else {
      // White or other race males use white equations
      riskPercentage = this.calculateWhiteMaleRisk(
        age!, totalCholesterol, hdl, systolicBP!, onBPMeds!, diabetic!, smoker!
      );
    }

    // Determine risk category
    const riskCategory = this.getRiskCategory(riskPercentage);

    // Generate recommendations based on 2018 ACC/AHA guidelines
    const recommendations = this.generateRecommendations(riskPercentage, ldl, diabetic!, age!);
    const statinRecommendation = this.getStatinRecommendation(riskPercentage, ldl, diabetic!, age!);
    const ldlGoal = this.getLDLGoal(riskPercentage, ldl, diabetic!);

    return {
      tenYearRisk: riskPercentage,
      riskCategory,
      riskPercentage: `${riskPercentage.toFixed(1)}%`,
      recommendations,
      statinRecommendation,
      ldlGoal,
    };
  }

  private static hasRequiredFields(demographics: PatientDemographics, labs: LabValues): boolean {
    return !!(
      demographics.age &&
      demographics.sex &&
      demographics.race &&
      demographics.systolicBP !== undefined &&
      demographics.onBPMeds !== undefined &&
      demographics.diabetic !== undefined &&
      demographics.smoker !== undefined &&
      labs.totalCholesterol !== undefined &&
      labs.hdl !== undefined
    );
  }

  /**
   * African American Female equation (2013 ACC/AHA Pooled Cohort Equations)
   */
  private static calculateAfricanAmericanFemaleRisk(
    age: number,
    totalChol: number,
    hdl: number,
    sbp: number,
    onBPMeds: boolean,
    diabetic: boolean,
    smoker: boolean
  ): number {
    const lnAge = Math.log(age);
    const lnTotalChol = Math.log(totalChol);
    const lnHDL = Math.log(hdl);
    const lnSBP = Math.log(sbp);
    const diabetes = diabetic ? 1 : 0;
    const smoking = smoker ? 1 : 0;

    const indSum = 
      17.1141 * lnAge +
      0.9396 * lnTotalChol +
      -18.9196 * lnHDL +
      4.4748 * lnAge * lnHDL +
      (onBPMeds ? (29.2907 * lnSBP + -6.4321 * lnAge * lnSBP) : (27.8197 * lnSBP + -6.0873 * lnAge * lnSBP)) +
      0.6908 * smoking +
      0.8738 * diabetes;

    const meanCoef = 86.6081;
    const baselineSurvival = 0.9533;

    const risk = (1 - Math.pow(baselineSurvival, Math.exp(indSum - meanCoef))) * 100;
    return Math.max(0, Math.min(100, risk));
  }

  /**
   * African American Male equation (2013 ACC/AHA Pooled Cohort Equations)
   */
  private static calculateAfricanAmericanMaleRisk(
    age: number,
    totalChol: number,
    hdl: number,
    sbp: number,
    onBPMeds: boolean,
    diabetic: boolean,
    smoker: boolean
  ): number {
    const lnAge = Math.log(age);
    const lnTotalChol = Math.log(totalChol);
    const lnHDL = Math.log(hdl);
    const lnSBP = Math.log(sbp);
    const diabetes = diabetic ? 1 : 0;
    const smoking = smoker ? 1 : 0;

    const indSum = 
      2.469 * lnAge +
      0.302 * lnTotalChol +
      -0.307 * lnHDL +
      (onBPMeds ? (1.916 * lnSBP + 0.307 * lnAge * lnSBP) : 1.809 * lnSBP) +
      0.549 * smoking +
      0.645 * diabetes;

    const meanCoef = 19.5425;
    const baselineSurvival = 0.89536;

    const risk = (1 - Math.pow(baselineSurvival, Math.exp(indSum - meanCoef))) * 100;
    return Math.max(0, Math.min(100, risk));
  }

  /**
   * White Female equation (2013 ACC/AHA Pooled Cohort Equations)
   */
  private static calculateWhiteFemaleRisk(
    age: number,
    totalChol: number,
    hdl: number,
    sbp: number,
    onBPMeds: boolean,
    diabetic: boolean,
    smoker: boolean
  ): number {
    const lnAge = Math.log(age);
    const lnTotalChol = Math.log(totalChol);
    const lnHDL = Math.log(hdl);
    const lnSBP = Math.log(sbp);
    const diabetes = diabetic ? 1 : 0;
    const smoking = smoker ? 1 : 0;

    const indSum = 
      -29.799 * lnAge +
      4.884 * lnAge * lnAge +
      13.540 * lnTotalChol +
      -3.114 * lnAge * lnTotalChol +
      -13.578 * lnHDL +
      3.149 * lnAge * lnHDL +
      (onBPMeds ? 2.019 * lnSBP : 1.957 * lnSBP) +
      7.574 * smoking +
      -1.665 * lnAge * smoking +
      0.661 * diabetes;

    const meanCoef = -29.18;
    const baselineSurvival = 0.9665;

    const risk = (1 - Math.pow(baselineSurvival, Math.exp(indSum - meanCoef))) * 100;
    return Math.max(0, Math.min(100, risk));
  }

  /**
   * White Male equation (2013 ACC/AHA Pooled Cohort Equations)
   */
  private static calculateWhiteMaleRisk(
    age: number,
    totalChol: number,
    hdl: number,
    sbp: number,
    onBPMeds: boolean,
    diabetic: boolean,
    smoker: boolean
  ): number {
    const lnAge = Math.log(age);
    const lnTotalChol = Math.log(totalChol);
    const lnHDL = Math.log(hdl);
    const lnSBP = Math.log(sbp);
    const diabetes = diabetic ? 1 : 0;
    const smoking = smoker ? 1 : 0;

    const indSum = 
      12.344 * lnAge +
      11.853 * lnTotalChol +
      -2.664 * lnAge * lnTotalChol +
      -7.990 * lnHDL +
      1.769 * lnAge * lnHDL +
      (onBPMeds ? 1.797 * lnSBP : 1.764 * lnSBP) +
      7.837 * smoking +
      -1.795 * lnAge * smoking +
      0.658 * diabetes;

    const meanCoef = 61.18;
    const baselineSurvival = 0.9144;

    const risk = (1 - Math.pow(baselineSurvival, Math.exp(indSum - meanCoef))) * 100;
    return Math.max(0, Math.min(100, risk));
  }

  private static getRiskCategory(risk: number): 'low' | 'borderline' | 'intermediate' | 'high' {
    if (risk < 5) return 'low';
    if (risk < 7.5) return 'borderline';
    if (risk < 20) return 'intermediate';
    return 'high';
  }

  /**
   * Generate treatment recommendations based on 2018 ACC/AHA Cholesterol Guidelines
   */
  private static generateRecommendations(risk: number, ldl: number | undefined, diabetic: boolean, age: number): string {
    const recommendations: string[] = [];

    // Lifestyle modifications (always recommended)
    recommendations.push('• Heart-healthy lifestyle: Mediterranean diet, regular exercise, maintain healthy weight, smoking cessation');

    // LDL-specific recommendations
    if (ldl !== undefined) {
      if (ldl >= 190) {
        recommendations.push('• Severe hypercholesterolemia (LDL ≥190 mg/dL): HIGH-INTENSITY statin therapy indicated regardless of risk score');
      } else if (risk >= 20) {
        recommendations.push('• High risk (≥20%): HIGH-INTENSITY statin therapy recommended (goal: ≥50% LDL reduction)');
      } else if (risk >= 7.5) {
        recommendations.push('• Intermediate risk (7.5-19.9%): MODERATE-TO-HIGH intensity statin therapy recommended');
        recommendations.push('• Consider risk-enhancing factors: family history, chronic kidney disease, metabolic syndrome, chronic inflammatory conditions');
      } else if (risk >= 5) {
        recommendations.push('• Borderline risk (5-7.4%): Consider statin therapy if risk-enhancing factors present');
        recommendations.push('• May consider coronary artery calcium (CAC) scoring if decision uncertain');
      } else {
        recommendations.push('• Low risk (<5%): Continue lifestyle modifications. Statin generally not indicated unless LDL ≥190 mg/dL');
      }
    }

    // Diabetes-specific recommendations
    if (diabetic && age >= 40 && age <= 75) {
      recommendations.push('• Diabetes (age 40-75): MODERATE-intensity statin recommended (minimum)');
    }

    return recommendations.join('\n');
  }

  private static getStatinRecommendation(risk: number, ldl: number | undefined, diabetic: boolean, age: number): string {
    if (ldl !== undefined && ldl >= 190) {
      return 'HIGH-INTENSITY statin (Atorvastatin 40-80 mg or Rosuvastatin 20-40 mg)';
    }

    if (risk >= 20) {
      return 'HIGH-INTENSITY statin (≥50% LDL reduction)';
    }

    if (risk >= 7.5) {
      return 'MODERATE-TO-HIGH intensity statin based on shared decision-making';
    }

    if (diabetic && age >= 40 && age <= 75) {
      return 'MODERATE-INTENSITY statin (30-50% LDL reduction)';
    }

    if (risk >= 5) {
      return 'Consider statin if risk-enhancing factors present. May consider CAC scoring.';
    }

    return 'Lifestyle modifications recommended. Statin generally not indicated.';
  }

  private static getLDLGoal(risk: number, ldl: number | undefined, diabetic: boolean): string {
    if (!ldl) {
      return 'LDL not available';
    }

    if (ldl >= 190) {
      return 'Goal: ≥50% LDL reduction (consider <100 mg/dL)';
    }

    if (risk >= 20) {
      return 'Goal: ≥50% LDL reduction (consider <70 mg/dL for very high risk)';
    }

    if (risk >= 7.5) {
      return 'Goal: 30-50% LDL reduction';
    }

    return 'No specific LDL target; focus on risk-based statin intensity';
  }
}
