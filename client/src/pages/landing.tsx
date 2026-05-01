import { Link } from "wouter";
import {
  FlaskConical, Brain, Heart, Activity, FileText, Sparkles,
  Users, Shield, ChevronRight, CheckCircle2, Stethoscope,
  BarChart3, BookOpen, Leaf, ClipboardList, Zap, Lock,
  MousePointerClick, Send, Link2, PenLine, ListChecks, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appUrl } from "@/lib/app-url";
import { DemoModal } from "@/components/demo-modal";

const COPILOT_DEMO_VIDEO_URL = "/marketing/clinical-copilot-demo.mp4";

const CLINICIAN_FEATURES = [
  {
    icon: Brain,
    title: 'See beyond "normal" labs',
    desc: "Instantly interpret 60+ markers with clinical context — not just reference ranges — so you can understand what's actually happening, not just what's flagged.",
  },
  {
    icon: Heart,
    title: "Know your patient's real risk",
    desc: "Built-in PREVENT scoring with ApoB and Lp(a) context — helping you assess true cardiovascular risk, not just standard lipid panels.",
  },
  {
    icon: Activity,
    title: "Catch insulin resistance early",
    desc: "Identify insulin resistance phenotypes before A1c rises — with pattern-based insights and targeted intervention guidance.",
  },
  {
    icon: Stethoscope,
    title: "Document without slowing down",
    desc: "Record visits, generate AI-assisted SOAP notes, and capture key clinical insights — without adding time to your day.",
  },
  {
    icon: BarChart3,
    title: "Identify patterns most clinicians miss",
    desc: "From perimenopause shifts to iron deficiency and hormone optimization — ClinIQ connects patterns across labs so nothing important gets overlooked.",
  },
  {
    icon: BookOpen,
    title: 'Know the "why" behind every decision',
    desc: "Evidence-backed recommendations surfaced directly in your workflow — so you can move confidently without second-guessing.",
  },
  {
    icon: ClipboardList,
    title: "Track progress over time",
    desc: "Visualize trends across key markers and follow patient progress longitudinally — not just visit by visit.",
  },
  {
    icon: Shield,
    title: "Built with clinical-grade security",
    desc: "HIPAA-compliant infrastructure with secure data handling, audit logging, and protected patient information at every step.",
  },
];

const PATIENT_FEATURES = [
  {
    icon: FileText,
    title: "Clear, understandable reports",
    desc: "Patients see what their labs actually mean — not just numbers — so they can understand their health and what to do next.",
  },
  {
    icon: Leaf,
    title: "Personalized supplement guidance",
    desc: "Recommendations based on labs, symptoms, and clinical patterns — reviewed and curated by you before reaching the patient.",
  },
  {
    icon: Sparkles,
    title: "Actionable diet & lifestyle support",
    desc: "Lab-informed nutrition and lifestyle guidance patients can actually follow — delivered directly through the portal.",
  },
  {
    icon: Users,
    title: "Stay connected between visits",
    desc: "Share visit summaries, recommendations, and updates — keeping patients informed, engaged, and aligned with their care plan.",
  },
];

