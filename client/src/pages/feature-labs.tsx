import { Link } from "wouter";
import {
  ChevronRight, FlaskConical, Heart, Dna, TrendingUp, AlertTriangle,
  Leaf, Utensils, FileDown, ArrowUpRight, CheckCircle2, ImageIcon,
  Activity, Stethoscope, BarChart3, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/app-url";

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

export default function FeatureLabsPage() {
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
              <FlaskConical className="w-3 h-3" />
              Lab Interpretation
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              See the complete clinical picture — instantly
            </h1>
            <p className="text-lg leading-relaxed mb-8" style={{ color: "#4a5a38" }}>
              ClinIQ interprets 60+ lab markers with real clinical context — connecting patterns across cardiovascular risk, hormones, metabolic health, and inflammation to surface what standard reference ranges miss.
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

      {/* ── Lab Interpretation Engine ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Lab Interpretation Engine</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Beyond "normal" and "abnormal"
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Standard labs flag anything outside a population average. ClinIQ applies clinical context — interpreting what a value actually means for this patient, right now. Color-coded status across every marker, gender-specific thresholds, and side-by-side trending across visits.
              </p>
              <Highlights items={[
                "60+ markers across CBC, CMP, lipids, thyroid, hormones, iron, and inflammatory markers",
                "Color-coded status: Normal, Borderline, Abnormal, Critical — at a glance",
                "Gender-specific clinical thresholds built in",
                "Side-by-side comparison across multiple visits",
                "AI-powered PDF extraction — upload a lab and values populate automatically",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Lab results panel — color-coded status across all markers" />
          </div>
        </div>
      </section>

      {/* ── Cardiovascular Risk ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Cardiovascular risk assessment panel" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Cardiovascular Risk</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Go beyond the standard lipid panel
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                LDL alone doesn't tell the full story. ClinIQ runs the AHA PREVENT calculator automatically and layers in advanced lipid markers and inflammatory risk to give a far more accurate picture of true cardiovascular risk.
              </p>
              <Highlights items={[
                "AHA 2023 PREVENT cardiovascular risk score — runs automatically from entered labs",
                "ApoB as the direct measure of atherogenic particle burden",
                "Lp(a) flagged as a familial risk factor requiring specific management",
                "hs-CRP stratified into low, moderate, and high cardiovascular risk tiers",
                "Advanced lipid fractionation (sdLDL, non-HDL, TG/HDL ratio) with clinical context",
                "Residual risk identified even when LDL is at target",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Male Hormone Patterns ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Male Hormone Patterns</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Testosterone interpretation done right
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Male hormone panels require more than a single total testosterone value. ClinIQ interprets the full hormonal picture — free and bioavailable testosterone, SHBG dynamics, estradiol balance, and conversion patterns — with clinical context at every step.
              </p>
              <Highlights items={[
                "Free and bioavailable testosterone with SHBG-contextualized interpretation",
                "Estradiol balance and aromatization pattern recognition",
                "LH and FSH to differentiate primary vs. secondary hypogonadism",
                "DHEA-S and adrenal contribution to overall androgen picture",
                "Thyroid panel with male-specific clinical thresholds",
                "PSA trending flagged with appropriate clinical guidance",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Male hormone interpretation panel" />
          </div>
        </div>
      </section>

      {/* ── Female Hormone Patterns ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Female hormone interpretation — phase-aware analysis" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Female Hormone Patterns</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                The clinical nuance female patients deserve
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Female labs are not just male labs with different reference ranges. ClinIQ's dedicated female engine applies menstrual phase context, perimenopause pattern recognition, and female-specific testosterone interpretation — the clinical depth that standard systems skip entirely.
              </p>
              <Highlights items={[
                "Phase-aware interpretation — estradiol and progesterone mean different things on day 3 vs. day 21",
                "Perimenopause pattern recognition: FSH trending, estradiol variability, cycle irregularity",
                "Female testosterone patterns — free, total, SHBG ratios, androgen excess flags",
                "Iron and ferritin thresholds calibrated for women, not population averages",
                "DHEA-S and cortisol with adrenal pattern context",
                "Thyroid interpretation with female-specific clinical nuance",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Insulin Resistance ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Insulin Resistance Screening</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Catch it before the A1c rises
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                A1c only becomes abnormal after years of metabolic dysfunction. ClinIQ looks upstream — at fasting insulin, the triglyceride/HDL ratio, uric acid, and metabolic syndrome patterns — to identify insulin resistance a decade before it becomes prediabetes.
              </p>
              <Highlights items={[
                "HOMA-IR and fasting insulin with clinically meaningful interpretation",
                "Triglyceride/HDL ratio as a validated surrogate for insulin resistance",
                "Uric acid elevated as an early metabolic dysfunction signal",
                "Metabolic syndrome pattern detection across multiple markers",
                "Fasting glucose trending with early warning thresholds below standard cutoffs",
                "Targeted lifestyle and supplement intervention guidance per phenotype",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Insulin resistance and metabolic screening panel" />
          </div>
        </div>
      </section>

      {/* ── Red Flag Alert System ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Red flag alerts — surfaced prominently at top of evaluation" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Red Flag Alert System</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Critical values you can't miss
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Red flags are surfaced prominently at the top of every evaluation — not buried in a list of 60 numbers. Gender-specific thresholds. Multi-marker pattern detection. Standing order triggers for values requiring urgent action.
              </p>
              <Highlights items={[
                "Prominent top-of-evaluation display — never buried",
                "Gender-specific clinical thresholds, not lab-flagged population ranges",
                "Multi-marker pattern detection (e.g. low sodium + elevated glucose + osmolality shift)",
                "Standing order trigger documentation for critical value protocols",
                "Red flags automatically included in patient reports and SOAP notes",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Supplement Recommendations ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Supplement Recommendations</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Recommendations tied to the actual labs
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Not a generic protocol list. ClinIQ generates supplement recommendations connected to specific lab findings — with the clinical rationale attached. You review and publish them to the patient portal when they're ready.
              </p>
              <Highlights items={[
                "Lab-linked recommendations — each suggestion references the finding driving it",
                "Your custom supplement library integrated with clinical protocols",
                "Clinician review before anything reaches the patient",
                "Published to patient portal with one click",
                "Patient refill requests route directly to your inbox",
                "Included in patient wellness PDF reports",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Supplement recommendations panel with lab-linked rationale" />
          </div>
        </div>
      </section>

      {/* ── Dietary & Lifestyle Guidance ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Dietary and lifestyle guidance in the patient portal" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Dietary & Lifestyle Guidance</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Nutrition guidance that actually matches the labs
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                When you publish a lab result to the patient portal, ClinIQ auto-generates dietary recommendations specific to that patient's values — "Oats — to help lower your LDL of 165 mg/dL" instead of a generic handout. Patients get guidance they can actually connect to their own health.
              </p>
              <Highlights items={[
                "Dietary recommendations generated from each lab's specific measured values",
                "Connected to red flags, interpretations, and supplement context",
                "Appears alongside lab results in the patient portal",
                "Clinician reviews before it reaches the patient",
                "Lifestyle guidance included in patient wellness PDF reports",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Patient Reports ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Patient Reports</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                One tap to publish — or export a full PDF
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Every lab evaluation can be turned into a clean, branded patient report — automatically populated with values, interpretations, red flags, recommendations, and dietary guidance. Publish it to the patient portal in one click, or export as a PDF to share by any channel.
              </p>
              <Highlights items={[
                "One-tap publish to patient portal — patients see it immediately",
                "Full wellness PDF export with clinic branding",
                "Includes lab values, plain-language interpretations, and red flags",
                "Supplement and dietary recommendations embedded automatically",
                "Patients can download reports from their portal at any time",
                "Professional format suitable for sharing with other providers",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Patient wellness report — PDF and portal publish" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ backgroundColor: "#2e3a20" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "#f9f6f0", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Start seeing what the numbers actually mean
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
