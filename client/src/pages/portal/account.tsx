import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PortalShell } from "@/components/portal/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FileText, Stethoscope, ChevronRight, Loader2 } from "lucide-react";
import { PharmacyLookup, pharmacyValueFromRecord, pharmacyValueToPatch, type PharmacyLookupValue } from "@/components/pharmacy-lookup";
import { PharmacyDisplay } from "@/components/pharmacy-display";

interface PortalMe {
  patientId: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  preferredPharmacy?: string | null;
  pharmacyName?: string | null;
  pharmacyAddress?: string | null;
  pharmacyPhone?: string | null;
  pharmacyFax?: string | null;
  pharmacyNcpdpId?: string | null;
  pharmacyPlaceId?: string | null;
  clinicName?: string;
}

interface PortalDocument {
  kind: "form" | "visit";
  id: string;
  name: string;
  category: string;
  submittedAt: string;
  viewUrl: string;
}

const accountSchema = z.object({
  phone: z.string().trim().max(40, "Too long").optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});
type AccountFormValues = z.infer<typeof accountSchema>;

export default function PortalAccount() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery<PortalMe>({
    queryKey: ["/api/portal/me"],
    retry: false,
  });

  const { data: docsResp, isLoading: docsLoading } = useQuery<{ documents: PortalDocument[] }>({
    queryKey: ["/api/portal/account/documents"],
    retry: false,
  });

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { phone: "", email: "" },
  });

  // Pharmacy lives outside react-hook-form because it's a structured value
  // (PharmacyLookupValue). We track its initial snapshot so we can detect a
  // dirty change and enable the Save button accordingly.
  const [pharmacy, setPharmacy] = useState<PharmacyLookupValue>({ text: "", details: null });
  const [pharmacyInitial, setPharmacyInitial] = useState<PharmacyLookupValue>({ text: "", details: null });

  useEffect(() => {
    if (me) {
      form.reset({
        phone: me.phone ?? "",
        email: me.email ?? "",
      });
      const initial = pharmacyValueFromRecord(me);
      setPharmacy(initial);
      setPharmacyInitial(initial);
    }
  }, [me, form]);

  const pharmacyDirty =
    pharmacy.text.trim() !== pharmacyInitial.text.trim() ||
    (pharmacy.details?.pharmacyPlaceId ?? null) !== (pharmacyInitial.details?.pharmacyPlaceId ?? null);

  const updateMutation = useMutation({
    mutationFn: async (values: AccountFormValues & { pharmacy: PharmacyLookupValue }) => {
      const { pharmacy: pharm, ...rest } = values;
      const body = { ...rest, ...pharmacyValueToPatch(pharm) };
      return apiRequest("PATCH", "/api/portal/account", body);
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Your contact info is up to date." });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/me"] });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Couldn't save",
        description: err?.message || "Please try again in a moment.",
      });
    },
  });

  const onSubmit = (values: AccountFormValues) => updateMutation.mutate({ ...values, pharmacy });

  return (
    <PortalShell activeTab="home" headerSubtitle="Account">
      {/* Contact & pharmacy card */}
      <section
        className="rounded-2xl border p-5 sm:p-6"
        style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }}
        data-testid="card-account-contact"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "#1c2414" }}>Contact &amp; Pharmacy</h2>
          <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>
            Keep these current so your care team can reach you and send prescriptions to the right place.
          </p>
        </div>

        {meLoading ? (
          <div className="space-y-3">
            <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
            <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
            <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: "#1c2414" }}>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        {...field}
                        data-testid="input-account-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: "#1c2414" }}>Phone</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="(555) 123-4567"
                        {...field}
                        data-testid="input-account-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-1.5">
                <Label htmlFor="account-pharmacy" style={{ color: "#1c2414" }}>Preferred pharmacy</Label>
                <PharmacyLookup
                  inputId="account-pharmacy"
                  value={pharmacy}
                  onChange={setPharmacy}
                  placeholder="Search pharmacy by name or city"
                />
                {pharmacy.details?.pharmacyName && (
                  <div className="pt-1">
                    <PharmacyDisplay
                      pharmacyName={pharmacy.details.pharmacyName}
                      pharmacyAddress={pharmacy.details.pharmacyAddress}
                      pharmacyPhone={pharmacy.details.pharmacyPhone}
                      pharmacyFax={pharmacy.details.pharmacyFax}
                      pharmacyNcpdpId={pharmacy.details.pharmacyNcpdpId}
                      variant="inline"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending || (!form.formState.isDirty && !pharmacyDirty)}
                  data-testid="button-account-save"
                  style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {me?.clinicName && (
          <div
            className="mt-6 pt-4 border-t flex items-center gap-2 text-xs"
            style={{ borderColor: "#ede8df", color: "#7a8a64" }}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            Care provided by <span className="font-medium" style={{ color: "#1c2414" }}>{me.clinicName}</span>
          </div>
        )}
      </section>

      {/* Signed documents */}
      <section
        className="rounded-2xl border p-5 sm:p-6"
        style={{ borderColor: "#e8ddd0", backgroundColor: "#ffffff" }}
        data-testid="card-account-documents"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "#1c2414" }}>My Signed Documents</h2>
          <p className="text-xs mt-1" style={{ color: "#7a8a64" }}>
            Forms you've signed and visit summaries your care team has shared with you.
          </p>
        </div>

        {docsLoading ? (
          <div className="space-y-2">
            <div className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
            <div className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: "#f0ece2" }} />
          </div>
        ) : !docsResp?.documents?.length ? (
          <div
            className="rounded-xl border p-5 text-center"
            style={{ borderColor: "#ede8df", borderStyle: "dashed", color: "#7a8a64" }}
            data-testid="text-account-documents-empty"
          >
            <FileText className="w-5 h-5 mx-auto mb-2" style={{ color: "#a0a880" }} />
            <p className="text-sm">No signed documents yet.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {docsResp.documents.map((doc) => (
              <li key={doc.id}>
                <Link href={doc.viewUrl}>
                  <a
                    className="flex items-center gap-3 rounded-xl border p-3.5 hover-elevate"
                    style={{ borderColor: "#ede8df", backgroundColor: "#fffbf3" }}
                    data-testid={`link-document-${doc.id}`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: doc.kind === "visit" ? "#edf4e4" : "#f5f0e3" }}
                    >
                      {doc.kind === "visit" ? (
                        <Stethoscope className="w-4 h-4" style={{ color: "#2e3a20" }} />
                      ) : (
                        <FileText className="w-4 h-4" style={{ color: "#5a7040" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#1c2414" }}>
                        {doc.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
                        {doc.submittedAt
                          ? new Date(doc.submittedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : ""}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "#a0a880" }} />
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PortalShell>
  );
}
