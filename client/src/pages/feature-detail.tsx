import { Link, useParams } from "wouter";
import { ChevronRight, ArrowLeft, CheckCircle2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appUrl } from "@/lib/app-url";

interface FeaturePage {
  slug: string;
  category: string;
  title: string;
  tagline: string;
  description: string;
  highlights: string[];
  details: { heading: string; body: string }[];
}

const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "lab-interpretation",
    category: "Clinical Intelligence",
    title: "Lab Interpretation",
    tagline: "See beyond 'normal' — instantly.",
    description:
      "ClinIQ interprets 60+ lab markers with clinical context, not just reference ranges. Color-coded status indicators, gender-specific thresholds, and pattern recognition surface what a flat number never could.",
    highlights: [
      "60+ markers across CBC, CMP, lipids, thyroid, hormones, inflammatory markers, and more",
      "Gender-specific normal ranges and clinical thresholds",
      "Color-coded status: Normal, Borderline, Abnormal, Critical",
      "Prominent red flag alerts for values requiring urgent action",
      "Side-by-side trend view across multiple visits",
      "Male and female dedicated interpretation engines",
      "Quick lab entry and AI-powered PDF extraction",
    ],
    details: [
      {
        heading: "Not just a reference range checker",
        body: "Standard labs flag anything outside a population average. ClinIQ applies clinical context — interpreting what a TSH of 3.8 means for someone on levothyroxine, or why a 'normal' ferritin of 14 is clinically suboptimal for a woman with fatigue.",
      },
      {
        heading: "Gender-specific clinical logic",
        body: "Men and women are interpreted differently. Female lab panels apply menstrual phase context, hormone optimization ranges, and perimenopause pattern recognition that standard systems ignore.",
      },
      {
        heading: "Red flags you can't miss",
        body: "Critical values are surfaced at the top of every evaluation with clear clinical guidance — not buried in a list of 60 numbers.",
      },
    ],
  },
  {
    slug: "june-ai",
    category: "Clinical Intelligence",
    title: "June — AI Clinical Colleague",
    tagline: "Your AI colleague who actually knows your patient.",
    description:
      "June is an AI clinical colleague embedded directly in the patient chart. She has full context — labs, history, medications, SOAP notes, and your preferences — and responds like a knowledgeable colleague who's already reviewed the chart.",
    highlights: [
      "Full patient context in every response: labs, history, meds, allergies, chart notes",
      "Teach June your preferences — she remembers how you like to work",
      "Trigger rules: June activates specific protocols when you use certain phrases",
      "Patient-specific dietary and supplement recommendations",
      "Differential generation, protocol guidance, and clinical reasoning support",
      "Persistent conversation history per patient",
      "Clinician-only — never visible to the patient",
    ],
    details: [
      {
        heading: "She knows the chart before you ask",
        body: "Every time you open June for a patient, she has already read the full chart — labs, history, medications, allergies, and past notes. You don't have to paste or summarize anything.",
      },
      {
        heading: "Teach her how you work",
        body: "Use the 'Teach June' settings to define always-on preferences (e.g. 'never summarize my notes back to me'), trigger rules (e.g. 'when I say start GLP, include patient education'), and named context snippets she can reference.",
      },
      {
        heading: "A colleague, not a search engine",
        body: "June gives direct, clinical answers — not disclaimers and links. She reasons about the specific patient in front of you, not hypothetical cases.",
      },
    ],
  },
  {
    slug: "cardiovascular-risk",
    category: "Clinical Intelligence",
    title: "Cardiovascular Risk Assessment",
    tagline: "Go beyond the standard lipid panel.",
    description:
      "ClinIQ integrates PREVENT cardiovascular risk scoring with advanced lipid marker assessment — including ApoB, Lp(a), sdLDL, and hs-CRP — to give you a complete picture of true cardiovascular risk, not just LDL.",
    highlights: [
      "AHA PREVENT cardiovascular risk calculator built in",
      "ApoB and Lp(a) interpretation with clinical context",
      "Advanced lipid fractionation assessment",
      "hs-CRP inflammatory risk stratification",
      "Risk-stratified clinical recommendations",
      "Residual risk identification beyond standard statin targets",
      "Clear, defensible documentation of risk assessment",
    ],
    details: [
      {
        heading: "The PREVENT calculator, not just a lipid panel",
        body: "The 2023 AHA PREVENT model incorporates kidney function, metabolic health, and inflammatory markers — giving a far more accurate 10-year risk estimate than older calculators. ClinIQ runs it automatically from the lab values already entered.",
      },
      {
        heading: "ApoB and Lp(a) in clinical context",
        body: "LDL can be misleading. ClinIQ interprets ApoB as the direct measure of atherogenic particle burden, and flags elevated Lp(a) as a familial risk factor requiring specific management — not just a footnote.",
      },
      {
        heading: "hs-CRP and residual inflammatory risk",
        body: "Inflammation is an independent cardiovascular risk factor. ClinIQ stratifies hs-CRP into low, moderate, and high cardiovascular risk tiers and surfaces actionable clinical guidance for each.",
      },
    ],
  },
  {
    slug: "female-hormones",
    category: "Clinical Intelligence",
    title: "Female Hormone Pattern Recognition",
    tagline: "The clinical nuance female patients deserve.",
    description:
      "ClinIQ's female interpretation engine goes far beyond reference ranges — applying menstrual phase context, perimenopause pattern recognition, testosterone patterns, and gender-specific thresholds to give female patients the clinical depth their labs require.",
    highlights: [
      "Dedicated female lab interpretation engine",
      "Menstrual phase context for hormone interpretation",
      "Perimenopause and menopause pattern recognition",
      "Female testosterone pattern analysis (free, total, SHBG ratios)",
      "Thyroid interpretation with female-specific clinical context",
      "Iron and ferritin thresholds calibrated for women",
      "DHEA-S, cortisol, and adrenal pattern recognition",
    ],
    details: [
      {
        heading: "Phase-aware hormone interpretation",
        body: "Estradiol, progesterone, and LH/FSH mean different things on day 3 vs day 21. ClinIQ applies menstrual phase context to avoid misinterpretation — what looks 'normal' mid-cycle may be clinically significant in the luteal phase.",
      },
      {
        heading: "Perimenopause pattern recognition",
        body: "The lab picture of perimenopause is subtle and easy to miss. ClinIQ identifies FSH trending, cycle irregularity patterns, and estradiol variability — surfacing the pattern before a patient is dismissed as 'normal for age'.",
      },
      {
        heading: "Testosterone in women",
        body: "Female testosterone optimization requires a different clinical lens. ClinIQ interprets free and total testosterone with SHBG context, flags patterns of androgen excess, and identifies suboptimal levels missed by standard ranges.",
      },
    ],
  },
  {
    slug: "insulin-resistance",
    category: "Clinical Intelligence",
    title: "Insulin Resistance Screening",
    tagline: "Catch it before the A1c rises.",
    description:
      "ClinIQ identifies insulin resistance phenotypes using fasting insulin, glucose ratios, triglyceride patterns, and clinical markers — years before standard diabetes screening flags anything.",
    highlights: [
      "HOMA-IR and fasting insulin interpretation",
      "Triglyceride/HDL ratio as surrogate for insulin resistance",
      "Metabolic syndrome pattern recognition",
      "Fasting glucose trending with early warning thresholds",
      "Uric acid as an insulin resistance marker",
      "Targeted lifestyle and supplement intervention guidance",
      "Longitudinal tracking to measure intervention effectiveness",
    ],
    details: [
      {
        heading: "The markers most clinicians skip",
        body: "A1c only becomes abnormal after years of metabolic dysfunction. ClinIQ looks upstream — at fasting insulin, the TG/HDL ratio, and uric acid — to identify insulin resistance a decade before it becomes prediabetes.",
      },
      {
        heading: "Phenotype-based clinical guidance",
        body: "Not all insulin resistance looks the same. ClinIQ distinguishes between early hepatic, muscle, and adipose resistance patterns and surfaces the most relevant intervention strategy for each.",
      },
    ],
  },
  {
    slug: "red-flags",
    category: "Clinical Intelligence",
    title: "Red Flag Alert System",
    tagline: "Critical values that can't be missed.",
    description:
      "ClinIQ's red flag system applies gender-specific clinical thresholds to identify values requiring urgent action — surfaced prominently at the top of every evaluation so nothing critical gets buried in a long result list.",
    highlights: [
      "Gender-specific clinical red flag thresholds",
      "Prominent top-of-evaluation alert display",
      "Standing order triggers for critical value protocols",
      "Multi-system red flag pattern detection",
      "Red flags included in patient wellness reports",
      "Documented in SOAP notes and clinical summaries",
    ],
    details: [
      {
        heading: "Not the same as 'flagged by the lab'",
        body: "Lab flags use population statistics. ClinIQ red flags apply clinical thresholds — a potassium of 5.8 in someone on an ACE inhibitor is a different clinical situation than the same value in a healthy 25-year-old.",
      },
      {
        heading: "Pattern-based alerts, not just single values",
        body: "Some red flags only become visible in combination — a 'normal' sodium with an abnormal glucose and elevated osmolality tells a different story than either alone. ClinIQ detects multi-marker patterns that single-value flagging misses.",
      },
    ],
  },
  {
    slug: "soap-notes",
    category: "Documentation",
    title: "AI SOAP Note Generation",
    tagline: "End the visit. Start the note. It's already drafted.",
    description:
      "Record your encounter, and ClinIQ generates a complete, clinician-quality SOAP note — with a structured Review of Systems, assessment with ICD-10 codes, and a plan that reflects the actual visit. Review, edit, sign.",
    highlights: [
      "AI-generated SOAP notes from audio transcription",
      "Structured ROS using your customized normal-finding defaults",
      "Assessment with ICD-10 code suggestions",
      "Plan with supplement, medication, and protocol integration",
      "Manual block-based SOAP builder for typed notes",
      "Encounter templates for SOAP, Nurses Notes, and Non-Visit notes",
      "Electronic signing and locking for immutability",
      "PDF export with clinical letterhead and provider signature",
    ],
    details: [
      {
        heading: "From recording to signed note in minutes",
        body: "The full pipeline: record the encounter → AI transcribes and structures the content → SOAP note is generated in the background → clinician reviews and signs. Documentation that used to take 20 minutes now takes under 3.",
      },
      {
        heading: "Your defaults, your language",
        body: "ClinIQ remembers how you document normal findings. If 'RRR, no murmurs' is how you write a normal cardiac exam, that's what appears — not generic placeholder text.",
      },
      {
        heading: "Collaborating physician oversight",
        body: "Mid-level providers can route notes for physician co-signature with configurable quota tracking, prospective gating for controlled substance prescribing, and a full review workflow — all built in.",
      },
    ],
  },
  {
    slug: "encounter-templates",
    category: "Documentation",
    title: "Encounter Templates",
    tagline: "Every visit type, documented consistently.",
    description:
      "Build reusable note templates for your most common visit types — hormone consults, annual wellness, lab reviews, and more. ClinIQ AI extracts the right content from your transcript and fills the template intelligently.",
    highlights: [
      "Custom templates for SOAP, Nurses Notes, and Non-Visit types",
      "AI auto-extracts transcript content into template fields",
      "Role-based template restrictions (NP, PA, MD, RN)",
      "Clinic-wide or personal templates",
      "Standing instructions per template for AI guidance",
      "Integrated with the full SOAP note signing workflow",
    ],
    details: [
      {
        heading: "Built for specialty practice patterns",
        body: "A hormone consult note has a different structure than an acute sick visit. Templates let you define exactly how each visit type should be documented — and AI fills it from the actual transcript content.",
      },
      {
        heading: "Role-aware access",
        body: "Restrict templates to specific clinical roles — an RN template, an NP-only protocol note, or a clinic-wide annual wellness template that everyone uses consistently.",
      },
    ],
  },
  {
    slug: "ehr-chart",
    category: "Documentation",
    title: "EHR-Style Patient Chart",
    tagline: "Everything in one place — history, meds, notes, labs.",
    description:
      "Each patient has a persistent, structured chart: medical history, current medications, allergies, surgical history, family history, and social history — editable manually or auto-populated from form submissions and AI extraction.",
    highlights: [
      "Structured chart sections: history, medications, allergies, family/social history",
      "AI extraction from uploaded documents and form submissions",
      "Manual editing with rich text support",
      "Auto-populates from smart intake form submissions",
      "Chart Review mode for collaborating physician oversight",
      "Amendment and addendum support on locked notes",
      "Full audit trail on chart changes",
    ],
    details: [
      {
        heading: "The chart that builds itself",
        body: "When a patient completes an intake form, their medications, allergies, and medical history sync directly into the chart. When a document is uploaded, AI extracts the clinically relevant data. The chart populates as the relationship develops.",
      },
      {
        heading: "Locked notes with amendment support",
        body: "Once a SOAP note is signed and locked, it's immutable — but amendments and addenda can be attached. Every change is timestamped and attributed, giving you a defensible clinical record.",
      },
    ],
  },
  {
    slug: "patient-portal",
    category: "Patient Experience",
    title: "Patient Portal",
    tagline: "A portal patients actually want to use.",
    description:
      "ClinIQ's patient portal gives patients clear lab explanations, personalized supplement guidance, visit summaries, dietary recommendations, and direct access to their care — all branded to your practice.",
    highlights: [
      "Personalized lab result explanations in plain language",
      "Dietary recommendations tied to specific lab values",
      "Supplement guidance reviewed and published by the clinician",
      "Visit summaries and protocol access",
      "Secure messaging with the care team",
      "Medication refill request workflow",
      "Digital form completion from any device",
      "Branded to your practice",
    ],
    details: [
      {
        heading: "Lab results that make sense",
        body: "Instead of a list of numbers with reference ranges, patients see plain-language explanations of what each value means, why it matters, and what they can do about it.",
      },
      {
        heading: "Dietary guidance tied to their actual labs",
        body: "When a clinician publishes a lab result, the portal auto-generates dietary recommendations specific to that patient's values — 'Oats — to help lower your LDL of 165' instead of generic nutrition tips.",
      },
      {
        heading: "Clinician-curated, not AI-to-patient",
        body: "Everything in the patient portal is reviewed and published by the clinician before the patient sees it. ClinIQ assists; the clinician decides what reaches the patient.",
      },
    ],
  },
  {
    slug: "healthiq",
    category: "Patient Experience",
    title: "HealthIQ Hub",
    tagline: "Patients who understand their health stay engaged.",
    description:
      "The HealthIQ Hub gives patients a structured view of their body systems — scoring each area based on lab values, symptoms, and trends. An interactive, educational experience that keeps patients invested in their own care.",
    highlights: [
      "Body system health scores derived from labs and check-ins",
      "Interactive system cards with plain-language explanations",
      "Trend tracking over time",
      "Connected to daily check-in data",
      "Educational content tied to each patient's specific values",
      "Motivates patient engagement between visits",
    ],
    details: [
      {
        heading: "A health score patients understand",
        body: "Rather than raw lab numbers, patients see their cardiovascular health, metabolic health, hormonal balance, and other systems as clear, digestible scores — with context about what's driving each one.",
      },
      {
        heading: "Built for the in-between",
        body: "Most of healthcare happens between appointments. HealthIQ gives patients a reason to open the portal on off days — tracking their trends, completing check-ins, and staying connected to their care plan.",
      },
    ],
  },
  {
    slug: "digital-forms",
    category: "Patient Experience",
    title: "Digital Forms & Smart Intake",
    tagline: "Replace paper packets with a smarter intake experience.",
    description:
      "Build any form your clinic needs — new patient intake, medical history, consents, ROS, symptom checklists — with a drag-and-drop builder that wires directly into the patient chart. Assign as bundles, deliver in four ways.",
    highlights: [
      "20+ field types: symptom checklists, family history charts, matrix grids, e-signature, file upload",
      "Conditional logic — show or hide fields based on answers",
      "Smart field auto-link to patient demographics and chart domains",
      "Form bundles (packets) with sequential multi-form completion",
      "Four delivery modes: patient portal, email, in-clinic tablet, public link",
      "Patient name and demographics pre-populate automatically",
      "Submissions auto-match to patient and sync to chart",
      "Branded PDFs of every submission",
    ],
    details: [
      {
        heading: "Four ways to get every form completed",
        body: "Push to the portal, send via email link, hand a tablet at check-in, or embed on your website. Every form reaches patients exactly where they are — without requiring them to create an account for a public link.",
      },
      {
        heading: "Submissions that write the chart",
        body: "Tag form fields to chart domains — medications, allergies, medical history, surgical history. When a patient submits, the chart updates automatically, reviewed and confirmed by the clinician.",
      },
    ],
  },
  {
    slug: "daily-checkin",
    category: "Patient Experience",
    title: "Daily Check-In & Vitals Monitoring",
    tagline: "Stay connected to your patients every day, not just at visits.",
    description:
      "Patients log food, sleep, mood, energy, and symptoms daily. Clinicians direct targeted BP, HR, and weight monitoring with configurable alert thresholds — getting notified when values exceed clinical limits.",
    highlights: [
      "Patient self-reported daily logs: food, sleep, mood, energy, symptoms",
      "Clinician-directed vital monitoring: BP, HR, weight",
      "Configurable alert thresholds with clinician notifications",
      "Trend visualization over time",
      "Feeds into HealthIQ body system scoring",
      "Encourages daily patient engagement with their health",
    ],
    details: [
      {
        heading: "Clinician-directed, patient-executed",
        body: "You decide what you want tracked — blood pressure twice daily, morning weight, resting heart rate. Patients log it from their portal. You see the trend and get alerted when it crosses your threshold.",
      },
      {
        heading: "The data between the visits",
        body: "A blood pressure reading in your office is one data point. Thirty days of home BP readings tells a clinical story. Daily check-in gives you the longitudinal picture standard office visits can't.",
      },
    ],
  },
  {
    slug: "patient-management",
    category: "Practice Tools",
    title: "Patient Management",
    tagline: "Every patient. Every detail. Always in reach.",
    description:
      "Comprehensive patient profiles with lab history, trend charts, clinical chart, uploaded documents, form submissions, supplement orders, and a full encounter record — all in one place, accessible in seconds.",
    highlights: [
      "Persistent patient profiles with full clinical history",
      "Lab trend charts across all markers and all visits",
      "Document storage: outside records, PA forms, imaging, insurance cards",
      "Multi-tab chart: labs, encounters, forms, documents, vitals, notes",
      "Patient portal invite and engagement tracking",
      "Multi-provider access within a clinic",
      "Patient-safety tripwires to prevent cross-patient data errors",
    ],
    details: [
      {
        heading: "The full patient story in one view",
        body: "From the first lab panel to the most recent note, every data point about a patient is a single click away — organized, searchable, and easy to navigate during or before a visit.",
      },
      {
        heading: "Document storage that belongs in the chart",
        body: "Outside labs, PMP reports, imaging, insurance cards, consent forms, and referrals — all stored and categorized in the patient chart. Upload from desktop or scan multi-page documents with your device camera.",
      },
    ],
  },
  {
    slug: "appointments",
    category: "Practice Tools",
    title: "Appointments & Scheduling",
    tagline: "Scheduling that works around how your clinic operates.",
    description:
      "Full appointment scheduling with configurable visit types, provider availability, patient-facing booking, and a clinical calendar that connects directly to encounters and documentation.",
    highlights: [
      "Configurable appointment types with duration and buffer times",
      "Provider availability management with block scheduling",
      "Patient-facing appointment booking",
      "Appointment-to-encounter workflow integration",
      "Calendar overview with daily and weekly views",
      "Multi-provider scheduling for group practices",
    ],
    details: [
      {
        heading: "Connected to the clinical workflow",
        body: "An appointment in ClinIQ isn't just a calendar entry. It links to the patient chart, the encounter documentation, and the SOAP note workflow — so everything flows from the moment the visit is booked.",
      },
    ],
  },
  {
    slug: "supplements",
    category: "Practice Tools",
    title: "Supplement Library & Orders",
    tagline: "Recommend supplements with clinical precision.",
    description:
      "Build a custom supplement library tied to lab findings, clinical patterns, and patient profiles. Patients see your recommendations in the portal and can request refills — all tracked in a clinician inbox.",
    highlights: [
      "Custom supplement library with lab-linked recommendations",
      "Supplement recommendations published to patient portal",
      "Patient refill request workflow",
      "Clinician inbox for pending supplement orders",
      "Metagenics catalog integration",
      "Supplement recommendations included in wellness PDF reports",
    ],
    details: [
      {
        heading: "Recommendations tied to the actual labs",
        body: "Not a generic supplement list — recommendations that reference the specific lab value driving them. When ferritin is low, the iron recommendation appears with the clinical rationale, not as a blanket suggestion.",
      },
      {
        heading: "Refill requests in the clinician inbox",
        body: "Patients can request refills for supplements directly from the portal. Requests land in the clinician's inbox alongside pending supplement orders — reviewed and actioned from one place.",
      },
    ],
  },
];

