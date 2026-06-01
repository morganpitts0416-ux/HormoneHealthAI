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

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-1" />Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: "#5a7040" }} />
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Privacy Policy</span>
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
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Privacy Policy</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #c8d8b0" }}>
            <strong>Important Notice:</strong> This Privacy Policy is provided as a template and should be reviewed by qualified legal counsel before being relied upon. It is intended to describe the data practices of ClinIQ with respect to the ClinIQ platform.
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <Section title="1. Overview">
            <p>ClinIQ ("Company," "we," "us," or "our") operates the ClinIQ clinical intelligence platform ("Platform"). This Privacy Policy describes how we collect, use, store, disclose, and protect information about licensed healthcare professionals ("Clinicians"), healthcare organizations ("Organizations"), and the patients whose information may be entered into the Platform by authorized Clinicians.</p>
            <p>By using ClinIQ, you acknowledge that you have read and understood this Privacy Policy and agree to its terms. If you do not agree, you must discontinue use of the Platform immediately.</p>
            <p>ClinIQ provides software and technology services to support healthcare documentation, workflow automation, and clinical decision support. ClinIQ does not practice medicine, diagnose conditions, prescribe treatments, or establish provider-patient relationships.</p>
          </Section>

          <Section title="2. Information We Collect">
            <p><strong>Clinician and Organization Account Information:</strong> When you register, we collect your name, professional credentials (title, NPI), clinic or organization name, email address, phone number, billing address, and payment method information. Payment card data is processed and stored by Stripe, Inc. — we do not store raw card numbers on our systems.</p>
            <p><strong>Patient and Clinical Information:</strong> Clinicians may enter patient lab results, clinical notes, encounter transcriptions, medical histories, medications, and other clinical data into the Platform. When this information constitutes Protected Health Information ("PHI") under HIPAA, it is governed by the applicable Business Associate Agreement ("BAA"). Clinicians are solely responsible for ensuring they have appropriate patient authorization before entering PHI into the Platform.</p>
            <p><strong>Audio Recordings and Transcriptions:</strong> When using clinical encounter documentation features, audio files may be transmitted for transcription processing. See Section 5 for full disclosure of audio recording and transcription practices.</p>
            <p><strong>Forms and Intake Data:</strong> Patient intake responses, form submissions, and related information collected through the Platform's digital forms module are stored and associated with the applicable clinic and patient record.</p>
            <p><strong>Usage Data:</strong> We collect access logs, IP addresses, browser types, session durations, and feature usage data for security, audit, and platform improvement purposes.</p>
          </Section>

          <Section title="3. HIPAA and Protected Health Information (PHI)">
            <p>ClinIQ provides software and technology services to healthcare providers and healthcare organizations. In the course of providing these services, ClinIQ may receive, process, store, transmit, and maintain Protected Health Information ("PHI") on behalf of covered entities and healthcare organizations.</p>
            <p>When acting on behalf of a covered entity, ClinIQ serves as a Business Associate as defined by the Health Insurance Portability and Accountability Act of 1996 ("HIPAA") and complies with applicable Business Associate Agreements ("BAAs"). A BAA is provided and must be accepted at registration.</p>
            <p>ClinIQ implements administrative, technical, and physical safeguards designed to protect PHI in accordance with applicable laws and industry standards, including the HIPAA Security Rule and HIPAA Privacy Rule.</p>
            <p>Nothing in this Privacy Policy limits any rights or obligations established under HIPAA or an applicable Business Associate Agreement. In the event of a conflict between this Privacy Policy and an applicable BAA with respect to PHI, the BAA controls.</p>
          </Section>

          <Section title="4. Artificial Intelligence and Automated Processing">
            <p>ClinIQ utilizes artificial intelligence technologies to support healthcare workflow automation, clinical documentation, transcription processing, note generation, summarization, clinical data organization, and decision-support functions.</p>
            <p>AI-generated outputs — including but not limited to SOAP notes, clinical recommendations, lab interpretations, and patient summaries — are intended to assist healthcare professionals and are not intended to replace independent clinical judgment, diagnosis, treatment decisions, or professional medical advice.</p>
            <p>Healthcare providers remain solely responsible for reviewing, verifying, and approving all clinical information before it is incorporated into patient records or relied upon in patient care. ClinIQ assumes no liability for clinical decisions made on the basis of AI-generated content without independent provider review.</p>
            <p>ClinIQ may utilize AI service providers operating under contractual privacy and security obligations, including Business Associate Agreements where applicable. See Section 8 for details on specific AI subprocessors.</p>
          </Section>

          <Section title="5. Audio Recording, Transcription, and Clinical Documentation">
            <p>ClinIQ may process audio recordings, encounter recordings, voice inputs, transcriptions, speaker attribution information, and generated clinical documentation in order to facilitate healthcare documentation and workflow automation.</p>
            <p>Such information may be used to generate encounter notes, summaries, SOAP documentation, and related clinical records, which are then available to the authorized Clinician for review, editing, signing, and storage within the Platform.</p>
            <p>ClinIQ does not sell audio recordings or transcription data.</p>
            <p>Audio recordings and associated transcripts are protected using industry-standard safeguards and are accessible only to authorized users with appropriate permissions within their healthcare organization.</p>
            <p>Where audio is transmitted to a third-party transcription provider, such transmission occurs under applicable contractual safeguards. See Section 8 for current AI and transcription subprocessors. Audio data is not retained by subprocessors beyond the period necessary to complete transcription processing, consistent with our zero-retention configuration where available.</p>
          </Section>

          <Section title="6. How We Use Your Information">
            <p>We use the information we collect to: (a) provide and operate the ClinIQ platform; (b) process subscription billing through Stripe; (c) send service-related communications including account notifications, invitations, and billing receipts; (d) maintain audit logs as required by HIPAA; (e) improve platform features, clinical algorithms, and AI-assisted workflows; (f) support clinical documentation and decision-support functions authorized by your Organization; and (g) comply with legal obligations.</p>
            <p>We do not sell, rent, or share your information or any PHI with third parties for marketing purposes.</p>
            <p>We do not use PHI to train AI models for use outside of the services provided to your Organization without appropriate authorization.</p>
          </Section>

          <Section title="7. Ownership of Healthcare Data">
            <p>Healthcare organizations and providers retain ownership of patient medical records, clinical documentation, laboratory data, encounter information, communications, and Protected Health Information entered into or generated through the Platform.</p>
            <p>ClinIQ does not claim ownership of patient medical records or provider-generated clinical content.</p>
            <p>ClinIQ retains ownership of its software, source code, platform architecture, workflows, algorithms, user interface elements, trademarks, intellectual property, and proprietary technologies.</p>
            <p>Upon termination of services, healthcare organizations may request an export of their clinical data in accordance with the terms of their service agreement and applicable BAA obligations.</p>
          </Section>

          <Section title="8. Service Providers and Subprocessors">
            <p>ClinIQ utilizes carefully selected third-party service providers to support platform functionality, including cloud hosting, artificial intelligence processing, communications delivery, payment processing, infrastructure management, analytics, and security services.</p>
            <p>Current service providers include:</p>
            <ul className="list-none space-y-1 pl-2">
              <li><strong>OpenAI:</strong> AI-assisted processing for transcription, note generation, clinical recommendations, and document analysis. Where PHI may be processed, OpenAI operates under a Business Associate Agreement with zero-retention configuration where applicable. Text data sent to OpenAI via the API is not used to train OpenAI models under our current BAA-covered configuration.</li>
              <li><strong>Stripe:</strong> Payment processing for subscriptions and billing. Stripe acts as an independent data controller for payment card data under PCI-DSS standards. We store only Stripe customer IDs and subscription status — never raw card numbers.</li>
              <li><strong>Resend:</strong> Transactional email delivery for operational communications such as account invitations, password resets, and authentication workflows. Resend is used only for operational communications and is not used to transmit PHI.</li>
              <li><strong>ElevenLabs:</strong> Voice synthesis services used to generate audio responses within the Platform. ElevenLabs is used for voice synthesis only and is not used as ClinIQ's primary transcription or clinical documentation system.</li>
              <li><strong>Google Cloud Platform / PostgreSQL hosting:</strong> Cloud infrastructure and database hosting for the Platform.</li>
            </ul>
            <p>Where Protected Health Information may be processed by a service provider, ClinIQ maintains appropriate contractual safeguards, including Business Associate Agreements where applicable and available.</p>
            <p>Certain service providers may receive only limited operational data necessary to perform their services. ClinIQ does not authorize service providers to use customer data for independent marketing purposes.</p>
            <p>This list of subprocessors may be updated from time to time. Material changes will be communicated to registered Organizations as described in Section 19.</p>
          </Section>

          <Section title="9. Email Communications">
            <p>Transactional email providers may be used for account notifications, invitations, password resets, authentication workflows, and similar operational communications.</p>
            <p>ClinIQ does not intentionally transmit Protected Health Information through transactional email systems that are not operating under a Business Associate Agreement.</p>
            <p>Users should avoid transmitting sensitive medical information through email unless specifically instructed by their healthcare provider and after considering applicable security and privacy implications.</p>
          </Section>

          <Section title="10. Voice Services">
            <p>ClinIQ may utilize voice synthesis technologies to provide voice-based user experiences and interactions within the Platform.</p>
            <p>Voice synthesis providers are used solely to generate audio responses and are not used as ClinIQ's primary transcription or clinical documentation systems.</p>
            <p>ClinIQ does not intentionally transmit Protected Health Information to voice synthesis providers unless appropriate safeguards and contractual protections are in place.</p>
          </Section>

          <Section title="11. Data Security and Breach Response">
            <p>ClinIQ employs administrative, technical, and organizational safeguards designed to protect information from unauthorized access, disclosure, alteration, or destruction.</p>
            <p>These safeguards include:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Access controls and authentication systems</li>
              <li>• Role-based permissions scoped to clinic and provider level</li>
              <li>• Encryption in transit (TLS) for all data communications</li>
              <li>• Encryption at rest where applicable</li>
              <li>• Audit logging of PHI access and modifications</li>
              <li>• Session management controls and automatic timeouts</li>
              <li>• Login lockout protections after failed authentication attempts</li>
              <li>• Monitoring and incident response procedures</li>
            </ul>
            <p>In the event of a security incident involving personal information or Protected Health Information, ClinIQ will investigate, mitigate, and provide notifications as required by applicable law, including the HIPAA Breach Notification Rule, and contractual obligations, including applicable Business Associate Agreements.</p>
            <p>ClinIQ does not guarantee that any system is completely immune from security risks. No security measure is impenetrable, and we encourage Clinicians and Organizations to maintain strong password practices and report any suspected unauthorized access promptly.</p>
          </Section>

          <Section title="12. Patient Messaging and Portal Communications">
            <p>Communications sent through patient portals, messaging systems, forms, or electronic communication features within the Platform are not continuously monitored by ClinIQ or, unless specifically arranged, by the treating healthcare provider around the clock.</p>
            <p>Patients should not use ClinIQ messaging tools, patient portals, or electronic communication features to report emergencies or urgent medical conditions.</p>
            <p>For medical emergencies, users should call 911 or seek immediate emergency medical care at the nearest emergency room.</p>
          </Section>

          <Section title="13. Data Retention">
            <p>ClinIQ retains information for as long as necessary to provide services, comply with legal obligations, enforce contractual rights, resolve disputes, and satisfy healthcare record retention requirements.</p>
            <p>Retention periods may vary based upon applicable federal law, state law, healthcare regulations, contractual obligations, and healthcare organization policies. Audit logs are retained for a minimum of six years as required by the HIPAA Security Rule.</p>
            <p>Upon termination of services, ClinIQ may retain certain information for legally required retention periods, backup and recovery purposes, security investigations, compliance obligations, and legitimate business operations. Clinicians and Organizations may contact us to request deletion of account data, subject to applicable legal and contractual retention obligations.</p>
          </Section>

          <Section title="14. De-Identified and Aggregated Data">
            <p>ClinIQ may create de-identified, anonymized, or aggregated information that cannot reasonably be used to identify an individual patient, in accordance with applicable HIPAA de-identification standards.</p>
            <p>Such information may be used for platform improvement, analytics, product development, quality improvement, security monitoring, and operational benchmarking.</p>
            <p>ClinIQ will not attempt to re-identify de-identified information except as permitted by law.</p>
          </Section>

          <Section title="15. Multi-Tenant Data Segregation">
            <p>ClinIQ operates as a multi-tenant healthcare platform serving multiple healthcare organizations simultaneously.</p>
            <p>The platform is designed with logical access controls and data segregation mechanisms intended to restrict organizations from accessing information belonging to other organizations. Each Organization's data is scoped by clinic-level identifiers enforced at both the application and database layers.</p>
            <p>Users are granted access only to information authorized by their healthcare organization and permission settings. ClinIQ's permission model enforces both clinical role and administrative role access controls independently.</p>
          </Section>

          <Section title="16. Telehealth Services">
            <p>Where enabled by a healthcare organization, ClinIQ may facilitate telehealth communications, virtual visits, and related healthcare interactions.</p>
            <p>Telehealth services are provided by healthcare providers and healthcare organizations, not by ClinIQ. ClinIQ provides the technology platform to support such communications.</p>
            <p>ClinIQ does not practice medicine, diagnose conditions, prescribe treatments, or establish provider-patient relationships.</p>
          </Section>

          <Section title="17. Children's Information">
            <p>ClinIQ may process information relating to minors when authorized by a parent, guardian, healthcare provider, or healthcare organization and when permitted by applicable law, including the Children's Online Privacy Protection Act (COPPA) and applicable state minor privacy laws.</p>
            <p>Such information is handled in accordance with applicable privacy and healthcare regulations, including HIPAA where applicable. Healthcare organizations are responsible for ensuring they have appropriate authorizations in place before entering minor patient information into the Platform.</p>
          </Section>

          <Section title="18. Your Rights">
            <p>Clinicians and Organization administrators have the right to access, correct, or request deletion of their account information by contacting us. Patients' rights regarding their PHI are governed by HIPAA and are administered by the Clinician or Organization as the Covered Entity — patients should direct rights requests to their healthcare provider.</p>
            <p>Depending on your jurisdiction, you may have additional rights under applicable privacy laws, including the right to know what information we hold about you, the right to request correction of inaccurate information, and the right to request deletion subject to legal retention requirements.</p>
          </Section>

          <Section title="19. Changes to This Policy">
            <p>We may update this Privacy Policy periodically to reflect changes in our data practices, platform functionality, or applicable law. We will notify registered Clinicians and Organization administrators of material changes via email or in-platform notification at least 30 days prior to the effective date of material changes where practicable. Continued use of the Platform after such notification constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="20. Contact Us">
            <p>For questions about this Privacy Policy or our data practices, please contact:</p>
            <div className="rounded-lg px-4 py-3 mt-2" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ClinIQ</p>
              <p>ClinIQ Platform · Privacy Inquiries</p>
              <p>Email: privacy@cliniqapp.ai</p>
            </div>
          </Section>

        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/terms"><span className="cursor-pointer hover:underline">Terms of Service</span></Link>
          <Link href="/baa"><span className="cursor-pointer hover:underline">Business Associate Agreement</span></Link>
          <Link href="/"><span className="cursor-pointer hover:underline">Back to Home</span></Link>
        </div>
      </main>
    </div>
  );
}
