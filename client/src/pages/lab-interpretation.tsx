import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Sparkles, AlertCircle, Download, Upload, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LabInputForm } from "@/components/lab-input-form";
import { ResultsDisplay } from "@/components/results-display";
import { RedFlagAlert } from "@/components/red-flag-alert";
import { PatientSummary } from "@/components/patient-summary";
import { labsApi } from "@/lib/api";
import { generateLabReportPDF } from "@/lib/pdf-export";
import { useToast } from "@/hooks/use-toast";
import type { LabValues, InterpretationResult } from "@shared/schema";

export default function LabInterpretation() {
  const [labValues, setLabValues] = useState<LabValues>({});
  const [interpretationResult, setInterpretationResult] = useState<InterpretationResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>("input");
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
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
      setLabValues(prev => ({ ...prev, ...data }));
      toast({
        title: "PDF Extracted Successfully",
        description: "Lab values have been auto-filled. Please review and edit as needed before submitting.",
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
    console.log('[Frontend] Calling interpretMutation.mutate');
    interpretMutation.mutate(values);
  };

  const handleReset = () => {
    setLabValues({});
    setInterpretationResult(null);
    setActiveTab("input");
    setPdfFileName(null);
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
      pdfExtractMutation.mutate(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
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
              {interpretationResult && (
                <>
                  <Button 
                    variant="default" 
                    onClick={handleExportPDF}
                    data-testid="button-export-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
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
          <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-navigation">
            <TabsTrigger value="input" data-testid="tab-input">Lab Entry</TabsTrigger>
            <TabsTrigger value="results" disabled={!interpretationResult} data-testid="tab-results">
              Results & Recommendations
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
