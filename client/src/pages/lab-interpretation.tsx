import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Sparkles, AlertCircle, Download, Upload, CheckCircle2, Save, History, Heart } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LabInputForm } from "@/components/lab-input-form";
import { ResultsDisplay } from "@/components/results-display";
import { RedFlagAlert } from "@/components/red-flag-alert";
import { PatientSummary } from "@/components/patient-summary";
import { SavedInterpretations } from "@/components/saved-interpretations";
import { labsApi, type WellnessPlan } from "@/lib/api";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generateMalePatientWellnessPDF } from "@/lib/patient-pdf-export-male";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LabValues, InterpretationResult, FemaleLabValues } from "@shared/schema";

export default function LabInterpretation() {
  const [labValues, setLabValues] = useState<LabValues>({});
  const [interpretationResult, setInterpretationResult] = useState<InterpretationResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>("input");
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [isPdfPendingReview, setIsPdfPendingReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const interpretMutation = useMutation({
    mutationFn: labsApi.interpretLabs,
    onSuccess: (data) => {
      console.log('[Frontend] Interpretation successful:', data);
      setInterpretationResult(data);
      setActiveTab("results");
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
      generateLabReportPDF(labValues, interpretationResult);
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
      const patientName = labValues.patientName || 'Unknown Patient';
      return apiRequest('POST', '/api/saved-interpretations', {
        patientName,
        gender: 'male',
        labValues,
        interpretation: interpretationResult,
        labDate: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-interpretations'] });
      toast({
        title: "Saved",
        description: "Interpretation saved to history.",
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
    if (!labValues.patientName) {
      toast({
        variant: "destructive",
        title: "Patient Name Required",
        description: "Please enter a patient name before saving.",
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
    onSuccess: async (wellnessPlan) => {
      console.log('[Frontend] Male wellness plan generated:', wellnessPlan);
      if (interpretationResult) {
        const patientName = labValues.patientName || undefined;
        await generateMalePatientWellnessPDF(labValues, interpretationResult, wellnessPlan, patientName);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Lab Interpretation Tool</h1>
              <p className="text-sm text-muted-foreground">Men's Hormone & Primary Care Clinic</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/female">
                <Button variant="outline" data-testid="link-to-womens-labs">
                  Switch to Women's Labs
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
        </div>
      </header>

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
                  onSubmit={handleSubmit} 
                  isLoading={interpretMutation.isPending}
                  initialValues={labValues}
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
                />

                {/* Patient Summary */}
                {interpretationResult.patientSummary && (
                  <PatientSummary 
                    summary={interpretationResult.patientSummary}
                    labValues={labValues}
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
