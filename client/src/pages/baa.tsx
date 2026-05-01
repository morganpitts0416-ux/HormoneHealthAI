import { Link } from "wouter";
import { Shield, ChevronLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3" style={{ color: "#1c2414" }}>{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "#3d4a30" }}>
        {children}
      </div>
    </section>
  );
}

export default function BusinessAssociateAgreement() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: "#5a7040" }} />
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Business Associate Agreement</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <img src="/cliniq-logo.png?v=2" alt="ClinIQ" className="h-7 w-auto" />
            <span className="text-sm font-bold" style={{ color: "#1c2414" }}>ClinIQ</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Business Associate Agreement</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed flex gap-2" style={{ backgroundColor: "#fff8e1", color: "#5a4a20", border: "1px solid #f0d080" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#c07800" }} />
            <span><strong>Legal Review Required:</strong> This Business Associate Agreement is a template provided for informational purposes. It should be reviewed and customized by a qualified healthcare attorney licensed in your jurisdiction before being relied upon. The presence of this document does not constitute legal advice.</span>
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "#1c2414" }}>Parties</p>
            <p className="text-sm" style={{ color: "#3d4a30" }}>
              This Business Associate Agreement ("BAA") is entered into between <strong>ReAlign Health</strong> ("Business Associate" or "BA") and the licensed clinician or healthcare organization creating an account on the ClinIQ platform ("Covered Entity" or "CE"), collectively the "Parties."
            </p>
            <p className="text-sm mt-2" style={{ color: "#3d4a30" }}>
              This BAA is incorporated by reference into and made part of the ClinIQ Terms of Service. By accepting the Terms of Service at registration, the CE agrees to the terms of this BAA.
            </p>
          </div>

          <Section title="1. Definitions">
            <p>Capitalized terms used but not defined herein shall have the meanings assigned to them in the Health Insurance Portability and Accountability Act of 1996 ("HIPAA"), the Health Information Technology for Economic and Clinical Health Act ("HITECH"), and their implementing regulations at 45 C.F.R. Parts 160 and 164 (collectively, the "HIPAA Rules"), as amended.</p>
            <p><strong>"Protected Health Information" or "PHI"</strong> means any individually identifiable health information that is transmitted or maintained in any form or medium, as defined in 45 C.F.R. § 160.103.</p>
            <p><strong>"Services"</strong> means the ClinIQ clinical intelligence platform and related services provided by the Business Associate to the Covered Entity under the Terms of Service.</p>
          </Section>

          <Section title="2. Obligations of the Business Associate">
            <p>The Business Associate agrees to:</p>
            <p><strong>2.1 Use Restrictions:</strong> Not use or disclose PHI other than as permitted or required by this BAA or as required by law. PHI will be used by the BA solely to provide the Services and for the BA's proper management and administration.</p>
            <p><strong>2.2 Safeguards:</strong> Use appropriate administrative, physical, and technical safeguards to prevent use or disclosure of PHI other than as provided for in this BAA, and to comply with the HIPAA Security Rule (45 C.F.R. Part 164, Subpart C) with respect to electronic PHI.</p>
            <p><strong>2.3 Subcontractors:</strong> Enter into a written agreement with any subcontractors that create, receive, maintain, or transmit PHI on behalf of the BA, obligating the subcontractor to equivalent restrictions and conditions as apply to the BA.</p>
            <p><strong>2.4 Breach Notification:</strong> Report to the CE, without unreasonable delay and in no case later than 60 days following discovery, any Breach of Unsecured PHI, as defined in 45 C.F.R. § 164.402, that the BA becomes aware of.</p>
            <p><strong>2.5 Access:</strong> To the extent the BA maintains a Designated Record Set on behalf of the CE, provide access to PHI in accordance with 45 C.F.R. § 164.524 upon request by the CE or an individual.</p>
            <p><strong>2.6 Amendment:</strong> Make PHI available for amendment and incorporate any amendments pursuant to 45 C.F.R. § 164.526 upon direction from the CE.</p>
            <p><strong>2.7 Accounting:</strong> Make available information required to provide an accounting of disclosures of PHI in accordance with 45 C.F.R. § 164.528.</p>
            <p><strong>2.8 Government Access:</strong> Make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary of the U.S. Department of Health and Human Services for purposes of determining the CE's and BA's compliance with the HIPAA Rules.</p>
            <p><strong>2.9 Minimum Necessary:</strong> To the extent practicable, request only the minimum amount of PHI necessary to accomplish the purpose of the request.</p>
          </Section>

          <Section title="3. Permitted Uses and Disclosures">
            <p>The BA may use or disclose PHI only as follows:</p>
            <p><strong>3.1</strong> To provide the Services described in the Terms of Service, including AI-powered clinical interpretation, SOAP note generation, evidence analysis, and patient portal services.</p>
            <p><strong>3.2</strong> For the proper management and administration of the BA's business, provided that (a) the disclosure is required by law, or (b) the BA obtains reasonable assurances from the recipient that it will be held confidentially and used only for the purpose disclosed.</p>
            <p><strong>3.3</strong> To provide data aggregation services relating to the healthcare operations of the CE, as that term is defined at 45 C.F.R. § 164.501.</p>
            <p><strong>3.4</strong> As required by law.</p>
          </Section>

          <Section title="4. Obligations of the Covered Entity">
            <p>The Covered Entity agrees to:</p>
            <p><strong>4.1</strong> Not request the BA to use or disclose PHI in any manner that would not be permissible under the HIPAA Rules if done by the CE itself.</p>
            <p><strong>4.2</strong> Obtain all necessary patient authorizations prior to entering PHI into the Platform, consistent with applicable law.</p>
            <p><strong>4.3</strong> Notify the BA of any limitation in the CE's Notice of Privacy Practices that would affect the BA's use or disclosure of PHI.</p>
            <p><strong>4.4</strong> Notify the BA of any changes in, or revocation of, permission by an individual to use or disclose PHI.</p>
            <p><strong>4.5</strong> Notify the BA of any restriction on the use or disclosure of PHI that the CE has agreed to or is required to abide by.</p>
            <p><strong>4.6</strong> Maintain appropriate controls over user accounts and access credentials.</p>
          </Section>

          <Section title="5. Term and Termination">
            <p><strong>5.1 Term:</strong> This BAA shall be effective upon account registration and shall remain in effect for the duration of the CE's active subscription, unless earlier terminated.</p>
            <p><strong>5.2 Termination for Cause:</strong> Either party may terminate this BAA and the underlying Services upon written notice if the other party has materially breached any obligation under this BAA and has not cured such breach within 30 days of written notice specifying the breach.</p>
            <p><strong>5.3 Effect of Termination:</strong> Upon termination, the BA shall, if feasible, return or destroy all PHI received from, or created on behalf of, the CE. If return or destruction is not feasible, the BA shall extend the protections of this BAA to such PHI for as long as it is retained and shall limit further uses and disclosures to those purposes that make return or destruction of the PHI infeasible. PHI shall be retained for the minimum period required by applicable law, including HIPAA, following which it shall be securely destroyed.</p>
          </Section>

          <Section title="6. Miscellaneous">
            <p><strong>6.1 Amendment:</strong> The Parties agree to amend this BAA to the extent necessary to comply with applicable law, including any changes to the HIPAA Rules.</p>
            <p><strong>6.2 Interpretation:</strong> Any ambiguity in this BAA shall be resolved in favor of a meaning that permits the CE to comply with the HIPAA Rules.</p>
            <p><strong>6.3 No Third-Party Beneficiaries:</strong> Nothing in this BAA shall be construed to create any rights in any third party, including patients.</p>
            <p><strong>6.4 Entire Agreement:</strong> This BAA, together with the Terms of Service and Privacy Policy, constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, and representations.</p>
            <p><strong>6.5 Governing Law:</strong> This BAA shall be governed by applicable federal law, including HIPAA, and the laws of the state governing the Terms of Service.</p>
          </Section>

          <Section title="7. Electronic Acceptance">
            <p>By checking the BAA acknowledgment checkbox during registration, the Covered Entity agrees to be bound by the terms of this Business Associate Agreement. This electronic acceptance shall be deemed a legally binding signature for purposes of this BAA.</p>
            <p>ReAlign Health maintains a record of the date, time, and account associated with each BAA acceptance for audit and compliance purposes.</p>
          </Section>

          <Section title="Contact">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ReAlign Health</p>
              <p>ClinIQ Platform · HIPAA Compliance Inquiries</p>
              <p>Email: hipaa@realignhealth.com</p>
            </div>
          </Section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/privacy"><span className="cursor-pointer hover:underline">Privacy Policy</span></Link>
          <Link href="/terms"><span className="cursor-pointer hover:underline">Terms of Service</span></Link>
          <Link href="/"><span className="cursor-pointer hover:underline">Back to Home</span></Link>
        </div>
      </main>
    </div>
  );
}
