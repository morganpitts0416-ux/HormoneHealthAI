import { useState, useRef, useEffect } from "react";
import { usePatientContext } from "@/hooks/use-patient-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Sparkles, AlertCircle, Download, Upload, CheckCircle2, Heart, Save, History, User } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FemaleLabInputForm } from "@/components/female-lab-input-form";
import { ResultsDisplay } from "@/components/results-display";
import { RedFlagAlert } from "@/components/red-flag-alert";
import {
  PreventAssessmentCard,
  PreventNotCalculatedCard,
  AdvancedLipidsCard,
  StopBangCard,
  FemaleHormoneAssessmentCard,
  FemaleHormonePatternCard,
  InsulinResistanceCard,
  MitoScoreCard,
} from "@/components/lab-assessment-cards";
import { PatientSummary } from "@/components/patient-summary";
import { SOAPNote } from "@/components/soap-note";
import { SavedInterpretations } from "@/components/saved-interpretations";
import { PatientSelector } from "@/components/patient-selector";
import { PatientHistory } from "@/components/patient-history";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import { SupplementSelector, type CustomSupplement } from "@/components/supplement-selector";
import { femaleLabsApi, type WellnessPlan } from "@/lib/api";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generatePatientWellnessPDF } from "@/lib/patient-pdf-export";
import { useClinicBrandingPartial, useClinicBranding } from "@/hooks/use-clinic-branding";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalLoading } from "@/hooks/use-global-loading";
import { Link, useSearch, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FemaleLabValues, InterpretationResult, LabValues, Patient, LabResult } from "@shared/schema";

