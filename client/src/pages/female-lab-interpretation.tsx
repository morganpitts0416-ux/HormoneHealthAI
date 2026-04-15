import { useState, useRef, useEffect } from "react";
import { usePatientContext } from "@/hooks/use-patient-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Sparkles, AlertCircle, Download, Upload, CheckCircle2, Heart, Save, History, Activity } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FemaleLabInputForm } from "@/components/female-lab-input-form";
import { ResultsDisplay } from "@/components/results-display";
import { RedFlagAlert } from "@/components/red-flag-alert";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalLoading } from "@/hooks/use-global-loading";
import { Link, useSearch } from "wouter";
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
  const [selectedSupplementNames, setSelectedSupplementNames] = useState<Set<string>>(new Set());
  const [customSupplements, setCustomSupplements] = useState<CustomSupplement[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasPrefilledBmiRef = useRef(false);
  const { toast } = useToast();
  const { user } = useAuth();
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
        },
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
        apiRequest('POST', `/api/patients/${resolvedPatient.id}/labs`, {
          labDate,
          labValues,
          interpretationResult: data,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/patients/${resolvedPatient!.id}/labs`] });
          queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
          console.log('[Frontend] Auto-saved interpretation to patient profile');
        }).catch(err => console.error('[Frontend] Auto-save failed:', err));
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
              await apiRequest('POST', `/api/patients/${newPatient.id}/labs`, {
                labDate, labValues, interpretationResult: data,
              });
              queryClient.invalidateQueries({ queryKey: [`/api/patients/${newPatient.id}/labs`] });
              console.log('[Frontend] Auto-created female patient profile and saved labs:', newPatient.id);
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
        await generatePatientWellnessPDF(labValues, interpretationResult, wellnessPlan, patientName, patientLabs, curatedSupplements, user?.clinicName);
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
      generateLabReportPDF(labValues as unknown as LabValues, interpretationResult, selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : undefined, user?.clinicName || "Women's Hormone & Primary Care Clinic", patientLabs);
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
      pdfExtractMutation.mutate(file);
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 z-10" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center">
          <div className="flex items-center justify-between w-full gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-14 sm:h-16 w-auto flex-shrink-0" style={{ mixBlendMode: "multiply" }} />
              <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "#c4b9a5" }} />
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold leading-tight" style={{ color: "#1c2414" }}>Women's Lab Interpretation</h1>
                <p className="text-xs leading-tight" style={{ color: "#7a8a64" }}>Hormone & Primary Care</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" data-testid="link-to-dashboard" style={{ color: "#2e3a20" }} title="Dashboard">
                  <span className="hidden sm:inline">Dashboard</span>
                  <span className="sm:hidden">Home</span>
                </Button>
              </Link>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3" data-testid="tabs-navigation-female">
            <TabsTrigger value="input" data-testid="tab-input-female">Lab Entry</TabsTrigger>
            <TabsTrigger value="results" disabled={!interpretationResult} data-testid="tab-results-female">
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
                  setLabValues({
                    patientName: `${patient.firstName} ${patient.lastName}`,
                    demographics: {
                      ...(patient.dateOfBirth ? { age: calculateAge(patient.dateOfBirth) } : {}),
                    },
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
            {interpretationResult && (
              <>
                {/* Red Flags */}
                {interpretationResult.redFlags.length > 0 && (
                  <RedFlagAlert redFlags={interpretationResult.redFlags} />
                )}

                {/* Results Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Complete Lab Results Overview</CardTitle>
                    <CardDescription>
                      Detailed interpretation of all lab values with female-specific reference ranges
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResultsDisplay 
                      interpretations={interpretationResult.interpretations}
                      aiRecommendations={interpretationResult.aiRecommendations}
                      recheckWindow={interpretationResult.recheckWindow}
                      redFlags={interpretationResult.redFlags}
                      preventAssessment={interpretationResult.preventRisk}
                      adjustedRiskAssessment={interpretationResult.adjustedRisk}
                      insulinResistance={interpretationResult.insulinResistance}
                    />
                  </CardContent>
                </Card>

                {/* Clinical Phenotypes */}
                {interpretationResult.clinicalPhenotypes && interpretationResult.clinicalPhenotypes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-purple-600" />
                        <CardTitle>Clinical Phenotype Assessment</CardTitle>
                      </div>
                      <CardDescription>
                        Detected clinical patterns driving supplement and treatment recommendations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {interpretationResult.clinicalPhenotypes.map((phenotype, index) => (
                          <div 
                            key={index} 
                            className={`p-4 rounded-lg border ${
                              phenotype.confidence === 'high' ? 'border-purple-300 bg-purple-50/50 dark:bg-purple-950/20' :
                              phenotype.confidence === 'moderate' ? 'border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20' :
                              'border-gray-200 bg-gray-50/50 dark:bg-gray-800/30'
                            }`}
                            data-testid={`clinical-phenotype-${index}`}
                          >
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h4 className="font-semibold text-sm">{phenotype.name}</h4>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                phenotype.confidence === 'high' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' :
                                phenotype.confidence === 'moderate' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                              }`}>
                                {phenotype.confidence} confidence
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{phenotype.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {phenotype.supportingFindings.map((finding, fIdx) => (
                                <span key={fIdx} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                  {finding}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Supplement Protocol — Interactive Selector */}
                <SupplementSelector
                  supplements={interpretationResult.supplements || []}
                  selectedNames={selectedSupplementNames}
                  onSelectionChange={setSelectedSupplementNames}
                  customSupplements={customSupplements}
                  onCustomChange={setCustomSupplements}
                />

                {/* Patient Summary */}
                <PatientSummary summary={interpretationResult.patientSummary} labValues={labValues as any} />

                {/* SOAP Note */}
                {interpretationResult.soapNote && (
                  <SOAPNote soapNote={interpretationResult.soapNote} />
                )}

                {/* Lab Trend Charts with AI Narrative */}
                {selectedPatient && patientLabs && patientLabs.length >= 2 && (
                  <PatientTrendCharts
                    labs={patientLabs}
                    patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                    patientId={selectedPatient.id}
                    gender="female"
                  />
                )}

                {/* Recheck Window */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recommended Recheck Window</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-medium">{interpretationResult.recheckWindow}</p>
                  </CardContent>
                </Card>
              </>
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