const CATEGORY_ORDER = [
  "Clinical Intelligence",
  "Documentation",
  "Patient Experience",
  "Practice Tools",
];

export default function FeatureDetailPage() {
  const params = useParams<{ slug: string }>();
  const feature = FEATURE_PAGES.find(f => f.slug === params.slug);

  if (!feature) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#f9f6f0" }}>
        <p className="text-lg font-semibold" style={{ color: "#1c2414" }}>Feature page not found.</p>
        <Link href="/home">
          <Button variant="outline">Back to home</Button>
        </Link>
      </div>
    );
  }

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
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-3 h-3 mr-1" /> All Features
              </Button>
            </Link>
            <a href={appUrl("/login")}>
              <Button variant="ghost" size="sm">Sign In</Button>
            </a>
            <a href={appUrl("/register?plan=solo")}>
              <Button size="sm" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                Start Free Trial
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: "#7a8a64" }}>
            <Link href="/home" className="hover:underline cursor-pointer">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Features</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span style={{ color: "#1c2414" }}>{feature.title}</span>
          </div>
          <Badge
            variant="outline"
            className="mb-4 text-xs font-medium"
            style={{ borderColor: "#a0b880", color: "#3d4a30", backgroundColor: "#edf2e6" }}
          >
            {feature.category}
          </Badge>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4 leading-tight"
            style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}
          >
            {feature.title}
          </h1>
          <p className="text-xl font-medium mb-4" style={{ color: "#5a7040" }}>
            {feature.tagline}
          </p>
          <p className="text-base leading-relaxed max-w-2xl" style={{ color: "#4a5a38" }}>
            {feature.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={appUrl("/register?plan=solo")}>
              <Button size="lg" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                Start free trial
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
            <Link href="/home">
              <Button size="lg" variant="outline" style={{ borderColor: "#c4b9a5", color: "#3d4a30" }}>
                See all features
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Screenshot placeholder */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div
          className="rounded-2xl flex flex-col items-center justify-center gap-4 py-24"
          style={{
            border: "2px dashed #d4c9b5",
            backgroundColor: "#faf7f2",
          }}
        >
          <ImageIcon className="w-10 h-10" style={{ color: "#c4b9a5" }} />
          <p className="text-sm font-semibold" style={{ color: "#9aaa84" }}>
            Screenshots &amp; walkthrough coming soon
          </p>
          <p className="text-xs max-w-xs text-center" style={{ color: "#b5a990" }}>
            This feature page is being built out with real screenshots and screen recordings from the platform.
          </p>
        </div>
      </section>

      {/* Highlights */}
      <section className="border-y" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-xl sm:text-2xl font-bold mb-8" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            What's included
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
            {feature.highlights.map(h => (
              <li key={h} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5a7040" }} />
                <span className="text-sm leading-relaxed" style={{ color: "#3a4a28" }}>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Detail sections */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-14 space-y-12">
        {feature.details.map(d => (
          <div key={d.heading} className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-12">
            <h3 className="text-base font-bold leading-snug" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              {d.heading}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>{d.body}</p>
          </div>
        ))}
      </section>

      {/* More features */}
      <section className="border-t" style={{ borderColor: "#e8ddd0", backgroundColor: "#f5f1e8" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-lg font-bold mb-6" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
            More features
          </h2>
          <div className="flex flex-wrap gap-2">
            {FEATURE_PAGES.filter(f => f.slug !== feature.slug).map(f => (
              <Link key={f.slug} href={`/features/${f.slug}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer text-xs py-1 px-3"
                  style={{ borderColor: "#d4c9b5", color: "#3d4a30", backgroundColor: "#ffffff" }}
                >
                  {f.title}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ backgroundColor: "#2e3a20" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "#f9f6f0", fontFamily: "Source Serif 4, Georgia, serif" }}>
            See it in your practice
          </h2>
          <p className="text-sm mb-8" style={{ color: "#a0b880" }}>
            14 days free. No credit card required. Cancel any time.
          </p>
          <a href={appUrl("/register?plan=solo")}>
            <Button size="lg" style={{ backgroundColor: "#f9f6f0", color: "#2e3a20", fontWeight: 600 }}>
              Start your free trial
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </section>

    </div>
  );
}

export { FEATURE_PAGES, CATEGORY_ORDER };
