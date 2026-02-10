import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Sparkles, AlertCircle, Download, Upload, CheckCircle2, Heart, Save, History } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FemaleLabInputForm } from "@/components/female-lab-input-form";
import { ResultsDisplay } from "@/components/results-display";
import { RedFlagAlert } from "@/components/red-flag-alert";
import { PatientSummary } from "@/components/patient-summary";
import { SavedInterpretations } from "@/components/saved-interpretations";
import { femaleLabsApi, type WellnessPlan } from "@/lib/api";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { generatePatientWellnessPDF } from "@/lib/patient-pdf-export";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FemaleLabValues, InterpretationResult, LabValues } from "@shared/schema";

export default function FemaleLabInterpretation() {
  const [labValues, setLabValues] = useState<FemaleLabValues>({});
  const [interpretationResult, setInterpretationResult] = useState<InterpretationResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>("input");
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [isPdfPendingReview, setIsPdfPendingReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const interpretMutation = useMutation({
    mutationFn: femaleLabsApi.interpretLabs,
    onSuccess: (data) => {
      console.log('[Frontend] Female interpretation successful:', data);
      setInterpretationResult(data);
      setActiveTab("results");
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
    onSuccess: async (wellnessPlan) => {
      console.log('[Frontend] Wellness plan generated:', wellnessPlan);
      if (interpretationResult) {
        const patientName = labValues.patientName || undefined;
        await generatePatientWellnessPDF(labValues, interpretationResult, wellnessPlan, patientName);
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
      generateLabReportPDF(labValues as unknown as LabValues, interpretationResult, undefined, "Women's Hormone & Primary Care Clinic");
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
      const patientName = labValues.patientName || 'Unknown Patient';
      return apiRequest('POST', '/api/saved-interpretations', {
        patientName,
        gender: 'female',
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

  const handleLoadInterpretation = (loadedLabValues: LabValues | FemaleLabValues, loadedInterpretation: InterpretationResult) => {
    setLabValues(loadedLabValues as FemaleLabValues);
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
              <p className="text-sm text-muted-foreground">Women's Hormone & Primary Care Clinic</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline" data-testid="link-to-mens-labs">
                  Switch to Men's Labs
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
                  onSubmit={handleSubmit}
                  isLoading={interpretMutation.isPending}
                  initialValues={labValues}
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
                    />
                  </CardContent>
                </Card>

                {/* Supplement Recommendations */}
                {interpretationResult.supplements && interpretationResult.supplements.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <CardTitle>Supplement Recommendations</CardTitle>
                      </div>
                      <CardDescription>
                        Personalized supplement suggestions based on lab results
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {interpretationResult.supplements.map((supp, index) => (
                          <div 
                            key={index} 
                            className={`p-4 rounded-lg border ${
                              supp.priority === 'high' ? 'border-red-200 bg-red-50/50' :
                              supp.priority === 'medium' ? 'border-amber-200 bg-amber-50/50' :
                              'border-gray-200 bg-gray-50/50'
                            }`}
                            data-testid={`supplement-recommendation-${index}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-base">{supp.name}</h4>
                                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                                    supp.priority === 'high' ? 'bg-red-100 text-red-700' :
                                    supp.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {supp.priority} priority
                                  </span>
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                                    {supp.category}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-primary mb-1">
                                  Dose: {supp.dose}
                                </p>
                                <p className="text-sm text-muted-foreground mb-1">
                                  <span className="font-medium">Indication:</span> {supp.indication}
                                </p>
                                <p className="text-sm text-muted-foreground mb-1">
                                  {supp.rationale}
                                </p>
                                {supp.caution && (
                                  <p className="text-sm text-amber-700 mt-2 flex items-start gap-1">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span><span className="font-medium">Caution:</span> {supp.caution}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Patient Summary */}
                <PatientSummary summary={interpretationResult.patientSummary} labValues={labValues as any} />

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
