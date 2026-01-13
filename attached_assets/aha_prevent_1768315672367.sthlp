{smcl}

{title:Title}

{p2colset 5 20 30 2}{...}
{p2col:{hi:aha_prevent} {hline 2}}Predicting Risk of Cardiovascular Disease EVENTs (PREVENT) Equations{p_end}
{p2colreset}{...}


{marker syntax}{...}
{title:Syntax}

{pstd}
aha_prevent using data in memory

{p 4 28 2}
				{cmdab:aha_prevent_base}
				{if}
				{cmd:,}
				{opt age}({it:varname}) 
				{opt sex}({it:varname}) 
				{opt bmi}({it:varname})  
				{opt sbp}({it:varname}) 
				{opt bptreat}({it:varname}) 
				{opt tc}({it:varname}) 
				{opt hdl}({it:varname})  
				{opt statin}({it:varname})  
				{opt dm}({it:varname})  
				{opt smoke}({it:varname})  
				{opt egfr}({it:varname}){p_end}
{p 4 28 2}
				{cmdab:aha_prevent_uacr}
				{if}
				{cmd:,}
				{opt age}({it:varname}) 
				{opt sex}({it:varname}) 
				{opt bmi}({it:varname})  
				{opt sbp}({it:varname}) 
				{opt bptreat}({it:varname}) 
				{opt tc}({it:varname}) 
				{opt hdl}({it:varname})  
				{opt statin}({it:varname})  
				{opt dm}({it:varname})  
				{opt smoke}({it:varname})  
				{opt egfr}({it:varname})  
				{opt uacr}({it:varname}){p_end}
{p 4 29 2}
				{cmdab:aha_prevent_hba1c}
				{if}
				{cmd:,}
				{opt age}({it:varname}) 
				{opt sex}({it:varname}) 
				{opt bmi}({it:varname})  
				{opt sbp}({it:varname}) 
				{opt bptreat}({it:varname}) 
				{opt tc}({it:varname}) 
				{opt hdl}({it:varname})  
				{opt statin}({it:varname})  
				{opt dm}({it:varname})  
				{opt smoke}({it:varname})  
				{opt egfr}({it:varname})  
				{opt hba1c}({it:varname}){p_end}
{p 4 27 2}
				{cmdab:aha_prevent_sdi}
				{if}
				{cmd:,}
				{opt age}({it:varname}) 
				{opt sex}({it:varname}) 
				{opt bmi}({it:varname})  
				{opt sbp}({it:varname}) 
				{opt bptreat}({it:varname}) 
				{opt tc}({it:varname}) 
				{opt hdl}({it:varname})  
				{opt statin}({it:varname})  
				{opt dm}({it:varname})  
				{opt smoke}({it:varname})  
				{opt egfr}({it:varname})  
				{opt sdi}({it:varname}){p_end}
{p 4 28 2}
				{cmdab:aha_prevent_full}
				{if}
				{cmd:,}
				{opt age}({it:varname}) 
				{opt sex}({it:varname}) 
				{opt bmi}({it:varname})  
				{opt sbp}({it:varname}) 
				{opt bptreat}({it:varname}) 
				{opt tc}({it:varname}) 
				{opt hdl}({it:varname})  
				{opt statin}({it:varname})  
				{opt dm}({it:varname})  
				{opt smoke}({it:varname})  
				{opt egfr}({it:varname})  
				{opt uacr}({it:varname})  
				{opt hba1c}({it:varname})  
				{opt sdi}({it:varname}){p_end}

{synoptset 21 tabbed}{...}
{synopthdr:options}
{synoptline}
{syntab:Required}

{synopt:{opt age(varname numeric)}}specifies the variable for age in years. The program will generate the 10-year risk for those between 30-79 years of age and 30-year risk for those between 30-59 years.{p_end}

{synopt:{opt sex(varname numeric)}}specifies the variable for sex, where female=1 and male=0.{p_end}

{synopt:{opt bmi(varname numeric)}}specifies the variable for BMI (18.5-39.9 kg/m^2).{p_end}

{synopt:{opt sbp(varname numeric)}}specifies the variable for systolic blood pressure (90-200 mmHg).{p_end}

{synopt:{opt bptreat(varname numeric)}}specifies the variable for treatment for hypertension, where having any treatment=1 and no treatment=0.{p_end}

{synopt:{opt tc(varname numeric)}}specifies the variable for total cholesterol level (130-320 mg/dL).{p_end}

{synopt:{opt hdl(varname numeric)}}specifies the variable for high density lipoprotein level (20-100 mg/dL). This is used in the calculation of non-HDL cholesterol for input into equations, where non-HDL = TC - HDL.{p_end}

{synopt:{opt statin(varname numeric)}}specifies the variable for Statin use, where Statin use=1 and no Statin use=0.{p_end}

{synopt:{opt dm(varname numeric)}}specifies the variable for diabetes status, where diabetic=1 and non?diabetic=0.{p_end}

{synopt:{opt smoke(varname numeric)}}specifies the variable for smoking status, where smoker=1 and non?smoker=0.{p_end}

{synopt:{opt egfr(varname numeric)}}specifies the variable for Estimated glomerular filtration rate (>0 mL/min/1.73m^2).{p_end}


{syntab:Optional}
{synopt:{opt uacr(varname numeric)}}used with the aha_prevent_uacr and aha_prevent_full commands, specifies the variable for Urine albumin-creatinine ratio (?0 mg/g).{p_end}

{synopt:{opt hba1c(varname numeric)}}used with the aha_prevent_hba1c and aha_prevent_full commands, specifies the variable for Hemoglobin A1c (>0 percent).{p_end}

{synopt:{opt sdi(varname numeric)}}used with the aha_prevent_sdi and aha_prevent_full commands, specifies the variable for Social deprivation index decile (integer 1-10).{p_end}

