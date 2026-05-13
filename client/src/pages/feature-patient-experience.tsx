import { Link } from "wouter";
import {
  ChevronRight, Users, CalendarDays, LayoutDashboard, Heart,
  Activity, CheckCircle2, ImageIcon, MousePointerClick, Send,
  Smartphone, Link2, PenLine, ListChecks, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";
import intakeFlowVideo from "@assets/Intake_Flow_updated_(1)_1778687909629.mp4";
import iPadIntakeVideo from "@assets/intake_mockup_with_voice_1778687935447.mp4";
import formPdfImage from "@assets/Form_quick_mock-up_1778687945791.png";
import formBuilderVideo from "@assets/Form_builder_Demo_(1)_1778689377166.mp4";

function ScreenshotPlaceholder({ label }: { label?: string }) {
  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center gap-3"
      style={{
        border: "2px dashed #d4c9b5",
        backgroundColor: "#faf7f2",
        minHeight: 260,
        padding: "2.5rem 1.5rem",
      }}
    >
      <ImageIcon className="w-8 h-8" style={{ color: "#c4b9a5" }} />
      <p className="text-xs font-semibold text-center" style={{ color: "#9aaa84" }}>
        {label ?? "Screenshot coming soon"}
      </p>
    </div>
  );
}

function VideoPlayer({ src, label }: { src: string; label?: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: "0 4px 24px 0 rgba(44,58,32,0.10)", border: "1px solid #e0d9cc" }}>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="w-full block"
        style={{ display: "block", backgroundColor: "#1c2414", maxHeight: 480, objectFit: "contain" }}
      />
      {label && (
        <div className="px-3 py-2" style={{ backgroundColor: "#f5f1e8", borderTop: "1px solid #e0d9cc" }}>
          <p className="text-[11px] font-medium" style={{ color: "#7a8a64" }}>{label}</p>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#7a8a64" }}>
      {children}
    </span>
  );
}

function Highlights({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map(h => (
        <li key={h} className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5a7040" }} />
          <span className="text-sm leading-relaxed" style={{ color: "#3a4a28" }}>{h}</span>
        </li>
      ))}
    </ul>
  );
}

