* version 0.1 published Jan 2024
* by Jack Xiaoning Huang and Yingying Sang

program aha_prevent_base, rclass

preserve // preserve user data
********************************************************************************
* 10-year
use "`c(sysdir_personal)'a/prevent_beta10_2024.dta", clear
forvalues f=0/1 {
	foreach o in cvd ascvd hf chd str {
		if "`o'"=="hf" local lc 16
		else local lc 19
		forvalues i=1/5 {
			mata:beta`i'`f'_`o'_10=st_data((1,`=`lc'+`i'+(`i'==2)+(`i'==3)+4*(`i'==5)'),"beta`i'`f'_`o'")
		}
	}
}
/*
worksheet for row indices
i=1: 19+1=20		update to 19+1=20
i=2: 19+2=21		update to 19+2+1=22
i=3: 19+3=22		update to 19+3+1=23
i=4: 19+4-1=22		update to 19+4=23
i=5: 19+5+1=25		update to 19+5+4=28
*/
* 30-year
use "`c(sysdir_personal)'a/prevent_beta30_2024.dta", clear
forvalues f=0/1 {
	foreach o in cvd ascvd hf chd str {
		if "`o'"=="hf" local lc 17
		else local lc 20
		forvalues i=1/5 {
			mata:beta`i'`f'_`o'_30=st_data((1,`=`lc'+`i'+(`i'==2)+(`i'==3)+4*(`i'==5)'),"beta`i'`f'_`o'")
		}
	}
}
********************************************************************************
restore // restore user data



syntax [if], age(varname numeric) sex(varname numeric) bmi(varname numeric) sbp(varname numeric) bptreat(varname numeric) tc(varname numeric) hdl(varname numeric) statin(varname numeric) dm(varname numeric) smoke(varname numeric) egfr(varname numeric)

marksample touse, novarlist
markout `touse' `age' `sex' `bmi' `sbp' `bptreat' `tc' `hdl' `statin' `dm' `smoke' `egfr', sysmissok

qui count if `touse' // check sample size
if r(N) == 0 error 2000


* check to ensure binary variables contain only 0 or 1
foreach v in  `sex' `bptreat' `statin' `dm' `smoke' {
capture assert inlist(`v', 0, 1, .) if `touse' 
	if _rc {
		di as err "`v' contains values other than 0 or 1"
		exit 498
	}
}

* check ranges
capture assert `age'<80 & `age'>=30 | `age'==. if `touse'
	if _rc {
		di as err "Warning - `age' contains values outside of validated range (30-79 yrs)"
	}
capture assert `tc'<=320 & `tc'>=130 | `tc'==. if `touse'
	if _rc {
		di as err "Warning - `tc' contains values outside of validated range (130-320 mg/dL)"
	}
capture assert `hdl'<=100 & `hdl'>=20 | `hdl'==. if `touse'
	if _rc {
		di as err "Warning - `hdl' contains values outside of validated range (20-100 mg/dL)"
	}
capture assert `sbp'<=200 & `sbp'>=90 | `sbp'==. if `touse'
	if _rc {
		di as err "Warning - `sbp' contains values outside of validated range (90-200 mmHg)"
	}
capture assert `bmi'<40 & `bmi'>=18.5 | `bmi'==. if `touse'
	if _rc {
		di as err "Warning - `bmi' contains values outside of validated range (18.5-39.9 kg/m^2)"
	}

* check to ensure ratio variables >=0
foreach v in  `egfr' {
capture assert `v'>=0 if `touse'
	if _rc {
		di as err "`v' contains negative values"
		exit 498
	}
}


********************************************************************************
tempvar prevent_age prevent_age2 prevent_sbp prevent_sbp_1 prevent_sbp_2 prevent_bptreat prevent_nhdl prevent_statin prevent_hdl prevent_bmi prevent_bmi_1 prevent_bmi_2 prevent_egfr_1 prevent_egfr_2 prevent_c xb1_cvd_10 xb1_cvd_30 xb1_ascvd_10 xb1_ascvd_30 xb1_hf_10 xb1_hf_30


