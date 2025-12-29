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
import { Sparkles, User, Heart, Droplet, Activity, TestTube } from "lucide-react";

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
      snoring: false,
      tiredness: false,
      observedApnea: false,
      bmiOver35: false,
      neckCircOver40cm: false,
      ...initialValues.demographics,
    },
    onHRT: false,
    onBirthControl: false,
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
        snoring: false,
        tiredness: false,
        observedApnea: false,
        bmiOver35: false,
        neckCircOver40cm: false,
        ...initialValues.demographics,
      },
      onHRT: false,
      onBirthControl: false,
      ...initialValues,
    };
    form.reset(mergedValues, { keepDirtyValues: true });
  }, [initialValues]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Accordion type="multiple" defaultValue={["demographics", "menstrual", "hormones", "cbc", "thyroid", "lipids", "vitamins"]} className="space-y-4">
          
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
                  name="demographics.onBPMeds"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-bp-meds-female"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">On Blood Pressure Medication</FormLabel>
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
                          data-testid="checkbox-diabetic-female"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">History of Diabetes</FormLabel>
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
                          data-testid="checkbox-smoker-female"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">Current Smoker</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {/* STOP-BANG Sleep Apnea Screening */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold mb-4 text-primary">STOP-BANG Sleep Apnea Screening</h4>
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
                            data-testid="checkbox-snoring-female"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">Snoring (loud)</FormLabel>
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
                            data-testid="checkbox-tiredness-female"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">Excessive Daytime Tiredness</FormLabel>
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
                            data-testid="checkbox-observed-apnea-female"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">Observed Breathing Pauses</FormLabel>
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
                            data-testid="checkbox-bmi-over-35-female"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">BMI &gt; 35 kg/m²</FormLabel>
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
                            data-testid="checkbox-neck-circ-female"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-xs font-medium uppercase">Neck Circumference &gt; 40 cm</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <p className="text-xs text-muted-foreground mt-1">Hormone reference ranges vary by cycle phase</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="onHRT"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-hrt"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">On Hormone Replacement Therapy (HRT)</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="onBirthControl"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-birth-control"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-xs font-medium uppercase">On Hormonal Birth Control</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Female Hormones */}
          <AccordionItem value="hormones" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-hormones-female">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" />
                <span className="font-semibold">Female Hormones</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            step="0.1"
                            placeholder="100"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-estradiol-female"
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
                  name="progesterone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Progesterone</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="10"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-progesterone"
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
                  name="fsh"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">FSH</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="7"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-fsh"
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
                  name="lh"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">LH</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-lh-female"
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
                            placeholder="15"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-prolactin-female"
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
                  name="testosterone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Testosterone (Total)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="30"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-testosterone-female"
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
                  name="dheas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">DHEA-S</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="200"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-dheas"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">µg/dL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amh"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">AMH (Anti-Mullerian Hormone)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="2.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-amh"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Ovarian reserve marker</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* CBC - Female Ranges */}
          <AccordionItem value="cbc" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-cbc-female">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-red-500" />
                <span className="font-semibold">Complete Blood Count (CBC)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            placeholder="13.5"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hemoglobin-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">g/dL</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Female range: 12-16 g/dL</p>
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
                            placeholder="40"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hematocrit-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Female range: 36-44%</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wbc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">WBC</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="7"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-wbc-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">K/µL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="platelets"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Platelets</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="250"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-platelets-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">K/µL</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            data-testid="input-tsh-female"
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
                  name="freeT3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Free T3</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="3.0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-free-t3"
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
                  name="tpoAntibodies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">TPO Antibodies</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="10"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-tpo-antibodies"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">IU/mL</span>
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
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-lipids-female">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="font-semibold">Lipid Panel</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-total-cholesterol-female"
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
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-ldl-female"
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
                            placeholder="55"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-hdl-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Female optimal: &gt;50 mg/dL</p>
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
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-triglycerides-female"
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

          {/* Vitamins & Iron */}
          <AccordionItem value="vitamins" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-vitamins">
              <div className="flex items-center gap-2">
                <TestTube className="w-4 h-4 text-green-500" />
                <span className="font-semibold">Vitamins & Iron Status</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="ferritin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Ferritin</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="50"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-ferritin"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Optimal: 30-150 ng/mL</p>
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
                            step="1"
                            placeholder="40"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-vitamin-d"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">ng/mL</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Optimal: 30-80 ng/mL</p>
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
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Metabolic Panel */}
          <AccordionItem value="metabolic" className="border rounded-md px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-metabolic-female">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-orange-500" />
                <span className="font-semibold">Metabolic Panel</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="glucose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Glucose (Fasting)</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="1"
                            placeholder="90"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-glucose-female"
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
                  name="a1c"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Hemoglobin A1c</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="5.4"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-a1c-female"
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
                  name="creatinine"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase">Creatinine</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.9"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-creatinine-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">mg/dL</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Female range: ≤1.0 mg/dL</p>
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
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-egfr-female"
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
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-ast-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">U/L</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Female range: &lt;32 U/L</p>
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
                            placeholder="22"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value ?? ''}
                            data-testid="input-alt-female"
                          />
                        </FormControl>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">U/L</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Female range: &lt;32 U/L</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button
          type="submit"
          className="w-full gap-2"
          disabled={isLoading}
          data-testid="button-interpret-labs-female"
        >
          <Sparkles className="w-4 h-4" />
          {isLoading ? 'Interpreting Labs...' : 'Interpret Labs'}
        </Button>
      </form>
    </Form>
  );
}
