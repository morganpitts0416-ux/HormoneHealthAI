import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, CheckCircle2, AlertTriangle, ScrollText } from "lucide-react";

interface BaaStatus {
  signed: boolean;
  signedAt: string | null;
  signatureName: string | null;
  baaVersion: string | null;
}

const BAA_VERSION = "1.0";

// Full BAA text sections — mirrors the content of baa.tsx
const BAA_SECTIONS = [
  {
    title: "Parties",
    body: `This Business Associate Agreement ("BAA") is entered into between ReAlign Health ("Business Associate" or "BA") and the licensed clinician or healthcare organization creating an account on the ClinIQ platform ("Covered Entity" or "CE"), collectively the "Parties."

This BAA is incorporated by reference into and made part of the ClinIQ Terms of Service. By signing below, the CE agrees to the terms of this BAA.`,
  },
  {
    title: "1. Definitions",
    body: `Capitalized terms used but not defined herein shall have the meanings assigned to them in HIPAA, HITECH, and their implementing regulations at 45 C.F.R. Parts 160 and 164.

"Protected Health Information" or "PHI" means any individually identifiable health information transmitted or maintained in any form, as defined in 45 C.F.R. § 160.103.

"Services" means the ClinIQ clinical intelligence platform and related services provided by the Business Associate to the Covered Entity.`,
  },
  {
    title: "2. Obligations of the Business Associate",
    body: `2.1 Use Restrictions: Not use or disclose PHI other than as permitted by this BAA or required by law.
2.2 Safeguards: Use appropriate administrative, physical, and technical safeguards and comply with the HIPAA Security Rule (45 C.F.R. Part 164, Subpart C) with respect to electronic PHI.
2.3 Subcontractors: Enter into written agreements with subcontractors obligating them to equivalent restrictions.
2.4 Breach Notification: Report any Breach of Unsecured PHI without unreasonable delay and no later than 60 days following discovery.
2.5 Access: Provide access to PHI in accordance with 45 C.F.R. § 164.524 upon request.
2.6 Amendment: Make PHI available for amendment pursuant to 45 C.F.R. § 164.526.
2.7 Accounting: Provide accounting of disclosures per 45 C.F.R. § 164.528.
2.8 Government Access: Make internal records relating to PHI available to HHS for compliance determination.
2.9 Minimum Necessary: Request only the minimum amount of PHI necessary.`,
  },
  {
    title: "3. Permitted Uses and Disclosures",
    body: `The BA may use or disclose PHI only:
3.1 To provide the Services, including AI-powered clinical interpretation, SOAP note generation, evidence analysis, and patient portal services.
3.2 For proper management and administration of the BA's business, provided the disclosure is required by law or confidentiality is assured.
3.3 To provide data aggregation services relating to CE healthcare operations per 45 C.F.R. § 164.501.
3.4 As required by law.`,
  },
  {
    title: "4. Obligations of the Covered Entity",
    body: `The Covered Entity agrees to:
4.1 Not request the BA to use or disclose PHI in any manner impermissible under the HIPAA Rules.
4.2 Obtain all necessary patient authorizations prior to entering PHI into the Platform.
4.3 Notify the BA of any limitation in the CE's Notice of Privacy Practices affecting the BA's use of PHI.
4.4 Notify the BA of any changes in or revocation of permission by an individual to use PHI.
4.5 Notify the BA of any restriction on PHI use that the CE has agreed to abide by.
4.6 Maintain appropriate controls over user accounts and access credentials.`,
  },
  {
    title: "5. Term and Termination",
    body: `5.1 Term: This BAA is effective upon account registration and remains in effect for the duration of the CE's active subscription.
5.2 Termination for Cause: Either party may terminate upon written notice if the other party materially breaches any obligation and has not cured the breach within 30 days of written notice.
5.3 Effect of Termination: Upon termination, the BA shall return or destroy all PHI if feasible. If not feasible, the BA shall extend the protections of this BAA to such PHI for the minimum period required by applicable law, following which it shall be securely destroyed.`,
  },
  {
    title: "6. Miscellaneous",
    body: `6.1 Amendment: The Parties agree to amend this BAA to the extent necessary to comply with applicable law, including changes to the HIPAA Rules.
6.2 Interpretation: Any ambiguity shall be resolved to permit the CE to comply with the HIPAA Rules.
6.3 No Third-Party Beneficiaries: Nothing herein creates rights in any third party, including patients.
6.4 Entire Agreement: This BAA, together with the Terms of Service and Privacy Policy, constitutes the entire agreement between the Parties on this subject matter.
6.5 Governing Law: This BAA shall be governed by applicable federal law, including HIPAA.`,
  },
  {
    title: "7. Electronic Acceptance",
    body: `By typing your full legal name and clicking "I Agree & Sign," you agree to be bound by the terms of this Business Associate Agreement. This electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).

ReAlign Health maintains a permanent record of the date, time, IP address, and name associated with each BAA acceptance for HIPAA audit and compliance purposes. You will retain access to a copy of this agreement from your Account page.`,
  },
];