function calculateAge(dateOfBirth: Date | string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function FemaleLabInterpretation() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const initialPatientId = new URLSearchParams(search).get('patientId');

  const [labValues, setLabValues] = useState<FemaleLabValues>({});
  const [interpretationResult, setInterpretationResult] = useState<InterpretationResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>("input");
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [isPdfPendingReview, setIsPdfPendingReview] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const { setCurrentPatient } = usePatientContext();
  useEffect(() => {
    if (selectedPatient) {
      setCurrentPatient({ id: selectedPatient.id, name: `${selectedPatient.firstName ?? ""} ${selectedPatient.lastName ?? ""}`.trim() });
    } else {
      setCurrentPatient(null);
    }
  }, [selectedPatient, setCurrentPatient]);
  useEffect(() => {
    return () => {
      setCurrentPatient(null);
    };
  }, [setCurrentPatient]);
  const [selectedSupplementNames, setSelectedSupplementNames] = useState<Set<string>>(new Set());
  const [customSupplements, setCustomSupplements] = useState<CustomSupplement[]>([]);
  const [savedLabId, setSavedLabId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasPrefilledBmiRef = useRef(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const clinicBranding = useClinicBrandingPartial();
  const { data: clinicBrandingFull } = useClinicBranding();
  const { setLoading: setGlobalLoading, clearLoading: clearGlobalLoading } = useGlobalLoading();

  const { data: patientLabs } = useQuery<LabResult[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'labs'],
    enabled: !!selectedPatient?.id,
  });

  // Pre-fill BMI from most recent lab result once patientLabs load
  useEffect(() => {
    if (!selectedPatient || !patientLabs || hasPrefilledBmiRef.current) return;
    const lastBmi = patientLabs.length > 0
      ? (patientLabs[0].labValues as FemaleLabValues)?.demographics?.bmi
      : undefined;
    if (lastBmi) {
      hasPrefilledBmiRef.current = true;
      setLabValues(prev => ({
        ...prev,
        demographics: {
          ...(prev.demographics ?? {}),
          bmi: lastBmi,
        } as FemaleLabValues['demographics'],
      }));
    }
  }, [selectedPatient?.id, patientLabs]);

  useEffect(() => {
    if (interpretationResult?.supplements) {
      setSelectedSupplementNames(new Set(interpretationResult.supplements.map(s => s.name)));
      setCustomSupplements([]);
    }
  }, [interpretationResult]);

  const interpretMutation = useMutation({
    mutationFn: (data: FemaleLabValues) => {
      const payload = selectedPatient ? { ...data, patientId: selectedPatient.id } : data;
      return femaleLabsApi.interpretLabs(payload);
    },
    onMutate: () => { setGlobalLoading("Evaluating lab results…"); },
    onSettled: () => { clearGlobalLoading(); },
    onSuccess: async (data) => {
      console.log('[Frontend] Female interpretation successful:', data);
      setInterpretationResult(data);
      setActiveTab("results");
      const labDate = labValues.labDrawDate ? new Date(labValues.labDrawDate).toISOString() : new Date().toISOString();

      // Resolve the patient — prefer selectedPatient, fall back to name lookup
      let resolvedPatient = selectedPatient;
      if (!resolvedPatient && labValues.patientName) {
        try {
          const searchRes = await fetch(`/api/patients/search?q=${encodeURIComponent(labValues.patientName)}`, { credentials: 'include' });
          if (searchRes.ok) {
            const matches = await searchRes.json();
            if (matches.length === 1) {
              resolvedPatient = matches[0];
              setSelectedPatient(resolvedPatient);
              console.log('[Frontend] Resolved patient by name lookup:', resolvedPatient?.id);
            }
          }
        } catch (e) {
          console.warn('[Frontend] Patient name lookup failed:', e);
        }
      }

      if (resolvedPatient) {
        const pid = resolvedPatient.id;
        apiRequest('POST', `/api/patients/${pid}/labs`, {
          labDate,
          labValues,
          interpretationResult: data,
        }).then(async (res) => {
          const saved = await res.json().catch(() => ({}));
          // Pre-populate the labs cache with the newly saved lab so that
          // patient-profiles can open the modal immediately without waiting
          // for a background refetch. The server returns the full LabResult
          // object, so this data is complete.
          if (saved?.id) {
            setSavedLabId(saved.id);
            queryClient.setQueryData(
              ['/api/patients', pid, 'labs'],
              (old: any[] | undefined) => {
                const existing = Array.isArray(old) ? old : [];
                return existing.some(l => l.id === saved.id) ? existing : [...existing, saved];
              }
            );
          }
          queryClient.invalidateQueries({ queryKey: ['/api/patients', pid, 'labs'] });
          queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
          console.log('[Frontend] Auto-saved interpretation to patient profile, labId:', saved?.id);
          const labParam = saved?.id ? `&lab=${saved.id}` : '';
          setLocation(`/patients?patient=${pid}${labParam}`);
        }).catch(err => {
          console.error('[Frontend] Auto-save failed:', err);
          // Navigate to the patient profile even if the save failed so the
          // user never gets stuck on the evaluation screen.
          setLocation(`/patients?patient=${pid}`);
        });
      } else if (labValues.patientName) {
        // Auto-create a patient profile from the name typed in the form
        (async () => {
          try {
            const nameParts = labValues.patientName!.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || nameParts[0];
            const createRes = await apiRequest('POST', '/api/patients', { firstName, lastName, gender: 'female' });
            if (createRes.ok) {
              const newPatient = await createRes.json();
              setSelectedPatient(newPatient);
              queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
              const labRes = await apiRequest('POST', `/api/patients/${newPatient.id}/labs`, {
                labDate, labValues, interpretationResult: data,
              });
              const savedLab = await labRes.json().catch(() => ({}));
              queryClient.invalidateQueries({ queryKey: [`/api/patients/${newPatient.id}/labs`] });
              console.log('[Frontend] Auto-created female patient profile and saved labs:', newPatient.id);
              const labParam = savedLab?.id ? `&lab=${savedLab.id}` : '';
              setLocation(`/patients?patient=${newPatient.id}${labParam}`);
            } else {
              // Fallback to saved-interpretations
              await apiRequest('POST', '/api/saved-interpretations', { patientName: labValues.patientName, gender: 'female', labValues, interpretation: data, labDate });
              queryClient.invalidateQueries({ queryKey: ['/api/saved-interpretations'] });
            }
          } catch (e) {
            console.error('[Frontend] Auto-create patient failed:', e);
          }
        })();
      }
    },
    onError: (error) => {
      console.error('[Frontend] Female interpretation error:', error);
    },
  });

  const pdfExtractMutation = useMutation({
    mutationFn: femaleLabsApi.extractPdfLabs,
    onSuccess: (data) => {
      console.log('[Frontend] PDF extraction successful:', data);
      setLabValues(prev => {
        const merged = { ...prev, ...data };
        const demographicsDefaults = {
          onBPMeds: false,
          diabetic: false,
          smoker: false,
          familyHistory: false,
          onStatins: false,
          snoring: false,
          tiredness: false,
          observedApnea: false,
          bmiOver35: false,
          neckCircOver40cm: false,
        };
        merged.demographics = {
          ...demographicsDefaults,
          ...(prev.demographics ?? {}),
          ...(data.demographics ?? {}),
        };
        console.log('[Frontend] Merged PDF data with existing values:', merged);
        return merged;
      });
      setIsPdfPendingReview(true);
      
      toast({
        title: "PDF Extracted Successfully",
        description: "Lab values filled. Please enter patient demographics and menstrual phase, then click 'Interpret Labs'.",
        duration: 8000,
      });
    },
    onError: (error) => {
      console.error('[Frontend] PDF extraction error:', error);
      toast({
        variant: "destructive",
        title: "PDF Extraction Failed",
        description: error instanceof Error ? error.message : "Failed to extract lab values from PDF",
      });
    },
  });

  const wellnessPlanMutation = useMutation({
    mutationFn: () => {
      if (!interpretationResult) throw new Error('No interpretation result');
      return femaleLabsApi.generateWellnessPlan(
        labValues,
        interpretationResult.interpretations,
        interpretationResult.supplements,
        interpretationResult.preventRisk
      );
    },
    onMutate: () => { setGlobalLoading("Generating patient report…"); },
    onSettled: () => { clearGlobalLoading(); },
    onSuccess: async (wellnessPlan) => {
      console.log('[Frontend] Wellness plan generated:', wellnessPlan);
      if (interpretationResult) {
        const patientName = labValues.patientName || undefined;
        let patientLabs: LabResult[] | undefined;
        let patientId: number | undefined = selectedPatient?.id;

        if (!patientId && patientName) {
          try {
            const searchRes = await fetch(`/api/patients/search?q=${encodeURIComponent(patientName)}`, { credentials: 'include' });
            if (searchRes.ok) {
              const patients = await searchRes.json();
              if (patients.length > 0) {
                patientId = patients[0].id;
              }
            }
          } catch (e) {
            console.warn('Could not search for patient:', e);
          }
        }

        const currentLabDate = labValues.labDrawDate ? new Date(labValues.labDrawDate).toISOString() : new Date().toISOString();
        const currentLabResult: LabResult = {
          id: -1,
          patientId: patientId || 0,
          labDate: currentLabDate,
          labValues: labValues as any,
          interpretationResult,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as LabResult;

        if (patientId) {
          try {
            const res = await fetch(`/api/patients/${patientId}/labs`, { credentials: 'include' });
            if (res.ok) {
              const fetched: LabResult[] = await res.json();
              const isDuplicate = fetched.some(lab => 
                new Date(lab.labDate).toISOString().split('T')[0] === new Date(currentLabDate).toISOString().split('T')[0]
              );
              const combined = isDuplicate ? fetched : [...fetched, currentLabResult];
              combined.sort((a, b) => new Date(a.labDate).getTime() - new Date(b.labDate).getTime());
              if (combined.length >= 2) patientLabs = combined;
            }
          } catch (e) {
            console.warn('Could not fetch patient labs for trend charts:', e);
          }
        }
        const curatedSupplements = [
          ...(interpretationResult.supplements || []).filter(s => selectedSupplementNames.has(s.name)).map(s => ({
            name: s.name,
            dose: s.dose,
            indication: s.patientExplanation || s.indication,
          })),
          ...customSupplements.map(c => ({ name: c.name, dose: c.dose, indication: c.indication })),
        ];
        await generatePatientWellnessPDF(labValues, interpretationResult, wellnessPlan, patientName, patientLabs, curatedSupplements, user?.clinicName, clinicBranding, clinicBrandingFull?.clinicLogo ?? null, undefined, undefined, undefined, clinicBrandingFull?.footerText ?? null);
        toast({
          title: "Patient Report Generated",
          description: "The personalized wellness report has been downloaded.",
        });
      }
    },
    onError: (error) => {
      console.error('[Frontend] Wellness plan error:', error);
      toast({
        variant: "destructive",
        title: "Report Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate wellness plan",
      });
    },
  });

  const handleSubmit = (values: FemaleLabValues) => {
    console.log('[Frontend] handleSubmit called with values:', values);
    setLabValues(values);
    setIsPdfPendingReview(false);
    console.log('[Frontend] Calling interpretMutation.mutate');
    interpretMutation.mutate(values);
  };

  const handleReset = () => {
    setLabValues({});
    setInterpretationResult(null);
    setActiveTab("input");
    setPdfFileName(null);
    setIsPdfPendingReview(false);
  };

  const handleExportPDF = () => {
    if (interpretationResult) {
      generateLabReportPDF(labValues as unknown as LabValues, interpretationResult, selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : undefined, user?.clinicName, patientLabs, clinicBranding, clinicBrandingFull?.clinicLogo ?? null);
    }
  };

  const handlePatientReport = () => {
    if (interpretationResult) {
      wellnessPlanMutation.mutate();
    }
  };

  const handlePdfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('[Frontend] PDF file selected:', file.name);
      setPdfFileName(file.name);
      setInterpretationResult(null);
      setActiveTab("input");
      pdfExtractMutation.mutate({ file, patientId: selectedPatient?.id });
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!interpretationResult) throw new Error('No interpretation to save');
      const labDate = labValues.labDrawDate ? new Date(labValues.labDrawDate).toISOString() : new Date().toISOString();
      if (selectedPatient) {
        return apiRequest('POST', `/api/patients/${selectedPatient.id}/labs`, {
          labDate,
          labValues,
          interpretationResult,
        });
      }
      const patientName = labValues.patientName || 'Unknown Patient';
      return apiRequest('POST', '/api/saved-interpretations', {
        patientName,
        gender: 'female',
        labValues,
        interpretation: interpretationResult,
        labDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-interpretations'] });
      if (selectedPatient) {
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${selectedPatient.id}/labs`] });
      }
      toast({
        title: "Saved",
        description: selectedPatient 
          ? `Interpretation saved to ${selectedPatient.firstName} ${selectedPatient.lastName}'s profile.`
          : "Interpretation saved to history.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save interpretation",
      });
    },
  });

  const handleSave = () => {
    if (!selectedPatient && !labValues.patientName) {
      toast({
        variant: "destructive",
        title: "Patient Required",
        description: "Please select a patient or enter a patient name before saving.",
      });
      return;
    }
    saveMutation.mutate();
  };

  const handleLoadInterpretation = (loadedLabValues: LabValues | FemaleLabValues, loadedInterpretation: InterpretationResult) => {
    setLabValues(loadedLabValues as FemaleLabValues);
    setInterpretationResult(loadedInterpretation);
    setActiveTab("results");
  };

  // Cleanup overlay on unmount
  useEffect(() => () => { clearGlobalLoading(); }, []);

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Page toolbar */}
      <div className="border-b px-3 sm:px-4 py-2 flex items-center justify-between gap-2 flex-wrap" style={{ backgroundColor: "#f5f2ed", borderColor: "#d4c9b5" }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold" style={{ color: "#1c2414" }}>Women's Lab Interpretation</h1>
          <span className="text-xs hidden sm:inline" style={{ color: "#7a8a64" }}>Hormone &amp; Primary Care</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          <Link href="/patients">
            <Button variant="outline" size="sm" data-testid="link-to-patient-profiles" title="Patient Profiles">
              <span className="hidden sm:inline">Patient Profiles</span>
              <span className="sm:hidden">Patients</span>
            </Button>
          </Link>
          <Link href="/male">
            <Button variant="outline" size="sm" data-testid="link-to-mens-labs" title="Switch to Men's Labs">
              <span className="hidden sm:inline">Switch to Men's Labs</span>
              <span className="sm:hidden">Men's</span>
            </Button>
          </Link>
              {interpretationResult && (
                <>
                  {selectedPatient && (
                    <Link href={`/patients?patient=${selectedPatient.id}`}>
                      <Button variant="outline" size="sm" data-testid="button-view-patient-profile-female">
                        <User className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">View Patient</span>
                        <span className="sm:hidden">Profile</span>
                      </Button>
                    </Link>
                  )}
                  <Button 
                    variant="default" 
                    onClick={handlePatientReport}
                    disabled={wellnessPlanMutation.isPending}
                    data-testid="button-patient-report-female"
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    {wellnessPlanMutation.isPending ? 'Generating...' : 'Patient Report'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-interpretation-female"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleExportPDF}
                    data-testid="button-export-pdf-female"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Provider PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleReset}
                    data-testid="button-reset-female"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    New Interpretation
                  </Button>
                </>
              )}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3" data-testid="tabs-navigation-female">
            <TabsTrigger value="input" data-testid="tab-input-female">Lab Entry</TabsTrigger>
            <TabsTrigger value="results" data-testid="tab-results-female">
              Results
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history-female">
              <History className="w-4 h-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="space-y-6">
            {/* Patient Selector */}
            <PatientSelector
              gender="female"
              initialPatientId={initialPatientId ? parseInt(initialPatientId) : undefined}
              onPatientSelect={(patient) => {
                hasPrefilledBmiRef.current = false;
                setSelectedPatient(patient);
                if (patient) {
                  const baseDemographics: Record<string, any> = {};
                  if (patient.dateOfBirth) {
                    baseDemographics.age = calculateAge(patient.dateOfBirth);
                  }
                  // Fetch vitals to auto-fill systolic BP and BMI, then set all at once
                  fetch(`/api/patients/${patient.id}/vitals`, { credentials: 'include' })
                    .then(r => r.ok ? r.json() : [])
                    .then((vitals: any[]) => {
                      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
                      const recent = vitals.filter((v: any) => new Date(v.recordedAt).getTime() >= cutoff);
                      const bpEntry = recent.find((v: any) => v.systolicBp != null);
                      const bmiEntry = recent.find((v: any) => v.bmi != null);
                      if (bmiEntry) hasPrefilledBmiRef.current = true;
                      setLabValues({
                        patientName: `${patient.firstName} ${patient.lastName}`,
                        demographics: {
                          ...baseDemographics,
                          ...(bpEntry ? { systolicBP: bpEntry.systolicBp } : {}),
                          ...(bmiEntry ? { bmi: parseFloat(bmiEntry.bmi) } : {}),
                        } as FemaleLabValues['demographics'],
                      });
                    })
                    .catch(() => {
                      setLabValues({
                        patientName: `${patient.firstName} ${patient.lastName}`,
                        demographics: baseDemographics as FemaleLabValues['demographics'],
                      });
                    });
                } else {
                  setLabValues({});
                }
              }}
              selectedPatient={selectedPatient}
            />

            {/* Patient History (when patient selected) */}
            {selectedPatient && (
              <PatientHistory
                patient={selectedPatient}
                onLoadResult={handleLoadInterpretation}
              />
            )}

            {/* PDF Upload Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <CardTitle>AI-Powered PDF Upload</CardTitle>
                </div>
                <CardDescription>
                  Upload a lab report PDF. AI will automatically extract and fill in lab values for you to review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfUpload}
                      className="hidden"
                      data-testid="input-pdf-file-female"
                    />
                    <Button
                      onClick={handleUploadClick}
                      disabled={pdfExtractMutation.isPending}
                      variant="default"
                      className="gap-2"
                      data-testid="button-upload-pdf-female"
                    >
                      <Upload className="w-4 h-4" />
                      {pdfExtractMutation.isPending ? 'Extracting...' : 'Upload PDF'}
                    </Button>
                    {pdfFileName && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>{pdfFileName}</span>
                      </div>
                    )}
                  </div>
                  {pdfExtractMutation.isPending && (
                    <Alert>
                      <Sparkles className="w-4 h-4" />
                      <AlertTitle>Processing PDF</AlertTitle>
                      <AlertDescription>
                        AI is extracting lab values from your PDF. This may take a few moments...
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* PDF Review Guidance */}
            {isPdfPendingReview && (
              <Alert data-testid="alert-pdf-review-guidance-female">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Next Steps: Complete Demographics & Menstrual Phase</AlertTitle>
                <AlertDescription>
                  Lab values have been auto-filled from your PDF. To calculate ASCVD cardiovascular risk and get accurate hormone interpretations:
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Enter patient Age, Race, and Systolic Blood Pressure</li>
                    <li>Select current Menstrual Phase (affects hormone reference ranges)</li>
                    <li>Check any applicable boxes (HRT, Birth Control, Risk Factors)</li>
                    <li>Complete STOP-BANG screening questions</li>
                    <li>Click "Interpret Labs" to analyze</li>
                  </ol>
                </AlertDescription>
              </Alert>
            )}

            {/* Lab Input Form */}
            <Card>
              <CardHeader>
                <CardTitle>Enter Lab Values</CardTitle>
                <CardDescription>
                  Enter female patient lab values for interpretation. Reference ranges are adjusted for women.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FemaleLabInputForm
                  key={selectedPatient?.id ?? 'no-patient'}
                  onSubmit={handleSubmit}
                  isLoading={interpretMutation.isPending}
                  initialValues={labValues}
                  onPatientSelect={(patient) => setSelectedPatient(patient)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            {interpretationResult ? (
              <>
                {/* 1. Red Flags */}
                {interpretationResult.redFlags.length > 0 && (
                  <RedFlagAlert redFlags={interpretationResult.redFlags} />
                )}

                {/* 2. Results Table + Detailed Clinical Assessment + AI Synthesis + Follow-up */}
                <ResultsDisplay
                  interpretations={interpretationResult.interpretations}
                  aiRecommendations={interpretationResult.aiRecommendations}
                  recheckWindow={interpretationResult.recheckWindow}
                  redFlags={interpretationResult.redFlags}
                />

                {/* 3. PREVENT Cardiovascular Risk Assessment */}
                {interpretationResult.preventRisk ? (
                  <PreventAssessmentCard preventAssessment={interpretationResult.preventRisk} />
                ) : (
                  <PreventNotCalculatedCard missingFields={interpretationResult.preventMissingFields || []} />
                )}

                {/* 4. Advanced Lipid Marker Risk Adjustment */}
                {interpretationResult.adjustedRisk && (
                  <AdvancedLipidsCard adjustedRiskAssessment={interpretationResult.adjustedRisk} />
                )}

                {/* 5. STOP-BANG Sleep Apnea Screening (only when present) */}
                {interpretationResult.stopBangRisk && (
                  <StopBangCard stopBangRisk={interpretationResult.stopBangRisk} />
                )}

                {/* 6. Hormone Pattern Assessment (Testosterone Patterns + Perimenopause Assessment rows) */}
                <FemaleHormonePatternCard interpretations={interpretationResult.interpretations} />

                {/* 7a. Female Hormone Pattern Recognition — sex-hormone phenotypes only
                    (Menopausal Transition, Estrogen Dominance, Low Androgen / High SHBG) */}
                {interpretationResult.clinicalPhenotypes && (() => {
                  const HORMONE_PHENOTYPE_NAMES = new Set([
                    'Menopausal Transition',
                    'Estrogen Dominance / Impaired Clearance',
                    'Low Androgen Availability / High SHBG Perimenopause',
                  ]);
                  const hormonePhenotypes = interpretationResult.clinicalPhenotypes!.filter(
                    p => HORMONE_PHENOTYPE_NAMES.has(p.name)
                  );
                  return hormonePhenotypes.length > 0 ? (
                    <FemaleHormoneAssessmentCard
                      phenotypes={hormonePhenotypes}
                      title="Female Hormone Pattern Recognition"
                      description="Sex hormone axis patterns — estrogen, progesterone, and androgen dynamics"
                      testId="card-female-hormone-phenotypes"
                    />
                  ) : null;
                })()}

                {/* 7b. Clinical Phenotype Assessment — metabolic & non-hormone phenotypes only */}
                {interpretationResult.clinicalPhenotypes && (() => {
                  const HORMONE_PHENOTYPE_NAMES = new Set([
                    'Menopausal Transition',
                    'Estrogen Dominance / Impaired Clearance',
                    'Low Androgen Availability / High SHBG Perimenopause',
                  ]);
                  const metabolicPhenotypes = interpretationResult.clinicalPhenotypes!.filter(
                    p => !HORMONE_PHENOTYPE_NAMES.has(p.name)
                  );
                  return metabolicPhenotypes.length > 0 ? (
                    <FemaleHormoneAssessmentCard phenotypes={metabolicPhenotypes} />
                  ) : null;
                })()}

                {/* 8. Phenotype Assessment — Insulin Resistance Screening */}
                {interpretationResult.insulinResistance && interpretationResult.insulinResistance.likelihood !== 'none' && (
                  <InsulinResistanceCard insulinResistance={interpretationResult.insulinResistance} />
                )}

                {/* 8b. Cellular Energy / Mito Score */}
                {interpretationResult.mitoScore && (
                  <MitoScoreCard mitoScore={interpretationResult.mitoScore} />
                )}

                {/* 8. Supplement Protocol */}
                <FemaleSupplementModeBadge />
                <SupplementSelector
                  supplements={interpretationResult.supplements || []}
                  selectedNames={selectedSupplementNames}
                  onSelectionChange={setSelectedSupplementNames}
                  customSupplements={customSupplements}
                  onCustomChange={setCustomSupplements}
                />

                {/* 9. Patient Summary */}
                <PatientSummary
                  summary={interpretationResult.patientSummary}
                  labValues={labValues as any}
                />

                {/* 10. SOAP Note */}
                {interpretationResult.soapNote && (
                  <SOAPNote soapNote={interpretationResult.soapNote} />
                )}

                {/* 11. Lab Trend Charts */}
                {selectedPatient && patientLabs && patientLabs.length >= 2 && (
                  <PatientTrendCharts
                    labs={patientLabs}
                    patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                    patientId={selectedPatient.id}
                    gender="female"
                  />
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Sparkles className="w-8 h-8 opacity-30" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">No results yet</p>
                      <p className="text-xs">Enter lab values on the Lab Entry tab and run an interpretation to see results here.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("input")} data-testid="button-go-to-lab-entry-female">
                      Go to Lab Entry
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <SavedInterpretations 
              gender="female" 
              onLoadInterpretation={handleLoadInterpretation}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function FemaleSupplementModeBadge() {
  const { data } = useQuery<{ supplementMode?: string }>({ queryKey: ["/api/preferences/discount"] });
  if (data?.supplementMode !== 'custom_only') return null;
  return (
    <Alert data-testid="alert-supplement-mode-custom-only">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Custom-only supplement mode is active</AlertTitle>
      <AlertDescription>
        Default Metagenics recommendations were intentionally skipped. Only supplements from your custom library are shown. You can switch back any time in Account &rarr; Supplements.
      </AlertDescription>
    </Alert>
  );
}
