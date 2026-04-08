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
    title: "AI-Powered Lab Interpretation",
    desc: "Gender-specific reference ranges, color-coded status indicators, and plain-language clinical insights for 60+ lab markers — instantly.",
  },
  {
    icon: Heart,
    title: "PREVENT Cardiovascular Risk",
    desc: "Full 2023 AHA PREVENT equations for 10-year and 30-year CVD, ASCVD, and Heart Failure risk, plus advanced lipid and Lp(a) assessment.",
  },
  {
    icon: Activity,
    title: "Insulin Resistance Phenotyping",
    desc: "Identifies likelihood and four distinct IR phenotypes with trigger criteria, pathophysiology, and targeted treatment recommendations.",
  },
  {
    icon: Stethoscope,
    title: "Clinical Encounter Documentation",
    desc: "Record or upload audio — Whisper transcribes, AI diarizes speakers, and a 6-stage pipeline generates chart-ready SOAP notes with evidence flags.",
  },
  {
    icon: BarChart3,
    title: "Pattern & Trend Recognition",
    desc: "Female testosterone optimization, perimenopause patterns, FIB-4 scoring, STOP-BANG sleep apnea screening, and iron deficiency phenotyping.",
  },
  {
    icon: BookOpen,
    title: "Evidence-Based Guidance",
    desc: "Guideline citations (Class I–III, Level A–C) surfaced inline within SOAP notes — click any flag to see the supporting evidence without leaving the note.",
  },
  {
    icon: ClipboardList,
    title: "Lab History & Trend Charts",
    desc: "Persistent patient profiles, searchable lab history, trend indicators, and visual charts for 21 key markers with longitudinal clinical insights.",
  },
  {
    icon: Shield,
    title: "HIPAA Technical Controls",
    desc: "Audit logging, login lockout, session timeouts with warning dialogs, and robust password enforcement. Audio is deleted immediately after transcription.",
  },
];

const PATIENT_FEATURES = [
  {
    icon: FileText,
    title: "Understandable Health Reports",
    desc: "Patients receive plain-language explanations of their labs — not just numbers, but what they mean for their health and what comes next.",
  },
  {
    icon: Leaf,
    title: "Personalized Supplement Protocol",
    desc: "AI-matched supplement recommendations based on lab values, symptoms, and detected phenotypes — curated and approved by the clinician.",
  },
  {
    icon: Sparkles,
    title: "Diet & Lifestyle Recommendations",
    desc: "AI-generated, lab-informed dietary guidance, lifestyle recommendations, and personalized recipes delivered directly to the patient portal.",
  },
  {
    icon: Users,
    title: "Visit Summary Access",
    desc: "Clinicians can publish patient-facing encounter summaries to the portal — keeping patients informed and engaged between visits.",
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
              Built to see what a busy visit can miss
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "#5a6a4a" }}>
              ClinIQ wasn't designed to replace clinical judgment — it was built to expand it. While a clinician is focused on the chief complaint, ClinIQ is simultaneously evaluating cardiovascular risk, insulin resistance phenotype, iron deficiency patterns, perimenopause markers, and more. It surfaces what matters, even when the visit doesn't have time to go there.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: FlaskConical,
                heading: "For the Clinician",
                body: "A reasoning tool that interprets labs through multiple clinical lenses simultaneously — not just flagging out-of-range values, but providing differential context, risk stratification, and evidence-guided recommendations.",
              },
              {
                icon: Users,
                heading: "For the Patient",
                body: "A boutique portal that replaces the confusing PDF printout with educational, plain-language insights — personalized diet, supplements, and lifestyle guidance their clinician has curated specifically for them.",
              },
              {
                icon: Brain,
                heading: "For the Practice",
                body: "Encounter documentation, AI SOAP notes with evidence flags, and trend tracking across visits — reducing documentation time while increasing the depth of clinical insight captured.",
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
            Every angle, in one platform
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
              A portal patients actually understand
            </h2>
            <p className="text-sm mt-3 max-w-xl mx-auto" style={{ color: "#5a6a4a" }}>
              Built originally to give patients a meaningful, educational window into their own health — not just numbers on a page.
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