const INCLUDED = [
  "Unlimited patient profiles",
  "All lab panels (male & female)",
  "Clinical encounter documentation",
  "AI SOAP note generation",
  "Evidence-based guideline flags",
  "PREVENT cardiovascular calculator",
  "Insulin resistance phenotyping",
  "Patient wellness portal",
  "Supplement recommendation engine",
  "Trend charts & lab history",
  "Secure messaging integration",
  "HIPAA technical controls",
];

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0", fontFamily: "IBM Plex Sans, Inter, sans-serif" }}>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <img src="/cliniq-logo.png" alt="ClinIQ" className="h-14 w-auto" />
          </div>
          <nav className="flex items-center gap-2">
            <a href={appUrl("/login")}>
              <Button variant="ghost" size="sm" data-testid="link-signin">Sign In</Button>
            </a>
            <a href={appUrl("/register?plan=solo")}>
              <Button size="sm" data-testid="link-start-trial" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                Start Free Trial
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, #edf2e6 0%, #f9f6f0 60%, #f5ede4 100%)" }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <Badge variant="outline" className="mb-5 text-xs font-medium" style={{ borderColor: "#a0b880", color: "#3d4a30", backgroundColor: "#edf2e6" }}>
            <Zap className="w-3 h-3 mr-1" />
            A Clinical Intelligence + Patient Experience Platform
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Stop guessing. Start seeing<br />the full clinical picture.
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8" style={{ color: "#4a5a38" }}>
            Built for clinicians who know there's more to the story — ClinIQ helps you connect the dots, identify patterns, and confidently guide your patients with care that actually makes sense.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 flex-wrap">
            <a href={appUrl("/register?plan=solo")}>
              <Button size="lg" data-testid="link-hero-trial" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0", fontSize: "1rem", padding: "0 2rem" }}>
                Start your free 14-day trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <DemoModal />
            <a href={appUrl("/login")}>
              <Button size="lg" variant="outline" data-testid="link-hero-signin" style={{ borderColor: "#c4b9a5", color: "#3d4a30" }}>
                Sign in to your account
              </Button>
            </a>
          </div>
          <p className="text-xs mt-4" style={{ color: "#9aaa84" }}>Built by a Nurse Practitioner · Designed for real clinical workflows.</p>
        </div>
      </section>

      {/* ── App Preview ─────────────────────────────────────────────────── */}
      <section data-tour="app-preview" className="max-w-5xl mx-auto px-4 sm:px-6 pb-4 pt-2">
        <p className="text-center text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: "#9aaa84" }}>
          A look inside the platform
        </p>
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: "1px solid #d4c9b5",
            boxShadow: "0 24px 64px rgba(46,58,32,0.13), 0 4px 20px rgba(0,0,0,0.07)",
          }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ backgroundColor: "#2e3a20" }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#ff5f57" }} />
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#febc2e" }} />
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#28c840" }} />
            <div
              className="flex-1 mx-3 rounded px-3 py-0.5 text-[11px]"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
            >
              app.realignlabeval.com
            </div>
          </div>
          <img
            src="/help-shots/lab-results.png"
            alt="ClinIQ clinical lab interpretation and results"
            className="w-full block"
            style={{ display: "block" }}
          />
        </div>
        <p className="text-center text-xs mt-4" style={{ color: "#9aaa84" }}>
          Color-coded status across 60+ markers — in seconds, not minutes.
        </p>
      </section>

      {/* ── "Built differently" ──────────────────────────────────────────── */}
      <section data-tour="how-it-works" className="border-y" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              Because busy visits miss things
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#5a6a4a" }}>
              ClinIQ doesn't replace your clinical judgment — it expands it.<br className="hidden sm:block" />
              While you're focused on the visit, it's identifying patterns across cardiovascular risk, insulin resistance, iron deficiency, perimenopause, and more — surfacing what matters, even when time doesn't allow you to go there.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: FlaskConical,
                heading: "For the Clinician",
                body: 'Go beyond "normal" and "abnormal." ClinIQ connects the dots across labs — helping you identify patterns, stratify risk, and make decisions with clarity and confidence.',
              },
              {
                icon: Users,
                heading: "For the Patient",
                body: "No more confusing lab printouts. Patients receive clear, personalized insights — with guidance on nutrition, supplements, and lifestyle they can actually understand and follow.",
              },
              {
                icon: Brain,
                heading: "For the Practice",
                body: "Less documentation. More insight. Generate AI-supported SOAP notes, track trends over time, and capture deeper clinical insight — without adding time to your day.",
              },
            ].map(({ icon: Icon, heading, body }) => (
              <div key={heading} className="rounded-xl p-6 text-center" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#edf2e6" }}>
                  <Icon className="w-5 h-5" style={{ color: "#2e3a20" }} />
                </div>
                <h3 className="font-semibold mb-2" style={{ color: "#1c2414" }}>{heading}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#5a6a4a" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Clinician Features ───────────────────────────────────────────── */}
      <section data-tour="clinician-features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7a8a64" }}>For Clinicians</span>
          <h2 className="text-2xl sm:text-3xl font-bold mt-2" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            See what others miss — in seconds
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CLINICIAN_FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl p-5" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "#edf2e6" }}>
                <Icon className="w-4 h-4" style={{ color: "#2e3a20" }} />
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#1c2414" }}>{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "#6a7a58" }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Smart Intake & Digital Forms ─────────────────────────────────── */}
      <section data-tour="intake-forms" className="border-y" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7a8a64" }}>Smart Intake & Digital Forms</span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              Build any form your clinic needs — in minutes
            </h2>
            <p className="text-sm mt-3 max-w-2xl mx-auto" style={{ color: "#5a6a4a" }}>
              Replace paper packets, generic PDFs, and clunky third-party form tools with a clinic-grade form builder
              for new patient intake, medical history, consents, ROS, symptom checklists, and post-visit follow-ups —
              all branded to your practice and wired directly into the patient chart.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {[
              { icon: MousePointerClick, title: "Drag-and-drop builder", desc: "20+ field types including symptom checklists, family history charts, matrix grids, file upload, e-signature, and conditional logic. Arrange in 1–4 column layouts to match the way your clinic actually documents." },
              { icon: ListChecks, title: "Smart auto-link to charts", desc: "Tag fields to patient demographics, medications, allergies, and history. Submissions auto-match to the correct patient and merge cleanly into the chart with provider review." },
              { icon: Send, title: "Push to patient portal", desc: "Assign any form to a patient with one click. They get an email + portal notification, complete it on their phone or laptop, and you see it the moment they hit submit." },
              { icon: Link2, title: "Direct links & website embeds", desc: "Each form gets a public link you can text, email, QR-code, or embed on your website — perfect for prospective patients and lead capture." },
              { icon: Smartphone, title: "Fill in-clinic on a tablet", desc: "Hand a tablet to the patient at check-in or use your front-desk device. In-Clinic Only mode keeps consents and witness-signature forms off the public portal." },
              { icon: PenLine, title: "Consents, signatures & PDFs", desc: "Capture typed or drawn signatures for consents and HIPAA forms. Every submission is exported as a clean, branded PDF that mirrors the on-screen form for the chart." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl p-5" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "#edf2e6" }}>
                  <Icon className="w-4 h-4" style={{ color: "#2e3a20" }} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#1c2414" }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#6a7a58" }}>{desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#f5f1e8", border: "1px solid #e8ddd0" }}>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 items-center">
              <div>
                <h3 className="text-lg sm:text-xl font-bold mb-3" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                  Four ways to deliver every form
                </h3>
                <ul className="space-y-2.5 text-sm" style={{ color: "#3a4a28" }}>
                  {[
                    "Push to the patient portal with email + in-app notification",
                    "Email-only delivery for patients who don't use the portal",
                    "In-clinic tablet mode for consents and witness signatures",
                    "Public links + website embed codes for lead capture and pre-booking",
                  ].map(line => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#2e3a20" }} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl p-6" style={{ backgroundColor: "#1c2414", border: "1px solid #d4c9b5", boxShadow: "0 12px 32px rgba(46,58,32,0.10)" }}>
                <div className="rounded-lg p-5" style={{ backgroundColor: "#f9f6f0" }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#7a8a64" }}>Assign Form to Patient</div>
                  <div className="space-y-2.5">
                    {[
                      { icon: Send, label: "Push to portal", desc: "Email + in-app notification" },
                      { icon: Link2, label: "Send share link", desc: "Text, email, or QR code" },
                      { icon: Smartphone, label: "Fill in-clinic on tablet", desc: "Hand off at check-in" },
                      { icon: PenLine, label: "Embed on your website", desc: "Lead capture + pre-booking" },
                    ].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="flex items-start gap-3 rounded-md p-3" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "#edf2e6" }}>
                          <Icon className="w-4 h-4" style={{ color: "#2e3a20" }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold" style={{ color: "#1c2414" }}>{label}</div>
                          <div className="text-xs mt-0.5" style={{ color: "#6a7a58" }}>{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product Demo Video ───────────────────────────────────────────── */}
      <section data-tour="copilot-demo" className="border-y" style={{ backgroundColor: "#f5f1e8", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7a8a64" }}>See it in action</span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              Meet your new clinical co-pilot
            </h2>
            <p className="text-sm mt-3 max-w-2xl mx-auto" style={{ color: "#5a6a4a" }}>
              Watch how ClinIQ surfaces the patterns hiding in plain sight — turning routine lab review into clear, defensible clinical decisions in seconds.
            </p>
          </div>
          <div
            className="rounded-2xl overflow-hidden mx-auto"
            style={{
              maxWidth: 960,
              border: "1px solid #d4c9b5",
              boxShadow: "0 24px 64px rgba(46,58,32,0.16), 0 4px 16px rgba(0,0,0,0.06)",
              backgroundColor: "#1c2414",
            }}
            data-testid="video-copilot-demo-wrapper"
          >
            <video
              src={COPILOT_DEMO_VIDEO_URL}
              autoPlay
              loop
              muted
              playsInline
              controls
              preload="metadata"
              className="w-full block"
              style={{ aspectRatio: "16 / 10", objectFit: "cover", backgroundColor: "#1c2414" }}
              data-testid="video-copilot-demo"
            />
          </div>
        </div>
      </section>

      {/* ── Patient Portal Features ──────────────────────────────────────── */}
      <section data-tour="patient-portal" className="border-y" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {/* Portal screenshot — phone-style mockup */}
            <div className="w-full lg:w-[340px] flex-shrink-0">
              <div
                className="rounded-2xl overflow-hidden mx-auto"
                style={{
                  maxWidth: 300,
                  border: "1px solid #d4c9b5",
                  boxShadow: "0 20px 56px rgba(46,58,32,0.14), 0 4px 16px rgba(0,0,0,0.06)",
                }}
              >
                {/* Mobile status bar mockup */}
                <div className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: "#f9f6f0", borderBottom: "1px solid #e8ddd0" }}>
                  <span className="text-[10px] font-semibold" style={{ color: "#5a7040" }}>Your Clinic · Patient Portal</span>
                </div>
                <img
                  src="/help-shots/portal-overview.png"
                  alt="ClinIQ patient portal — personalized health dashboard"
                  className="w-full block"
                />
              </div>
            </div>

            {/* Text + feature cards */}
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7a8a64" }}>For Patients</span>
              <h2 className="text-2xl sm:text-3xl font-bold mt-2 mb-3" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Finally — a patient portal that actually makes sense
              </h2>
              <p className="text-sm leading-relaxed mb-8" style={{ color: "#5a6a4a" }}>
                ClinIQ was built to help patients truly understand their health — not just see numbers on a page. Clear explanations, personalized guidance, and real insight — all in one place.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PATIENT_FEATURES.map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="rounded-xl p-4" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: "#edf2e6" }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: "#5a7040" }} />
                    </div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: "#1c2414" }}>{title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: "#6a7a58" }}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section data-tour="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Simple, all-inclusive pricing
          </h2>
          <p className="text-sm mt-3" style={{ color: "#6a7a58" }}>Everything included. No per-patient fees. No feature tiers.</p>
        </div>

        {/* Founder ribbon */}
        <div className="max-w-3xl mx-auto mb-5 rounded-lg px-6 py-2.5 text-center text-xs font-semibold" style={{ backgroundColor: "#5a7040", color: "#f9f6f0", letterSpacing: "0.03em" }}>
          Founder Access — first 50 members get $97/mo forever on Solo · use code <span className="font-mono tracking-widest">FOUNDER50</span>
        </div>

        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* ── Solo plan ── */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: "2px solid #2e3a20" }}>
            <div className="px-7 py-7 text-center" style={{ backgroundColor: "#2e3a20" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0b880" }}>Solo ClinIQ Plan</p>
              <div className="flex items-end justify-center gap-2 mb-1">
                <span className="text-5xl font-bold" style={{ color: "#f9f6f0" }}>$149</span>
                <span className="text-sm mb-2" style={{ color: "#a0b880" }}>/month</span>
              </div>
              <p className="text-xs font-semibold" style={{ color: "#c4d4a8" }}>→ $97/mo with <span className="font-mono">FOUNDER50</span></p>
              <p className="text-xs mt-1" style={{ color: "#a0b880" }}>After your 14-day free trial</p>
            </div>
            <div className="px-6 py-6 flex flex-col flex-1" style={{ backgroundColor: "#ffffff" }}>
              <ul className="space-y-2 mb-6 flex-1">
                <li className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                  <span className="text-xs font-semibold" style={{ color: "#3d4a30" }}>1 provider</span>
                </li>
                {INCLUDED.map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                    <span className="text-xs" style={{ color: "#3d4a30" }}>{item}</span>
                  </li>
                ))}
              </ul>
              <a href={appUrl("/register?plan=solo")} className="w-full">
                <Button className="w-full" size="lg" data-testid="link-pricing-trial" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                  Start free trial
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
              <p className="text-center text-xs mt-2.5" style={{ color: "#9aaa84" }}>
                No charge for 14 days · Cancel anytime
              </p>
            </div>
          </div>

          {/* ── Suite plan ── */}
          <div className="rounded-2xl overflow-hidden flex flex-col relative" style={{ border: "2px solid #5a7040" }}>
            <div className="absolute top-3 right-3">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: "#a0b880", color: "#1c2414" }}>
                Multi-provider
              </span>
            </div>
            <div className="px-7 py-7 text-center" style={{ backgroundColor: "#3d5228" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0b880" }}>ClinIQ Suite</p>
              <div className="flex items-end justify-center gap-2 mb-1">
                <span className="text-5xl font-bold" style={{ color: "#f9f6f0" }}>$249</span>
                <span className="text-sm mb-2" style={{ color: "#a0b880" }}>/month</span>
              </div>
              <p className="text-xs" style={{ color: "#c4d4a8" }}>+ $79/mo per additional provider</p>
              <p className="text-xs mt-1" style={{ color: "#a0b880" }}>After your 14-day free trial</p>
            </div>
            <div className="px-6 py-6 flex flex-col flex-1" style={{ backgroundColor: "#f4f8f0" }}>
              <ul className="space-y-2 mb-6 flex-1">
                <li className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                  <span className="text-xs font-semibold" style={{ color: "#3d4a30" }}>2 providers included · add more at $79/mo each</span>
                </li>
                {INCLUDED.map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                    <span className="text-xs" style={{ color: "#3d4a30" }}>{item}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                  <span className="text-xs font-medium" style={{ color: "#3d4a30" }}>Shared patient records across providers</span>
                </li>
              </ul>
              <a href={appUrl("/register?plan=suite")} className="w-full">
                <Button className="w-full" size="lg" data-testid="link-pricing-suite-trial" style={{ backgroundColor: "#5a7040", color: "#f9f6f0" }}>
                  Start free trial
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
              <p className="text-center text-xs mt-2.5" style={{ color: "#7a8a64" }}>
                No charge for 14 days · Upgrade from Solo anytime
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ── HIPAA / Trust ────────────────────────────────────────────────── */}
      <section className="border-t" style={{ backgroundColor: "#edf2e6", borderColor: "#c8d8b0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Lock className="w-4 h-4" style={{ color: "#2e3a20" }} />
            <span className="text-sm font-semibold" style={{ color: "#2e3a20" }}>HIPAA-Conscious Design</span>
          </div>
          <p className="text-xs max-w-xl mx-auto leading-relaxed" style={{ color: "#4a5a38" }}>
            ClinIQ is built with HIPAA technical controls including audit logging, session management, password enforcement, and audio deletion after transcription. A Business Associate Agreement is provided at registration.
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/cliniq-logo.png" alt="ClinIQ" className="h-6 w-auto opacity-70" />
            <span className="text-xs" style={{ color: "#9aaa84" }}>© {new Date().getFullYear()} ReAlign Health. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/privacy">
              <span className="text-xs cursor-pointer" style={{ color: "#7a8a64" }}>Privacy Policy</span>
            </Link>
            <Link href="/terms">
              <span className="text-xs cursor-pointer" style={{ color: "#7a8a64" }}>Terms of Service</span>
            </Link>
            <Link href="/baa">
              <span className="text-xs cursor-pointer" style={{ color: "#7a8a64" }}>BAA</span>
            </Link>
            <a href={appUrl("/login")}>
              <span className="text-xs cursor-pointer" style={{ color: "#7a8a64" }}>Sign In</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
