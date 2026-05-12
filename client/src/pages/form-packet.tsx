import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PacketFormEntry {
  publicToken: string;
  formName: string;
  completed: boolean;
}

interface PacketData {
  packetToken: string;
  bundleName: string;
  forms: PacketFormEntry[];
  prefill: Record<string, string | null> | null;
  returnUrl: string | null;
  status: string;
}

function buildPrefillParams(prefill: Record<string, string | null> | null): string {
  if (!prefill) return "";
  const p = new URLSearchParams();
  if (prefill.firstName)   p.set("pf_fn",    prefill.firstName);
  if (prefill.lastName)    p.set("pf_ln",    prefill.lastName);
  if (prefill.dateOfBirth) p.set("pf_dob",   prefill.dateOfBirth);
  if (prefill.email)       p.set("pf_email", prefill.email);
  if (prefill.phone)       p.set("pf_phone", prefill.phone);
  return p.toString();
}

export default function FormPacketPage() {
  const params = useParams<{ token: string }>();
  const packetToken = params.token;
  const [currentStep, setCurrentStep] = useState(0);
  const [allDone, setAllDone] = useState(false);

  const { data, isLoading, error } = useQuery<PacketData>({
    queryKey: ["/api/packets/public", packetToken],
    queryFn: () =>
      fetch(`/api/packets/public/${packetToken}`).then(async r => {
        if (!r.ok) throw new Error((await r.json()).message ?? "Packet not found");
        return r.json();
      }),
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    if (data.status === "completed") { setAllDone(true); return; }
    const firstIncomplete = data.forms.findIndex(f => !f.completed);
    if (firstIncomplete === -1) { setAllDone(true); return; }
    setCurrentStep(firstIncomplete);
  }, [data]);

  const advanceMutation = useMutation({
    mutationFn: (completedToken: string) =>
      fetch(`/api/packets/public/${packetToken}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedToken }),
      }).then(r => r.json()),
  });

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "cliniq-packet-form-done") return;
      if (!data) return;
      const form = data.forms[currentStep];
      if (!form) return;
      advanceMutation.mutate(form.publicToken, {
        onSuccess: () => {
          const next = currentStep + 1;
          if (next >= data.forms.length) setAllDone(true);
          else setCurrentStep(next);
        },
      });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [data, currentStep]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading packet...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2 max-w-sm px-4">
          <p className="font-semibold text-destructive">Packet not found</p>
          <p className="text-sm text-muted-foreground">
            This link may have expired or all forms have already been completed.
          </p>
        </div>
      </div>
    );
  }

  if (allDone || data.status === "completed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-7 p-8 text-center bg-background">
        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-7">
          <CheckCircle2 className="h-14 w-14 text-green-600 dark:text-green-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Packet Complete!</h1>
          <p className="text-muted-foreground max-w-xs mx-auto">
            All {data.forms.length} form{data.forms.length !== 1 ? "s" : ""} in{" "}
            <strong>{data.bundleName}</strong> have been submitted.
          </p>
        </div>
        <div className="rounded-xl border bg-muted/40 px-8 py-5 max-w-sm w-full space-y-1.5">
          <p className="text-sm font-semibold">Hand device back to clinic staff</p>
          <p className="text-xs text-muted-foreground">
            This screen will remain until a staff member dismisses it.
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            if (data.returnUrl) window.location.href = data.returnUrl;
            else window.close();
          }}
          data-testid="button-packet-close"
        >
          Close (Staff Only)
        </Button>
      </div>
    );
  }

  const currentForm = data.forms[currentStep];
  const prefillQs = buildPrefillParams(data.prefill);
  const iframeSrc = `/f/${currentForm.publicToken}?embed=1&pkt=${packetToken}${prefillQs ? "&" + prefillQs : ""}`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">{data.bundleName}</p>
              <p className="text-sm font-semibold leading-tight truncate">{currentForm.formName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex gap-1 items-center">
              {data.forms.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all ${
                    i < currentStep
                      ? "h-2 w-2 bg-green-500"
                      : i === currentStep
                      ? "h-2.5 w-2.5 bg-primary"
                      : "h-2 w-2 bg-muted-foreground/25"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentStep + 1} / {data.forms.length}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <iframe
          key={currentStep}
          src={iframeSrc}
          title={currentForm.formName}
          className="w-full border-0 block"
          style={{ minHeight: "calc(100vh - 57px)" }}
        />
      </div>
    </div>
  );
}