export function BaaGate({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isStaff = !!(user as any)?.isStaff;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [signatureName, setSignatureName] = useState("");
  const [hasScrolled, setHasScrolled] = useState(false);

  const { data: baaStatus, isLoading } = useQuery<BaaStatus>({
    queryKey: ["/api/baa/status"],
    enabled: !isStaff,
  });

  const signMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/baa/sign", { signatureName: name });
      return res.json();
    },
    onSuccess: (data, name) => {
      qc.setQueryData(["/api/baa/status"], {
        signed: true,
        signedAt: data?.signedAt ?? new Date().toISOString(),
        signatureName: name,
        baaVersion: BAA_VERSION,
      });
      qc.invalidateQueries({ queryKey: ["/api/baa/status"] });
      toast({ title: "BAA signed", description: "Your Business Associate Agreement is on file." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to record signature", variant: "destructive" });
    },
  });

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setHasScrolled(true);
    }
  }

  // If the agreement fits without scrolling (tall screens), or once it renders,
  // auto-mark as scrolled so the Sign button isn't permanently disabled.
  useEffect(() => {
    if (baaStatus?.signed || isLoading) return;
    const check = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollHeight <= el.clientHeight + 40) {
        setHasScrolled(true);
      }
    };
    check();
    const t = setTimeout(check, 150);
    window.addEventListener("resize", check);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", check);
    };
  }, [baaStatus?.signed, isLoading]);

  function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!signatureName.trim() || signatureName.trim().length < 2) return;
    signMutation.mutate(signatureName.trim());
  }

  // Staff users inherit their clinician's BAA — no gate, no signing
  if (isStaff) return <>{children}</>;

  // Still loading — render nothing to avoid flash
  if (isLoading) return null;

  // Already signed — render the app normally
  if (baaStatus?.signed) return <>{children}</>;

  // Not signed — show the full-screen BAA gate
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      {/* Header */}
      <div className="flex-none border-b px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" style={{ color: "#5a7040" }} />
          <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>HIPAA Business Associate Agreement</span>
        </div>
        <div className="ml-auto">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#e8f0de", color: "#3a5020" }}>
            Required before accessing ClinIQ
          </span>
        </div>
      </div>

      {/* Notice */}
      <div className="flex-none px-4 py-2.5 flex items-start gap-2 text-xs border-b" style={{ backgroundColor: "#fff8e1", borderColor: "#f0d080", color: "#5a4a20" }}>
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#c07800" }} />
        <span>
          <strong>Legal Review Notice:</strong> This template has been provided for use with the ClinIQ platform. Please review carefully. By signing below you confirm you have read and agree to all terms.
        </span>
      </div>

      {/* Scrollable BAA body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <ScrollText className="h-5 w-5" style={{ color: "#5a7040" }} />
            <h1 className="text-xl font-bold" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              Business Associate Agreement
            </h1>
          </div>
          <p className="text-xs" style={{ color: "#7a8a64" }}>
            ReAlign Health ClinIQ · Version {BAA_VERSION} · Effective upon signing
          </p>

          {BAA_SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-sm font-semibold mb-2" style={{ color: "#2e3a20" }}>{section.title}</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#3d4a30" }}>
                {section.body}
              </p>
            </div>
          ))}

          <div className="pt-2 pb-1 border-t text-xs text-center" style={{ borderColor: "#e8ddd0", color: "#9aaa84" }}>
            HIPAA Compliance Inquiries: hipaa@realignhealth.com
          </div>
        </div>
      </div>

      {/* Signature panel — fixed at bottom */}
      <div className="flex-none border-t px-4 py-4" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <form onSubmit={handleSign} className="max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="sig-name" className="text-sm font-medium" style={{ color: "#1c2414" }}>
                Type your full legal name to sign
              </Label>
              <Input
                id="sig-name"
                data-testid="input-baa-signature"
                placeholder="Your full legal name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                style={{ fontFamily: "cursive", fontSize: "15px" }}
                autoComplete="name"
              />
              {!hasScrolled && (
                <p className="text-xs" style={{ color: "#9aaa84" }}>
                  Please scroll through the full agreement before signing.
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={!hasScrolled || signatureName.trim().length < 2 || signMutation.isPending}
              data-testid="button-sign-baa"
              className="sm:w-auto w-full"
            >
              {signMutation.isPending ? (
                "Recording…"
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  I Agree &amp; Sign
                </>
              )}
            </Button>
          </div>
          <p className="text-xs mt-2" style={{ color: "#9aaa84" }}>
            By signing, you agree to the BAA on behalf of yourself and any healthcare organization you represent.
            Your name, timestamp, and IP address will be recorded for HIPAA compliance.
          </p>
        </form>
      </div>
    </div>
  );
}
