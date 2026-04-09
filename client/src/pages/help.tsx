import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Search, ChevronRight, FlaskConical, Users, Mic, FileText,
  Heart, Moon, BarChart3, MessageSquare, Settings, ShieldCheck,
  Pill, BookOpen, Star, AlertTriangle, ZoomIn, X,
  HelpCircle, Video, SlidersHorizontal, Link2, CheckCircle2, Info,
} from "lucide-react";

// ── Screenshot types & lightbox ────────────────────────────────────────────

interface Shot { src: string; caption: string; }

function ScreenshotGallery({ shots }: { shots: Shot[] }) {
  const [lightbox, setLightbox] = useState<Shot | null>(null);

  return (
    <>
      <div className={`grid gap-3 mb-2 ${shots.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {shots.map((shot) => (
          <button
            key={shot.src}
            onClick={() => setLightbox(shot)}
            className="group relative rounded-md overflow-hidden border text-left"
            style={{ borderColor: "#d4c9b5" }}
          >
            <img
              src={shot.src}
              alt={shot.caption}
              className="w-full object-cover object-top"
              style={{ maxHeight: 220 }}
            />
            <div
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "rgba(44,58,32,0.35)" }}
            >
              <ZoomIn className="h-7 w-7 text-white drop-shadow" />
            </div>
            <p className="text-xs px-2 py-1.5 font-medium" style={{ color: "#5a6a4a", backgroundColor: "#fdf9f5" }}>
              {shot.caption}
            </p>
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.82)" }}
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-9 right-0 text-white flex items-center gap-1 text-sm opacity-80 hover:opacity-100"
            >
              <X className="h-4 w-4" /> Close
            </button>
            <img src={lightbox.src} alt={lightbox.caption} className="w-full rounded-md shadow-xl" />
            <p className="text-center text-white text-sm mt-2 opacity-75">{lightbox.caption}</p>
          </div>
        </div>
      )}
    </>
  );
}

function VideoPlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-md border-2 border-dashed flex flex-col items-center justify-center p-6 text-center mb-2" style={{ borderColor: "#d4c9b5", backgroundColor: "#fdf9f5" }}>
      <Video className="h-7 w-7 mb-1.5" style={{ color: "#c4b9a5" }} />
      <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>Screenshots coming soon</p>
      <p className="text-xs mt-0.5" style={{ color: "#a0aa90" }}>{title}</p>
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

// ── Section definitions ────────────────────────────────────────────────────

interface Section { id: string; icon: React.ElementType; label: string; badge?: string; }

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
  { id: "clinic-preferences", icon: SlidersHorizontal, label: "Clinic Preferences" },
  { id: "account", icon: Settings, label: "Account & Staff Management" },
  { id: "integrations", icon: Link2, label: "Integrations", badge: "Zapier" },
];

// ── Section content ────────────────────────────────────────────────────────

const CONTENT: Record<string, React.ReactNode> = {

  "getting-started": (
    <div className="space-y-6">
      <Guide title="The Clinician Dashboard">
        <ScreenshotGallery shots={[
          { src: "/help-shots/dashboard.png", caption: "Dashboard — your command center with notifications, patient messages, supplement orders, recent patients, and quick-launch tiles for all workflows." },
        ]} />
        <ul className="space-y-2 text-sm mt-3" style={{ color: "#5a6a4a" }}>
          <Bullet label="Top section" desc="Notifications panel — shows unread patient messages, pending supplement orders, and clinical action items." />
          <Bullet label="Clinical Documentation" desc="Launches Encounter Documentation for audio transcription and SOAP note generation." />
          <Bullet label="Lab Evaluations" desc="Quick access to Male and Female Lab Interpretation workflows." />
          <Bullet label="Recent Patients" desc="Jump directly into a patient's profile or start a new lab session from the bottom of the dashboard." />
        </ul>
      </Guide>
      <Guide title="First Login & Setup">
        <Steps steps={[
          "After registering, you will be prompted to sign the HIPAA Business Associate Agreement (BAA). Scroll through the full document, type your full legal name, and click I Agree & Sign.",
          "You will land on your Dashboard. All features are accessible from the tiles and header buttons.",
          "Navigate to Account (top right) to complete your profile: clinic name, title, and contact info.",
          "Invite staff members from the Account page under the Staff Access section if your clinic has multiple users.",
          "Your 14-day free trial starts automatically. No payment is required until the trial ends.",
        ]} />
      </Guide>
    </div>
  ),

  "male-labs": (
    <div className="space-y-6">
      <Guide title="Lab Entry & Results">
        <ScreenshotGallery shots={[
          { src: "/help-shots/female-lab-entry-1.png", caption: "Lab entry form — upload a PDF for AI extraction or enter values manually. Demographics and cardiovascular risk factors are at the top." },
          { src: "/help-shots/lab-results.png", caption: "Clinical Interpretation Summary — every marker shows value, status, reference range, clinical assessment, and management guidance." },
        ]} />
      </Guide>
      <Guide title="Entering Lab Values">
        <Steps steps={[
          "From the Dashboard, click Male Lab Interpretation.",
          "Select or create a patient using the patient search at the top. Type a name to search, or click New to add one.",
          "Upload a PDF lab report — ClinIQ will auto-extract the values using AI. Supported formats include Pathgroup and most standard hospital PDFs.",
          "Alternatively, enter values manually into each lab field. Fields are organized by category: Hormones, Metabolic, CBC, Lipids, Thyroid, etc.",
          "Click Interpret Labs when all values are entered.",
        ]} />
      </Guide>
      <Guide title="Understanding the Results Table">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Color coding" desc="Green = Normal/Optimal, Yellow/Orange = Borderline, Red = Critical or Red Flag." />
          <Bullet label="Assessment column" desc="Plain-language clinical interpretation for each marker." />
          <Bullet label="Management column" desc="Recommended clinical action for each finding." />
          <Bullet label="Alert column" desc="Critical values and standing-order triggers appear as red alert flags." />
          <Bullet label="AI Recommendations" desc="Scroll below the table for AI-generated clinical recommendations including supplement, lifestyle, and follow-up suggestions." />
        </ul>
      </Guide>
    </div>
  ),

  "female-labs": (
    <div className="space-y-6">
      <Guide title="Female Lab Entry — Step by Step">
        <ScreenshotGallery shots={[
          { src: "/help-shots/female-lab-entry-1.png", caption: "Step 1 — Upload a PDF for AI extraction or enter patient demographics and cardiovascular risk factors manually." },
          { src: "/help-shots/female-lab-entry-2.png", caption: "Step 2 — Complete the STOP-BANG sleep apnea screening, then set the Menstrual & Hormonal Context and check any active symptoms." },
          { src: "/help-shots/female-lab-entry-3.png", caption: "Step 3 — Enter hormone markers (SHBG, Estradiol, Progesterone, DHEA-S, AMH), Iron Studies, Vitamins, and Inflammation markers, then click Interpret Labs." },
        ]} />
      </Guide>
      <Guide title="Female-Specific Features">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="AI-Powered PDF Upload" desc="Click Upload PDF to have ClinIQ automatically extract and fill in lab values from a Pathgroup or hospital PDF report." />
          <Bullet label="Menstrual phase" desc="Select the patient's cycle phase (Follicular, Ovulatory, Luteal, Menstrual, or Postmenopausal) — hormone reference ranges adjust automatically." />
          <Bullet label="HRT & birth control flags" desc="Check On HRT or On Birth Control to adjust relevant reference ranges and clinical interpretation." />
          <Bullet label="Symptom assessment" desc="Check any current symptoms (Hot Flashes, Night Sweats, Sleep Disruption, etc.) — these drive phenotype detection and supplement recommendations." />
          <Bullet label="AMH (ovarian reserve)" desc="Enter Anti-Mullerian Hormone for ovarian reserve assessment, particularly relevant for perimenopause evaluation." />
        </ul>
      </Guide>
      <Guide title="Insulin Resistance Screening">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ screens for insulin resistance likelihood and identifies one of four phenotypes: Classic IR, Lean IR, Hyperinsulinemic Normoglycemic, and Post-prandial IR. Each phenotype includes trigger criteria, pathophysiology summary, and treatment recommendations. This appears automatically in the interpretation results when the pattern is detected.
        </p>
      </Guide>
    </div>
  ),

  "patients": (
    <div className="space-y-6">
      <Guide title="Patient Profiles">
        <ScreenshotGallery shots={[
          { src: "/help-shots/patient-profiles.png", caption: "Patient Profiles — search by name or MRN, filter by gender, view clinical encounters, clinical snapshot, and full lab history." },
          { src: "/help-shots/lab-results.png", caption: "Lab History — click View Details on any past session to open the full Clinical Interpretation Summary with every marker, status, and management note." },
        ]} />
      </Guide>
      <Guide title="Creating & Finding Patients">
        <Steps steps={[
          "Navigate to Patient Profiles from the dashboard or the header.",
          "Click New to create a profile — enter name, clinic, and gender.",
          "Use the search bar to find existing patients by name or MRN.",
          "Click a patient in the left panel to open their full profile.",
          "From the profile, use the top buttons: New Lab Interpretation, New Encounter, Invite to Portal, or Delete Patient.",
        ]} />
      </Guide>
      <Guide title="Lab History & Clinical Snapshot">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Lab History" desc="All past lab sessions are listed in the Lab History section with date and overall status. Click View Details to open the full interpretation." />
          <Bullet label="Clinical Snapshot" desc="After at least 2 lab sessions, ClinIQ generates a clinical snapshot comparing trends across key markers with clinician and patient-facing insights." />
          <Bullet label="Trend indicators" desc="Each marker shows an arrow (improving, worsening, stable) relative to the prior result." />
          <Bullet label="Clinical Encounters" desc="All documented encounters for this patient are listed with status badges (Transcribed, SOAP, Draft Summary)." />
        </ul>
      </Guide>
    </div>
  ),

  "encounters": (
    <div className="space-y-6">
      <Guide title="Creating an Encounter & Recording Audio">
        <ScreenshotGallery shots={[
          { src: "/help-shots/encounter-details.png", caption: "New Encounter — Details tab. Select the patient, visit type, and chief complaint. Optionally link lab results for AI context. Then record or upload the session audio." },
          { src: "/help-shots/encounter-transcript.png", caption: "After recording or uploading, the raw transcription appears in the Session Notes area. ClinIQ shows a word count and the HIPAA notice confirming audio is never stored." },
        ]} />
        <Steps steps={[
          "Click New Encounter from the Encounters page or from a patient's profile.",
          "Select the patient, visit type (e.g. Follow-up), and enter the chief complaint.",
          "Optionally link existing lab results — the AI will reference these when generating the SOAP note.",
          "In Session Notes, click Record to capture live audio, or Upload File to upload a pre-recorded audio file.",
          "Click Start Recording Session. When finished, click Stop — the transcript will appear in the text area.",
          "Click Save before moving to the next pipeline stage.",
        ]} />
      </Guide>
      <Guide title="The 6-Stage AI Pipeline">
        <ScreenshotGallery shots={[
          { src: "/help-shots/encounter-processing.png", caption: "AI Processing — the pipeline shows an animated indicator while analyzing the encounter. Each stage runs sequentially." },
        ]} />
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>Run each stage in order using the pipeline buttons in the Transcript tab:</p>
        <div className="space-y-2">
          {[
            { stage: "1", label: "Transcribe", desc: "Converts audio to raw text using OpenAI Whisper. Audio is deleted immediately — never stored." },
            { stage: "2", label: "Normalize", desc: "Corrects medical terminology and applies speaker diarization, labeling each line as Clinician or Patient." },
            { stage: "3", label: "Extract Facts", desc: "Identifies chief concerns, symptoms, diagnoses, and plan items from the transcript." },
            { stage: "4", label: "Generate SOAP", desc: "Builds a chart-ready SOAP note using extracted facts and linked lab context. Flags uncertain items for clinician review." },
            { stage: "5", label: "Evidence", desc: "Suggests clinical guideline citations for each diagnosis with confidence levels and alignment status." },
            { stage: "6", label: "Patient Summary", desc: "Generates a plain-language patient-facing summary publishable directly to the patient portal." },
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
    </div>
  ),

  "soap": (
    <div className="space-y-6">
      <Guide title="The SOAP Note">
        <ScreenshotGallery shots={[
          { src: "/help-shots/soap-note-1.png", caption: "SOAP Note tab — AI-generated chart note with Chief Complaint, Subjective (HPI, Medical History, ROS), Objective, and Assessment/Plan sections." },
          { src: "/help-shots/soap-note-2.png", caption: "Assessment/Plan — each diagnosis includes ICD-10 code, clinical evidence citations, and a detailed care plan. Use Copy Note to paste into your EHR." },
          { src: "/help-shots/soap-evidence-popup.png", caption: "Clinical Evidence popup — click any citation badge to view the full evidence summary, evidence class, level of evidence, and journal citation." },
        ]} />
      </Guide>
      <Guide title="Working with the SOAP Note">
        <Steps steps={[
          "After running the pipeline through Stage 4, open the SOAP Note tab.",
          "Review the AI-generated note. Click Edit at the top to make changes to any section directly.",
          "Click any citation badge (e.g. 4 citations) in the Assessment/Plan to open the Clinical Evidence popup with the supporting guidelines.",
          "Use Validate to check for any flagged uncertain items that need clinician review before signing.",
          "Click Regenerate to rerun Stage 4 if you need a fresh SOAP note after editing the transcript.",
          "When satisfied, click Copy Note to copy the clean text, or Save SOAP to lock it to the encounter record.",
          "Switch to the Evidence tab to see all guideline citations and gap analysis alongside the note.",
        ]} />
      </Guide>
      <Guide title="SOAP Safety Guardrails">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ will not invent physical exam findings, vitals, or clinical observations that are not supported by the audio transcript or linked lab data. Items with insufficient evidence are flagged with a review indicator rather than stated as fact. The SOAP note is a starting point — always review before copying to your EHR.
        </p>
      </Guide>
    </div>
  ),

  "cardiovascular": (
    <div className="space-y-6">
      <Guide title="PREVENT Risk Factors Entry">
        <ScreenshotGallery shots={[
          { src: "/help-shots/female-lab-entry-1.png", caption: "Patient Demographics & Cardiovascular Risk Factors — enter age, race, systolic BP, BMI, and check diabetes, smoking, statin therapy, and family history flags before running interpretation." },
        ]} />
      </Guide>
      <Guide title="Running a PREVENT Assessment">
        <Steps steps={[
          "PREVENT risk scores are calculated automatically when you enter a complete lipid panel and patient demographics.",
          "In the lab entry form, complete the Patient Demographics & Cardiovascular Risk Factors section: age, systolic blood pressure, BMI, and all checkboxes (diabetes, current smoker, statin therapy, family history of premature ASCVD).",
          "Enter the lipid panel values: Total Cholesterol, HDL, LDL.",
          "Click Interpret Labs — the PREVENT assessment appears automatically in the results under Cardiovascular Risk.",
        ]} />
      </Guide>
      <Guide title="Understanding the Risk Output">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="10-year CVD risk" desc="Probability of a cardiovascular event in the next 10 years using the 2023 AHA PREVENT equations." />
          <Bullet label="30-year CVD risk" desc="Long-term risk estimate — most useful for younger patients where 10-year risk understates lifetime burden." />
          <Bullet label="ASCVD vs Heart Failure" desc="Separate risk estimates for atherosclerotic cardiovascular disease and heart failure are provided." />
          <Bullet label="ApoB & Lp(a)" desc="If entered, the advanced lipid marker section adjusts overall risk stratification and flags elevated values." />
          <Bullet label="hs-CRP" desc="High-sensitivity CRP is interpreted separately for inflammatory risk stratification." />
        </ul>
      </Guide>
    </div>
  ),

  "sleep": (
    <div className="space-y-6">
      <Guide title="STOP-BANG in the Lab Entry Form">
        <ScreenshotGallery shots={[
          { src: "/help-shots/female-lab-entry-2.png", caption: "STOP-BANG Sleep Apnea Screening — five checkboxes visible here: Snoring (loud), Excessive Daytime Tiredness, Observed Breathing Pauses, BMI over 35, and Neck Circumference over 40 cm. Age and gender are pulled from demographics automatically." },
        ]} />
      </Guide>
      <Guide title="Completing the STOP-BANG Questionnaire">
        <Steps steps={[
          "The STOP-BANG section appears in the lab entry form below the cardiovascular risk factors.",
          "Answer all 8 yes/no questions based on patient-reported history and your clinical observation.",
          "Age (over 50) and Gender (male) are factored in automatically from the patient demographics you entered above.",
          "Run lab interpretation — the STOP-BANG score and risk classification appear in the results.",
        ]} />
      </Guide>
      <Guide title="STOP-BANG Scoring">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          The 8 components are: <strong>S</strong>noring (loud), <strong>T</strong>iredness (excessive daytime), <strong>O</strong>bserved apnea, blood <strong>P</strong>ressure (hypertension), <strong>B</strong>MI greater than 35, <strong>A</strong>ge greater than 50, <strong>N</strong>eck circumference greater than 40 cm, and <strong>G</strong>ender (male). A score of 0–2 = Low risk, 3–4 = Intermediate risk, 5–8 = High risk for obstructive sleep apnea. Recommended next steps are included in the interpretation output and SOAP note.
        </p>
      </Guide>
    </div>
  ),

  "supplements": (
    <div className="space-y-6">
      <Guide title="What Patients See — Supplement Protocol">
        <ScreenshotGallery shots={[
          { src: "/help-shots/portal-protocol.png", caption: "Protocol tab in the patient portal — patients see their supplement list with recommended vs optional labels, pricing (with any applied discount), and can order directly through Metagenics." },
          { src: "/help-shots/portal-supplements.png", caption: "Supplement cards show product name, dosing, patient-facing description, and provider notes. Patients can also save recipes tied to dietary recommendations." },
        ]} />
      </Guide>
      <Guide title="How Supplement Recommendations Work">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          ClinIQ recommends supplements based on three sources: the built-in Metagenics catalog mapped to lab values, your custom supplement library, and detected clinical phenotypes (e.g. insulin resistance subtype, iron deficiency pattern). Recommendations appear automatically after lab interpretation.
        </p>
      </Guide>
      <Guide title="Customizing the Supplement Selector">
        <Steps steps={[
          "After running interpretation, scroll to the Supplement Recommendations section.",
          "Use the interactive selector to add, remove, or reorder supplements for this patient's report.",
          "Supplements can be filtered by category, gender, and relevance to the current findings.",
          "The selected supplements are included in the Patient Wellness PDF and visible in the patient portal Protocol tab.",
        ]} />
      </Guide>
      <Guide title="Building Your Custom Supplement Library">
        <Steps steps={[
          "Navigate to Account, then Custom Supplements.",
          "Click Add Supplement and fill in the name, description, pricing, and gender filter.",
          "Set trigger rules: lab-value based (e.g. Ferritin under 30), symptom-based, or combined lab + symptom conditions.",
          "Add a patient-facing description — ClinIQ can generate one using AI based on the supplement purpose.",
          "Supplements with matching trigger rules will automatically appear in recommendations when the conditions are met.",
        ]} />
      </Guide>
      <Guide title="Discount Settings">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          In Account under Supplement Pricing, set a clinic-wide discount — either a percentage or flat dollar amount — applied to all supplement orders placed through the patient portal. The discount badge is shown automatically to patients on the Protocol tab.
        </p>
      </Guide>
    </div>
  ),

  "wellness-report": (
    <div className="space-y-6">
      <Guide title="What Patients See — Lab Visit Summary">
        <ScreenshotGallery shots={[
          { src: "/help-shots/portal-lab-modal.png", caption: "Lab Visit Summary modal — patients tap any lab visit to open a summary with three expandable sections: Your Lab Values, Dietary and Lifestyle Guidance, and Your Health Assessment." },
          { src: "/help-shots/portal-lab-values.png", caption: "Your Lab Values — each marker is listed with value, unit, phase-adjusted reference range, and a color-coded status dot. Patients can see exactly what was measured and whether it is within range." },
        ]} />
        <ScreenshotGallery shots={[
          { src: "/help-shots/portal-dietary.png", caption: "Dietary and Lifestyle Guidance — AI-generated personalized diet plan with specific foods to emphasize, portion guidance, and clinical rationale tied to the patient's actual lab findings." },
          { src: "/help-shots/portal-recipes.png", caption: "Recipe Ideas — clickable recipe suggestions tied to recommended foods. Patients can save recipes directly from the portal for easy reference." },
        ]} />
      </Guide>
      <Guide title="Generating a Wellness Report">
        <Steps steps={[
          "After completing lab interpretation and selecting supplements, scroll to the bottom of the results page.",
          "Click Generate Patient Wellness Report.",
          "ClinIQ compiles the full report: lab summary with plain-language explanations, personalized diet recommendations, supplement plan, lifestyle guidance, and smoking cessation education if applicable.",
          "The PDF opens in a new tab for download or printing.",
          "You can also publish the report to the patient portal — it appears automatically in the patient's Lab Evaluations list.",
        ]} />
      </Guide>
      <Guide title="What the Report Includes">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Lab values" desc="Every marker with value, reference range, status dot, and phase-specific context where applicable." />
          <Bullet label="AI diet plan" desc="Personalized dietary guidance with specific foods, portions, and clinical rationale tied to the patient's findings." />
          <Bullet label="Recipe ideas" desc="Clickable recipe suggestions mapped to recommended foods — patients can save them directly." />
          <Bullet label="Supplement plan" desc="The selected supplements with patient-facing descriptions, dosing, and pricing." />
          <Bullet label="Health assessment" desc="Plain-language summary of the overall clinical picture and recommended next steps." />
        </ul>
      </Guide>
    </div>
  ),

  "portal": (
    <div className="space-y-6">
      <Guide title="The Patient Portal — Overview">
        <ScreenshotGallery shots={[
          { src: "/help-shots/portal-overview.png", caption: "Patient portal dashboard — personalized greeting, Message your care team button, quick stats (Last Labs, Protocol supplements, Lab Visits), and Health Progress section showing trend changes in key markers with plain-language explanations." },
          { src: "/help-shots/portal-overview-2.png", caption: "Scrolling down — Visit Summaries, Lab Evaluations list, and the Wellness Protocol section showing active supplement recommendations with product descriptions." },
        ]} />
      </Guide>
      <Guide title="Visit Summaries in the Portal">
        <ScreenshotGallery shots={[
          { src: "/help-shots/portal-visit-summary.png", caption: "Visit Summary expanded — patients tap Read Summary to view the full plain-language encounter note published by their clinician, including what was discussed and their care plan." },
          { src: "/help-shots/patient-summary.png", caption: "Clinician side — in the Encounter Summary tab, edit the patient-facing note then click Publish to Patient Portal to send it to the patient's portal immediately." },
        ]} />
      </Guide>
      <Guide title="Inviting Patients to the Portal">
        <Steps steps={[
          "Open the patient's profile from Patient Profiles.",
          "Click Invite to Portal and confirm the patient's email address.",
          "The patient receives an email with a link to set their password and access their portal.",
          "From their portal, patients see their health progress trends, visit summaries, lab evaluations, supplement protocol, and messages.",
        ]} />
      </Guide>
      <Guide title="Health Progress — Trend Indicators">
        <p className="text-sm" style={{ color: "#5a6a4a" }}>
          The Health Progress section compares the two most recent lab visits. Markers with significant changes are highlighted with a trend arrow and a plain-language explanation (e.g. "Your estrogen level shifted significantly — erratic estrogen is one of the hallmarks of perimenopause"). Stable markers are grouped together below. This gives patients meaningful context without requiring clinical literacy.
        </p>
      </Guide>
      <Guide title="Messaging Modes">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>Configure messaging in Account under Portal Settings. Four modes are available:</p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="None" desc="Messaging is disabled. The Messages tab is hidden from the patient portal." />
          <Bullet label="In-app" desc="Patients and clinicians exchange messages directly within ClinIQ." />
          <Bullet label="SMS link" desc="Patients are shown a phone number or SMS link to message the clinic outside the app." />
          <Bullet label="External API" desc="Two-way bridge to your existing platform (Spruce, Klara, etc.) via webhook. Requires webhook URL configuration in Account settings." />
        </ul>
      </Guide>
    </div>
  ),

  "clinic-preferences": (
    <div className="space-y-6">

      <Guide title="Patient Portal Messaging">
        <ScreenshotGallery shots={[
          { src: "/help-shots/account-messaging.png", caption: "Patient Portal Messaging settings — choose how patients can contact you through the portal." },
        ]} />
        <p className="text-sm mt-3 mb-3" style={{ color: "#5a6a4a" }}>
          Found in Account Settings, the Portal Messaging section controls how patients can reach you from their portal. There are four modes:
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="No messaging" desc="Patients do not see a messaging option in their portal." />
          <Bullet label="In-app messaging" desc="Patients send messages through the portal and you reply from within the patient's profile in ClinIQ. Full two-way messaging entirely inside the platform." />
          <Bullet label="Text / SMS link" desc="When patients tap Message Provider, their SMS app opens pre-addressed to your clinic phone number. Enter your Spruce Health number (or any clinic number) in the Messaging Phone Number field. Replies come in through your SMS or Spruce inbox as normal." />
          <Bullet label="Two-way bridge — coming soon" desc="A direct API bridge to Spruce, Klara, or any webhook-capable messaging platform so portal messages and replies flow through your existing system. This integration is in development and will be available in a future update." />
        </ul>
        <div className="mt-4 rounded-md px-4 py-3 text-sm" style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}>
          <span className="font-semibold">Current recommendation:</span> Use <span className="font-semibold">Text / SMS link</span> with your Spruce Health number for seamless hand-off to your existing Spruce inbox, or use <span className="font-semibold">In-app messaging</span> to keep all patient communication inside ClinIQ.
        </div>
      </Guide>

      <Guide title="Custom Supplement Library">
        <ScreenshotGallery shots={[
          { src: "/help-shots/account-supplement-library.png", caption: "Supplement Library — your custom supplements are appended to AI recommendations when trigger rules match the patient's labs or symptoms." },
          { src: "/help-shots/account-add-supplement.png", caption: "Add Custom Supplement — name, brand, dose, category, pricing, clinical rationale, and AI-generated patient-facing description." },
        ]} />
        <p className="text-sm mt-3 mb-3" style={{ color: "#5a6a4a" }}>
          Under Clinical Preferences → Supplement Library, you can build your own supplement catalog that works alongside the built-in Metagenics recommendations.
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Adding a supplement" desc="Click Add Supplement. Enter the product name, brand, dose/directions, category, and which patients it applies to (All, Male Only, or Female Only)." />
          <Bullet label="Pricing" desc="Enter the retail price in USD. This is used for the patient portal ordering display and discount calculations." />
          <Bullet label="Clinical rationale" desc="Provider-only internal notes explaining why this supplement is recommended. Patients do not see this." />
          <Bullet label="Patient-facing description" desc="A plain-language explanation shown to patients. Click AI Generate to have ClinIQ write this automatically based on the supplement details." />
          <Bullet label="Trigger rules" desc="Supplements without trigger rules always appear. Supplements with rules only appear when at least one lab or symptom condition is met for that patient." />
        </ul>
      </Guide>

      <Guide title="Lab Range Overrides">
        <ScreenshotGallery shots={[
          { src: "/help-shots/account-lab-ranges.png", caption: "Lab Ranges — override optimal and reference ranges for any of 60+ markers on a per-gender basis." },
        ]} />
        <p className="text-sm mt-3 mb-3" style={{ color: "#5a6a4a" }}>
          Under Clinical Preferences → Lab Ranges, you can set your own optimal and reference ranges for any marker. Your overrides replace the system defaults shown in interpretation results and AI recommendations. Leave a field unchanged to keep the system default.
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Filtering" desc="Use the search bar to find a specific marker, or filter by gender using the All Genders dropdown." />
          <Bullet label="Per-gender overrides" desc="Male and female ranges can be set independently. Each marker row shows its current system defaults so you know what you are overriding." />
          <Bullet label="Editing a range" desc="Click the pencil icon on any marker row to open the override editor. Set your preferred optimal low, optimal high, reference low, and reference high values." />
          <Bullet label="Fallback behavior" desc="If no override is set for a marker, the system default is used automatically. You only need to enter ranges where your clinical protocol differs from the defaults." />
        </ul>
      </Guide>

      <Guide title="Supplement Pricing & Discounts">
        <ScreenshotGallery shots={[
          { src: "/help-shots/account-pricing.png", caption: "Pricing & Discount — set a default discount applied to all supplement orders through the patient portal." },
        ]} />
        <p className="text-sm mt-3 mb-3" style={{ color: "#5a6a4a" }}>
          Under Clinical Preferences → Pricing & Discount, you can set a discount that is automatically applied to all supplement prices shown in the patient portal.
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Discount type" desc="Choose Percentage off (e.g. 20% off retail) or Flat amount off (e.g. $10 off each item)." />
          <Bullet label="How it applies" desc="The discount is calculated against the price you set on each supplement in your library. Patients see only the discounted price — they never see the original retail price." />
          <Bullet label="No price set" desc="If a supplement has no price entered in the library, no price is shown to the patient in the portal." />
        </ul>
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
          "Set Lab Range Preferences to override default optimal or reference ranges for any of 60+ markers, per gender.",
          "Configure Portal Settings to set your messaging mode and patient portal preferences.",
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
          <Bullet label="Audit logging" desc="All data access and changes are audit-logged for HIPAA compliance." />
          <Bullet label="BAA on file" desc="Your signed Business Associate Agreement is viewable and downloadable from the Account page at any time." />
        </ul>
      </Guide>
    </div>
  ),

  "integrations": (
    <div className="space-y-6">

      <Guide title="Zapier Appointment Sync — Overview">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>
          ClinIQ connects to any scheduling platform that supports Zapier — including Boulevard, Jane App, Acuity Scheduling, Mindbody, and others. When a patient books, reschedules, or cancels an appointment, Zapier fires a webhook to your personal ClinIQ URL and the appointment appears instantly on your Appointments page and in the patient's portal.
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Auto-link to patient profiles" desc="When the appointment email matches a patient in your roster, ClinIQ links the appointment to their profile automatically — no manual matching required." />
          <Bullet label="Auto-create new profiles" desc="If no match is found and the appointment includes a patient email, ClinIQ creates a minimal patient profile automatically. You can complete the profile (DOB, biological sex, etc.) from the Patient Profiles page." />
          <Bullet label="Patient portal card" desc="Linked patients see a 'Next Appointment' card on their portal dashboard showing date, time, provider, and service type." />
          <Bullet label="Three Zaps required" desc="You'll create one Zap each for New Appointment, Updated/Rescheduled, and Cancelled. Each Zap uses the same webhook URL." />
        </ul>
      </Guide>

      <Guide title="Step 1 — Get Your Personal Webhook URL">
        <Steps steps={[
          "From your dashboard, click the Appointments icon in the top header (calendar icon).",
          "At the top of the Appointments page, you'll see your personal webhook URL displayed in a code box.",
          "Click the Copy button to copy it to your clipboard. This URL is unique to your account — do not share it.",
          "Keep this page open — you'll paste this URL into each Zap you create.",
        ]} />
        <div className="rounded-md p-3 mt-3 flex items-start gap-2" style={{ backgroundColor: "#f0f5ea", border: "1px solid #c8dbb8" }}>
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#5a7040" }} />
          <p className="text-xs" style={{ color: "#3d5228" }}>
            <strong>Important:</strong> Include the patient's email in every Zap. Email is how ClinIQ links appointments to patient profiles and makes the appointment visible in the patient portal.
          </p>
        </div>
      </Guide>

      <Guide title="Step 2 — Create Your 3 Zaps in Zapier">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>
          You'll set up three separate Zaps — one for each appointment event type. The trigger in each Zap comes from your scheduling platform; the action is always <strong>Webhooks by Zapier → POST</strong>.
        </p>
        <div className="space-y-3">
          {[
            { num: 1, event: "New Appointment", field: "event", value: "appointment.created", color: "#2e3a20" },
            { num: 2, event: "Updated / Rescheduled", field: "event", value: "appointment.updated", color: "#5a7040" },
            { num: 3, event: "Cancelled Appointment", field: "event", value: "appointment.cancelled", color: "#9aaa84" },
          ].map(z => (
            <div key={z.num} className="rounded-md border p-3" style={{ backgroundColor: "#fdfaf7", borderColor: "#d4c9b5" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: z.color }}>{z.num}</span>
                <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Zap: {z.event}</span>
              </div>
              <ul className="text-xs space-y-0.5 pl-7" style={{ color: "#5a6a4a" }}>
                <li><strong>Trigger:</strong> Your scheduling platform → "{z.event}" event</li>
                <li><strong>Action:</strong> Webhooks by Zapier → POST</li>
                <li><strong>URL:</strong> Paste your ClinIQ webhook URL</li>
                <li><strong>Required Data field:</strong> <code className="px-1 rounded text-[10px]" style={{ backgroundColor: "#eee" }}>{z.field}</code> = <code className="px-1 rounded text-[10px]" style={{ backgroundColor: "#eee" }}>{z.value}</code></li>
              </ul>
            </div>
          ))}
        </div>
      </Guide>

      <Guide title="Step 3 — Configure the Webhooks by Zapier Action">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>
          After selecting <strong>Webhooks by Zapier → POST</strong> as your action, Zapier will show several configuration fields. Here is exactly what to set for each one:
        </p>
        <div className="space-y-2">
          {[
            {
              field: "URL",
              value: "Paste your ClinIQ webhook URL (copied from the Appointments page).",
              required: true,
            },
            {
              field: "Payload Type",
              value: "Select Form — this sends data as standard key-value pairs that ClinIQ maps automatically. Do not choose JSON unless you are sending hand-crafted raw data.",
              required: true,
            },
            {
              field: "Data",
              value: "This is where the appointment fields from your scheduling platform flow in. You must add at minimum one manual field: event = appointment.created (or .updated or .cancelled depending on the Zap). All other fields — patient name, email, start time, service, etc. — are pulled in automatically from the previous Zapier step (your scheduling platform trigger). Leave everything else as-is and Zapier will include all available fields.",
              required: true,
            },
            {
              field: "Wrap Request in Array",
              value: "No — leave this off.",
              required: false,
            },
            {
              field: "File",
              value: "Leave blank — not used.",
              required: false,
            },
            {
              field: "Unflatten",
              value: "Yes — leave this on (default). This helps Zapier correctly structure any nested data fields from your platform.",
              required: false,
            },
            {
              field: "Basic Auth",
              value: "Leave blank — ClinIQ uses your personal webhook URL for authentication. No username or password is needed.",
              required: false,
            },
            {
              field: "Headers",
              value: "Leave blank — no custom headers required.",
              required: false,
            },
          ].map((row, i) => (
            <div key={i} className="rounded-md border p-3 flex items-start gap-3" style={{ borderColor: "#d4c9b5", backgroundColor: "#fdfaf7" }}>
              <div className="flex items-center gap-1.5 flex-shrink-0 w-36">
                {row.required
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  : <span className="w-3.5 h-3.5 flex-shrink-0" />
                }
                <span className="text-xs font-semibold" style={{ color: "#1c2414" }}>{row.field}</span>
              </div>
              <p className="text-xs" style={{ color: "#5a6a4a" }}>{row.value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: "#9aaa84" }}>
          Fields marked with a green checkmark are required. All others can be left at their defaults.
        </p>
      </Guide>

      <Guide title="Fields ClinIQ Maps Automatically">
        <p className="text-sm mb-3" style={{ color: "#5a6a4a" }}>
          ClinIQ accepts multiple naming conventions so it works regardless of which platform you use. You do not need to rename or reformat any fields from your scheduling platform — just include them and ClinIQ handles the mapping.
        </p>
        <div className="rounded-md overflow-hidden border" style={{ borderColor: "#d4c9b5" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "#e8ddd0" }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "#1c2414" }}>ClinIQ Field</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "#1c2414" }}>Accepted Field Names from Your Platform</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: "#1c2414" }}>Required?</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: "Appointment start", accepts: "start_time, start_at, startTime, appointment_start, date", required: "Yes" },
                { field: "Patient email", accepts: "patient_email, client_email, customer_email, email", required: "Strongly recommended" },
                { field: "Patient name", accepts: "patient_name, client_name, customer_name, name", required: "Yes" },
                { field: "Event type", accepts: "event, status", required: "Yes — must be appointment.created / .updated / .cancelled" },
                { field: "Appointment end", accepts: "end_time, end_at, endTime, appointment_end", required: "No" },
                { field: "Service / visit type", accepts: "service, service_name, service_type, visit_type, appointment_type", required: "No (used to guess gender for new profiles)" },
                { field: "Staff / provider", accepts: "staff_name, provider, provider_name, staff, employee", required: "No" },
                { field: "Location", accepts: "location, location_name, site, clinic", required: "No" },
                { field: "Duration (minutes)", accepts: "duration_minutes, duration, duration_mins", required: "No" },
                { field: "Patient phone", accepts: "patient_phone, client_phone, customer_phone, phone", required: "No" },
              ].map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fdfaf7" : "#fff" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "#2e3a20" }}>{row.field}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: "#5a6a4a", fontSize: 10 }}>{row.accepts}</td>
                  <td className="px-3 py-2" style={{ color: row.required === "Yes" ? "#2e3a20" : "#9aaa84", fontWeight: row.required === "Yes" ? 600 : 400 }}>{row.required}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Guide>

      <Guide title="New Patients — What Happens Automatically">
        <ul className="space-y-2 text-sm" style={{ color: "#5a6a4a" }}>
          <Bullet label="Email match found" desc="If the appointment email matches an existing patient in your roster, ClinIQ links the appointment to their profile. The appointment appears on their portal dashboard immediately." />
          <Bullet label="No email match — new patient" desc="If no existing patient has that email, ClinIQ automatically creates a minimal patient profile using the name and email from the appointment. The patient's biological sex defaults to Male unless the service type contains words like 'women' or 'female' — you can correct this from the Patient Profiles page." />
          <Bullet label="No email sent" desc="Auto-created patient profiles are not sent a portal invite automatically. You must go to Patient Profiles, select the patient, and send a portal invite once their profile is ready." />
          <Bullet label="Completing the profile" desc="Auto-created profiles contain name and email only. Visit Patient Profiles to add date of birth, biological sex, and any other details before running a lab interpretation." />
        </ul>
      </Guide>

      <Guide title="Troubleshooting">
        <Steps steps={[
          "Appointments not appearing: Make sure the Zap is turned on in Zapier and the webhook URL is pasted exactly as copied (no extra spaces). Use Zapier's 'Test' feature to fire a sample and confirm ClinIQ receives it.",
          "Appointment not linked to a patient: The patient email in your scheduling platform must exactly match the email on the patient's ClinIQ profile (case-insensitive). Check both and correct any typos.",
          "Wrong gender on auto-created profile: ClinIQ defaults to Male when the service type doesn't contain a gender hint. Go to Patient Profiles, select the patient, and update the biological sex.",
          "Duplicate patient profiles: If the same patient was added manually with a different email, you'll have two profiles. Merge by updating the email on one to match the other, then re-save.",
          "Cancelled appointments still showing: Confirm your Cancelled Zap includes the field event: appointment.cancelled exactly. Missing or misspelled event values cause ClinIQ to treat the record as a new booking.",
        ]} />
      </Guide>

    </div>
  ),

};

// ── Main component ─────────────────────────────────────────────────────────

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
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left w-full transition-colors"
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
