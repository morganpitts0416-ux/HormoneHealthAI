import { Link } from "wouter";
import {
  FlaskConical, Brain, Heart, Activity, FileText, Sparkles,
  Users, Shield, ChevronRight, CheckCircle2, Stethoscope,
  BarChart3, BookOpen, Leaf, ClipboardList, Zap, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appUrl } from "@/lib/app-url";

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
    desc: "From perimenopause shifts to iron deficiency and hormone optimization — ReAlign connects patterns across labs so nothing important gets overlooked.",
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-8 w-auto" />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#7a8a64" }}>ReAlign Health</span>
              <span className="text-base font-bold" style={{ color: "#1c2414" }}>ClinIQ</span>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <a href={appUrl("/login")}>
              <Button variant="ghost" size="sm" data-testid="link-signin">Sign In</Button>
            </a>
            <a href={appUrl("/register")}>
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
            Built by a practicing clinician for real-world care
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Stop guessing. Start seeing<br />the full clinical picture.
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8" style={{ color: "#4a5a38" }}>
            Built for clinicians who know there's more to the story — ClinIQ by ReAlign Health helps you connect the dots, identify patterns, and confidently guide your patients with care that actually makes sense.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={appUrl("/register")}>
              <Button size="lg" data-testid="link-hero-trial" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0", fontSize: "1rem", padding: "0 2rem" }}>
                Start your free 14-day trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <a href={appUrl("/login")}>
              <Button size="lg" variant="outline" data-testid="link-hero-signin" style={{ borderColor: "#c4b9a5", color: "#3d4a30" }}>
                Sign in to your account
              </Button>
            </a>
          </div>
          <p className="text-xs mt-4" style={{ color: "#9aaa84" }}>Built by a Nurse Practitioner. Designed for real clinical workflows.</p>
        </div>
      </section>

      {/* ── "Built differently" ──────────────────────────────────────────── */}
      <section className="border-y" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              Because busy visits miss things
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#5a6a4a" }}>
              ReAlign doesn't replace your clinical judgment — it expands it.<br className="hidden sm:block" />
              While you're focused on the visit, it's identifying patterns across cardiovascular risk, insulin resistance, iron deficiency, perimenopause, and more — surfacing what matters, even when time doesn't allow you to go there.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: FlaskConical,
                heading: "For the Clinician",
                body: 'Go beyond "normal" and "abnormal." ReAlign connects the dots across labs — helping you identify patterns, stratify risk, and make decisions with clarity and confidence.',
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
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
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

      {/* ── Patient Portal Features ──────────────────────────────────────── */}
      <section className="border-y" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#7a8a64" }}>For Patients</span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              Finally — a patient portal that actually makes sense
            </h2>
            <p className="text-sm mt-3 max-w-xl mx-auto" style={{ color: "#5a6a4a" }}>
              ClinIQ by ReAlign Health was built to help patients truly understand their health — not just see numbers on a page. Clear explanations, personalized guidance, and real insight — all in one place.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PATIENT_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl p-5" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "#edf2e6" }}>
                  <Icon className="w-4 h-4" style={{ color: "#5a7040" }} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#1c2414" }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#6a7a58" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Simple, all-inclusive pricing
          </h2>
          <p className="text-sm mt-3" style={{ color: "#6a7a58" }}>Everything included. No per-patient fees. No feature tiers.</p>
        </div>
        <div className="max-w-lg mx-auto rounded-2xl overflow-hidden" style={{ border: "2px solid #2e3a20" }}>
          <div className="px-8 py-8 text-center" style={{ backgroundColor: "#2e3a20" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0b880" }}>ClinIQ Monthly</p>
            <div className="flex items-end justify-center gap-1 mb-2">
              <span className="text-5xl font-bold" style={{ color: "#f9f6f0" }}>$97</span>
              <span className="text-sm mb-2" style={{ color: "#a0b880" }}>/month</span>
            </div>
            <p className="text-sm" style={{ color: "#c4d4a8" }}>After your 14-day free trial</p>
          </div>
          <div className="px-8 py-7" style={{ backgroundColor: "#ffffff" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-7">
              {INCLUDED.map(item => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#5a7040" }} />
                  <span className="text-xs" style={{ color: "#3d4a30" }}>{item}</span>
                </div>
              ))}
            </div>
            <a href={appUrl("/register")} className="w-full">
              <Button className="w-full" size="lg" data-testid="link-pricing-trial" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                Start your 14-day free trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <p className="text-center text-xs mt-3" style={{ color: "#9aaa84" }}>
              Card required to start trial · No charge for 14 days · Cancel anytime
            </p>
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
            <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-6 w-auto opacity-70" />
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
