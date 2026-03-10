import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { femaleLabValuesSchema, type FemaleLabValues } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, User, Heart, Droplet, Activity, TestTube, Beaker, Thermometer } from "lucide-react";

interface FemaleLabInputFormProps {
  onSubmit: (values: FemaleLabValues) => void;
  isLoading?: boolean;
  initialValues?: FemaleLabValues;
}

export function FemaleLabInputForm({ onSubmit, isLoading = false, initialValues = {} }: FemaleLabInputFormProps) {
  const defaultValues: FemaleLabValues = {
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
    onHRT: false,
    onBirthControl: false,
    hotFlashes: false,
    nightSweats: false,
    vaginalDryness: false,
    frequentUTIs: false,
    jointAches: false,
    sleepDisruption: false,
    lowLibido: false,
    lowEnergy: false,
    lowMotivation: false,
    acne: false,
    pmsSymptoms: false,
    irritability: false,
    headaches: false,
    heavyMenses: false,
    bloating: false,
    hairLoss: false,
    restlessLegs: false,
    anxiety: false,
    weightGain: false,
    moodChanges: false,
    brainFog: false,
    ...initialValues,
  };

  const form = useForm<FemaleLabValues>({
    resolver: zodResolver(femaleLabValuesSchema),
    defaultValues,
  });

  useEffect(() => {
    const mergedValues: FemaleLabValues = {
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
      onHRT: false,
      onBirthControl: false,
      hotFlashes: false,
      nightSweats: false,
      vaginalDryness: false,
      frequentUTIs: false,
      jointAches: false,
      sleepDisruption: false,
      lowLibido: false,
      lowEnergy: false,
      lowMotivation: false,
      acne: false,
      pmsSymptoms: false,
      irritability: false,
      headaches: false,
      heavyMenses: false,
      bloating: false,
      hairLoss: false,
      restlessLegs: false,
      anxiety: false,
      weightGain: false,
      moodChanges: false,
      brainFog: false,
      ...initialValues,
    };
    form.reset(mergedValues, { keepDirtyValues: true });
  }, [initialValues]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Accordion type="multiple" defaultValue={["demographics", "menstrual", "symptoms", "cbc", "cmp", "lipids", "thyroid", "hormones", "iron", "vitamins", "inflammation"]} className="space-y-4">
          
          {/* Patient Demographics & ASCVD Risk Factors */}
          <AccordionItem value="demographics" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-demographics-female">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="font-semibold">Patient Demographics & Cardiovascular Risk Factors</span>
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
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Enter patient name"
                          {...field}
                          value={field.value ?? ''}
                          data-testid="input-patient-name-female"
                        />
                      </FormControl>
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
                          data-testid="input-lab-draw-date-female"
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
                            data-testid="input-age-female"
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
                  name="demographics.race"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Race</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-race-female">
                            <SelectValue placeholder="Select race" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="white">White</SelectItem>
                          <SelectItem value="african_american">African American</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
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
                            data-testid="input-systolic-bp-female"
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
                            data-testid="input-bmi-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">kg/m²</span>
                      </div>
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
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-bp-meds-female" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">On Blood Pressure Medication</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.diabetic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-diabetic-female" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">History of Diabetes</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.smoker"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-smoker-female" />
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
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-family-history-female" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Family Hx Premature ASCVD</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="demographics.onStatins"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-on-statins-female" />
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
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-snoring-female" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Snoring (loud)</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.tiredness" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-tiredness-female" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Excessive Daytime Tiredness</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.observedApnea" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-observed-apnea-female" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Observed Breathing Pauses</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.bmiOver35" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-bmi-over-35-female" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">BMI &gt; 35 kg/m²</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="demographics.neckCircOver40cm" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-neck-circ-female" /></FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Neck Circumference &gt; 40 cm</FormLabel>
                    </FormItem>
                  )} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Menstrual/Hormonal Context */}
          <AccordionItem value="menstrual" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-menstrual">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" />
                <span className="font-semibold">Menstrual & Hormonal Context</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="menstrualPhase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Menstrual Phase</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-menstrual-phase">
                            <SelectValue placeholder="Select phase" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="follicular">Follicular (Day 1-14)</SelectItem>
                          <SelectItem value="ovulatory">Ovulatory (Day 14-16)</SelectItem>
                          <SelectItem value="luteal">Luteal (Day 16-28)</SelectItem>
                          <SelectItem value="postmenopausal">Postmenopausal</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Hormone ranges vary by phase</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="onHRT" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-hrt" /></FormControl>
                    <FormLabel className="text-xs font-medium uppercase">On HRT</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="onBirthControl" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-birth-control" /></FormControl>
                    <FormLabel className="text-xs font-medium uppercase">On Birth Control</FormLabel>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Symptom Assessment - For hormone pattern detection in women 35+ */}
          <AccordionItem value="symptoms" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-symptoms-female">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-orange-500" />
                <span className="font-semibold">Symptom Assessment</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <p className="text-xs text-muted-foreground mb-4">Check any symptoms the patient is currently experiencing. These drive clinical phenotype detection and personalized supplement recommendations.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="hotFlashes" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-hot-flashes" /></FormControl>
                    <FormLabel className="text-xs font-medium">Hot Flashes</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="nightSweats" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-night-sweats" /></FormControl>
                    <FormLabel className="text-xs font-medium">Night Sweats</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sleepDisruption" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-sleep-disruption" /></FormControl>
                    <FormLabel className="text-xs font-medium">Sleep Disruption</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="vaginalDryness" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-vaginal-dryness" /></FormControl>
                    <FormLabel className="text-xs font-medium">Vaginal Dryness</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="frequentUTIs" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-frequent-utis" /></FormControl>
                    <FormLabel className="text-xs font-medium">Frequent UTIs</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="jointAches" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-joint-aches" /></FormControl>
                    <FormLabel className="text-xs font-medium">Joint Aches</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lowLibido" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-low-libido" /></FormControl>
                    <FormLabel className="text-xs font-medium">Low Libido</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lowEnergy" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-low-energy" /></FormControl>
                    <FormLabel className="text-xs font-medium">Low Energy</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lowMotivation" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-low-motivation" /></FormControl>
                    <FormLabel className="text-xs font-medium">Low Motivation</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="moodChanges" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-mood-changes" /></FormControl>
                    <FormLabel className="text-xs font-medium">Mood Changes</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="anxiety" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-anxiety" /></FormControl>
                    <FormLabel className="text-xs font-medium">Anxiety</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="irritability" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-irritability" /></FormControl>
                    <FormLabel className="text-xs font-medium">Irritability</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="brainFog" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-brain-fog" /></FormControl>
                    <FormLabel className="text-xs font-medium">Brain Fog</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="headaches" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-headaches" /></FormControl>
                    <FormLabel className="text-xs font-medium">Headaches</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="pmsSymptoms" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-pms-symptoms" /></FormControl>
                    <FormLabel className="text-xs font-medium">PMS Symptoms</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="heavyMenses" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-heavy-menses" /></FormControl>
                    <FormLabel className="text-xs font-medium">Heavy Menses</FormLabel>
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
                <FormField control={form.control} name="hairLoss" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-hair-loss" /></FormControl>
                    <FormLabel className="text-xs font-medium">Hair Loss</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="restlessLegs" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-restless-legs" /></FormControl>
                    <FormLabel className="text-xs font-medium">Restless Legs</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="weightGain" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl><Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-weight-gain" /></FormControl>
                    <FormLabel className="text-xs font-medium">Weight Gain / Central Adiposity</FormLabel>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* CBC - Complete Blood Count */}
          <AccordionItem value="cbc" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-cbc-female">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-red-500" />
                <span className="font-semibold">CBC (Complete Blood Count)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="hemoglobin" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Hemoglobin</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="13.5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-hemoglobin-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">g/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">12-16 g/dL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="hematocrit" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Hematocrit</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="40" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-hematocrit-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">36-44%</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="rbc" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">RBC</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.01" placeholder="4.5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-rbc-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">M/uL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="wbc" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">WBC</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="7" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-wbc-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">K/uL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="platelets" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Platelets</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="250" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-platelets-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">K/uL</span>
                    </div>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* CMP - Comprehensive Metabolic Panel */}
          <AccordionItem value="cmp" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-cmp-female">
              <div className="flex items-center gap-2">
                <Beaker className="w-4 h-4 text-blue-500" />
                <span className="font-semibold">CMP (Comprehensive Metabolic Panel)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="glucose" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Glucose (Fasting)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="90" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-glucose-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="bun" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">BUN</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="15" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-bun-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="creatinine" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Creatinine</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="0.9" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-creatinine-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="egfr" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">eGFR</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="90" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-egfr-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mL/min</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sodium" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Sodium</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="140" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-sodium-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mEq/L</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="potassium" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Potassium</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="4.0" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-potassium-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mEq/L</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="chloride" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Chloride</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="100" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-chloride-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mEq/L</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="co2" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">CO2</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="24" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-co2-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mEq/L</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="calcium" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Calcium</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="9.5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-calcium-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="albumin" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Albumin</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="4.0" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-albumin-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">g/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="totalProtein" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Total Protein</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="7.0" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-total-protein-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">g/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="bilirubin" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Bilirubin (Total)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="0.8" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-bilirubin-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="ast" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">AST</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="25" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-ast-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">U/L</span>
                    </div>
                    <p className="text-xs text-muted-foreground">&lt;32 U/L</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="alt" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">ALT</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="22" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-alt-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">U/L</span>
                    </div>
                    <p className="text-xs text-muted-foreground">&lt;32 U/L</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="a1c" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Hemoglobin A1c</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="5.4" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-a1c-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Lipid Panel */}
          <AccordionItem value="lipids" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-lipids-female">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="font-semibold">Lipid Panel</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="totalCholesterol" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Total Cholesterol</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="180" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-total-cholesterol-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="ldl" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">LDL Cholesterol</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="100" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-ldl-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="hdl" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">HDL Cholesterol</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="55" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-hdl-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">&gt;50 mg/dL optimal</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="triglycerides" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Triglycerides</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="120" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-triglycerides-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="apoB" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Apo B</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="90" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-apob-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">&lt;90 mg/dL optimal</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lpa" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Lp(a)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="30" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-lpa-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">&lt;50 mg/dL optimal</p>
                  </FormItem>
                )} />
              </div>
              
              {/* CAC Score and CV Assessment */}
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-semibold mb-4 text-primary">Cardiovascular Assessment</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="cacScore" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">CAC Score (if available)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl><Input type="number" step="1" placeholder="0" {...field} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-cac-score" /></FormControl>
                        <span className="text-sm text-muted-foreground">Agatston</span>
                      </div>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="knownASCVD" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-known-ascvd" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Known ASCVD</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="statinHesitant" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="checkbox-statin-hesitant" />
                      </FormControl>
                      <FormLabel className="text-xs font-medium uppercase">Hesitant About Statin</FormLabel>
                    </FormItem>
                  )} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Thyroid Panel */}
          <AccordionItem value="thyroid" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-thyroid">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <span className="font-semibold">Thyroid Panel</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="tsh" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">TSH</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.01" placeholder="2.5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-tsh-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mIU/L</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="freeT4" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Free T4</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.01" placeholder="1.2" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-free-t4" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="freeT3" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Free T3</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.01" placeholder="3.0" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-free-t3" /></FormControl>
                      <span className="text-sm text-muted-foreground">pg/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tpoAntibodies" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">TPO Antibodies</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="10" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-tpo-antibodies" /></FormControl>
                      <span className="text-sm text-muted-foreground">IU/mL</span>
                    </div>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Female Hormones */}
          <AccordionItem value="hormones" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-hormones-female">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" />
                <span className="font-semibold">Hormones</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="fsh" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">FSH</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="7" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-fsh" /></FormControl>
                      <span className="text-sm text-muted-foreground">mIU/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="estradiol" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Estradiol</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="100" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-estradiol-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">pg/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="progesterone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Progesterone</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="10" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-progesterone" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="testosterone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Testosterone (Total)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="30" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-testosterone-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">15-70 ng/dL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="shbg" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">SHBG</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="60" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-shbg-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">nmol/L</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Sex Hormone Binding Globulin (24-122 nmol/L)</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="freeTestosterone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Free Testosterone</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.01" placeholder="1.5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-free-testosterone-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">pg/mL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Calculated (0.5-5.0 pg/mL)</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="bioavailableTestosterone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Bioavailable Testosterone</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-bioavailable-testosterone-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/dL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">2-10 ng/dL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="lh" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">LH</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-lh-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">mIU/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="prolactin" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Prolactin</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="15" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-prolactin-female" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="dheas" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">DHEA-S</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="200" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-dheas" /></FormControl>
                      <span className="text-sm text-muted-foreground">ug/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="amh" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">AMH</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="2.5" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-amh" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/mL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Ovarian reserve</p>
                  </FormItem>
                )} />
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="ferritin" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Ferritin</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="50" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-ferritin" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/mL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">30-150 ng/mL optimal</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="iron" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Iron</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="80" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-iron" /></FormControl>
                      <span className="text-sm text-muted-foreground">ug/dL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tibc" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">TIBC (Iron Binding Capacity)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="300" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-tibc" /></FormControl>
                      <span className="text-sm text-muted-foreground">ug/dL</span>
                    </div>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Vitamins */}
          <AccordionItem value="vitamins" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-vitamins">
              <div className="flex items-center gap-2">
                <TestTube className="w-4 h-4 text-green-500" />
                <span className="font-semibold">Vitamins</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="vitaminD" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Vitamin D (25-OH)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="40" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-vitamin-d" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/mL</span>
                    </div>
                    <p className="text-xs text-muted-foreground">30-80 ng/mL</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="vitaminB12" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Vitamin B12</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="1" placeholder="500" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-vitamin-b12" /></FormControl>
                      <span className="text-sm text-muted-foreground">pg/mL</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="folate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">Folate</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="10" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-folate" /></FormControl>
                      <span className="text-sm text-muted-foreground">ng/mL</span>
                    </div>
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
                <span className="font-semibold">Inflammation Markers</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="hsCRP" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium uppercase">hs-CRP (High-Sensitivity CRP)</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl><Input type="number" step="0.1" placeholder="1.0" {...field} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ''} data-testid="input-hscrp" /></FormControl>
                      <span className="text-sm text-muted-foreground">mg/L</span>
                    </div>
                    <p className="text-xs text-muted-foreground">&lt;1 low risk, 1-3 moderate, &gt;3 high risk</p>
                  </FormItem>
                )} />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button type="submit" className="w-full gap-2" disabled={isLoading} data-testid="button-interpret-labs-female">
          <Sparkles className="w-4 h-4" />
          {isLoading ? 'Interpreting Labs...' : 'Interpret Labs'}
        </Button>
      </form>
    </Form>
  );
}
