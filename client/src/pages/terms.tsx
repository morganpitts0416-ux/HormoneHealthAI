import { Link } from "wouter";
import { FileText, ChevronLeft } from "lucide-react";
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

export default function TermsOfService() {
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
            <FileText className="w-4 h-4" style={{ color: "#5a7040" }} />
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Terms of Service</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-7 w-auto" />
            <span className="text-sm font-bold" style={{ color: "#1c2414" }}>ReAlign Health ClinIQ</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Terms of Service</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #c8d8b0" }}>
            <strong>Important Notice:</strong> These Terms of Service are provided as a template and should be reviewed by qualified legal counsel before being relied upon. By registering for ClinIQ, you agree to these terms.
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <Section title="1. Acceptance of Terms">
            <p>These Terms of Service ("Terms") constitute a legally binding agreement between you ("Clinician," "you," or "your") and ReAlign Health ("Company," "we," "us," or "our") governing your access to and use of the ClinIQ clinical intelligence platform ("Platform").</p>
            <p>By creating an account or using the Platform, you represent that you are a licensed healthcare professional authorized to practice in your jurisdiction and that you have read, understood, and agree to be bound by these Terms. If you are registering on behalf of a clinic or healthcare organization, you further represent that you have authority to bind that organization to these Terms.</p>
          </Section>

          <Section title="2. Eligibility and Authorized Use">
            <p>ClinIQ is intended exclusively for licensed healthcare professionals including physicians, nurse practitioners, physician assistants, pharmacists, and other qualified clinicians acting within the scope of their professional license. Use by unlicensed individuals is strictly prohibited.</p>
            <p>You agree to use the Platform only for lawful clinical purposes, to maintain the confidentiality of your login credentials, and to ensure that any individual accessing the Platform through your account is appropriately licensed and authorized. You are responsible for all activity that occurs under your account.</p>
          </Section>

          <Section title="3. Clinical Decision Support — Disclaimer">
            <p><strong>ClinIQ is a clinical decision support tool, not a substitute for professional medical judgment.</strong> All AI-generated content, lab interpretations, SOAP notes, risk calculations, supplement recommendations, and clinical suggestions are informational and educational in nature. They do not constitute medical advice and must be independently evaluated and verified by a qualified clinician before being applied to any patient care decision.</p>
            <p>You acknowledge that: (a) clinical algorithms and AI outputs may contain errors; (b) no software tool can replace clinical assessment; (c) final diagnostic and treatment decisions are your sole professional responsibility; and (d) you will exercise independent clinical judgment in evaluating all platform outputs.</p>
            <p>ReAlign Health shall not be liable for any clinical outcomes, patient harm, or professional consequences arising from reliance on platform outputs without independent clinical verification.</p>
          </Section>

          <Section title="4. Subscription, Trial, and Billing">
            <p><strong>Free Trial:</strong> New accounts receive a 14-day free trial period. A valid payment method is required at registration. No charge is made during the trial period. If you cancel before the trial ends, you will not be charged.</p>
            <p><strong>Subscription:</strong> After the trial period, your payment method will be charged the then-current monthly subscription fee (currently $97/month USD). Subscriptions auto-renew monthly until cancelled.</p>
            <p><strong>Cancellation:</strong> You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period — no partial month refunds are provided. Upon cancellation, your account will remain active through the end of the paid period, after which access will be suspended.</p>
            <p><strong>Price Changes:</strong> We reserve the right to modify subscription pricing with 30 days' advance notice to registered email addresses.</p>
            <p><strong>Payment Processing:</strong> Payments are processed by Stripe, Inc. By providing a payment method, you authorize us and Stripe to charge all amounts due under these Terms.</p>
          </Section>

          <Section title="5. Protected Health Information">
            <p>You are solely responsible for ensuring that any Protected Health Information (PHI) entered into the Platform is handled in compliance with HIPAA and all applicable federal and state privacy laws. You represent that you are authorized to access and input the patient data you submit, that you have obtained all necessary patient authorizations, and that you have implemented appropriate safeguards within your practice.</p>
            <p>A Business Associate Agreement (BAA) is presented at registration and governs the handling of PHI by ReAlign Health. The BAA is incorporated by reference into these Terms.</p>
          </Section>

          <Section title="6. Intellectual Property">
            <p>The Platform, including all software, algorithms, clinical content, design, and documentation, is the proprietary intellectual property of ReAlign Health and is protected by applicable copyright, trademark, and other laws. You are granted a limited, non-exclusive, non-transferable, revocable license to access and use the Platform solely for your authorized clinical practice during your active subscription period.</p>
            <p>You may not reverse engineer, decompile, copy, reproduce, sell, resell, or create derivative works from the Platform or its content without our express written permission.</p>
            <p>You retain ownership of clinical data and patient information you enter into the Platform. By entering data, you grant ReAlign Health a limited license to process and display that data solely for the purpose of providing the Platform services to you.</p>
          </Section>

          <Section title="7. Prohibited Conduct">
            <p>You agree not to: (a) share your login credentials with unauthorized individuals; (b) use the Platform for any unlawful purpose or in violation of professional regulations; (c) attempt to gain unauthorized access to any Platform systems; (d) upload malicious code or interfere with Platform operations; (e) use the Platform to harm, defraud, or deceive patients; or (f) misrepresent your professional credentials or licensure status.</p>
          </Section>

          <Section title="8. Termination">
            <p>We reserve the right to suspend or terminate your account for violation of these Terms, non-payment, professional license revocation, or for any conduct we determine to be harmful to patients, other users, or the Platform. You may terminate your account at any time by cancelling your subscription and contacting us to request account deletion.</p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, REALIGN HEALTH AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO CLINICAL OUTCOMES, PATIENT HARM, LOST PROFITS, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
            <p>OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.</p>
          </Section>

          <Section title="10. Indemnification">
            <p>You agree to indemnify, defend, and hold harmless ReAlign Health and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Platform; (b) your violation of these Terms; (c) your violation of any applicable law or professional regulation; or (d) any clinical decision made in reliance on Platform outputs.</p>
          </Section>

          <Section title="11. Governing Law and Disputes">
            <p>These Terms shall be governed by and construed in accordance with the laws of the state in which ReAlign Health is incorporated, without regard to conflict of law principles. Any disputes shall be resolved by binding arbitration in accordance with the American Arbitration Association rules, except that either party may seek injunctive relief in a court of competent jurisdiction.</p>
          </Section>

          <Section title="12. Changes to Terms">
            <p>We may update these Terms periodically. Material changes will be communicated via email or in-platform notification with at least 14 days' advance notice. Continued use of the Platform after such notice constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="13. Contact">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ReAlign Health</p>
              <p>ClinIQ Platform · Legal Inquiries</p>
              <p>Email: legal@cliniqapp.ai</p>
            </div>
          </Section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/privacy"><span className="cursor-pointer hover:underline">Privacy Policy</span></Link>
          <Link href="/baa"><span className="cursor-pointer hover:underline">Business Associate Agreement</span></Link>
          <Link href="/"><span className="cursor-pointer hover:underline">Back to Home</span></Link>
        </div>
      </main>
    </div>
  );
}
