import { Link } from "wouter";
import { Shield, ChevronLeft } from "lucide-react";
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

export default function PrivacyPolicy() {
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
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Privacy Policy</span>
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
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Privacy Policy</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #c8d8b0" }}>
            <strong>Important Notice:</strong> This Privacy Policy is provided as a template and should be reviewed by qualified legal counsel before being relied upon. It is intended to describe the data practices of ReAlign Health with respect to the ClinIQ platform.
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <Section title="1. Overview">
            <p>ReAlign Health ("Company," "we," "us," or "our") operates the ClinIQ clinical intelligence platform ("Platform"). This Privacy Policy describes how we collect, use, store, disclose, and protect information about licensed healthcare professionals ("Clinicians") who use the Platform and their patients whose protected health information ("PHI") may be entered into the Platform.</p>
            <p>By using ClinIQ, you acknowledge that you have read and understood this Privacy Policy and agree to its terms. If you do not agree, you must discontinue use of the Platform immediately.</p>
          </Section>

          <Section title="2. Information We Collect">
            <p><strong>Clinician Account Information:</strong> When you register, we collect your name, professional credentials (title, NPI), clinic name, email address, phone number, billing address, and payment method information. Payment card data is processed and stored by Stripe, Inc. — we do not store raw card numbers on our systems.</p>
            <p><strong>Protected Health Information (PHI):</strong> Clinicians may enter patient lab results, clinical notes, encounter transcriptions, and other clinical data into the Platform. This information constitutes PHI under the Health Insurance Portability and Accountability Act (HIPAA) and is governed by our Business Associate Agreement (BAA). Clinicians are solely responsible for ensuring they have appropriate patient authorization before entering PHI.</p>
            <p><strong>Audio Recordings:</strong> When using the clinical encounter documentation feature, audio files are transmitted to OpenAI's Whisper API for transcription and are immediately and permanently deleted from our systems upon transcription completion. Audio is never stored in our database.</p>
            <p><strong>Usage Data:</strong> We collect access logs, IP addresses, browser types, session durations, and feature usage data for security, audit, and platform improvement purposes.</p>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to: (a) provide and operate the ClinIQ platform; (b) process subscription billing through Stripe; (c) send service-related communications including account notifications and billing receipts; (d) maintain audit logs as required by HIPAA; (e) improve platform features and clinical algorithms; and (f) comply with legal obligations.</p>
            <p>We do not sell, rent, or share your information or any PHI with third parties for marketing purposes.</p>
          </Section>

          <Section title="4. HIPAA Compliance">
            <p>ReAlign Health acts as a Business Associate under HIPAA with respect to PHI entered into the Platform by Clinicians who are Covered Entities or are themselves Business Associates of Covered Entities. We maintain appropriate administrative, physical, and technical safeguards to protect PHI.</p>
            <p>A Business Associate Agreement (BAA) is provided and must be accepted at registration. The BAA governs our obligations with respect to PHI and is incorporated by reference into this Privacy Policy.</p>
            <p>Technical safeguards include: encrypted data transmission (TLS), audit logging of all PHI access, session timeouts with user warnings, login lockout after failed attempts, and strong password requirements.</p>
          </Section>

          <Section title="5. Third-Party Services">
            <p><strong>OpenAI:</strong> Transcription and AI-generated content (SOAP notes, recommendations, evidence analysis) are processed via the OpenAI API. Audio files are deleted immediately after transcription. Text data sent to OpenAI is subject to OpenAI's API data usage policies.</p>
            <p><strong>Stripe:</strong> Subscription billing is processed by Stripe, Inc. Stripe acts as an independent data controller for payment card data under PCI-DSS standards. We store only Stripe customer IDs and subscription status — never raw card numbers.</p>
            <p><strong>Email Services:</strong> Transactional emails (account invitations, password resets) may be sent via Resend or a compatible email service provider.</p>
          </Section>

          <Section title="6. Data Retention">
            <p>Clinician account data and associated PHI are retained for the duration of the active subscription and for a period of 6 years following account termination, consistent with HIPAA retention requirements. Clinicians may request deletion of their account data by contacting us, subject to our legal obligations to retain certain records.</p>
            <p>Audit logs are retained for a minimum of 6 years as required by the HIPAA Security Rule.</p>
          </Section>

          <Section title="7. Data Security">
            <p>We implement industry-standard security measures including TLS encryption for all data in transit, encrypted storage at rest, role-based access controls, regular security assessments, and session management controls. While we work diligently to protect your information, no security system is impenetrable, and we cannot guarantee absolute security.</p>
            <p>In the event of a security breach affecting PHI, we will notify affected Clinicians and, where required, relevant regulatory authorities, in accordance with HIPAA Breach Notification Rule requirements.</p>
          </Section>

          <Section title="8. Your Rights">
            <p>Clinicians have the right to access, correct, or request deletion of their account information by contacting us. Patients' rights regarding their PHI are governed by HIPAA and are administered by the Clinician as the Covered Entity — patients should direct rights requests to their healthcare provider.</p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>We may update this Privacy Policy periodically. We will notify registered Clinicians of material changes via email or in-platform notification. Continued use of the Platform after such notification constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="10. Contact Us">
            <p>For questions about this Privacy Policy or our data practices, please contact:</p>
            <div className="rounded-lg px-4 py-3 mt-2" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ReAlign Health</p>
              <p>ClinIQ Platform · Privacy Inquiries</p>
              <p>Email: privacy@realignhealth.com</p>
            </div>
          </Section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/terms"><span className="cursor-pointer hover:underline">Terms of Service</span></Link>
          <Link href="/baa"><span className="cursor-pointer hover:underline">Business Associate Agreement</span></Link>
          <Link href="/"><span className="cursor-pointer hover:underline">Back to Home</span></Link>
        </div>
      </main>
    </div>
  );
}
