import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface PrescriberCredentials {
  licenseState: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiresAt: string | null;
  deaNumber: string | null;
  deaState: string | null;
  deaExpiresAt: string | null;
  prescribingAuthorized: boolean;
  verifiedAt: string | null;
}

const emptyCredentials: PrescriberCredentials = {
  licenseState: "",
  licenseNumber: "",
  licenseType: "",
  licenseExpiresAt: null,
  deaNumber: null,
  deaState: null,
  deaExpiresAt: null,
  prescribingAuthorized: false,
  verifiedAt: null,
};

export function PrescriberCredentialsSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PrescriberCredentials>(emptyCredentials);

  const { data, isLoading, isError } = useQuery<PrescriberCredentials | null>({
    queryKey: ["/api/prescriber-credentials/me"],
  });

  useEffect(() => {
    if (data !== undefined) {
      setForm({ ...emptyCredentials, ...(data ?? {}) });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        licenseState: form.licenseState.trim().toUpperCase(),
        licenseNumber: form.licenseNumber.trim(),
        licenseType: form.licenseType.trim(),
        licenseExpiresAt: form.licenseExpiresAt || null,
        deaNumber: form.deaNumber?.trim() || null,
        deaState: form.deaState?.trim().toUpperCase() || null,
        deaExpiresAt: form.deaExpiresAt || null,
      };
      return apiRequest("PUT", "/api/prescriber-credentials/me", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/prescriber-credentials/me"],
      });
      toast({ title: "Credentials saved", description: "Verification may be required before prescribing." });
    },
    onError: () => {
      toast({ title: "Unable to save credentials", variant: "destructive" });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading prescribing credentials...</p>;
  if (isError) return <p className="text-sm text-destructive">Unable to load prescribing credentials.</p>;


  const field = (
    label: string,
    key: "licenseState" | "licenseNumber" | "licenseType" |
         "licenseExpiresAt" | "deaNumber" | "deaState" | "deaExpiresAt",
    type = "text"
  ) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => setForm(previous => ({
          ...previous,
          [key]: e.target.value
        }))}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Professional License & Prescribing Credentials</CardTitle>
        <CardDescription>
          Your individual credentials for this clinic.
          Changes may require verification before prescribing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field("License Type (NP, MD, PA, etc.)", "licenseType")}
          {field("License Number", "licenseNumber")}
          {field("License State", "licenseState")}
          {field("License Expiration", "licenseExpiresAt", "date")}
        </div>

        <div className="border-t pt-5">
          <h4 className="font-medium mb-3">DEA Registration (if applicable)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("DEA Number", "deaNumber")}
            {field("DEA Registered State", "deaState")}
            {field("DEA Expiration", "deaExpiresAt", "date")}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Status: {form.prescribingAuthorized && form.verifiedAt
            ? "Verified for prescribing"
            : "Pending verification"}
        </p>

        <Button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving..." : "Save Prescribing Credentials"}
        </Button>
      </CardContent>
    </Card>
  );
}
