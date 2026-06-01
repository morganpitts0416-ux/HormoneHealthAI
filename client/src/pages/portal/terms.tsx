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

export default function PortalTerms() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/login?mode=patient">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: "#5a7040" }} />
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Patient Portal Terms of Use</span>
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
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Patient Portal Terms of Use</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: June 1, 2026</p>
          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #c8d8b0" }}>
            These Patient Portal Terms of Use govern your access to and use of the ClinIQ Patient Portal. By accessing, registering for, or using the Portal, you agree to these Terms.
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <Section title="1. Purpose of the Portal">
            <p>The ClinIQ Patient Portal is provided to help patients securely access information made available by their healthcare provider, including:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Laboratory results</li>
              <li>• Educational information</li>
              <li>• Wellness recommendations</li>
              <li>• Messages from providers</li>
              <li>• Appointment information</li>
              <li>• Forms and questionnaires</li>
              <li>• Other health-related information chosen by your healthcare provider</li>
            </ul>
            <p>The Portal is intended to support communication and engagement with your healthcare provider and is not a substitute for professional medical care.</p>
          </Section>

          <Section title="2. Relationship to Your Healthcare Provider">
            <p>ClinIQ provides technology services only.</p>
            <p>ClinIQ is not a healthcare provider and does not practice medicine. ClinIQ does not diagnose conditions, prescribe medications, provide treatment recommendations, establish provider-patient relationships, or make healthcare decisions.</p>
            <p>All healthcare services are provided solely by your healthcare provider.</p>
          </Section>

          <Section title="3. No Medical Advice">
            <p>Information presented through the Portal is provided for informational and educational purposes only.</p>
            <p>You should not make changes to medications, supplements, treatments, or healthcare decisions based solely on information displayed in the Portal.</p>
            <p>Always consult your healthcare provider regarding medical concerns, treatment decisions, or questions about your health information.</p>
          </Section>

          <Section title="4. AI-Assisted Information">
            <p>Certain summaries, explanations, educational materials, wellness recommendations, administrative communications, and informational content displayed through the Portal may be generated or assisted by artificial intelligence technologies.</p>
            <p>Artificial intelligence systems may generate inaccurate, incomplete, outdated, or incorrect information.</p>
            <p>AI-assisted content is provided solely to support patient understanding and engagement and should not be relied upon as medical advice.</p>
            <p>Healthcare providers remain solely responsible for patient care and medical decision-making.</p>
          </Section>

          <Section title="5. Patient Messaging">
            <p>The Portal may allow electronic communications with your healthcare provider. You understand and agree that:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Messages may not be reviewed immediately.</li>
              <li>• Messages may become part of your medical record.</li>
              <li>• Providers determine appropriate response methods and response times.</li>
              <li>• Certain issues may require an office visit, telehealth appointment, or emergency care.</li>
            </ul>
          </Section>

          <Section title="6. Medical Emergencies">
            <p className="font-semibold" style={{ color: "#dc2626" }}>THE PORTAL IS NOT AN EMERGENCY SERVICE.</p>
            <p>Do not use the Portal to report emergencies, urgent symptoms, severe reactions, chest pain, suicidal thoughts, breathing difficulties, or other urgent medical concerns.</p>
            <p>If you believe you are experiencing a medical emergency:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• <strong>Call 911 immediately.</strong></li>
              <li>• Contact emergency services.</li>
              <li>• Go to the nearest emergency department.</li>
            </ul>
            <p>Neither ClinIQ nor your healthcare provider guarantees immediate review of Portal messages.</p>
          </Section>

          <Section title="7. Appointments">
            <p>Appointment requests, scheduling tools, and appointment information displayed through the Portal are subject to provider availability and clinic policies.</p>
            <p>Submitting a request does not guarantee an appointment.</p>
          </Section>

          <Section title="8. Account Security">
            <p>You are responsible for maintaining the confidentiality of your Portal credentials. You agree to:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Use a secure password.</li>
              <li>• Protect your account information.</li>
              <li>• Notify your healthcare provider if you suspect unauthorized access.</li>
            </ul>
          </Section>

          <Section title="9. Authorized Representatives">
            <p>Parents, guardians, caregivers, healthcare proxies, and other authorized representatives may be granted Portal access when permitted by applicable law and approved by the healthcare provider.</p>
          </Section>

          <Section title="10. Service Availability">
            <p>ClinIQ does not guarantee uninterrupted access to the Portal. The Portal may become unavailable due to maintenance, technical issues, internet outages, security incidents, or events beyond ClinIQ's control.</p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>To the fullest extent permitted by law, ClinIQ shall not be liable for:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Medical decisions or clinical outcomes</li>
              <li>• Delayed message review</li>
              <li>• Provider actions or omissions</li>
              <li>• Treatment, diagnostic, or prescription decisions</li>
              <li>• Emergency situations</li>
              <li>• Temporary service interruptions</li>
            </ul>
          </Section>

          <Section title="12. Changes to These Terms">
            <p>ClinIQ may modify these Terms from time to time. Continued use of the Portal after changes become effective constitutes acceptance of the revised Terms.</p>
          </Section>

          <Section title="13. Contact">
            <p>Questions regarding your healthcare should be directed to your healthcare provider.</p>
            <p>Questions regarding the Portal may be directed to:</p>
            <div className="rounded-lg px-4 py-3 mt-2" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ClinIQ Patient Support</p>
              <p>Email: <a href="mailto:support@cliniqapp.ai" style={{ color: "#5a7040" }}>support@cliniqapp.ai</a></p>
            </div>
          </Section>

          <Section title="14. Acceptance">
            <p>By creating an account or using the Portal, you acknowledge that you have read, understood, and agree to these Terms.</p>
          </Section>

        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/privacy"><span className="cursor-pointer hover:underline">Privacy Policy</span></Link>
          <Link href="/login?mode=patient"><span className="cursor-pointer hover:underline">Patient Portal Login</span></Link>
        </div>
      </main>
    </div>
  );
}
