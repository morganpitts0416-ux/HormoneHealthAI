import { Link } from "wouter";
import {
  ChevronRight, Mic, FileText, PenLine, BookTemplate, ClipboardList,
  Stethoscope, Search, Zap, MessageSquare, CheckCircle2, ImageIcon,
  LayoutList, BookOpen,
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

export default function FeatureDocumentationPage() {
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
              <FileText className="w-3 h-3" />
              Documentation
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
              From recording to signed note — in minutes
            </h1>
            <p className="text-lg leading-relaxed mb-8" style={{ color: "#4a5a38" }}>
              ClinIQ's documentation suite covers the full encounter cycle — record the visit, generate a clinician-quality note, extract key details into the chart, and sign — without the extra hour.
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

      {/* ── Encounter Transcription ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Encounter Transcription</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Record the visit. The rest happens automatically.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Hit record at the start of the visit. ClinIQ captures the conversation in real time, diarizes speakers (clinician vs. patient), and produces a clean, scrollable transcript — ready for note generation the moment the visit ends.
              </p>
              <Highlights items={[
                "Real-time audio capture directly in the browser — no app download required",
                "Speaker diarization separates clinician and patient voices automatically",
                "Transcript available immediately after recording stops",
                "Recording persists across navigation — move between chart tabs without losing the session",
                "Transcription syncs to the encounter for every subsequent note generation",
                "Manual transcript entry or paste also supported",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Recording interface with real-time transcript" />
          </div>
        </div>
      </section>

      {/* ── AI SOAP Note Generation ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="AI-generated SOAP note with evidence overlay" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>AI SOAP Note Generation</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                A complete, defensible note — with evidence built in
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                ClinIQ generates a full SOAP note from the transcript — structured Subjective, Objective, Assessment with ICD-10 codes, and a Plan that reflects the actual visit. Evidence-backed recommendations are surfaced inline, so every clinical decision has the rationale attached.
              </p>
              <Highlights items={[
                "Complete SOAP structure — not a summary, a full clinical note",
                "Structured Review of Systems using your customized normal-finding defaults",
                "Assessment section with ICD-10 code suggestions",
                "Evidence overlay — clinical rationale surfaced alongside recommendations",
                "Plan includes lab orders, medication changes, supplement and lifestyle guidance",
                "Electronic signing and locking for immutability — amendments supported after signing",
                "PDF export with clinical letterhead, clinic branding, and provider signature",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Manual Note Builder ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Manual Note Builder</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Full control when you want to write it yourself
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                The block-based manual note builder gives you complete control over the note structure — add, remove, and reorder sections with a rich-text editor in each block. Use the slash menu to insert ROS, Physical Exam, Assessment &amp; Plan, and custom blocks without leaving the keyboard.
              </p>
              <Highlights items={[
                "Block-based builder — drag to reorder, click to edit each section",
                "Rich text editing with formatting support in every block",
                "Slash ( / ) menu inserts any block type instantly without reaching for the mouse",
                "ROS and Physical Exam blocks pre-fill with your saved normal-finding defaults",
                "Assessment & Plan block with inline ICD-10 code search",
                "All manual notes go through the same signing and PDF export workflow",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Manual block-based note builder with slash menu" />
          </div>
        </div>
      </section>

      {/* ── Encounter Templates ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Encounter template builder and selector" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>AI Encounter Templates</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Every visit type documented consistently
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Build reusable templates for your most common visit types — hormone consults, annual wellness reviews, follow-up labs, nurse visits. AI extracts the right content from the transcript and fills the template intelligently, following your documentation standards.
              </p>
              <Highlights items={[
                "Three note types: SOAP, Nurses Note, and Non-Visit (phone/portal/message)",
                "Drag-and-drop template field builder — extract fields, checklists, AI instructions, vital signs blocks",
                "AI reads the transcript and fills each field — you don't write trigger logic",
                "Instruction fields tell AI exactly what language to use and what to never omit",
                "Role-based restrictions — restrict templates to NP, PA, MD, RN, or all roles",
                "Clinic-wide shared templates or personal private templates",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Chart Extraction ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Chart Extraction</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Notes that write the chart as you go
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                After a note is generated, ClinIQ can extract clinically relevant details — new medications, updated allergies, diagnoses, history changes — and propose them for the patient's chart. Review, confirm, and the chart updates automatically. No double-entry.
              </p>
              <Highlights items={[
                "AI extracts medications, allergies, diagnoses, and history from notes and transcripts",
                "Proposed changes are reviewed by the clinician before any chart update",
                "Confirmed extractions update the chart instantly — medical history, med list, allergy list",
                "Works on AI-generated and manually written notes",
                "Also pulls from uploaded outside documents and form submissions",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Chart extraction — AI-proposed updates from note" />
          </div>
        </div>
      </section>

      {/* ── Custom Diagnosis / ICD-10 ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="ICD-10 search and custom diagnosis in Assessment & Plan" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Diagnoses & ICD-10</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Searchable ICD-10 codes — right inside the note
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Search the full ICD-10 library directly within the Assessment &amp; Plan block. Save your most-used diagnoses to a personal or clinic-wide favorites list so they're one click away in every encounter.
              </p>
              <Highlights items={[
                "Full ICD-10 code search embedded in the Assessment & Plan block",
                "Save frequently used codes to a personal or clinic-wide favorites list",
                "AI suggests relevant ICD-10 codes based on the note content",
                "Codes attach directly to the note and are included in PDF exports",
                "Diagnosis list feeds into the patient's persistent problem list in the chart",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Phrase Library & Shortcuts ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Phrase Library & Shortcuts</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Your words. Instantly available everywhere.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Save any phrase, clinical statement, or boilerplate text to your phrase library and assign it a shortcut. Type <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}>/</code> followed by the shortcut anywhere in the note editor and it expands instantly — your exact wording, every time.
              </p>
              <Highlights items={[
                "Save any text as a named phrase with a / shortcut trigger",
                "Works in every note editor — AI-generated, manual blocks, and templates",
                "Personal phrases or shared clinic-wide library",
                "Insert entire paragraphs, ROS statements, or standing plan language in seconds",
                "Eliminates repetitive typing for your most common clinical statements",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Phrase library and / shortcut in note editor" />
          </div>
        </div>
      </section>

      {/* ── Teach June ── */}
      <section className="border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <ScreenshotPlaceholder label="Teach June preferences — always-on rules, triggers, and context snippets" />
            </div>
            <div className="order-1 lg:order-2">
              <SectionLabel>Teach June</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                June learns how you like to work
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Every clinician documents differently. Teach June your preferences and she follows them in every note — always-on rules, trigger phrases that activate specific protocols, and named context snippets she can reference when a trigger fires.
              </p>
              <Highlights items={[
                "Always-on instructions — June follows in every response (e.g. \"never summarize my notes back to me\")",
                "Trigger rules — activate when you use a specific phrase (e.g. \"start GLP\" → include full patient education)",
                "Context snippets — named text blocks your triggers can reference (e.g. full GLP education content)",
                "Preferences are loaded at the start of every June session — no manual activation needed",
                "Settings accessible from the June drawer in any patient chart",
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ── ROS & Clinical Block Defaults ── */}
      <section className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "#e8ddd0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <SectionLabel>Clinical Block Defaults</SectionLabel>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>
                Your normal findings. Your language. Always.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#4a5a38" }}>
                Customize the default normal-finding text for every ROS system and Physical Exam section. When a normal result is documented, ClinIQ uses your preferred wording — "RRR, no murmurs" instead of "Normal/Negative" — across AI-generated notes, manual blocks, and templates.
              </p>
              <Highlights items={[
                "Per-system defaults for Review of Systems and Physical Exam sections",
                "Your preferred wording appears in AI notes, manual builder, and templates automatically",
                "Settings saved per clinician — each provider has their own defaults",
                "Changes apply immediately to all new note generation",
                "Override or clear any system individually",
              ]} />
            </div>
            <ScreenshotPlaceholder label="Clinical Block Defaults — ROS and PE normal-finding settings" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ backgroundColor: "#2e3a20" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "#f9f6f0", fontFamily: "Source Serif 4, Georgia, serif" }}>
            Documentation that works as fast as you do
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
