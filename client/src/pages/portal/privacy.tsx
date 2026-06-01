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

export default function PortalPrivacy() {
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
            <Shield className="w-4 h-4" style={{ color: "#5a7040" }} />
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Patient Privacy Notice</span>
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
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Patient Privacy Notice</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: June 1, 2026</p>
          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #c8d8b0" }}>
            This Privacy Notice explains how ClinIQ processes information made available through the ClinIQ Patient Portal.
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <Section title="1. Information We Process">
            <p>The Portal may display information provided by your healthcare provider, including:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Contact information</li>
              <li>• Appointment information</li>
              <li>• Laboratory results</li>
              <li>• Forms and questionnaires</li>
              <li>• Provider communications</li>
              <li>• Educational content</li>
              <li>• Wellness recommendations</li>
              <li>• Other healthcare information chosen by your provider</li>
            </ul>
          </Section>

          <Section title="2. How Information Is Used">
            <p>Information may be processed to:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Provide Portal access</li>
              <li>• Display health information</li>
              <li>• Facilitate communications</li>
              <li>• Support appointment management</li>
              <li>• Improve patient engagement</li>
              <li>• Provide educational content</li>
              <li>• Support authorized healthcare operations</li>
            </ul>
          </Section>

          <Section title="3. AI-Assisted Features">
            <p>ClinIQ may use artificial intelligence technologies to assist with educational content, summaries, explanations, administrative communications, workflow automation, and patient engagement features.</p>
            <p>AI systems are intended to support communication and understanding and do not replace healthcare professionals.</p>
          </Section>

          <Section title="4. How Information Is Protected">
            <p>ClinIQ employs administrative, technical, and organizational safeguards designed to protect information from unauthorized access, use, or disclosure.</p>
            <p>No system can guarantee absolute security.</p>
          </Section>

          <Section title="5. Who May Access Information">
            <p>Access may be granted to:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• You</li>
              <li>• Authorized representatives</li>
              <li>• Members of your healthcare provider's organization</li>
              <li>• Service providers supporting ClinIQ operations when necessary to provide services</li>
            </ul>
            <p>ClinIQ does not sell patient information.</p>
          </Section>

          <Section title="6. Communications">
            <p>The Portal may send notifications regarding:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Account activity</li>
              <li>• Appointment reminders</li>
              <li>• Provider communications</li>
              <li>• Portal activity</li>
              <li>• Administrative updates</li>
            </ul>
            <p>Certain communications may be delivered electronically through email, SMS, or Portal notifications.</p>
          </Section>

          <Section title="7. Your Healthcare Provider">
            <p>Your healthcare provider remains responsible for medical care, clinical decisions, and management of your healthcare records.</p>
            <p>ClinIQ provides technology services supporting access to information.</p>
          </Section>

          <Section title="8. Changes to This Notice">
            <p>This Privacy Notice may be updated periodically. Updated versions will be posted within the Portal or on the ClinIQ website.</p>
          </Section>

          <Section title="9. Contact">
            <p>Questions regarding this Privacy Notice may be directed to:</p>
            <div className="rounded-lg px-4 py-3 mt-2" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ClinIQ Patient Support</p>
              <p>Email: <a href="mailto:support@cliniqapp.ai" style={{ color: "#5a7040", textDecoration: "underline" }}>support@cliniqapp.ai</a></p>
            </div>
          </Section>

        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/portal/terms"><span className="cursor-pointer hover:underline">Patient Portal Terms of Use</span></Link>
          <Link href="/privacy"><span className="cursor-pointer hover:underline">Privacy Policy</span></Link>
          <Link href="/login?mode=patient"><span className="cursor-pointer hover:underline">Patient Portal Login</span></Link>
        </div>
      </main>
    </div>
  );
}