{synoptline}
{p2colreset}{...}


	
{title:Description}

{pstd}
{cmd:aha_prevent} 
implements the American Heart Association's 
Predicting Risk of Cardiovascular Disease EVENTs ("PREVENT") equations. 
The PREVENT equations predict 10-year and 30-year risks for 
total cardiovascular disease (CVD), 
atherosclerotic cardiovascular disease (ASCVD), 
and heart failure (HF). 
These reflect the interplay between the cardiovascular system, 
chronic kidney disease, and metabolic health. 
This program includes five commands, and each command will generate 
the following six new variables 
(where "model" refers to "base", "uacr", "hba1c", "sdi", or "full") 
for 10-year and 30-year total CVD, ASCVD, and HF absolute risks (percent).
{p_end}

{pstd}
aha_prevent_model_10yr_CVD: Predicted 10-year Total CVD risk{p_end}
{pstd}
aha_prevent_model_30yr_CVD: Predicted 30-year Total CVD risk{p_end}
{pstd}
aha_prevent_model_10yr_ASCVD: Predicted 10-year ASCVD risk{p_end}
{pstd}
aha_prevent_model_30yr_ASCVD: Predicted 30-year ASCVD risk{p_end}
{pstd}
aha_prevent_model_10yr_HF: Predicted 10-year HF risk{p_end}
{pstd}
aha_prevent_model_30yr_HF: Predicted 30-year HF risk{p_end}



{title:Examples}

    {hline}
    Setup
{phang2}
{cmd:. use "`c(sysdir_personal)'a/prevent_test.dta", clear}
{p_end}

{pstd}Run {cmd:aha_prevent} using data in memory{p_end}

{phang2}{cmd:. aha_prevent_base, age(age) sex(sex) bmi(bmi) sbp(sbp) bptreat(htnmed) tc(tc) hdl(hdl) statin(statin) dm(dm) smoke(smoke) egfr(egfr)}

{phang2}{cmd:. aha_prevent_uacr, age(age) sex(sex) bmi(bmi) sbp(sbp) bptreat(htnmed) tc(tc) hdl(hdl) statin(statin) dm(dm) smoke(smoke) egfr(egfr) uacr(uacr)}

{phang2}{cmd:. aha_prevent_sdi, age(age) sex(sex) bmi(bmi) sbp(sbp) bptreat(htnmed) tc(tc) hdl(hdl) statin(statin) dm(dm) smoke(smoke) egfr(egfr) sdi(sdi10)}

{phang2}{cmd:. aha_prevent_hba1c, age(age) sex(sex) bmi(bmi) sbp(sbp) bptreat(htnmed) tc(tc) hdl(hdl) statin(statin) dm(dm) smoke(smoke) egfr(egfr) hba1c(hba1c)}

{phang2}{cmd:. aha_prevent_full, age(age) sex(sex) bmi(bmi) sbp(sbp) bptreat(htnmed) tc(tc) hdl(hdl) statin(statin) dm(dm) smoke(smoke) egfr(egfr) uacr(uacr) hba1c(hba1c) sdi(sdi10)}

{hline}



{title:References}

{p 4 8 2}
Inker LA, Eneanya ND, Coresh J, Tighiouart H, Wang D, Sang Y, Crews DC, Doria A, Estrella MM, Froissart M, Grams ME. 
New creatinine-and cystatin C-based equations to estimate GFR without race. 
New England Journal of Medicine. 2021 Nov 4;385(19):1737-49.
{p_end}

{p 4 8 2}
Khan SS, Coresh J, Pencina MJ, Ndumele CE, Rangaswami J, Chow SL, Palaniappan LP, Sperling LS, Virani SS, Ho JE, Neeland IJ. 
Novel prediction equations for absolute risk assessment of total cardiovascular disease incorporating cardiovascular-kidney-metabolic health: 
a scientific statement from the American Heart Association. 
Circulation. 2023 Dec 12;148(24):1982-2004.
{p_end}

{p 4 8 2}
Khan SS, Matsushita K, Sang Y, Ballew SH, Grams ME, Surapaneni A, Blaha MJ, Carson AP, Chang AR, Ciemins E, Go AS. 
for the Chronic Kidney Disease Prognosis Consortium and 
the American Heart Association 
Cardiovascular-Kidney-Metabolic Science Advisory Group. 
Development and validation of the American Heart Association Predicting Risk of Cardiovascular Disease EVENTs (PREVENT) equations. 
Circulation. 2023.
{p_end}





{marker citation}{title:Citation of {cmd:aha_prevent}}

{p 4 8 2}Please cite the package as: {p_end}

{p 4 8 2}Huang, X., Sang, Y., & Khan, S. S. (2024). 'aha_prevent': AHA PREVENT equations for STATA. STATA package version 1.0.0. https://github.com/AHA-DS-Analytics/PREVENT
{p_end}



{title:Author}

{p 4 8 2}Jack Xiaoning Huang{p_end}
{p 4 8 2}Northwestern University Feinberg School of Medicine{p_end}
{p 4 8 2}{browse "mailto:jack.huang@northwestern.edu":jack.huang@northwestern.edu}{p_end}

{p 4 8 2}Yingying Sang{p_end}
{p 4 8 2}Johns Hopkins Bloomberg School of Public Health{p_end}
{p 4 8 2}{browse "mailto:ysang1@jhu.edu":ysang1@jhu.edu}{p_end}

{p 4 8 2}Sadiya Khan{p_end}
{p 4 8 2}Northwestern University Feinberg School of Medicine{p_end}
{p 4 8 2}{browse "mailto:s-khan-1@northwestern.edu":s-khan-1@northwestern.edu}{p_end}
