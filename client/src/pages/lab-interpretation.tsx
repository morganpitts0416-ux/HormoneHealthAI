import { useState, useRef, useEffect } from "react";
import { usePatientContext } from "@/hooks/use-patient-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Sparkles, AlertCircle, Download, Upload, CheckCircle2, Save, History, Heart } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LabInputForm } from "@/components/lab-input-form";
import { ResultsDisplay } from "@/components/results-display";
import { RedFlagAlert } from "@/components/red-flag-alert";
import { PatientSummary } from "@/components/patient-summary";
import { SOAPNote } from "@/components/soap-note";
import { SavedInterpretations } from "@/components/saved-interpretations";
import { PatientSelector } from "@/components/patient-selector";
import { PatientHistory } from "@/components/patient-history";
import { PatientTrendCharts } from "@/components/patient-trend-charts";
import { SupplementSelector, type CustomSupplement } from "@/components/supplement-selector";
import { labsApi, type WellnessPlan } from "@/lib/api";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generateMalePatientWellnessPDF } from "@/lib/patient-pdf-export-male";
import { useClinicBrandingPartial } from "@/hooks/use-clinic-branding";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalLoading } from "@/hooks/use-global-loading";
import { Link, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LabValues, InterpretationResult, FemaleLabValues, Patient, LabResult } from "@shared/schema";

