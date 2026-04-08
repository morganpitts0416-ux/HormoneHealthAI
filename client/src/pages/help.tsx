import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Search, ChevronRight, FlaskConical, Users, Mic, FileText,
  Heart, Moon, BarChart3, MessageSquare, CreditCard, Settings, ShieldCheck,
  Pill, BookOpen, Star, CheckCircle2, AlertTriangle, Zap, Upload, TrendingUp,
  HelpCircle, Video,
} from "lucide-react";

interface Section {
  id: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
}

const SECTIONS: Section[] = [
  { id: "getting-started", icon: Star, label: "Getting Started" },
  { id: "male-labs", icon: FlaskConical, label: "Male Lab Interpretation" },
  { id: "female-labs", icon: FlaskConical, label: "Female Lab Interpretation" },
  { id: "patients", icon: Users, label: "Patient Profiles & History" },
  { id: "encounters", icon: Mic, label: "Clinical Encounters & AI Pipeline", badge: "AI" },
  { id: "soap", icon: FileText, label: "SOAP Notes" },
  { id: "cardiovascular", icon: Heart, label: "PREVENT Cardiovascular Risk" },
  { id: "sleep", icon: Moon, label: "STOP-BANG Sleep Screening" },
  { id: "supplements", icon: Pill, label: "Supplement Recommendations" },
  { id: "wellness-report", icon: BookOpen, label: "Patient Wellness Reports" },
  { id: "portal", icon: MessageSquare, label: "Patient Portal & Messaging" },
  { id: "billing", icon: CreditCard, label: "Billing & Subscription" },
  { id: "account", icon: Settings, label: "Account & Staff Management" },
];

