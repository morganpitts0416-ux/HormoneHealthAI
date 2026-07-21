import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { labValuesSchema, type LabValues } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, User, Thermometer, Activity, Droplet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface LabInputFormProps {
  onSubmit: (values: LabValues) => void;
  isLoading?: boolean;
  initialValues?: LabValues;
  onPatientSelect?: (patient: any) => void;
}

export function LabInputForm({ onSubmit, isLoading = false, initialValues = {}, onPatientSelect }: LabInputFormProps) {
  // Merge initialValues with default booleans to ensure calculators always receive defined values
  const defaultValues: LabValues = {
    onTRT: false,
    demographics: {
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
      ...initialValues.demographics,
    },
    ...initialValues,
  };

  const form = useForm<LabValues>({
    resolver: zodResolver(labValuesSchema),
    defaultValues,
  });

  // Reset form when initialValues change (e.g., after PDF extraction)
  // Use keepDirtyValues to preserve any fields the user has already edited
  useEffect(() => {
    const mergedValues: LabValues = {
      demographics: {
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
        ...initialValues.demographics,
      },
      ...initialValues,
    };
    // keepDirtyValues: true preserves any fields the user has already changed
    // This prevents wiping demographics when PDF extraction completes
    form.reset(mergedValues, { keepDirtyValues: true });
  }, [initialValues]);

  // Patient name autocomplete
  const watchedPatientName = useWatch({ control: form.control, name: "patientName" }) as string | undefined;
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [patientSelectedFlag, setPatientSelectedFlag] = useState(false);
  const patientNameRef = useRef<HTMLDivElement>(null);
  const searchQuery = (!patientSelectedFlag && (watchedPatientName?.length ?? 0) >= 2) ? (watchedPatientName ?? "") : "";
  const { data: patientSuggestions } = useQuery<any[]>({
    queryKey: ["/api/patients/search", searchQuery],
    enabled: searchQuery.length >= 2,
  });

  // Show dropdown when we have results and haven't yet picked one
  useEffect(() => {
    if (!patientSelectedFlag && (patientSuggestions?.length ?? 0) > 0 && (watchedPatientName?.length ?? 0) >= 2) {
      setShowPatientDropdown(true);
    } else {
      setShowPatientDropdown(false);
    }
  }, [patientSuggestions, watchedPatientName, patientSelectedFlag]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientNameRef.current && !patientNameRef.current.contains(e.target as Node)) {
        setShowPatientDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePatientSuggestionSelect = (patient: any) => {
    const fullName = `${patient.firstName} ${patient.lastName}`;
    form.setValue("patientName", fullName);
    // Auto-fill age from DOB — parse as local time to avoid UTC off-by-one
    if (patient.dateOfBirth) {
      const [y, mo, d] = String(patient.dateOfBirth).split('T')[0].split('-').map(Number);
      const dob = new Date(y, mo - 1, d);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      form.setValue("demographics.age" as any, age);
    }
    // Auto-fill systolic BP and BMI from most recent vitals (no date cutoff —
    // vitals come back newest-first so find() always picks the most recent entry)
    if (patient.id) {
      fetch(`/api/patients/${patient.id}/vitals`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((vitals: any[]) => {
          const bpEntry = vitals.find((v: any) => v.systolicBp != null);
          const bmiEntry = vitals.find((v: any) => v.bmi != null);
          if (bpEntry && !form.getValues("demographics.systolicBP" as any)) {
            form.setValue("demographics.systolicBP" as any, bpEntry.systolicBp);
          }
          if (bmiEntry && !form.getValues("demographics.bmi" as any)) {
            form.setValue("demographics.bmi" as any, parseFloat(bmiEntry.bmi));
          }
        })
        .catch(() => {});
    }
    setPatientSelectedFlag(true);
    setShowPatientDropdown(false);
    if (onPatientSelect) onPatientSelect(patient);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Accordion type="multiple" defaultValue={["demographics", "symptoms", "cbc", "hormones", "lipids", "other", "iron"]} className="space-y-4">
          {/* Patient Demographics & ASCVD Risk Factors */}
          <AccordionItem value="demographics" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-demographics">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="font-semibold">Patient Demographics & Cardiovascular Risk Factors</span>
                <span className="text-xs text-muted-foreground ml-2">(Required for ASCVD risk calculation)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="patientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Patient Name</FormLabel>
                      <div ref={patientNameRef} className="relative">
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="Enter patient name"
                            {...field}
                            value={field.value ?? ''}
                            autoComplete="off"
                            data-testid="input-patient-name"
                            onChange={(e) => {
                              field.onChange(e);
                              setPatientSelectedFlag(false);
                            }}
                          />
                        </FormControl>
                        {showPatientDropdown && patientSuggestions && patientSuggestions.length > 0 && (
                          <Card className="absolute z-50 left-0 right-0 top-full mt-1 shadow-md max-h-48 overflow-y-auto">
                            <CardContent className="p-1">
                              {patientSuggestions.slice(0, 8).map((p: any) => {
                                const age = p.dateOfBirth ? (() => { const [y,mo,d] = String(p.dateOfBirth).split('T')[0].split('-').map(Number); return Math.floor((Date.now() - new Date(y, mo-1, d).getTime()) / (365.25*24*60*60*1000)); })() : null;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); handlePatientSuggestionSelect(p); }}
                                    className="w-full text-left px-3 py-2 text-sm rounded hover-elevate flex items-center gap-2"
                                    data-testid={`option-patient-suggestion-${p.id}`}
                                  >
                                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium">{p.firstName} {p.lastName}</span>
                                    {age !== null && <span className="text-muted-foreground text-xs">({age}y {p.gender})</span>}
                                  </button>
                                );
                              })}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="labDrawDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Lab Draw Date (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ''}
                          data-testid="input-lab-draw-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="demographics.age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Age</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="45"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-age"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">years</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                <FormField
                  control={form.control}
                  name="demographics.systolicBP"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Systolic Blood Pressure</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="120"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-systolic-bp"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mmHg</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.bmi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">BMI (Body Mass Index)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="25.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-bmi"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">kg/m²</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Required for AHA PREVENT cardiovascular risk calculation</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.onBPMeds"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-bp-meds"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">
                          Currently on Blood Pressure Medication
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">Leave unchecked if not on BP meds</p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.diabetic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-diabetic"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">
                          History of Diabetes
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">Leave unchecked if no diabetes</p>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.smoker"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-smoker" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Current Smoker</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.familyHistory"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-family-history" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Family History of Premature CVD</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.onStatins"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-on-statins" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Currently on Statin Therapy</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              {/* STOP-BANG Sleep Apnea Screening */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold mb-4 text-primary">STOP-BANG Sleep Apnea Screening</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="demographics.snoring" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-snoring" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Snoring (loud)</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.tiredness" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-tiredness" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Excessive Daytime Tiredness</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.observedApnea" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-observed-apnea" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Observed Breathing Pauses</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.bmiOver35" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-bmi-over-35" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">BMI &gt; 35 kg/m²</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.neckCircOver40cm" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-neck-circ-over-40" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Neck Circumference &gt; 40 cm</FormLabel>
                    </FormItem>
                  )} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Symptom Assessment */}
          <AccordionItem value="symptoms" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-symptoms">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-orange-500" />
                <span className="font-semibold">Symptom Assessment</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <p className="text-xs text-muted-foreground mb-4">Check any symptoms the patient is currently experiencing. These drive clinical phenotype detection and personalized recommendations.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="lowLibido" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-low-libido" /></FormControl>
                    <FormLabel className="text-xs font-medium">Low Libido</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lowEnergy" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-low-energy" /></FormControl>
                    <FormLabel className="text-xs font-medium">Low Energy / Fatigue</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lowMotivation" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-low-motivation" /></FormControl>
                    <FormLabel className="text-xs font-medium">Low Motivation</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="brainFog" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-brain-fog" /></FormControl>
                    <FormLabel className="text-xs font-medium">Brain Fog</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="moodChanges" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-mood-changes" /></FormControl>
                    <FormLabel className="text-xs font-medium">Mood Changes</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="irritability" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-irritability" /></FormControl>
                    <FormLabel className="text-xs font-medium">Irritability</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="anxiety" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-anxiety" /></FormControl>
                    <FormLabel className="text-xs font-medium">Anxiety</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sleepDisruption" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-sleep-disruption" /></FormControl>
                    <FormLabel className="text-xs font-medium">Sleep Disruption</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="nightSweats" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-night-sweats" /></FormControl>
                    <FormLabel className="text-xs font-medium">Night Sweats</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="hairLoss" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-hair-loss" /></FormControl>
                    <FormLabel className="text-xs font-medium">Hair Loss / Thinning</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="weightGain" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-weight-gain" /></FormControl>
                    <FormLabel className="text-xs font-medium">Weight Gain / Central Adiposity</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="jointAches" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-joint-aches" /></FormControl>
                    <FormLabel className="text-xs font-medium">Joint Aches</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="headaches" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-headaches" /></FormControl>
                    <FormLabel className="text-xs font-medium">Headaches</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="acne" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-acne" /></FormControl>
                    <FormLabel className="text-xs font-medium">Acne</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="bloating" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-bloating" /></FormControl>
                    <FormLabel className="text-xs font-medium">Bloating / GI Issues</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="restlessLegs" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-restless-legs" /></FormControl>
                    <FormLabel className="text-xs font-medium">Restless Legs</FormLabel>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* CBC Panel */}
          <AccordionItem value="cbc" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-cbc">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-chart-1" />
                <span className="font-semibold">Complete Blood Count (CBC)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hemoglobin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Hemoglobin</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="15.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hemoglobin"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">g/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hematocrit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Hematocrit</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="45.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hematocrit"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">%</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mcv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">MCV</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="90"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-mcv"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">fL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">80-100 fL</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* CMP / Liver / Kidney Panel */}
          <AccordionItem value="cmp" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-cmp">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-chart-2" />
                <span className="font-semibold">Metabolic Panel (Liver & Kidney)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ast"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">AST</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="25"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-ast"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">U/L</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="alt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">ALT</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="30"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-alt"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">U/L</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bilirubin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Bilirubin (Total)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.8"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-bilirubin"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="creatinine"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Creatinine</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="1.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-creatinine"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="egfr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">eGFR</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="90"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-egfr"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mL/min</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bun"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">BUN</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="15"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-bun"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Hormone Panel */}
          <AccordionItem value="hormones" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-hormones">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-chart-3" />
                <span className="font-semibold">Hormone Panel</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              {/* TRT Status */}
              <FormField
                control={form.control}
                name="onTRT"
                render={({ field }) => (
                  <FormItem className="mb-4 p-3 rounded-md border flex items-start gap-3" style={{ backgroundColor: "#f5f0e8" }}>
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-on-trt"
                        className="mt-0.5"
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-semibold cursor-pointer" style={{ color: "#2e3a20" }}>
                        Patient is currently on TRT (Testosterone Replacement Therapy)
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Check this if the patient is actively on any form of testosterone therapy (injections, topical, pellets, etc.). This adjusts interpretation thresholds and dose recommendations.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="testosterone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Total Testosterone</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="550"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-testosterone"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estradiol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Estradiol</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="30"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-estradiol"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">pg/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shbg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">SHBG</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="35"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-shbg"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">nmol/L</span>
                      </div>
                      <p className="text-xs text-muted-foreground">25-50 nmol/L optimal</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="freeTestosterone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Calculated Free Testosterone</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="120"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-free-testosterone"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">pg/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimal 120-220 pg/mL</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bioavailableTestosterone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Bioavailable Testosterone</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="180"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-bioavailable-testosterone"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/dL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimal 100-280 ng/dL</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lh"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">LH</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="2.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-lh"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mIU/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prolactin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Prolactin</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="10"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-prolactin"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Lipid Panel */}
          <AccordionItem value="lipids" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-lipids">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-chart-4" />
                <span className="font-semibold">Lipid Panel</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ldl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">LDL Cholesterol</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="100"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-ldl"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hdl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">HDL Cholesterol</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="50"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hdl"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalCholesterol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Total Cholesterol</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="180"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-total-cholesterol"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="triglycerides"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Triglycerides</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="120"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-triglycerides"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Other Labs */}
          <AccordionItem value="other" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-other">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-chart-5" />
                <span className="font-semibold">Other Labs</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tsh"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">TSH</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="2.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-tsh"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mIU/L</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="freeT4"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Free T4</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="1.2"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-free-t4-thyroid"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="freeT3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Free T3</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="3.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-free-t3"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">pg/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimal 3.2-4.2 pg/mL</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalT3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Total T3</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="130"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-total-t3"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalT4"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Total T4</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="8.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-total-t4"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mcg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tpoAntibodies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Anti-TPO Antibodies</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="10"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-tpo-antibodies-male"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">IU/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">&lt;35 negative, &gt;100 Hashimoto's</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="antiTg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Anti-Thyroglobulin</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="10"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-anti-tg-male"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">IU/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">&lt;20 negative, &gt;40 positive</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="a1c"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Hemoglobin A1c</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="5.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-a1c"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">%</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vitaminD"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Vitamin D (25-OH)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="45"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-vitamin-d"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="psa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">PSA</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="1.2"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-psa"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="previousPsa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Previous PSA (Optional)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="1.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-previous-psa"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="monthsSinceLastPsa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Months Since Last PSA</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="12"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-months-since-psa"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">months</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vitaminB12"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Vitamin B12</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="500"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-vitamin-b12"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">pg/mL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="apoB"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">ApoB</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="90"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-apob"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lpa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Lp(a)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="30"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-lpa"
                          />
                        </FormControl>
                        <FormField
                          control={form.control}
                          name="lpaUnit"
                          render={({ field: unitField }) => (
                            <Select value={unitField.value ?? 'nmol/L'} onValueChange={unitField.onChange}>
                              <SelectTrigger className="w-24" data-testid="select-lpa-unit">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="nmol/L">nmol/L</SelectItem>
                                <SelectItem value="mg/dL">mg/dL</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Iron Studies */}
          <AccordionItem value="iron" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-iron">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-orange-500" />
                <span className="font-semibold">Iron Studies</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormField control={form.control} name="ferritin" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Ferritin</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="100" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-ferritin-male" /></FormControl>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Optimal 70-150 ng/mL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="iron" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Iron</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="90" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-iron-male" /></FormControl>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">ug/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal 60-170 ug/dL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tibc" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">TIBC (Iron Binding Cap)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="300" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-tibc-male" /></FormControl>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">ug/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal 250-450 ug/dL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="ironSaturation" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Iron Saturation (TSAT)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="30" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-iron-saturation-male" /></FormControl>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Normal 20-50%</p>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Inflammation Markers */}
          <AccordionItem value="inflammation" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-inflammation">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-yellow-500" />
                <span className="font-semibold">Inflammation &amp; Metabolic Markers</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hsCRP"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">hs-CRP (High-Sensitivity CRP)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="1.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hscrp"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/L</span>
                      </div>
                      <p className="text-xs text-muted-foreground">&lt;1 low risk, 1–3 moderate, &gt;3 high risk</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dheas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">DHEA-S</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="400"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-dheas-male"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mcg/dL</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimal 280-650 mcg/dL (male)</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="homocysteine"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Homocysteine</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="8.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-homocysteine-male"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">µmol/L</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimal &lt;10, elevated &gt;15</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex justify-end pt-4">
          <Button 
            type="submit" 
            size="lg" 
            disabled={isLoading}
            data-testid="button-interpret"
            className="min-w-48"
          >
            {isLoading ? (
              <>
                <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Interpret Labs
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
