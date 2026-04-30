import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Loader2,
  Pill,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";

interface PortalMe {
  patientId: number;
  firstName?: string;
  lastName?: string;
  preferredPharmacy?: string | null;
}

interface ChartMedication {
  id: string;
  name: string;
  source: "patient_chart";
}

interface PatientReportedMedication {
  id: string;
  rowId: number;
  name: string;
  dose: string | null;
  frequency: string | null;
  type: "medication" | "supplement";
  source: "patient_reported";
}

interface MedicationsResponse {
  chartMedications: ChartMedication[];
  patientReported: PatientReportedMedication[];
}

interface NewMedDraft {
  key: string;
  name: string;
  dose: string;
  frequency: string;
}

function makeKey(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PortalRefillRequest() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me, error: meError } = useQuery<PortalMe>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  useEffect(() => {
    if (meError) setLocation("/portal/login");
  }, [meError, setLocation]);

  const { data: medsData, isLoading: medsLoading } = useQuery<MedicationsResponse>({
    queryKey: ["/api/portal/tracking/medications"],
    enabled: !!me,
  });

  // Build a unified list of "currently on the chart" medications. Both the
  // clinician-entered chart meds and the patient-reported meds the patient
  // has previously logged are reasonable things to refill, so show both.
  const chartItems = medsData?.chartMedications ?? [];
  const reportedMedItems = (medsData?.patientReported ?? []).filter(
    (m) => m.type === "medication",
  );

  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [newMeds, setNewMeds] = useState<NewMedDraft[]>([]);
  const [pharmacyNote, setPharmacyNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggleSelected = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const addNewMedRow = () => {
    setNewMeds((prev) => [...prev, { key: makeKey(), name: "", dose: "", frequency: "" }]);
  };

  const updateNewMed = (key: string, field: "name" | "dose" | "frequency", value: string) => {
    setNewMeds((prev) => prev.map((m) => (m.key === key ? { ...m, [field]: value } : m)));
  };

  const removeNewMed = (key: string) => {
    setNewMeds((prev) => prev.filter((m) => m.key !== key));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const cleanedNew = newMeds
        .map((m) => ({
          name: m.name.trim(),
          dose: m.dose.trim(),
          frequency: m.frequency.trim(),
        }))
        .filter((m) => m.name.length > 0);

      const body = {
        chartMedications: Array.from(selectedNames),
        newMedications: cleanedNew,
        pharmacyNote: pharmacyNote.trim(),
      };
      return apiRequest("POST", "/api/portal/refill-request", body);
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/messages"] });
      toast({
        title: "Refill request sent",
        description: "Your care team will review it shortly.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not send refill request",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const cleanedNewCount = newMeds.filter((m) => m.name.trim().length > 0).length;
  const canSubmit =
    !submitMutation.isPending && (selectedNames.size > 0 || cleanedNewCount > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    submitMutation.mutate();
  };

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fbf8f2" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#5a7040" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fbf8f2" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{ backgroundColor: "#ffffff", borderColor: "#ede8df" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/portal/dashboard">
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-back-to-dashboard"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#edf4e4" }}
            >
              <Pill className="w-4 h-4" style={{ color: "#2e3a20" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight truncate" style={{ color: "#1c2414" }}>
                Request a medication refill
              </h1>
              <p className="text-xs" style={{ color: "#7a8a64" }}>
                Sent to your care team for review
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24">
        {submitted ? (
          <SuccessPanel onSendAnother={() => {
            setSelectedNames(new Set());
            setNewMeds([]);
            setPharmacyNote("");
            setSubmitted(false);
          }} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-refill-request">
            {/* Current medications section */}
            <section
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
            >
              <div className="px-4 sm:px-5 py-4 border-b" style={{ borderColor: "#f1ede4" }}>
                <h2 className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                  Your current medications
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                  Check the boxes for any you'd like refilled.
                </p>
              </div>

              <div className="px-4 sm:px-5 py-2">
                {medsLoading ? (
                  <div className="py-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#5a7040" }} />
                  </div>
                ) : chartItems.length === 0 && reportedMedItems.length === 0 ? (
                  <p className="py-6 text-sm" style={{ color: "#7a8a64" }} data-testid="text-no-current-meds">
                    No medications on file yet. You can still add a refill request for a medication below.
                  </p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: "#f1ede4" }}>
                    {chartItems.map((m) => {
                      const checked = selectedNames.has(m.name);
                      return (
                        <li key={m.id} className="py-3">
                          <label
                            className="flex items-start gap-3 cursor-pointer"
                            data-testid={`row-chart-med-${m.id}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleSelected(m.name)}
                              data-testid={`checkbox-chart-med-${m.id}`}
                              className="mt-0.5"
                            />
                            <span className="text-sm leading-snug" style={{ color: "#1c2414" }} data-testid={`text-chart-med-${m.id}`}>
                              {m.name}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {reportedMedItems.map((m) => {
                      const checked = selectedNames.has(m.name);
                      const detail = [m.dose, m.frequency].filter(Boolean).join(" · ");
                      return (
                        <li key={m.id} className="py-3">
                          <label
                            className="flex items-start gap-3 cursor-pointer"
                            data-testid={`row-reported-med-${m.id}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleSelected(m.name)}
                              data-testid={`checkbox-reported-med-${m.id}`}
                              className="mt-0.5"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm leading-snug" style={{ color: "#1c2414" }} data-testid={`text-reported-med-${m.id}`}>
                                {m.name}
                              </span>
                              {detail && (
                                <span className="block text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                                  {detail}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Add another medication */}
            <section
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
            >
              <div className="px-4 sm:px-5 py-4 border-b" style={{ borderColor: "#f1ede4" }}>
                <h2 className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                  Other medications
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                  Need a refill on something not listed above? Add it here.
                </p>
              </div>

              <div className="px-4 sm:px-5 py-4 space-y-4">
                {newMeds.map((m, idx) => (
                  <div
                    key={m.key}
                    className="rounded-xl p-3 sm:p-4 space-y-3"
                    style={{ backgroundColor: "#fbf8f2", border: "1px solid #f1ede4" }}
                    data-testid={`row-new-med-${idx}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold" style={{ color: "#7a8a64", letterSpacing: "0.06em" }}>
                        MEDICATION {idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewMed(m.key)}
                        data-testid={`button-remove-new-med-${idx}`}
                        aria-label="Remove medication"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`new-med-name-${m.key}`} className="text-xs" style={{ color: "#1c2414" }}>
                        Medication name
                      </Label>
                      <Input
                        id={`new-med-name-${m.key}`}
                        value={m.name}
                        onChange={(e) => updateNewMed(m.key, "name", e.target.value)}
                        placeholder="e.g. Levothyroxine"
                        data-testid={`input-new-med-name-${idx}`}
                        autoComplete="off"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`new-med-dose-${m.key}`} className="text-xs" style={{ color: "#1c2414" }}>
                          Dose
                        </Label>
                        <Input
                          id={`new-med-dose-${m.key}`}
                          value={m.dose}
                          onChange={(e) => updateNewMed(m.key, "dose", e.target.value)}
                          placeholder="e.g. 50 mcg"
                          data-testid={`input-new-med-dose-${idx}`}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`new-med-frequency-${m.key}`} className="text-xs" style={{ color: "#1c2414" }}>
                          Frequency
                        </Label>
                        <Input
                          id={`new-med-frequency-${m.key}`}
                          value={m.frequency}
                          onChange={(e) => updateNewMed(m.key, "frequency", e.target.value)}
                          placeholder="e.g. once daily"
                          data-testid={`input-new-med-frequency-${idx}`}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addNewMedRow}
                  className="w-full"
                  data-testid="button-add-new-med"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add medication
                </Button>
              </div>
            </section>

            {/* Pharmacy / notes */}
            <section
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
            >
              <div className="px-4 sm:px-5 py-4 border-b" style={{ borderColor: "#f1ede4" }}>
                <h2 className="text-sm font-semibold" style={{ color: "#1c2414" }}>
                  Notes for your care team
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                  Optional. Mention your preferred pharmacy or anything else they should know.
                </p>
              </div>
              <div className="px-4 sm:px-5 py-4">
                <Textarea
                  value={pharmacyNote}
                  onChange={(e) => setPharmacyNote(e.target.value)}
                  placeholder={
                    me?.preferredPharmacy
                      ? `Send to ${me.preferredPharmacy}, or specify a different pharmacy here.`
                      : "Pharmacy name & location, or any special instructions."
                  }
                  rows={3}
                  data-testid="input-pharmacy-note"
                  maxLength={1000}
                />
              </div>
            </section>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/portal/dashboard">
                <Button type="button" variant="ghost" data-testid="button-cancel-refill">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={!canSubmit}
                data-testid="button-submit-refill"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>Send refill request</>
                )}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function SuccessPanel({ onSendAnother }: { onSendAnother: () => void }) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 text-center"
      style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}
      data-testid="panel-refill-success"
    >
      <div
        className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3"
        style={{ backgroundColor: "#edf4e4" }}
      >
        <CheckCircle2 className="w-6 h-6" style={{ color: "#2e7d32" }} />
      </div>
      <h2 className="text-base font-semibold" style={{ color: "#1c2414" }}>
        Your refill request was sent
      </h2>
      <p className="text-sm mt-1" style={{ color: "#7a8a64" }}>
        Your care team will review it and follow up. You'll see any reply in your messages.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-5">
        <Link href="/portal/dashboard">
          <Button variant="outline" data-testid="button-back-home">
            Back to home
          </Button>
        </Link>
        <Button onClick={onSendAnother} data-testid="button-send-another-refill">
          Send another refill request
        </Button>
      </div>
    </div>
  );
}