export default function FeaturePatientExperiencePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0", fontFamily: "IBM Plex Sans, Inter, sans-serif" }}>

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <Link href="/home">
            <img src="/cliniq-logo.png?v=2" alt="ClinIQ" className="h-14 w-auto cursor-pointer" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/home">
              <Button variant="ghost" size="sm" style={{ color: "#4a5a38" }}>← Back</Button>
            </Link>
            <a href={appUrl("/login")}>
              <Button variant="ghost" size="sm">Sign In</Button>
            </a>
            <a href={appUrl("/register?plan=solo")}>
              <Button size="sm" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>Start Free Trial</Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: "#e8ddd0" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, #edf2e6 0%, #f9f6f0 60%, #f5ede4 100%)" }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold mb-5" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #a0b880" }}>
              <Users className="w-3 h-3" />
              Patient Experience
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              The complete patient journey — in one platform
            </h1>
            <p className="text-lg leading-relaxed mb-8" style={{ color: "#4a5a38" }}>
              From the first intake form to ongoing monitoring between visits — ClinIQ keeps patients informed, engaged, and connected to their care every step of the way.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={appUrl("/register?plan=solo")}>
                <Button size="lg" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                  Start free trial <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
              <Link href="/home">
                <Button size="lg" variant="outline" style={{ borderColor: "#c4b9a5", color: "#3d4a30" }}>
                  See all features
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Smart Intake Forms ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Smart Intake & Digital Forms</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Replace paper packets with something smarter
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Build any form your clinic needs with a drag-and-drop builder — new patient intake, medical history, symptom checklists, consents, ROS, post-visit follow-ups. Forms are branded to your practice and wire directly into the patient chart on submission.
              </p>
              <Highlights items={[
                "20+ field types: symptom checklists, family history charts, matrix grids, e-signature, file upload, conditional logic",
                "1–4 column layouts to match how your clinic documents",
                "Patient name and demographics pre-populate automatically from their profile",
                "Smart field auto-link to chart domains: medications, allergies, history, demographics",
                "Form bundles (packets) for multi-form sequential completion — new patient onboarding in one link",
                "Every submission exported as a branded PDF and stored in the patient chart",
              ]} />
            </div>
            <div className="flex flex-col gap-4">
              <VideoPlayer src={formBuilderVideo} label="Form builder walkthrough — building custom forms, sending via text and email, assigning to patient profiles, and embedding on clinic websites" />
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e0d9cc", boxShadow: "0 4px 24px 0 rgba(44,58,32,0.08)" }}>
                <img src={formPdfImage} alt="Intake form PDF export — clean branded medical document" className="w-full block" style={{ display: "block", backgroundColor: "#1c2414" }} />
                <div className="px-3 py-2" style={{ backgroundColor: "#f5f1e8", borderTop: "1px solid #e0d9cc" }}>
                  <p className="text-[11px] font-medium" style={{ color: "#7a8a64" }}>Every submission exports as a clean, branded medical PDF — ready to file or print</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Four Delivery Methods ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 flex flex-col gap-4">
              <VideoPlayer src={formBuilderVideo} label="Sending forms via text and email, assigning to patient profiles, and embedding on your clinic website" />
              <VideoPlayer src={iPadIntakeVideo} label="In-clinic tablet mode — hand off at check-in, submissions auto-save directly to the chart" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Four Ways to Deliver Every Form</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Get every form completed — however patients prefer
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Assign any form from a patient's profile and choose how it reaches them. The moment they submit, you see it in the chart. Assign forms and consents directly to a patient — they'll see it waiting for them the next time they log in to the portal.
              </p>
              <Highlights items={[
                "Push to patient portal — they get an email notification and see it waiting when they log in",
                "Email-only delivery for patients who don't use the portal",
                "In-clinic tablet mode — hand off at check-in for consents and witness signatures",
                "Public link or website embed — for prospective patients and lead capture, no account required",
                "Assigned forms appear in the patient portal's Forms & Consents section with completion status",
                "Completed submissions trigger a review task in the clinician's workflow",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Appointments & Scheduling ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Appointments & Scheduling</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Scheduling connected to the clinical workflow
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                An appointment in ClinIQ isn't just a calendar entry — it links to the patient chart, the encounter documentation, and the SOAP note workflow. Everything flows naturally from the moment the visit is booked.
              </p>
              <Highlights items={[
                "Configurable appointment types with custom duration and buffer times",
                "Provider availability management with block scheduling",
                "Patient-facing booking — patients self-schedule from the portal",
                "Appointment links directly to encounter and documentation workflow",
                "Calendar overview with daily and weekly views",
                "Multi-provider scheduling for group practices",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Appointment calendar and scheduling interface" />
          </div>
        </div>
      </section>

      {/* ── Patient Portal ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Patient portal dashboard — labs, visits, forms, messaging" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Patient Portal</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                A portal patients actually want to open
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                ClinIQ's patient portal gives patients plain-language lab explanations, visit summaries, personalized supplement and dietary guidance, secure messaging, and access to everything their care team has shared — all branded to your practice.
              </p>
              <Highlights items={[
                "Lab results in plain language — not just numbers with reference ranges",
                "Visit summaries, protocols, and care plan updates from the clinician",
                "Assigned forms and consents appear here for the patient to complete",
                "Secure messaging directly with the care team",
                "Supplement recommendations published by the clinician",
                "Lab-specific dietary guidance auto-generated and reviewed before publishing",
                "Medication refill requests — patients submit from the portal, you action from your inbox",
                "Document downloads — wellness reports, visit summaries, lab exports",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── HealthIQ Hub ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>HealthIQ Hub</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Patients who understand their health stay engaged
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                The HealthIQ Hub gives patients a structured view of their body systems — scoring cardiovascular health, metabolic function, hormonal balance, and more from their actual lab values. An interactive, educational experience that keeps patients invested in their care between appointments.
              </p>
              <Highlights items={[
                "Body system health scores derived from lab values, check-ins, and trends",
                "Interactive system cards with plain-language explanations of what's driving each score",
                "Trend tracking over time — patients can see their progress",
                "Connected to daily check-in data for a real-time picture",
                "Educational content tied to the patient's specific values — not generic health tips",
                "Encourages patients to engage on days they're not in the office",
              ]} />
            </div>
            <ScreenshotPlaceholder label="HealthIQ Hub — body system health scores and trends" />
          </div>
        </div>
      </section>

      {/* ── Daily Check-In & Vitals ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Daily check-in and vitals monitoring dashboard" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Daily Check-In & Vitals Monitoring</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                The data between the visits
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                A blood pressure reading in your office is one data point. Thirty days of home BP readings tells a clinical story. Clinicians configure exactly what they want tracked; patients log it daily from the portal; alerts fire when values cross your clinical threshold.
              </p>
              <Highlights items={[
                "Patient self-reported daily logs: food, sleep, mood, energy, symptoms",
                "Clinician-directed vital monitoring: blood pressure, heart rate, weight",
                "Configurable alert thresholds — you set the limits, ClinIQ notifies you when crossed",
                "Trend visualization across any time window",
                "Check-in data feeds directly into HealthIQ body system scoring",
                "Meaningful longitudinal data for appointments and follow-ups",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ backgroundColor: "#2e3a20" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "#f9f6f0", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Give your patients the experience they deserve
          </h2>
          <p className="text-sm mb-8" style={{ color: "#a0b880" }}>
            14 days free. No credit card required. Cancel any time.
          </p>
          <a href={appUrl("/register?plan=solo")}>
            <Button size="lg" style={{ backgroundColor: "#f9f6f0", color: "#2e3a20", fontWeight: 600 }}>
              Start your free trial <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </section>

    </div>
  );
}