const CONTENT: Record<string, React.ReactNode> = {
  "getting-started": (
    <div className="space-y-6">
      <VideoPlaceholder title="Getting Started with ClinIQ" />
      <Guide title="First Login & Setup">
        <Steps steps={[
          "After registering, you will be prompted to sign the HIPAA Business Associate Agreement (BAA). Scroll through the full document, type your full legal name, and click I Agree & Sign.",
          "You will land on your Dashboard. This is your command center — all features are accessible from here.",
          "Navigate to Account (top right) to complete your profile: clinic name, title, and contact info.",
          "Invite staff members from the Account page under the Staff Access section if your clinic has multiple users.",
          "Your 14-day free trial begins automatically. No payment is required until the trial ends.",
        ]} />
      </Guide>
      <Guide title="Dashboard Overview">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>
          The dashboard is divided into two main columns:
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Left column" desc="Quick-start tiles for Male Interpretation, Female Interpretation, Clinical Encounters, and Patient Profiles." />
          <Bullet label="Right column" desc="Notifications, red flag alerts, pending reviews, and clinical action items surfaced by the AI." />
          <Bullet label="Header" desc="Access Billing, Account settings, and Help from the top-right buttons." />
        </ul>
      </Guide>
      <Guide title="Navigation Quick Reference">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Male Labs", path: "/male", desc: "Enter and interpret male lab panels" },
            { label: "Female Labs", path: "/female", desc: "Hormone and female-specific interpretation" },
            { label: "Patients", path: "/patients", desc: "Patient profiles and lab history" },
            { label: "Encounters", path: "/encounters", desc: "Audio transcription and SOAP notes" },
          ].map(item => (
            <div key={item.path} className="rounded-md p-3 border text-sm" style={{ borderColor: "#e8ddd0", backgroundColor: "#fdf9f5" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>{item.label}</p>
              <p style={{ color: "#7a8a64" }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </Guide>
    </div>
  ),

  "male-labs": (
    <div className="space-y-6">
      <VideoPlaceholder title="Male Lab Interpretation Walkthrough" />
      <Guide title="Entering Lab Values">
        <Steps steps={[
          "From the Dashboard, click Male Lab Interpretation or navigate to the Labs tab.",
          "Select or create a patient using the Patient selector at the top. Type a name to search, or click New Patient to add one.",
          "You can upload a PDF lab report — ClinIQ will auto-extract the values using AI. Supported formats: Pathgroup and most standard hospital PDFs.",
          "Alternatively, enter values manually into each lab field. Fields are organized by category: Hormones, Metabolic, CBC, Lipids, Thyroid, etc.",
          "Select the correct units for each value where applicable.",
          "Click Interpret Results when all values are entered.",
        ]} />
      </Guide>
      <Guide title="Understanding Results">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Color coding" desc="Green = Optimal, Yellow = Borderline, Orange = Abnormal, Red = Critical / Red Flag." />
          <Bullet label="Red Flag alerts" desc="Critical values appear at the top of results in a red alert box with recommended clinical actions." />
          <Bullet label="Reference vs Optimal ranges" desc="ClinIQ shows both standard lab reference ranges and clinically optimal ranges side by side." />
          <Bullet label="AI Recommendations" desc="Scroll down to see AI-generated clinical recommendations including supplement, lifestyle, and follow-up suggestions." />
          <Bullet label="Custom ranges" desc="Override reference or optimal ranges per marker in Account > Lab Range Preferences." />
        </ul>
      </Guide>
      <Guide title="Standing Orders & Clinical Logic">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ automatically checks for clinical patterns including erythrocytosis thresholds, testosterone optimization protocols, insulin resistance phenotypes, FIB-4 liver scoring, and lipid management guidelines. Any triggered standing order appears as an alert card in the results.
        </p>
      </Guide>
    </div>
  ),

  "female-labs": (
    <div className="space-y-6">
      <VideoPlaceholder title="Female Lab Interpretation Walkthrough" />
      <Guide title="Female-Specific Workflow">
        <Steps steps={[
          "Navigate to Female Lab Interpretation from the dashboard.",
          "Select or create a patient, then choose the patient's menstrual cycle phase (Follicular, Ovulatory, Luteal, Menstrual, or Postmenopausal). This adjusts hormone reference ranges dynamically.",
          "Upload a PDF or enter lab values manually. Female-specific markers include estradiol, progesterone, FSH, LH, DHEA-S, and more.",
          "Click Interpret Results to generate the full interpretation.",
        ]} />
      </Guide>
      <Guide title="Female-Specific Features">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Hormone phase context" desc="Reference ranges automatically adjust based on the selected menstrual phase or menopausal status." />
          <Bullet label="Testosterone pattern recognition" desc="ClinIQ identifies female testosterone patterns for clinical optimization — low-normal, optimal, or elevated with context." />
          <Bullet label="Perimenopause indicators" desc="Specific pattern detection for perimenopause transitions based on FSH, estradiol, and symptom markers." />
          <Bullet label="Iron & thyroid" desc="Female-specific iron deficiency thresholds and expanded thyroid panel interpretation including reverse T3." />
        </ul>
      </Guide>
      <Guide title="Insulin Resistance Screening">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ screens for insulin resistance likelihood and identifies one of four phenotypes: Classic IR, Lean IR, Hyperinsulinemic Normoglycemic, and Post-prandial IR. Each phenotype includes trigger criteria, pathophysiology summary, and treatment recommendations.
        </p>
      </Guide>
    </div>
  ),

  "patients": (
    <div className="space-y-6">
      <VideoPlaceholder title="Patient Profiles & Lab History" />
      <Guide title="Creating & Finding Patients">
        <Steps steps={[
          "Navigate to Patient Profiles from the dashboard or the patients link.",
          "Click New Patient to create a profile — enter name, date of birth, gender, and optional contact info.",
          "Use the search bar to find existing patients by name.",
          "Click a patient card to open their full profile including all past lab results.",
        ]} />
      </Guide>
      <Guide title="Lab History & Trends">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="History view" desc="All past lab result sessions are listed in reverse chronological order. Click any session to expand the full panel." />
          <Bullet label="Trend indicators" desc="Each lab marker shows an arrow (up, down, stable) comparing the current value to the previous result." />
          <Bullet label="Trend charts" desc="Click the chart icon next to any marker to view a time-series chart of that value across all sessions." />
          <Bullet label="21 tracked markers" desc="ClinIQ tracks clinical trends for 21 key markers and generates both clinician-facing and patient-facing trend insights." />
        </ul>
      </Guide>
      <Guide title="Patient Portal Access">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          From a patient profile, you can invite the patient to their portal. They will receive an email with a link to set their password and view their results, wellness reports, supplement recommendations, and messages.
        </p>
      </Guide>
    </div>
  ),

  "encounters": (
    <div className="space-y-6">
      <VideoPlaceholder title="Clinical Encounters & 6-Stage AI Pipeline" />
      <Guide title="Creating an Encounter">
        <Steps steps={[
          "Navigate to Clinical Encounters from the dashboard.",
          "Click New Encounter and select the patient this encounter is for.",
          "Fill in the visit Details tab: visit type, chief complaint, and any relevant notes.",
          "Optionally link existing lab results to provide AI context for SOAP generation.",
        ]} />
      </Guide>
      <Guide title="Audio Upload & Transcription (Stage 1)">
        <Steps steps={[
          "In the Details tab, click Upload Audio or use Record to capture the visit audio directly.",
          "ClinIQ uses OpenAI Whisper to transcribe the audio. The audio file is deleted immediately after processing — it is never stored in the database.",
          "Click Run Transcription to start Stage 1. Progress is shown in the pipeline status bar.",
          "The raw transcript appears in the Transcript tab once Stage 1 completes.",
        ]} />
      </Guide>
      <Guide title="The 6-Stage AI Pipeline">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>Run stages in order using the pipeline buttons in the Transcript tab:</p>
        <div className="space-y-2">
          {[
            { stage: "1", label: "Transcribe", desc: "Converts audio to raw text using Whisper." },
            { stage: "2", label: "Normalize", desc: "Corrects medical terminology and applies speaker diarization — labels each line as Clinician or Patient." },
            { stage: "3", label: "Extract Facts", desc: "Identifies chief concerns, symptoms, diagnoses, and plan items from the transcript." },
            { stage: "4", label: "Generate SOAP", desc: "Builds a chart-ready SOAP note using extracted facts and linked lab context. Flags uncertain items for clinician review." },
            { stage: "5", label: "Evidence", desc: "Suggests clinical guideline citations and evidence for each diagnosis with confidence levels." },
            { stage: "6", label: "Patient Summary", desc: "Generates a patient-facing plain-language summary publishable to the patient portal." },
          ].map(item => (
            <div key={item.stage} className="flex gap-3 items-start text-sm">
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>{item.stage}</span>
              <div>
                <span className="font-semibold" style={{ color: "#1c2414" }}>{item.label}: </span>
                <span style={{ color: "#5a6a4a" }}>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </Guide>
      <Guide title="Reviewing & Editing the SOAP Note">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          The SOAP Note tab displays the AI-generated note. Items flagged as uncertain or requiring clinician review are highlighted. You can edit any section of the note directly — the AI output is a starting point, not a final document. Once satisfied, the note can be copied to your EHR.
        </p>
      </Guide>
    </div>
  ),

  "soap": (
    <div className="space-y-6">
      <VideoPlaceholder title="SOAP Notes from Lab Interpretation" />
      <Guide title="Generating a SOAP Note from Lab Results">
        <Steps steps={[
          "After running lab interpretation (male or female), scroll to the AI Recommendations section.",
          "Click Generate SOAP Note. ClinIQ will draft a chart-ready note incorporating all lab values, red flags, risk scores, and supplement recommendations.",
          "Review the generated note in the SOAP modal. All four sections (Subjective, Objective, Assessment, Plan) are editable.",
          "Copy the note to your clipboard or EHR system.",
        ]} />
      </Guide>
      <Guide title="SOAP Safety Guardrails">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ's SOAP generation is designed to be clinically conservative. It will not invent physical exam findings, vitals, or clinical observations that are not supported by the data provided. Items with insufficient evidence are flagged with a review indicator rather than stated as fact.
        </p>
      </Guide>
    </div>
  ),

  "cardiovascular": (
    <div className="space-y-6">
      <VideoPlaceholder title="PREVENT Cardiovascular Risk Assessment" />
      <Guide title="Running a PREVENT Assessment">
        <Steps steps={[
          "PREVENT risk scores are calculated automatically when you enter a complete lipid panel and basic patient demographics.",
          "Ensure the patient profile has accurate age, sex, and that you have entered: total cholesterol, HDL, LDL, systolic blood pressure, diabetes status, and smoking status.",
          "The assessment appears in the results section under Cardiovascular Risk.",
          "Review the 10-year and 30-year risk scores for CVD, ASCVD, and Heart Failure.",
        ]} />
      </Guide>
      <Guide title="Understanding the Risk Output">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="10-year CVD risk" desc="Probability of a cardiovascular event in the next 10 years using the 2023 AHA PREVENT equations." />
          <Bullet label="30-year CVD risk" desc="Long-term risk estimate for younger patients where 10-year risk may understate lifetime burden." />
          <Bullet label="ASCVD vs Heart Failure" desc="Separate risk estimates for atherosclerotic cardiovascular disease and heart failure are provided." />
          <Bullet label="ApoB & Lp(a) adjustment" desc="If ApoB and Lp(a) are entered, the advanced lipid marker section adjusts the overall risk stratification." />
          <Bullet label="hs-CRP" desc="High-sensitivity CRP is interpreted separately for inflammatory risk stratification." />
        </ul>
      </Guide>
    </div>
  ),

  "sleep": (
    <div className="space-y-6">
      <VideoPlaceholder title="STOP-BANG Sleep Apnea Screening" />
      <Guide title="Running the STOP-BANG Questionnaire">
        <Steps steps={[
          "STOP-BANG is available within the lab interpretation results for applicable patients.",
          "Answer the 8 yes/no questions based on patient-reported history and clinical observation.",
          "ClinIQ calculates the risk score and classifies the patient as Low, Intermediate, or High risk for obstructive sleep apnea (OSA).",
          "The result and recommended next steps appear in the interpretation output and are included in the SOAP note if generated.",
        ]} />
      </Guide>
      <Guide title="STOP-BANG Components">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          The 8 components are: Snoring, Tiredness, Observed apnea, Pressure (high blood pressure), BMI greater than 35, Age greater than 50, Neck circumference greater than 40 cm, and Gender (male). A score of 0–2 = Low risk, 3–4 = Intermediate, 5–8 = High risk.
        </p>
      </Guide>
    </div>
  ),

  "supplements": (
    <div className="space-y-6">
      <VideoPlaceholder title="Supplement Recommendations & Custom Library" />
      <Guide title="How Supplement Recommendations Work">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ recommends supplements based on three sources: the built-in Metagenics catalog mapped to lab values, your custom supplement library, and detected clinical phenotypes (e.g. insulin resistance subtype, iron deficiency pattern). Recommendations appear automatically after lab interpretation.
        </p>
      </Guide>
      <Guide title="Customizing the Supplement Selector">
        <Steps steps={[
          "After running interpretation, scroll to the Supplement Recommendations section.",
          "Use the interactive selector to add, remove, or reorder supplements for this patient's report.",
          "Supplements can be filtered by category, gender, and relevance.",
          "The selected supplements are included in the Patient Wellness PDF Report and visible in the patient portal.",
        ]} />
      </Guide>
      <Guide title="Building Your Custom Supplement Library">
        <Steps steps={[
          "Navigate to Account > Custom Supplements.",
          "Click Add Supplement and fill in the name, description, pricing, and gender filter.",
          "Set trigger rules: lab-value based (e.g. Ferritin < 30), symptom-based, or combined lab + symptom conditions.",
          "Add a patient-facing description — ClinIQ can generate one using AI based on the supplement's purpose.",
          "Supplements with matching trigger rules will automatically appear in recommendations when the conditions are met.",
        ]} />
      </Guide>
      <Guide title="Discount Settings">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          In Account > Supplement Pricing, set a clinic-wide discount — either a percentage or flat dollar amount — applied to all supplement orders placed through the patient portal.
        </p>
      </Guide>
    </div>
  ),

  "wellness-report": (
    <div className="space-y-6">
      <VideoPlaceholder title="Generating Patient Wellness PDF Reports" />
      <Guide title="Generating a Wellness Report">
        <Steps steps={[
          "After completing lab interpretation and selecting supplements, scroll to the bottom of the results page.",
          "Click Generate Patient Wellness Report.",
          "ClinIQ will compile the full report including: lab summary with plain-language explanations, personalized diet recommendations, supplement plan, lifestyle guidance, and smoking cessation education if applicable.",
          "The PDF is generated and opens in a new tab for download or printing.",
          "You can also publish the report to the patient's portal so they can access it directly.",
        ]} />
      </Guide>
      <Guide title="What the Report Includes">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Lab summary" desc="Patient-friendly explanations of every value with color-coded status and plain-language descriptions." />
          <Bullet label="AI diet recommendations" desc="Personalized dietary guidance generated based on detected patterns and phenotypes." />
          <Bullet label="Supplement plan" desc="The selected supplements with patient-facing descriptions, dosing context, and pricing." />
          <Bullet label="Lifestyle guidance" desc="Exercise, sleep, and stress recommendations tailored to the clinical findings." />
          <Bullet label="Follow-up reminders" desc="Recommended timeframes for repeat testing based on the clinical picture." />
        </ul>
      </Guide>
    </div>
  ),

  "portal": (
    <div className="space-y-6">
      <VideoPlaceholder title="Patient Portal & Messaging Setup" />
      <Guide title="Inviting Patients to the Portal">
        <Steps steps={[
          "Open the patient's profile from Patient Profiles.",
          "Click Invite to Portal and confirm the patient's email address.",
          "The patient receives an email with a link to set their password and access their portal.",
          "From their portal, patients can view lab results, wellness reports, supplement recommendations, and messages.",
        ]} />
      </Guide>
      <Guide title="Messaging Modes">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>Configure messaging in Account > Portal Settings. Four modes are available:</p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="None" desc="Messaging is disabled. The message tab is hidden from the patient portal." />
          <Bullet label="In-app" desc="Patients and clinicians exchange messages directly within ClinIQ." />
          <Bullet label="SMS link" desc="Patients are shown a phone number or SMS link to message the clinic outside the app." />
          <Bullet label="External API" desc="Two-way bridge connects to your existing messaging platform (Spruce, Klara, etc.) via webhook. Requires webhook URL configuration." />
        </ul>
      </Guide>
      <Guide title="Publishing Encounter Summaries">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          In the Encounters page, after completing Stage 6 (Patient Summary), click Publish to Portal. The patient-facing summary will appear in the patient's portal under their visit history.
        </p>
      </Guide>
    </div>
  ),

  "billing": (
    <div className="space-y-6">
      <VideoPlaceholder title="Billing & Subscription Management" />
      <Guide title="Starting Your Subscription">
        <Steps steps={[
          "Your 14-day free trial starts automatically at registration — no credit card required.",
          "Before the trial ends, navigate to Billing (top-right header button).",
          "Click Add Payment Method and enter your card details securely via Stripe.",
          "Click Subscribe — your subscription starts at $97/month and renews automatically.",
        ]} />
      </Guide>
      <Guide title="Managing Your Subscription">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Billing page" desc="Shows your current plan status, next billing date, and payment method on file." />
          <Bullet label="Cancel" desc="Click Cancel Subscription to stop renewal. Access continues until the end of the current billing period." />
          <Bullet label="Reactivate" desc="If cancelled, click Reactivate before the period ends to resume without re-entering payment details." />
          <Bullet label="Failed payments" desc="You will receive an email notification if a payment fails. Update your payment method in the Billing page." />
        </ul>
      </Guide>
      <Guide title="Complimentary Access">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          Some accounts are granted complimentary access by the ReAlign Health team. If your account has complimentary access, the Billing page will show a Complimentary Access banner and no payment method is required.
        </p>
      </Guide>
    </div>
  ),

  "account": (
    <div className="space-y-6">
      <VideoPlaceholder title="Account Settings & Staff Management" />
      <Guide title="Account Settings">
        <Steps steps={[
          "Click Account in the top-right header to open your account settings.",
          "Update your profile: clinic name, title, first and last name.",
          "Change your password under Security Settings.",
          "Set your Lab Range Preferences to override default optimal or reference ranges for any of 60+ markers, per gender.",
        ]} />
      </Guide>
      <Guide title="Inviting Staff Members">
        <Steps steps={[
          "In Account, scroll to the Staff Access section.",
          "Click Invite Staff Member and enter their email address and role.",
          "They will receive an invitation email with a link to set their password.",
          "Staff members operate within your clinic workspace with role-based access restrictions.",
          "Remove staff access at any time by clicking the remove button next to their name.",
        ]} />
      </Guide>
      <Guide title="Security & HIPAA Controls">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Login lockout" desc="Accounts are locked after 5 failed login attempts to prevent unauthorized access." />
          <Bullet label="Session timeout" desc="Inactive sessions show a warning dialog and auto-logout to protect patient data." />
          <Bullet label="Password requirements" desc="Strong password enforcement is required for all accounts." />
          <Bullet label="Audit logging" desc="All data access and changes are audit-logged for HIPAA compliance." />
          <Bullet label="BAA on file" desc="Your signed Business Associate Agreement is viewable and downloadable from the Account page at any time." />
        </ul>
      </Guide>
    </div>
  ),
};

function VideoPlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-md border-2 border-dashed flex flex-col items-center justify-center p-8 text-center" style={{ borderColor: "#d4c9b5", backgroundColor: "#fdf9f5" }}>
      <Video className="h-8 w-8 mb-2" style={{ color: "#c4b9a5" }} />
      <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>Video walkthrough coming soon</p>
      <p className="text-xs mt-1" style={{ color: "#a0aa90" }}>{title}</p>
    </div>
  );
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold mb-3" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>{title}</h3>
      {children}
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm" style={{ color: "#5a6a4a" }}>
          <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5" style={{ backgroundColor: "#e8f0de", color: "#2e3a20" }}>{i + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullet({ label, desc }: { label: string; desc: string }) {
  return (
    <li className="flex gap-2 text-sm">
      <ChevronRight className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#5a7040" }} />
      <span><span className="font-semibold" style={{ color: "#1c2414" }}>{label}: </span><span style={{ color: "#5a6a4a" }}>{desc}</span></span>
    </li>
  );
}

export default function HelpCenter() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState("getting-started");
  const [search, setSearch] = useState("");

  const filtered = SECTIONS.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase())
  );

  const active = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0", fontFamily: "IBM Plex Sans, Inter, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} style={{ color: "#2e3a20" }} data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" style={{ color: "#5a7040" }} />
            <span className="font-semibold text-base" style={{ color: "#1c2414" }}>Help Center</span>
          </div>
          <Badge className="ml-1 text-xs" style={{ backgroundColor: "#e8f0de", color: "#2e3a20" }}>
            ClinIQ Documentation
          </Badge>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex gap-6">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col gap-1 w-64 flex-shrink-0">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "#9aaa84" }} />
            <Input
              placeholder="Search topics..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-sm"
              data-testid="input-help-search"
              style={{ backgroundColor: "#fff", borderColor: "#d4c9b5" }}
            />
          </div>
          {filtered.map(section => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                onClick={() => { setActiveSection(section.id); setSearch(""); }}
                data-testid={`nav-help-${section.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors w-full"
                style={{
                  backgroundColor: isActive ? "#2e3a20" : "transparent",
                  color: isActive ? "#f9f6f0" : "#3d4a30",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{section.label}</span>
                {section.badge && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                    style={{ backgroundColor: isActive ? "#5a7040" : "#e8f0de", color: isActive ? "#f9f6f0" : "#2e3a20" }}>
                    {section.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Mobile section picker */}
        <div className="md:hidden w-full mb-4">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "#9aaa84" }} />
            <Input
              placeholder="Search topics..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-sm"
              style={{ backgroundColor: "#fff", borderColor: "#d4c9b5" }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filtered.map(section => (
              <button
                key={section.id}
                onClick={() => { setActiveSection(section.id); setSearch(""); }}
                className="text-xs px-3 py-1.5 rounded-full border font-medium"
                style={{
                  backgroundColor: section.id === activeSection ? "#2e3a20" : "#fdf9f5",
                  color: section.id === activeSection ? "#f9f6f0" : "#3d4a30",
                  borderColor: section.id === activeSection ? "#2e3a20" : "#d4c9b5",
                }}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <div className="mb-5 pb-4 border-b" style={{ borderColor: "#e8ddd0" }}>
            <div className="flex items-center gap-2">
              {active && <active.icon className="h-5 w-5" style={{ color: "#5a7040" }} />}
              <h2 className="text-xl font-bold" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                {active?.label}
              </h2>
            </div>
          </div>
          {CONTENT[activeSection]}

          {/* Footer note */}
          <div className="mt-10 pt-6 border-t flex items-start gap-2 text-xs" style={{ borderColor: "#e8ddd0", color: "#9aaa84" }}>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: "#c07800" }} />
            <span>
              ClinIQ is a clinical decision support tool. All AI-generated content — including lab interpretations, SOAP notes, and supplement recommendations — should be reviewed by a licensed clinician before use in patient care.
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}
