import { Link } from "wouter";
import { FileText, ChevronLeft } from "lucide-react";
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

export default function TermsOfService() {
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
            <FileText className="w-4 h-4" style={{ color: "#5a7040" }} />
            <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Terms of Service</span>
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
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1c2414", fontFamily: "Source Serif 4, Georgia, serif" }}>Terms of Service</h1>
          <p className="text-xs" style={{ color: "#7a8a64" }}>Effective Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          <div className="mt-4 rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#3d4a30", border: "1px solid #c8d8b0" }}>
            These Terms of Service constitute a legally binding agreement governing access to and use of the ClinIQ platform. By registering for or using ClinIQ, you agree to these Terms.
          </div>
        </div>

        <div className="rounded-xl px-6 sm:px-10 py-8" style={{ backgroundColor: "#ffffff", border: "1px solid #e8ddd0" }}>

          <Section title="1. Acceptance of Terms">
            <p>These Terms of Service ("Terms") constitute a legally binding agreement between you ("Clinician," "Customer," "you," or "your") and ClinIQ ("Company," "we," "us," or "our") governing your access to and use of the ClinIQ clinical intelligence platform ("Platform").</p>
            <p>By creating an account or using the Platform, you represent that you are a licensed healthcare professional authorized to practice in your jurisdiction and that you have read, understood, and agree to be bound by these Terms. If you are registering on behalf of a clinic or healthcare organization, you further represent that you have authority to bind that organization to these Terms.</p>
            <p>By accessing or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms, the Privacy Policy, any applicable Business Associate Agreement, and any additional policies incorporated by reference.</p>
          </Section>

          <Section title="2. Eligibility and Authorized Use">
            <p>ClinIQ is intended exclusively for licensed healthcare professionals including physicians, nurse practitioners, physician assistants, pharmacists, and other qualified clinicians acting within the scope of their professional license. Use by unlicensed individuals is strictly prohibited.</p>
            <p>You agree to use the Platform only for lawful clinical purposes, to maintain the confidentiality of your login credentials, and to ensure that any individual accessing the Platform through your account is appropriately licensed and authorized. You are responsible for all activity that occurs under your account.</p>
          </Section>

          <Section title="3. Clinical Decision Support — AI Disclaimer">
            <p><strong>ClinIQ is a clinical decision support tool, not a substitute for professional medical judgment.</strong> All AI-generated content, lab interpretations, SOAP notes, risk calculations, supplement recommendations, and clinical suggestions are informational and educational in nature. They do not constitute medical advice and must be independently evaluated and verified by a qualified clinician before being applied to any patient care decision.</p>
            <p>AI-generated outputs, summaries, transcriptions, documentation, recommendations, interpretations, risk calculations, clinical suggestions, workflows, and other content may contain inaccuracies, omissions, outdated information, incomplete information, or incorrect conclusions. ClinIQ utilizes probabilistic artificial intelligence technologies that may generate inaccurate or unexpected results.</p>
            <p>Providers must independently review, verify, modify when appropriate, and approve all AI-generated content before relying upon it in patient care, clinical documentation, treatment decisions, prescriptions, communications, or healthcare operations.</p>
            <p>ClinIQ does not warrant the accuracy, completeness, reliability, or clinical appropriateness of any AI-generated output.</p>
            <p>You acknowledge that: (a) clinical algorithms and AI outputs may contain errors; (b) no software tool can replace clinical assessment; (c) final diagnostic and treatment decisions are your sole professional responsibility; and (d) you will exercise independent clinical judgment in evaluating all platform outputs.</p>
            <p>Healthcare providers remain solely responsible for all clinical decisions and actions taken in connection with patient care. ClinIQ shall not be liable for any clinical outcomes, patient harm, or professional consequences arising from reliance on platform outputs without independent clinical verification.</p>
          </Section>

          <Section title="3A. No Practice of Medicine">
            <p>ClinIQ provides software, workflow automation, clinical documentation, communication, transcription, scheduling, patient engagement, and clinical decision-support technologies.</p>
            <p>ClinIQ does not practice medicine, provide medical advice, diagnose medical conditions, prescribe medications, establish provider-patient relationships, determine standards of care, or make healthcare decisions on behalf of providers.</p>
            <p>The Platform is intended solely to support licensed healthcare professionals. All medical decisions, diagnoses, treatment plans, prescriptions, patient communications, and clinical judgments remain the sole responsibility of the licensed healthcare provider.</p>
            <p>No information generated by the Platform shall be considered medical advice or a substitute for professional clinical judgment.</p>
          </Section>

          <Section title="4. Subscription, Trial, and Billing">
            <p><strong>Free Trial:</strong> New accounts receive a 14-day free trial period. A valid payment method is required at registration. No charge is made during the trial period. If you cancel before the trial ends, you will not be charged.</p>
            <p><strong>Subscription:</strong> After the trial period, your payment method will be charged the then-current monthly subscription fee (currently $97/month USD). Subscriptions auto-renew monthly until cancelled.</p>
            <p><strong>Cancellation:</strong> You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period — no partial month refunds are provided. Upon cancellation, your account will remain active through the end of the paid period, after which access will be suspended.</p>
            <p><strong>Price Changes:</strong> We reserve the right to modify subscription pricing with 30 days' advance notice to registered email addresses.</p>
            <p><strong>Payment Processing:</strong> Payments are processed by Stripe, Inc. By providing a payment method, you authorize us and Stripe to charge all amounts due under these Terms.</p>
          </Section>

          <Section title="5. Protected Health Information and HIPAA">
            <p>ClinIQ may receive, process, transmit, store, and maintain Protected Health Information ("PHI") on behalf of healthcare organizations and providers. Where applicable, ClinIQ acts as a Business Associate under HIPAA and performs services pursuant to executed Business Associate Agreements ("BAAs"). A BAA is presented at registration and is incorporated by reference into these Terms.</p>
            <p>Customer remains responsible for:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Obtaining required patient consents and authorizations</li>
              <li>• Lawful collection and entry of PHI into the Platform</li>
              <li>• Determining authorized disclosures of PHI</li>
              <li>• Maintaining compliance with professional and regulatory obligations</li>
              <li>• Ensuring appropriate user access controls within its organization</li>
            </ul>
            <p>ClinIQ remains responsible for obligations expressly assumed under applicable Business Associate Agreements. Nothing in these Terms modifies or limits obligations established under an executed Business Associate Agreement. In the event of a conflict between these Terms and an applicable BAA with respect to PHI, the BAA controls.</p>
          </Section>

          <Section title="5A. Recording, Transcription, and Patient Consent Responsibilities">
            <p>Certain Platform features may facilitate audio recording, encounter transcription, voice processing, documentation generation, and related healthcare workflow functions.</p>
            <p>Customer is solely responsible for obtaining all notices, disclosures, authorizations, and consents required by federal law, state law, professional regulations, employer policies, or payer requirements before recording, transcribing, processing, storing, or transmitting patient communications.</p>
            <p>Customer acknowledges that consent requirements vary by jurisdiction and agrees to ensure compliance with all applicable laws before utilizing recording or transcription functionality.</p>
            <p>ClinIQ shall not be responsible for Customer's failure to obtain legally required consents or authorizations.</p>
          </Section>

          <Section title="6. Intellectual Property and Data Ownership">
            <p>The Platform, including all software, algorithms, clinical content, design, and documentation, is the proprietary intellectual property of ClinIQ and is protected by applicable copyright, trademark, and other laws. You are granted a limited, non-exclusive, non-transferable, revocable license to access and use the Platform solely for your authorized clinical practice during your active subscription period.</p>
            <p>You may not reverse engineer, decompile, copy, reproduce, sell, resell, or create derivative works from the Platform or its content without our express written permission.</p>
            <p>Customer retains ownership of:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Patient records and clinical documentation</li>
              <li>• Laboratory data and encounter information</li>
              <li>• Patient communications and uploaded files</li>
              <li>• Forms, questionnaires, and healthcare content created through use of the Platform</li>
            </ul>
            <p>ClinIQ retains ownership of:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Software, source code, and system architecture</li>
              <li>• Workflows, user interface designs, and trademarks</li>
              <li>• Proprietary methodologies, algorithms, and automation systems</li>
              <li>• Platform functionality and artificial intelligence systems</li>
            </ul>
            <p>No ownership rights are transferred to Customer except for the limited license expressly granted under these Terms. By entering data into the Platform, you grant ClinIQ a limited license to process and display that data solely for the purpose of providing the Platform services to you.</p>
          </Section>

          <Section title="7. Third-Party Services and Subprocessors">
            <p>ClinIQ may utilize third-party service providers to support platform functionality, including cloud hosting, infrastructure, artificial intelligence services, payment processing, communications delivery, security services, analytics, voice services, and operational support.</p>
            <p>Such providers may include providers of cloud infrastructure, artificial intelligence services, payment processing, email delivery, voice synthesis, and security monitoring.</p>
            <p>ClinIQ maintains contractual safeguards and security requirements appropriate to the services provided. Certain providers may process limited data solely for the purpose of delivering services to ClinIQ and its customers.</p>
          </Section>

          <Section title="7A. OpenAI, Email, and Voice Processing Disclosures">
            <p>ClinIQ utilizes artificial intelligence services operated under contractual privacy and security protections, including Business Associate Agreements where applicable. ClinIQ maintains a Business Associate Agreement with OpenAI and utilizes configurations intended to prevent retention of customer healthcare data where applicable.</p>
            <p>ClinIQ utilizes Google Cloud infrastructure under contractual healthcare-compliant arrangements.</p>
            <p>ClinIQ may utilize transactional email providers for account-related communications, invitations, password resets, authentication messages, and operational notifications. ClinIQ does not intentionally transmit Protected Health Information through transactional email systems that are not operating under a Business Associate Agreement.</p>
            <p>ClinIQ may utilize voice synthesis providers to generate audio responses and voice interactions within the Platform. Voice synthesis providers are not used as ClinIQ's primary clinical transcription system and are not intended to serve as a medical record system. ClinIQ does not intentionally transmit Protected Health Information to voice synthesis providers unless appropriate safeguards and contractual protections are in place.</p>
          </Section>

          <Section title="8. Prohibited Conduct">
            <p>You agree not to: (a) share your login credentials with unauthorized individuals; (b) use the Platform for any unlawful purpose or in violation of professional regulations; (c) attempt to gain unauthorized access to any Platform systems; (d) upload malicious code or interfere with Platform operations; (e) use the Platform to harm, defraud, or deceive patients; or (f) misrepresent your professional credentials or licensure status.</p>
          </Section>

          <Section title="9. Patient Communications and Emergencies">
            <p>Patient portals, messaging systems, forms, communication tools, and notifications provided through the Platform are not monitored continuously by ClinIQ or, unless specifically arranged, by the treating healthcare provider around the clock.</p>
            <p>The Platform is not intended for emergency communications. Patients experiencing a medical emergency should call 911 or seek immediate emergency medical care at the nearest emergency room.</p>
            <p>ClinIQ shall not be responsible for delays in review, response, or handling of messages transmitted through the Platform.</p>
          </Section>

          <Section title="10. Multi-Tenant Platform">
            <p>ClinIQ operates as a multi-tenant platform serving multiple healthcare organizations simultaneously. The Platform utilizes logical access controls, account segregation mechanisms, permission systems, and organizational boundaries designed to restrict access to authorized users.</p>
            <p>No system can guarantee absolute security, but ClinIQ implements commercially reasonable safeguards intended to prevent unauthorized access between organizations.</p>
          </Section>

          <Section title="11. Data Retention and Data Export">
            <p>Customer may request export of its data during an active subscription and for a reasonable period following termination, subject to technical limitations and applicable law.</p>
            <p>Following termination, ClinIQ may retain information as necessary to satisfy legal obligations, maintain backups, investigate security incidents, comply with healthcare regulations, enforce contractual rights, and resolve disputes. After applicable retention periods expire, ClinIQ may permanently delete Customer data in accordance with its retention policies.</p>
          </Section>

          <Section title="12. Termination">
            <p>We reserve the right to suspend or terminate your account for violation of these Terms, non-payment, professional license revocation, or for any conduct we determine to be harmful to patients, other users, or the Platform. You may terminate your account at any time by cancelling your subscription and contacting us to request account deletion.</p>
            <p>Upon termination, Customer's access to the Platform may be suspended or revoked. ClinIQ may disable access to hosted data following termination. Customer remains responsible for obtaining any required data exports before expiration of applicable post-termination access periods.</p>
          </Section>

          <Section title="13. Warranty Disclaimer">
            <p className="font-semibold">THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE."</p>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, CLINIQ DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, RELIABILITY, AND UNINTERRUPTED OPERATION.</p>
            <p>CLINIQ DOES NOT WARRANT THAT THE PLATFORM WILL BE ERROR-FREE, SECURE, OR AVAILABLE AT ALL TIMES.</p>
          </Section>

          <Section title="14. Limitation of Liability">
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, CLINIQ AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO CLINICAL OUTCOMES, PATIENT HARM, LOST PROFITS, OR LOSS OF DATA, ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
            <p>UNDER NO CIRCUMSTANCES SHALL CLINIQ BE LIABLE FOR:</p>
            <ul className="list-none space-y-1 pl-2 uppercase text-xs tracking-wide">
              <li>• Clinical decisions or medical outcomes</li>
              <li>• Misdiagnosis or treatment decisions</li>
              <li>• Prescription decisions</li>
              <li>• Failure to obtain patient consent</li>
              <li>• Documentation errors not reviewed by a provider</li>
              <li>• AI-generated content relied upon without independent verification</li>
              <li>• Lost business opportunities or reputational harm</li>
            </ul>
            <p>OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.</p>
          </Section>

          <Section title="15. Indemnification">
            <p>You agree to indemnify, defend, and hold harmless ClinIQ and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Platform; (b) your violation of these Terms; (c) your violation of any applicable law or professional regulation; or (d) any clinical decision made in reliance on Platform outputs.</p>
            <p>Customer shall additionally indemnify and defend ClinIQ against claims arising from:</p>
            <ul className="list-none space-y-1 pl-2">
              <li>• Patient care provided by Customer</li>
              <li>• Malpractice allegations related to Customer's clinical practice</li>
              <li>• Unauthorized disclosure of PHI by Customer or its users</li>
              <li>• Failure to obtain required patient consent before using recording or transcription features</li>
              <li>• Misuse of AI-generated outputs without independent clinical review</li>
              <li>• Violations of healthcare laws or professional licensing requirements</li>
            </ul>
          </Section>

          <Section title="16. Force Majeure">
            <p>ClinIQ shall not be liable for delays, interruptions, outages, security incidents, service failures, or inability to perform caused by circumstances beyond its reasonable control, including natural disasters, internet failures, telecommunications disruptions, cyberattacks, labor disputes, governmental actions, cloud provider outages, or acts of God.</p>
          </Section>

          <Section title="17. Governing Law, Disputes, and Class Action Waiver">
            <p>These Terms shall be governed exclusively by the laws of the State of Mississippi without regard to conflict-of-law principles.</p>
            <p>Any dispute arising out of or relating to these Terms shall be resolved through binding arbitration administered by the American Arbitration Association. The arbitration venue shall be Madison County, Mississippi. Either party may seek emergency injunctive relief in a court of competent jurisdiction to preserve the status quo pending arbitration.</p>
            <p>To the maximum extent permitted by law, claims may only be brought in an individual capacity and not as a plaintiff or class member in any purported class action, collective action, or representative proceeding.</p>
          </Section>

          <Section title="18. Changes to Terms">
            <p>We may update these Terms periodically. Material changes will be communicated via email or in-platform notification with at least 30 days' advance notice. Continued use of the Platform after such notice constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="19. Contact">
            <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#f9f6f0", border: "1px solid #e8ddd0" }}>
              <p className="font-semibold" style={{ color: "#1c2414" }}>ClinIQ</p>
              <p>ClinIQ Platform · Legal Inquiries</p>
              <p>Email: legal@cliniqapp.ai</p>
            </div>
          </Section>

        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs justify-center" style={{ color: "#9aaa84" }}>
          <Link href="/privacy"><span className="cursor-pointer hover:underline">Privacy Policy</span></Link>
          <Link href="/baa"><span className="cursor-pointer hover:underline">Business Associate Agreement</span></Link>
          <Link href="/"><span className="cursor-pointer hover:underline">Back to Home</span></Link>
        </div>
      </main>
    </div>
  );
}