* recode variables
qui gen `prevent_age'=(`age'-55)/10 if `age'>=30 & `age'<80
qui gen `prevent_age2'=`prevent_age'^2 if `age'<60

qui gen `prevent_sbp'=(`sbp'-110)/20
qui replace `prevent_sbp'=. if `sbp'<90 | `sbp'>200
mkspline `prevent_sbp_1' 0 `prevent_sbp_2'=`prevent_sbp'
qui replace `prevent_sbp_2'=`prevent_sbp_2'-1
qui gen `prevent_bptreat'=`prevent_sbp_2'*`bptreat'

qui gen `prevent_nhdl'=`tc'*0.02586-`hdl'*0.02586-3.5
qui replace `prevent_nhdl'=. if `tc'<130 | `tc'>320
qui replace `prevent_nhdl'=. if `hdl'<20 | `hdl'>100
qui gen `prevent_statin'=`prevent_nhdl'*`statin'
qui gen `prevent_hdl'=(`hdl'*0.02586-1.3)/0.3

qui gen `prevent_bmi'=(`bmi'-25)/5
qui replace `prevent_bmi'=. if `bmi'<18.5 | `bmi'>=40
mkspline `prevent_bmi_1' 1 `prevent_bmi_2'=`prevent_bmi'

mkspline `prevent_egfr_1' 60 `prevent_egfr_2'=`egfr'
qui replace `prevent_egfr_1'=-`prevent_egfr_1'/15+4
qui replace `prevent_egfr_2'=-`prevent_egfr_2'/15+2


foreach v of varlist `prevent_nhdl' `prevent_hdl' `prevent_sbp_2' `dm' `smoke' `prevent_bmi_2' `prevent_egfr_1' {
	tempvar age_`v'
	qui gen `age_`v''=`v'*`prevent_age'
}
qui gen `prevent_c'=1
********************************************************************************



foreach o in cvd ascvd hf {
	
if "`o'"=="hf" local cov `prevent_sbp_1' `prevent_sbp_2' `dm' `smoke' `prevent_bmi_1' `prevent_bmi_2' `prevent_egfr_1' `prevent_egfr_2' `bptreat' `prevent_bptreat' `age_`prevent_sbp_2'' `age_`dm'' `age_`smoke'' `age_`prevent_bmi_2'' `age_`prevent_egfr_1''

else local cov `prevent_nhdl' `prevent_hdl' `prevent_sbp_1' `prevent_sbp_2' `dm' `smoke' `prevent_egfr_1' `prevent_egfr_2' `bptreat' `statin' `prevent_bptreat' `prevent_statin' `age_`prevent_nhdl'' `age_`prevent_hdl'' `age_`prevent_sbp_2'' `age_`dm'' `age_`smoke'' `age_`prevent_egfr_1''

	foreach y in 10 30 {
	if `y'==30 local av `prevent_age' `prevent_age2'
	else local av `prevent_age'
		forvalues i=1/1 {
		qui gen `xb`i'_`o'_`y''=.
			forvalues f=0/1 {
			qui replace `sex'=1-`sex'
			mata:st_store(.,"`xb`i'_`o'_`y''","`sex'",st_data(.,"`av' `cov' `var`i'' `prevent_c'","`sex'")*beta`i'`f'_`o'_`y')
			}
		qui gen aha_prevent_base_`y'yr_`o'=exp(`xb`i'_`o'_`y'')/(exp(`xb`i'_`o'_`y'')+1) if `touse' & `sex'!=.
		}
	}
}

foreach v of varlist aha_prevent_base_* {
	qui replace `v'=`v'*100
}
di "Please note for the sex variable female should be coded as 1. Please type 'help aha_prevent' for more details about the program."

label variable aha_prevent_base_10yr_cvd "AHA PREVENT Risk Base Model: Any CVD in 10 years (%)"
label variable aha_prevent_base_30yr_cvd "AHA PREVENT Risk Base Model: Any CVD in 30 years (%)"
label variable aha_prevent_base_10yr_ascvd "AHA PREVENT Risk Base Model: ASCVD in 10 years (%)"
label variable aha_prevent_base_30yr_ascvd "AHA PREVENT Risk Base Model: ASCVD in 30 years (%)"
label variable aha_prevent_base_10yr_hf "AHA PREVENT Risk Base Model: Heart failure in 10 years (%)"
label variable aha_prevent_base_30yr_hf "AHA PREVENT Risk Base Model: Heart failure in 30 years (%)"

end
