import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { labValuesSchema, type LabValues } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, User } from "lucide-react";

interface LabInputFormProps {
  onSubmit: (values: LabValues) => void;
  isLoading?: boolean;
  initialValues?: LabValues;
}

export function LabInputForm({ onSubmit, isLoading = false, initialValues = {} }: LabInputFormProps) {
  // Merge initialValues with default booleans to ensure calculators always receive defined values
  const defaultValues: LabValues = {
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Accordion type="multiple" defaultValue={["demographics", "cbc", "hormones", "lipids", "other"]} className="space-y-4">
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
                    <FormItem className="md:col-span-2">
                      <FormLabel className="text-xs font-medium uppercase">Patient Name</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Enter patient name"
                          {...field}
                          value={field.value ?? ''}
                          data-testid="input-patient-name"
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
                  name="demographics.sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Sex</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-sex">
                            <SelectValue placeholder="Select sex" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.race"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Race</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-race">
                            <SelectValue placeholder="Select race" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="white">White</SelectItem>
                          <SelectItem value="african_american">African American</SelectItem>
                          <SelectItem value="other">Other (uses White equation)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Note: "Other" uses the non-Black pooled cohort equation</p>
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
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-smoker"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">
                          Current Smoker
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">Leave unchecked if non-smoker</p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {/* STOP-BANG Sleep Apnea Screening */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold mb-4 text-primary">STOP-BANG Sleep Apnea Screening</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Optional screening for obstructive sleep apnea risk. Age, sex, and blood pressure are already captured above.
                </p>
                
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="demographics.snoring"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-snoring"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">
                            Snoring (loud enough to be heard through closed door)
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">Leave unchecked if no loud snoring</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="demographics.tiredness"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-tiredness"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">
                            Tiredness (excessive daytime sleepiness or fatigue)
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">Leave unchecked if no excessive tiredness</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="demographics.observedApnea"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-observed-apnea"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">
                            Observed Apnea (witnessed breathing pauses during sleep)
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">Leave unchecked if no witnessed apneas</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="demographics.bmiOver35"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-bmi-over-35"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">
                            BMI Greater Than 35 kg/m²
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">Leave unchecked if BMI ≤35</p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="demographics.neckCircOver40cm"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-neck-circ-over-40"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">
                            Neck Circumference Greater Than 40cm (16 inches)
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">Leave unchecked if neck circumference ≤40cm</p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
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
                            data-testid="input-free-t4"
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
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
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