function calculateAge(dateOfBirth: Date | string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function LabInterpretation() {
  const search = useSearch();
  const initialPatientId = new URLSearchParams(search).get('patientId');

  const [labValues, setLabValues] = useState<LabValues>({});
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
  const clinicBranding = useClinicBrandingPartial();
  const { setLoading: setGlobalLoading, clearLoading: clearGlobalLoading } = useGlobalLoading();

  const { data: patientLabs } = useQuery<LabResult[]>({
    queryKey: ['/api/patients', selectedPatient?.id, 'labs'],
    enabled: !!selectedPatient?.id,
  });

  // Pre-fill BMI from most recent lab result once patientLabs load
  useEffect(() => {
    if (!selectedPatient || !patientLabs || hasPrefilledBmiRef.current) return;
    const lastBmi = patientLabs.length > 0
      ? (patientLabs[0].labValues as LabValues)?.demographics?.bmi
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
    mutationFn: (data: LabValues) => {
      const payload = selectedPatient ? { ...data, patientId: selectedPatient.id } : data;
      return labsApi.interpretLabs(payload);
    },
    onMutate: () => { setGlobalLoading("Evaluating lab results…"); },
    onSettled: () => { clearGlobalLoading(); },
    onSuccess: async (data) => {
      console.log('[Frontend] Interpretation successful:', data);
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
            const createRes = await apiRequest('POST', '/api/patients', { firstName, lastName, gender: 'male' });
            if (createRes.ok) {
              const newPatient = await createRes.json();
              setSelectedPatient(newPatient);
              queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
              await apiRequest('POST', `/api/patients/${newPatient.id}/labs`, {
                labDate, labValues, interpretationResult: data,
              });
              queryClient.invalidateQueries({ queryKey: [`/api/patients/${newPatient.id}/labs`] });
              console.log('[Frontend] Auto-created patient profile and saved labs:', newPatient.id);
            } else {
              // Fallback to saved-interpretations
              await apiRequest('POST', '/api/saved-interpretations', { patientName: labValues.patientName, gender: 'male', labValues, interpretation: data, labDate });
              queryClient.invalidateQueries({ queryKey: ['/api/saved-interpretations'] });
            }
          } catch (e) {
            console.error('[Frontend] Auto-create patient failed:', e);
          }
        })();
      }
    },
    onError: (error) => {
      console.error('[Frontend] Interpretation error:', error);
    },
  });

  const pdfExtractMutation = useMutation({
    mutationFn: labsApi.extractPdfLabs,
    onSuccess: (data) => {
      console.log('[Frontend] PDF extraction successful:', data);
      // Use functional update to preserve any demographics user has already entered
      setLabValues(prev => {
        const merged = { ...prev, ...data };
        // Safely merge demographics with schema defaults to satisfy TypeScript
        // Start with defaults, then overlay prev (user entries), then data (PDF extraction)
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
        description: "Lab values filled. Please enter patient demographics and STOP-BANG data, then click 'Interpret Labs'.",
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

  const handleSubmit = (values: LabValues) => {
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
      generateLabReportPDF(labValues, interpretationResult, selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : undefined, user?.clinicName, patientLabs, clinicBranding);
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
        gender: 'male',
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

  const wellnessPlanMutation = useMutation({
    mutationFn: () => {
      if (!interpretationResult) throw new Error('No interpretation result');
      return labsApi.generateWellnessPlan(
        labValues,
        interpretationResult.interpretations,
        interpretationResult.supplements,
        interpretationResult.preventRisk
      );
    },
    onMutate: () => { setGlobalLoading("Generating patient report…"); },
    onSettled: () => { clearGlobalLoading(); },
    onSuccess: async (wellnessPlan) => {
      console.log('[Frontend] Male wellness plan generated:', wellnessPlan);
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
        await generateMalePatientWellnessPDF(labValues, interpretationResult, wellnessPlan, patientName, patientLabs, curatedSupplements, user?.clinicName);
        toast({
          title: "Patient Report Generated",
          description: "The personalized wellness report has been downloaded.",
        });
      }
    },
    onError: (error) => {
      console.error('[Frontend] Male wellness plan error:', error);
      toast({
        variant: "destructive",
        title: "Report Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate wellness plan",
      });
    },
  });

  const handlePatientReport = () => {
    if (interpretationResult) {
      wellnessPlanMutation.mutate();
    }
  };

  const handleLoadInterpretation = (loadedLabValues: LabValues | FemaleLabValues, loadedInterpretation: InterpretationResult) => {
    setLabValues(loadedLabValues as LabValues);
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
          <h1 className="text-sm font-semibold" style={{ color: "#1c2414" }}>Men's Lab Interpretation</h1>
          <span className="text-xs hidden sm:inline" style={{ color: "#7a8a64" }}>Hormone &amp; Primary Care</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          <Link href="/patients">
            <Button variant="outline" size="sm" data-testid="link-to-patient-profiles" title="Patient Profiles">
              <span className="hidden sm:inline">Patient Profiles</span>
              <span className="sm:hidden">Patients</span>
            </Button>
          </Link>
          <Link href="/female">
            <Button variant="outline" size="sm" data-testid="link-to-womens-labs" title="Switch to Women's Labs">
              <span className="hidden sm:inline">Switch to Women's Labs</span>
              <span className="sm:hidden">Women's</span>
            </Button>
          </Link>
              {interpretationResult && (
                <>
                  <Button 
                    variant="default" 
                    onClick={handlePatientReport}
                    disabled={wellnessPlanMutation.isPending}
                    data-testid="button-patient-report"
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    {wellnessPlanMutation.isPending ? 'Generating...' : 'Patient Report'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-interpretation"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleExportPDF}
                    data-testid="button-export-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Provider PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleReset}
                    data-testid="button-reset"
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
          <TabsList className="grid w-full max-w-lg grid-cols-3" data-testid="tabs-navigation">
            <TabsTrigger value="input" data-testid="tab-input">Lab Entry</TabsTrigger>
            <TabsTrigger value="results" disabled={!interpretationResult} data-testid="tab-results">
              Results
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="w-4 h-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="space-y-6">
            {/* Patient Selector */}
            <PatientSelector
              gender="male"
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
                  Upload a Pathgroup or hospital lab report PDF. AI will automatically extract and fill in lab values for you to review.
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
                      data-testid="input-pdf-file"
                    />
                    <Button
                      onClick={handleUploadClick}
                      disabled={pdfExtractMutation.isPending}
                      variant="default"
                      className="gap-2"
                      data-testid="button-upload-pdf"
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
              <Alert data-testid="alert-pdf-review-guidance">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Next Steps: Complete Demographics & STOP-BANG</AlertTitle>
                <AlertDescription>
                  Lab values have been auto-filled from your PDF. To calculate ASCVD cardiovascular risk and STOP-BANG sleep apnea screening:
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Open the "Patient Demographics & Cardiovascular Risk Factors" section below</li>
                    <li>Enter age, sex, race, blood pressure, and risk factors (diabetes, smoking, BP medications)</li>
                    <li>Complete the STOP-BANG Sleep Apnea Screening checkboxes</li>
                    <li>Review auto-filled lab values and click "Interpret Labs"</li>
                  </ol>
                </AlertDescription>
              </Alert>
            )}

            {/* Manual Entry Form */}
            <Card>
              <CardHeader>
                <CardTitle>Enter or Review Lab Values</CardTitle>
                <CardDescription>
                  {pdfFileName 
                    ? 'Review the auto-filled values below and make any necessary corrections.'
                    : 'Input the lab results from the standard men\'s clinic panel. Leave fields blank if not available.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LabInputForm
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
                {/* Red Flags - Most Prominent */}
                {interpretationResult.redFlags?.length > 0 && (
                  <RedFlagAlert redFlags={interpretationResult.redFlags} />
                )}

                {/* Lab Results */}
                <ResultsDisplay 
                  interpretations={interpretationResult.interpretations || []}
                  aiRecommendations={interpretationResult.aiRecommendations || ''}
                  recheckWindow={interpretationResult.recheckWindow || ''}
                  redFlags={interpretationResult.redFlags || []}
                  ascvdAssessment={interpretationResult.ascvdRisk || null}
                  preventAssessment={interpretationResult.preventRisk}
                  adjustedRiskAssessment={interpretationResult.adjustedRisk}
                  insulinResistance={interpretationResult.insulinResistance}
                />

                {/* Supplement Protocol — Interactive Selector */}
                <SupplementModeBadge />
                <SupplementSelector
                  supplements={interpretationResult.supplements || []}
                  selectedNames={selectedSupplementNames}
                  onSelectionChange={setSelectedSupplementNames}
                  customSupplements={customSupplements}
                  onCustomChange={setCustomSupplements}
                />

                {/* Patient Summary */}
                {interpretationResult.patientSummary && (
                  <PatientSummary 
                    summary={interpretationResult.patientSummary}
                    labValues={labValues}
                  />
                )}

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
                    gender="male"
                  />
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <p>No interpretation results yet. Enter lab values to get started.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <SavedInterpretations 
              gender="male" 
              onLoadInterpretation={handleLoadInterpretation}
            />
          </TabsContent>
        </Tabs>

        {/* Loading State */}
        {interpretMutation.isPending && (
          <Card className="mt-6">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <Sparkles className="w-12 h-12 text-primary animate-pulse" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Analyzing Lab Results...</h3>
                  <p className="text-sm text-muted-foreground">
                    Applying clinical protocols and generating AI-powered recommendations
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {interpretMutation.isError && (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle>Interpretation Failed</AlertTitle>
            <AlertDescription>
              {interpretMutation.error instanceof Error 
                ? interpretMutation.error.message 
                : "Failed to interpret lab results. Please try again or contact support if the problem persists."}
            </AlertDescription>
            <Button 
              onClick={() => interpretMutation.reset()} 
              variant="outline" 
              className="mt-4"
              data-testid="button-retry"
            >
              Try Again
            </Button>
          </Alert>
        )}
      </main>
    </div>
  );
}

function SupplementModeBadge() {
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
