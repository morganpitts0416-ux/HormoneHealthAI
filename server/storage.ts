import { eq, ne, desc, asc, ilike, like, or, and, isNull, isNotNull, count, sql, inArray, lte } from "drizzle-orm";
import { getSeedAsEntries } from "./medication-seed.js";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;
import * as schema from "@shared/schema";
import { detectControlledSubstances, detectNewDiagnoses, computeQuotaPeriodKey, computeEnforcementDueAt, daysPastDue } from "./lib/chart-review-rules";
import type {
  Patient, InsertPatient,
  LabResult, InsertLabResult,
  SimpleLabUpload, InsertSimpleLabUpload,
  SavedInterpretation, InsertSavedInterpretation,
  User, InsertUser,
  ClinicianStaff, InsertClinicianStaff,
  PatientPortalAccount, InsertPatientPortalAccount,
  PublishedProtocol, InsertPublishedProtocol,
  PortalMessage, InsertPortalMessage,
  SavedRecipe, InsertSavedRecipe,
  SupplementOrder, InsertSupplementOrder,
  PatientDocument, InsertPatientDocument, PatientDocumentSummary,
  ClinicianSupplementSettings, InsertClinicianSupplementSettings,
  ClinicianSupplement, InsertClinicianSupplement,
  ClinicianSupplementRule, InsertClinicianSupplementRule,
  ClinicianLabPreference, InsertClinicianLabPreference,
  ClinicalEncounter, InsertClinicalEncounter,
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('[pg-pool] idle client error (main pool):', err.message);
});

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRow(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

function rawRows(result: any): Record<string, any>[] {
  const rows = result.rows ?? result ?? [];
  return Array.isArray(rows) ? rows.map(mapRow) : [];
}
export const db = drizzle(pool, { schema });

export interface IStorage {
  // User operations
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  recordLoginAttempt(userId: number, success: boolean): Promise<void>;
  recordStaffLoginAttempt(staffId: number, success: boolean): Promise<void>;
  createUser(user: Omit<InsertUser, 'passwordHash'> & { passwordHash: string }): Promise<User>;
  updateUser(id: number, user: Partial<Omit<InsertUser, 'passwordHash'>>): Promise<User | undefined>;

  // Password reset / invite operations
  savePasswordResetToken(userId: number, token: string, expires: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: number): Promise<void>;
  updatePassword(userId: number, passwordHash: string): Promise<void>;

  // BAA e-signatures
  getBaaSignature(userId: number): Promise<schema.BaaSignature | undefined>;
  createBaaSignature(data: schema.InsertBaaSignature): Promise<schema.BaaSignature>;

  // Stripe billing
  updateUserStripe(id: number, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeCurrentPeriodEnd?: Date | null;
    stripeCancelAtPeriodEnd?: boolean;
    subscriptionStatus?: string;
  }): Promise<User | undefined>;

  // Admin operations
  getAllUsers(): Promise<User[]>;
  promoteToAdmin(id: number): Promise<User | undefined>;
  updateUserAdmin(id: number, data: Partial<Pick<User, 'subscriptionStatus' | 'role' | 'notes' | 'freeAccount'>>): Promise<User | undefined>;
  deleteUserAdmin(id: number): Promise<boolean>;
  getPatientCountByUser(userId: number, clinicId?: number | null): Promise<number>;

  // Patient operations (clinic-aware: clinicId preferred, userId fallback for legacy records)
  getPatient(id: number, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  getAllPatients(userId: number, clinicId?: number | null): Promise<Patient[]>;
  searchPatients(searchTerm: string, userId: number, gender?: string, clinicId?: number | null): Promise<Patient[]>;
  getPatientByName(firstName: string, lastName: string, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  getPatientByEmail(email: string, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: number, patient: Partial<InsertPatient>, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  deletePatient(id: number, userId: number, clinicId?: number | null): Promise<boolean>;

  // Clinic management
  getClinicForUser(userId: number): Promise<schema.Clinic | undefined>;
  getAllClinicsAdmin(): Promise<Array<schema.Clinic & { memberCount: number; patientCount: number; ownerEmail: string | null }>>;
  backfillPatientsToClinic(userId: number, clinicId: number): Promise<number>;
  addUserToClinic(clinicId: number, userId: number, role: string): Promise<schema.ClinicMembership>;
  getClinicMembers(clinicId: number): Promise<Array<schema.ClinicMembership & { userEmail: string; userName: string }>>;

  // Lab result operations
  getLabResult(id: number): Promise<LabResult | undefined>;
  getLabResultsByPatient(patientId: number): Promise<LabResult[]>;
  createLabResult(labResult: InsertLabResult): Promise<LabResult>;
  updateLabResult(id: number, labResult: Partial<InsertLabResult>): Promise<LabResult | undefined>;
  deleteLabResult(id: number): Promise<boolean>;
  updateLabResultProviderOverrides(id: number, overrides: any): Promise<LabResult | undefined>;

  // Simple lab upload operations
  getSimpleLabsByPatient(patientId: number): Promise<SimpleLabUpload[]>;
  createSimpleLabUpload(data: InsertSimpleLabUpload): Promise<SimpleLabUpload>;
  deleteSimpleLabUpload(id: number): Promise<boolean>;

  // Saved interpretation operations (scoped by userId)
  getSavedInterpretation(id: number, userId: number): Promise<SavedInterpretation | undefined>;
  getAllSavedInterpretations(userId: number, gender?: string): Promise<SavedInterpretation[]>;
  searchSavedInterpretations(searchTerm: string, userId: number, gender?: string): Promise<SavedInterpretation[]>;
  createSavedInterpretation(interpretation: InsertSavedInterpretation): Promise<SavedInterpretation>;
  deleteSavedInterpretation(id: number, userId: number): Promise<boolean>;

  // Clinician staff operations
  getClinicianStaffById(id: number): Promise<ClinicianStaff | undefined>;
  getClinicianStaffByEmail(email: string): Promise<ClinicianStaff | undefined>;
  getClinicianStaffByInviteToken(token: string): Promise<ClinicianStaff | undefined>;
  getAllStaffForClinician(clinicianId: number): Promise<ClinicianStaff[]>;
  getAllStaffForClinic(clinicId: number): Promise<ClinicianStaff[]>;
  createClinicianStaff(data: Omit<InsertClinicianStaff, 'passwordHash'> & { passwordHash?: string | null }): Promise<ClinicianStaff>;
  updateClinicianStaff(id: number, data: Partial<ClinicianStaff>): Promise<ClinicianStaff | undefined>;
  deleteClinicianStaff(id: number): Promise<boolean>;

  // Encounter Templates
  getEncounterTemplates(clinicianId: number, clinicId?: number | null, callerRole?: string | null): Promise<schema.EncounterTemplate[]>;
  getEncounterTemplateById(id: number): Promise<schema.EncounterTemplate | undefined>;
  createEncounterTemplate(data: schema.InsertEncounterTemplate & { clinicianId: number }): Promise<schema.EncounterTemplate>;
  updateEncounterTemplate(id: number, data: Partial<schema.EncounterTemplate>): Promise<schema.EncounterTemplate | undefined>;
  deleteEncounterTemplate(id: number): Promise<boolean>;

  // Clinic provider invites
  createClinicProviderInvite(data: schema.InsertClinicProviderInvite): Promise<schema.ClinicProviderInvite>;
  getClinicProviderInviteByToken(token: string): Promise<schema.ClinicProviderInvite | undefined>;
  getClinicProviderInvites(clinicId: number): Promise<schema.ClinicProviderInvite[]>;
  updateClinicProviderInviteStatus(id: number, status: string): Promise<void>;
  deleteClinicProviderInvite(id: number): Promise<boolean>;

  // Patient portal account operations
  getPatientById(id: number): Promise<Patient | undefined>;
  getPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByInviteToken(token: string): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByResetToken(token: string): Promise<PatientPortalAccount | undefined>;
  createPortalAccount(account: InsertPatientPortalAccount): Promise<PatientPortalAccount>;
  updatePortalAccount(patientId: number, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined>;
  updatePortalAccountByEmail(email: string, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined>;

  // Published protocol operations
  publishProtocol(protocol: InsertPublishedProtocol): Promise<PublishedProtocol>;
  getLatestPublishedProtocol(patientId: number): Promise<PublishedProtocol | undefined>;
  getAllPublishedProtocols(patientId: number): Promise<PublishedProtocol[]>;
  deleteProtocolsByLabResultId(labResultId: number): Promise<void>;
  markProtocolViewed(protocolId: number): Promise<void>;

  // Portal messaging operations
  getPortalMessages(patientId: number): Promise<PortalMessage[]>;
  createPortalMessage(msg: InsertPortalMessage): Promise<PortalMessage>;
  markPortalMessagesRead(patientId: number, readBySenderType: 'patient' | 'clinician'): Promise<void>;
  // ── Unified Communication Timeline (portal + Spruce merged) ─────────────
  getPatientCommunicationTimeline(patientId: number, clinicId: number): Promise<CommunicationTimelineItem[]>;
  getUnreadPortalMessageCount(patientId: number, unreadBySenderType: 'patient' | 'clinician'): Promise<number>;
  getPortalMessageByExternalId(externalMessageId: string): Promise<PortalMessage | undefined>;
  // ── Phase 2: Internal notes + reply context ──────────────────────────────
  createInternalNote(data: {
    patientId: number; clinicId: number; clinicianId: number;
    content: string; messageType?: string;
    mentionedUserIds?: number[];
  }): Promise<PortalMessage>;
  getReplyContext(patientId: number, clinicId: number): Promise<ReplyContext>;
  createMessageMention(data: schema.InsertPatientMessageMention): Promise<schema.PatientMessageMention>;

  // Saved recipe operations (patient portal)
  getSavedRecipes(patientId: number): Promise<SavedRecipe[]>;
  saveRecipe(recipe: InsertSavedRecipe): Promise<SavedRecipe>;
  deleteSavedRecipe(id: number, patientId: number): Promise<boolean>;

  // Supplement order operations
  createSupplementOrder(order: InsertSupplementOrder): Promise<SupplementOrder>;
  getSupplementOrdersByPatient(patientId: number): Promise<SupplementOrder[]>;
  getSupplementOrdersByClinicianPatient(clinicianId: number, patientId: number): Promise<SupplementOrder[]>;
  getPendingOrdersForClinician(clinicianId: number): Promise<Array<SupplementOrder & { patientFirstName: string; patientLastName: string }>>;
  updateSupplementOrderStatus(orderId: number, clinicianId: number, status: string): Promise<SupplementOrder | undefined>;

  // Patient uploaded documents (outside records, PA forms, PMP, scans, etc.)
  createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocumentSummary>;
  listPatientDocuments(patientId: number, clinicId: number): Promise<PatientDocumentSummary[]>;
  getPatientDocument(docId: number, clinicId: number): Promise<PatientDocument | undefined>;
  deletePatientDocument(docId: number, clinicId: number): Promise<boolean>;

  // Clinician notification helpers
  getUnreadMessageSummaryForClinician(clinicianId: number): Promise<Array<{ patientId: number; patientFirstName: string; patientLastName: string; count: number; lastAt: string }>>;
  getPendingRefillRequestsForClinician(clinicianId: number, clinicId: number | null): Promise<Array<{ id: number; patientId: number | null; patientFirstName: string | null; patientLastName: string | null; title: string; message: string; createdAt: string }>>;

  // Clinician Supplement Settings (discount)
  getClinicianSupplementSettings(clinicianId: number): Promise<ClinicianSupplementSettings | undefined>;
  upsertClinicianSupplementSettings(clinicianId: number, data: Partial<InsertClinicianSupplementSettings>): Promise<ClinicianSupplementSettings>;

  // Clinician Supplement Library
  getClinicianSupplements(clinicianId: number): Promise<ClinicianSupplement[]>;
  getClinicianSupplement(id: number, clinicianId: number): Promise<ClinicianSupplement | undefined>;
  createClinicianSupplement(supplement: InsertClinicianSupplement): Promise<ClinicianSupplement>;
  updateClinicianSupplement(id: number, clinicianId: number, data: Partial<InsertClinicianSupplement>): Promise<ClinicianSupplement | undefined>;
  deleteClinicianSupplement(id: number, clinicianId: number): Promise<boolean>;

  // Clinician Supplement Rules
  getClinicianSupplementRules(supplementId: number, clinicianId: number): Promise<ClinicianSupplementRule[]>;
  getAllClinicianSupplementRules(clinicianId: number): Promise<ClinicianSupplementRule[]>;
  createClinicianSupplementRule(rule: InsertClinicianSupplementRule): Promise<ClinicianSupplementRule>;
  updateClinicianSupplementRule(id: number, clinicianId: number, data: Partial<InsertClinicianSupplementRule>): Promise<ClinicianSupplementRule | undefined>;
  deleteClinicianSupplementRule(id: number, clinicianId: number): Promise<boolean>;

  // Clinician Lab Preferences
  getClinicianLabPreferences(clinicianId: number): Promise<ClinicianLabPreference[]>;
  getClinicianLabPreference(clinicianId: number, markerKey: string, gender: string): Promise<ClinicianLabPreference | undefined>;
  upsertClinicianLabPreference(clinicianId: number, data: InsertClinicianLabPreference): Promise<ClinicianLabPreference>;
  deleteClinicianLabPreference(id: number, clinicianId: number): Promise<boolean>;

  // Clinical Encounters
  getEncountersByClinicianId(clinicianId: number, patientId?: number, clinicId?: number | null): Promise<(ClinicalEncounter & { patientName: string })[]>;
  getEncounter(id: number, clinicianId: number, clinicId?: number | null): Promise<ClinicalEncounter | undefined>;
  createEncounter(data: InsertClinicalEncounter): Promise<ClinicalEncounter>;
  updateEncounter(id: number, clinicianId: number, data: Partial<InsertClinicalEncounter> & { soapNote?: any; soapGeneratedAt?: Date; summaryPublished?: boolean; summaryPublishedAt?: Date; diarizedTranscript?: any; clinicalExtraction?: any; evidenceSuggestions?: import("@shared/schema").EvidenceOverlay | any; patternMatch?: import("@shared/schema").PatternMatchResult | any; updatedAt?: Date }, clinicId?: number | null): Promise<ClinicalEncounter | undefined>;
  deleteEncounter(id: number, clinicianId: number, clinicId?: number | null): Promise<boolean>;
  getPublishedEncountersByPatient(patientId: number): Promise<Pick<ClinicalEncounter, 'id' | 'visitDate' | 'visitType' | 'chiefComplaint' | 'patientSummary' | 'summaryPublishedAt'>[]>;

  // Appointments (native + Boulevard sync via Zapier)
  upsertAppointment(userId: number, boulevardId: string, data: Omit<schema.InsertAppointment, 'userId' | 'boulevardAppointmentId'>): Promise<schema.Appointment>;
  cancelAppointment(userId: number, boulevardId: string): Promise<void>;
  getAppointmentsByUserId(userId: number): Promise<schema.Appointment[]>;
  getAppointmentsByClinicAndRange(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.Appointment[]>;
  getAppointmentsByPatientEmail(email: string, userId: number): Promise<schema.Appointment[]>;
  getAppointmentsByPatientId(patientId: number): Promise<schema.Appointment[]>;
  matchAppointmentToPatient(appointmentId: number, patientId: number): Promise<void>;
  getAppointmentById(id: number): Promise<schema.Appointment | null>;
  createNativeAppointment(data: schema.InsertAppointment): Promise<schema.Appointment>;
  updateNativeAppointment(id: number, clinicId: number, data: Partial<schema.InsertAppointment>): Promise<schema.Appointment | null>;
  deleteNativeAppointment(id: number, clinicId: number): Promise<boolean>;
  markAppointmentReminderSent(id: number): Promise<void>;
  getAppointmentsNeedingReminder(now: Date, hoursAhead: number): Promise<schema.Appointment[]>;
  detectAppointmentConflict(providerId: number, start: Date, end: Date, excludeId?: number): Promise<boolean>;

  // Appointment Types
  getAppointmentTypes(clinicId: number, includeInactive?: boolean): Promise<schema.AppointmentType[]>;
  getAppointmentTypeById(id: number, clinicId: number): Promise<schema.AppointmentType | null>;
  createAppointmentType(data: schema.InsertAppointmentType): Promise<schema.AppointmentType>;
  updateAppointmentType(id: number, clinicId: number, data: Partial<schema.InsertAppointmentType>): Promise<schema.AppointmentType | null>;
  deleteAppointmentType(id: number, clinicId: number): Promise<boolean>;

  // Provider Availability (recurring weekly)
  getProviderAvailability(clinicId: number, providerId?: number | null): Promise<schema.ProviderAvailability[]>;
  createProviderAvailability(data: schema.InsertProviderAvailability): Promise<schema.ProviderAvailability>;
  updateProviderAvailability(id: number, clinicId: number, data: Partial<schema.InsertProviderAvailability>): Promise<schema.ProviderAvailability | null>;
  deleteProviderAvailability(id: number, clinicId: number): Promise<boolean>;

  // Calendar Blocks (one-off time-off, breaks)
  getCalendarBlocks(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.CalendarBlock[]>;
  createCalendarBlock(data: schema.InsertCalendarBlock): Promise<schema.CalendarBlock>;
  deleteCalendarBlock(id: number, clinicId: number): Promise<boolean>;

  // Providers (clinic roster used by scheduler)
  getProvidersByClinic(clinicId: number, includeInactive?: boolean): Promise<schema.Provider[]>;

  // Patient Chart
  getPatientChart(patientId: number, clinicianId: number): Promise<schema.PatientChart | null>;
  upsertPatientChart(patientId: number, clinicianId: number, data: Partial<Omit<schema.PatientChart, 'id' | 'patientId' | 'clinicianId' | 'updatedAt'>>): Promise<schema.PatientChart>;

  // Patient Medications (structured — Phase A)
  getPatientMedications(patientId: number, clinicId: number): Promise<schema.PatientMedication[]>;
  getPatientMedicationsByFormSubmission(formSubmissionId: number): Promise<schema.PatientMedication[]>;
  createPatientMedication(data: schema.InsertPatientMedication & { createdByUserId?: number | null; createdByStaffId?: number | null }): Promise<schema.PatientMedication>;
  updatePatientMedication(id: number, patientId: number, clinicId: number, data: Partial<schema.InsertPatientMedication> & { updatedByUserId?: number | null; updatedByStaffId?: number | null }): Promise<schema.PatientMedication | null>;
  discontinuePatientMedication(id: number, patientId: number, clinicId: number, opts: { discontinuedByUserId?: number | null; discontinuedByStaffId?: number | null; discontinuedReason?: string | null }): Promise<schema.PatientMedication | null>;

  // Patient Vitals
  getPatientVitals(patientId: number, clinicianId?: number | null): Promise<schema.PatientVital[]>;
  createPatientVital(data: { patientId: number; clinicianId: number } & schema.InsertPatientVital & { bmi?: number | null }): Promise<schema.PatientVital>;
  deletePatientVital(id: number, clinicianId: number): Promise<boolean>;

  // Note Templates
  getNoteTemplates(clinicId: number, providerId: number, noteType?: string): Promise<schema.NoteTemplate[]>;
  getNoteTemplate(id: number, clinicId: number): Promise<schema.NoteTemplate | null>;
  createNoteTemplate(data: schema.InsertNoteTemplate): Promise<schema.NoteTemplate>;
  updateNoteTemplate(id: number, clinicId: number, data: Partial<schema.InsertNoteTemplate>): Promise<schema.NoteTemplate | null>;
  deleteNoteTemplate(id: number, clinicId: number, providerId: number): Promise<boolean>;

  // Note Phrases
  getNotePhrases(clinicId: number, providerId: number): Promise<schema.NotePhrase[]>;
  createNotePhrase(data: schema.InsertNotePhrase): Promise<schema.NotePhrase>;
  updateNotePhrase(id: number, clinicId: number, data: Partial<schema.InsertNotePhrase>): Promise<schema.NotePhrase | null>;
  deleteNotePhrase(id: number, clinicId: number, providerId: number): Promise<boolean>;

  // Medication Dictionary
  getMedicationDictionaries(clinicianId: number): Promise<schema.MedicationDictionary[]>;
  createMedicationDictionary(data: schema.InsertMedicationDictionary): Promise<schema.MedicationDictionary>;
  deleteMedicationDictionary(id: number, clinicianId: number): Promise<boolean>;
  createMedicationEntries(entries: schema.InsertMedicationEntry[]): Promise<void>;
  getAllMedicationEntries(clinicianId: number): Promise<schema.MedicationEntry[]>;
  updateMedicationDictionaryCount(id: number, count: number): Promise<void>;
  getOrCreateManualDictionary(clinicianId: number): Promise<schema.MedicationDictionary>;
  addSingleMedicationEntry(entry: schema.InsertMedicationEntry): Promise<schema.MedicationEntry>;
  updateMedicationEntryAliases(id: number, clinicianId: number, fields: Partial<Pick<schema.MedicationEntry, "brandNames" | "commonSpokenVariants" | "commonMisspellings" | "drugClass" | "subclass" | "route" | "notes">>): Promise<schema.MedicationEntry | null>;
  deleteMedicationEntry(id: number, clinicianId: number): Promise<boolean>;
  // ── Encounter Drafts (server-side, cross-device) ──────────────────────────
  getEncounterDrafts(clinicianId: number): Promise<schema.EncounterDraft[]>;
  createEncounterDraft(draft: schema.InsertEncounterDraft): Promise<schema.EncounterDraft>;
  deleteEncounterDraft(id: number, clinicianId: number): Promise<boolean>;

  // ── Diagnosis Presets (clinic-wide shared /dx shortcuts) ──────────────────
  getDiagnosisPresets(clinicId: number): Promise<schema.DiagnosisPreset[]>;
  getDiagnosisPreset(id: number, clinicId: number): Promise<schema.DiagnosisPreset | undefined>;
  createDiagnosisPreset(data: schema.InsertDiagnosisPreset): Promise<schema.DiagnosisPreset>;
  updateDiagnosisPreset(id: number, clinicId: number, data: Partial<schema.InsertDiagnosisPreset>): Promise<schema.DiagnosisPreset | undefined>;
  deleteDiagnosisPreset(id: number, clinicId: number): Promise<boolean>;

  // ── Daily Check-In: tracking settings (one row per patient) ───────────────
  getPatientTrackingSettings(patientId: number): Promise<schema.PatientTrackingSettings | null>;
  upsertPatientTrackingSettings(patientId: number, partial: Partial<schema.InsertPatientTrackingSettings>): Promise<schema.PatientTrackingSettings>;

  // ── Daily Check-In: daily logs (one row per patient per day) ──────────────
  getPatientDailyCheckin(patientId: number, date: string): Promise<schema.PatientDailyCheckin | null>;
  getPatientDailyCheckins(patientId: number, opts?: { from?: string; to?: string; limit?: number }): Promise<schema.PatientDailyCheckin[]>;
  upsertPatientDailyCheckin(patientId: number, date: string, partial: Partial<schema.InsertPatientDailyCheckin>): Promise<schema.PatientDailyCheckin>;

  // ── Daily Check-In: medication adherence ──────────────────────────────────
  logMedicationAdherence(data: schema.InsertPatientMedicationAdherenceLog): Promise<schema.PatientMedicationAdherenceLog>;
  getMedicationAdherence(patientId: number, opts?: { from?: string; to?: string; limit?: number }): Promise<schema.PatientMedicationAdherenceLog[]>;

  // ── Daily Check-In: patient-reported medications/supplements ──────────────
  addPatientReportedMedication(data: schema.InsertPatientReportedMedication): Promise<schema.PatientReportedMedication>;
  listPatientReportedMedications(patientId: number, opts?: { status?: string }): Promise<schema.PatientReportedMedication[]>;
  getPatientReportedMedication(id: number, patientId: number): Promise<schema.PatientReportedMedication | undefined>;
  updatePatientReportedMedication(id: number, patientId: number, partial: Partial<schema.InsertPatientReportedMedication>): Promise<schema.PatientReportedMedication | undefined>;
  markPatientReportedMedReviewed(id: number, patientId: number, reviewedByUserId: number): Promise<schema.PatientReportedMedication | undefined>;
  deletePatientReportedMedication(id: number, patientId: number): Promise<boolean>;

  // ── Vitals Monitoring Mode: clinician-directed episodes ──────────────────
  createVitalsMonitoringEpisode(data: schema.InsertVitalsMonitoringEpisode & { clinicId: number; createdByUserId: number }): Promise<schema.VitalsMonitoringEpisode>;
  getVitalsMonitoringEpisode(id: number): Promise<schema.VitalsMonitoringEpisode | undefined>;
  listVitalsMonitoringEpisodesForPatient(patientId: number): Promise<schema.VitalsMonitoringEpisode[]>;
  getActiveVitalsMonitoringEpisodes(): Promise<schema.VitalsMonitoringEpisode[]>;
  getActiveVitalsMonitoringEpisodeForPatient(patientId: number): Promise<schema.VitalsMonitoringEpisode | undefined>;
  endVitalsMonitoringEpisode(id: number, opts: { status: "completed" | "ended_early" | "cancelled"; endedByUserId?: number; reason?: string }): Promise<schema.VitalsMonitoringEpisode | undefined>;
  // ── Vitals Monitoring Mode: patient-logged vitals ─────────────────────────
  createPatientLoggedVital(data: schema.InsertPatientVital & { patientId: number; clinicianId: number }): Promise<schema.PatientVital>;
  listPatientLoggedVitalsForEpisode(episodeId: number): Promise<schema.PatientVital[]>;
  countPatientLoggedReadingsByDate(episodeId: number, date: string): Promise<number>;
  // ── Vitals Monitoring Mode: alerts (audit + dedupe) ───────────────────────
  recordVitalsMonitoringAlert(data: schema.InsertVitalsMonitoringAlert): Promise<schema.VitalsMonitoringAlert>;
  getVitalsMonitoringAlertsForEpisode(episodeId: number): Promise<schema.VitalsMonitoringAlert[]>;
  hasVitalsMonitoringAlert(episodeId: number, alertType: string, alertDate?: string): Promise<boolean>;

  // ── Daily Check-In: provider inbox notifications ──────────────────────────
  createInboxNotification(data: schema.InsertProviderInboxNotification): Promise<schema.ProviderInboxNotification>;
  listInboxNotifications(clinicId: number, opts?: { providerId?: number | null; includeDismissed?: boolean; limit?: number }): Promise<schema.ProviderInboxNotification[]>;
  countUnreadInboxNotifications(clinicId: number, providerId?: number | null): Promise<number>;
  markInboxNotificationRead(id: number, clinicId: number, userId: number): Promise<schema.ProviderInboxNotification | undefined>;
  markAllInboxNotificationsRead(clinicId: number, providerId: number | null, userId: number): Promise<number>;
  dismissInboxNotification(id: number, clinicId: number, userId: number): Promise<boolean>;

  // ── Spruce routing ────────────────────────────────────────────────────────
  // Maps Spruce phone-line / team identifiers → ClinIQ clinic_id so that every
  // inbound Spruce event is tenant-scoped before any downstream action is taken.
  getSpruceRoutingRulesByClinic(clinicId: number): Promise<schema.SpruceRoutingRule[]>;
  findPatientByPhoneForClinic(phone: string, clinicId: number): Promise<{ id: number; firstName: string; lastName: string } | null>;
  findSpruceClinicId(phoneLineId?: string | null, teamId?: string | null, toPhone?: string | null): Promise<number | null>;
  findSpruceMessageByDedupeKey(clinicId: number, dedupeKey: string): Promise<schema.SpruceMessage | null>;
  findSpruceOutboundByDeliveryId(clinicId: number, spruceDeliveryId: string): Promise<schema.SpruceOutboundMessage | null>;
  // Fallback echo-suppression check immune to the race condition between
  // API-response stamping and webhook arrival.  The mirror spruce_messages row
  // is always written BEFORE the Spruce API call, so this check always finds it
  // regardless of timing.
  findSpruceEchoMirrorByConvAndBody(clinicId: number, spruceConversationId: string, messageBody: string): Promise<schema.SpruceMessage | null>;
  createSpruceRoutingRule(data: schema.InsertSpruceRoutingRule & { clinicId: number }): Promise<schema.SpruceRoutingRule>;
  updateSpruceRoutingRule(id: number, data: Partial<schema.InsertSpruceRoutingRule>): Promise<schema.SpruceRoutingRule | undefined>;
  deleteSpruceRoutingRule(id: number): Promise<void>;
  createSpruceUnroutedEvent(data: schema.InsertSpruceUnroutedEvent): Promise<schema.SpruceUnroutedEvent>;
  listSpruceUnroutedEvents(opts?: { limit?: number; unreviewedOnly?: boolean }): Promise<schema.SpruceUnroutedEvent[]>;
  markSpruceUnroutedEventReviewed(id: number, userId: number): Promise<void>;

  // ── Clinic Spruce settings (per-clinic connection config + encrypted secrets) ─
  getClinicSpruceSettings(clinicId: number): Promise<schema.ClinicSpruceSettings | null>;
  upsertClinicSpruceSettings(
    clinicId: number,
    data: Partial<Pick<schema.ClinicSpruceSettings,
      "isEnabled" | "spruceAutoReplyEnabled" | "spruceJuneAcknowledgmentsEnabled"
      | "spruceOrgId" | "spruceWebhookEndpointId"
      | "spruceReceivingPhone" | "webhookSecretEncrypted" | "apiTokenEncrypted"
    >>,
  ): Promise<schema.ClinicSpruceSettings>;

  // ── Spruce message + workflow request persistence ─────────────────────────
  createSpruceMessage(data: schema.InsertSpruceMessage): Promise<schema.SpruceMessage>;
  createSpruceWorkflowRequest(data: schema.InsertSpruceWorkflowRequest): Promise<schema.SpruceWorkflowRequest>;
  getPendingSpruceWorkflowRequests(clinicId: number): Promise<schema.SpruceWorkflowRequest[]>;
  listSpruceConversations(clinicId: number): Promise<SpruceConversationSummary[]>;
  getSpruceConversationMessages(clinicId: number, conversationKey: string): Promise<SpruceConversationMessageRow[]>;
  updateSpruceWorkflowRequestStatus(
    id: number,
    status: string,
    resolvedByUserId?: number,
  ): Promise<schema.SpruceWorkflowRequest | undefined>;
  // Patient-link backfill: when a patient is created/updated with a phone,
  // retroactively links all unmatched Spruce messages + workflow requests for
  // that clinic whose fromPhone normalizes to the same last-10 digits.
  backfillSprucePatientLinks(clinicId: number, patientId: number, phone: string): Promise<void>;
  // Conversation state machine
  getSpruceConversationState(clinicId: number, conversationKey: string): Promise<schema.SpruceConversationStateRow | null>;
  upsertSpruceConversationState(clinicId: number, conversationKey: string, data: Partial<Pick<schema.SpruceConversationStateRow, 'state' | 'aiMutedAt' | 'aiMutedByUserId' | 'lastActivityAt'>>): Promise<schema.SpruceConversationStateRow>;
  // Manually link all messages in a conversation to a specific patient
  linkSpruceConversationToPatient(clinicId: number, conversationKey: string, patientId: number): Promise<{ updatedMessages: number }>;
  // Archive a conversation (Phase 3)
  archiveSpruceConversation(clinicId: number, conversationKey: string, archivedByUserId: number | null, source: 'cliniq' | 'spruce' | 'sync', spruceArchiveSyncedAt?: Date | null, spruceArchiveError?: string | null): Promise<schema.SpruceConversationStateRow>;
  // Stamp staffLastViewedAt on the conversation state when a clinician opens it
  markSpruceConversationViewed(clinicId: number, conversationKey: string): Promise<void>;
  // Set the tagged clinician (assigned-to) on a conversation state row
  setSpruceConversationTaggedClinician(clinicId: number, conversationKey: string, userId: number | null): Promise<void>;
  // Outbound message audit log
  createSpruceOutboundMessage(data: schema.InsertSpruceOutboundMessage): Promise<schema.SpruceOutboundMessage>;
  updateSpruceOutboundDeliveryId(id: number, spruceDeliveryId: string): Promise<void>;
  // After Spruce API confirms delivery, stamp the mirrored spruce_messages row
  // with the real Spruce message ID + matching dedupeKey so that Spruce's echo
  // webhook is suppressed by the existing dedup check.
  updateSpruceMessageEchoIds(id: number, spruceMessageId: string, dedupeKey: string): Promise<void>;
  // ── Spruce June Phase 3A ─────────────────────────────────────────────────
  // Per-clinic, per-workflow June settings
  getSpruceWorkflowSetting(clinicId: number, workflow: string): Promise<schema.SpruceWorkflowSettings | null>;
  upsertSpruceWorkflowSetting(clinicId: number, workflow: string, data: { allowAcknowledgment?: boolean; allowFollowUpQuestion?: boolean; maxJuneTurns?: number }): Promise<schema.SpruceWorkflowSettings>;
  listSpruceWorkflowSettings(clinicId: number): Promise<schema.SpruceWorkflowSettings[]>;
  // Update June-specific fields on a workflow request
  updateSpruceWorkflowRequestJune(id: number, data: { juneAckSentAt?: Date; juneMemoText?: string; juneTurnCount?: number }): Promise<void>;
  // Find the most recent pending workflow request for a Spruce conversation (for multi-turn)
  getOpenSpruceWorkflowRequestByConversation(clinicId: number, conversationKey: string): Promise<schema.SpruceWorkflowRequest | null>;
  // Find the most recent workflow request (any status) for display in the thread UI
  getLatestSpruceWorkflowRequest(clinicId: number, conversationKey: string): Promise<schema.SpruceWorkflowRequest | null>;
  // Mark all unreplied messages in a conversation as replied (for manually dismissing from "Unreplied" view)
  markSpruceConversationReplied(clinicId: number, conversationKey: string): Promise<void>;

  // ── Spruce June Playbook (T1 tables) ─────────────────────────────────────
  // clinic_june_playbook — one row per clinic
  getClinicJunePlaybook(clinicId: number): Promise<schema.ClinicJunePlaybook | null>;
  upsertClinicJunePlaybook(clinicId: number, data: Partial<schema.InsertClinicJunePlaybook>): Promise<schema.ClinicJunePlaybook>;
  // clinic_knowledge_entries — any number per clinic
  getClinicKnowledgeEntries(clinicId: number): Promise<schema.ClinicKnowledgeEntry[]>;
  upsertClinicKnowledgeEntry(clinicId: number, data: schema.InsertClinicKnowledgeEntry): Promise<schema.ClinicKnowledgeEntry>;
  deleteClinicKnowledgeEntry(id: number, clinicId: number): Promise<boolean>;
  // spruce_workflow_playbooks — one row per (clinic, workflow)
  getSpruceWorkflowPlaybook(clinicId: number, workflow: string): Promise<schema.SpruceWorkflowPlaybook | null>;
  getAllSpruceWorkflowPlaybooks(clinicId: number): Promise<schema.SpruceWorkflowPlaybook[]>;
  upsertSpruceWorkflowPlaybook(clinicId: number, workflow: string, data: Partial<schema.InsertSpruceWorkflowPlaybook>): Promise<schema.SpruceWorkflowPlaybook>;
  // After-hours notice dedup — stamps afterHoursNoticeSentAt on conv state
  setAfterHoursNoticeSentAt(clinicId: number, conversationKey: string, sentAt: Date): Promise<void>;

  // ── Form Workflow Builder (Layer 1) ────────────────────────────────────────
  listFormWorkflows(clinicId: number): Promise<schema.FormWorkflow[]>;
  getFormWorkflow(id: number, clinicId: number): Promise<schema.FormWorkflow | null>;
  createFormWorkflow(clinicId: number, data: Omit<schema.InsertFormWorkflow, "clinicId">): Promise<schema.FormWorkflow>;
  updateFormWorkflow(id: number, clinicId: number, data: Partial<Omit<schema.InsertFormWorkflow, "clinicId">>): Promise<schema.FormWorkflow | null>;
  deleteFormWorkflow(id: number, clinicId: number): Promise<boolean>;
  listFormWorkflowSteps(workflowId: number): Promise<schema.FormWorkflowStep[]>;
  replaceFormWorkflowSteps(workflowId: number, steps: Omit<schema.InsertFormWorkflowStep, "workflowId">[]): Promise<schema.FormWorkflowStep[]>;
  // ── Layer 2: workflow execution engine ──────────────────────────────────
  findEnabledWorkflowForForm(clinicId: number, formId: number): Promise<schema.FormWorkflow | null>;
  createWorkflowRun(data: schema.InsertFormWorkflowRun): Promise<schema.FormWorkflowRun>;
  getWorkflowRun(id: number): Promise<schema.FormWorkflowRun | null>;
  updateWorkflowRun(id: number, data: Partial<Pick<schema.FormWorkflowRun, "status" | "currentStepPosition" | "stoppedReason" | "completedAt" | "contextJson">>): Promise<void>;
  getWorkflowRunBySubmission(workflowId: number, submissionId: number): Promise<schema.FormWorkflowRun | null>;
  listWaitingStepStates(limit: number): Promise<schema.FormWorkflowStepState[]>;
  getWorkflowStepState(runId: number, stepPosition: number): Promise<schema.FormWorkflowStepState | null>;
  upsertWorkflowStepState(runId: number, stepPosition: number, data: { stepType: string; status: string; executedAt?: Date | null; resultJson?: any; dueAt?: Date | null; lockedAt?: Date | null }): Promise<schema.FormWorkflowStepState>;
  lockWaitingStep(id: number): Promise<boolean>;
  clearWaitingStepLock(id: number): Promise<void>;
  listActiveRunsForPatient(clinicId: number, patientId: number): Promise<schema.FormWorkflowRun[]>;
  findSpruceConversationByPatient(clinicId: number, patientId: number): Promise<{ conversationKey: string; spruceConversationId: string | null; fromPhone: string | null; toPhone: string | null } | null>;
  hasPatientRespondedSince(clinicId: number, patientId: number, since: Date): Promise<boolean>;
  createWorkflowInboxNotification(data: { clinicId: number; patientId?: number | null; providerId?: number | null; type: string; title: string; message: string; severity?: string; relatedEntityId?: number | null }): Promise<void>;
  listFormWorkflowRunsByWorkflow(workflowId: number, clinicId: number): Promise<schema.FormWorkflowRun[]>;
  // ── Layer 2.5: monitoring & manual controls ──────────────────────────────
  listStepStatesByRun(runId: number): Promise<schema.FormWorkflowStepState[]>;
  pauseWorkflowRun(runId: number): Promise<void>;
  resumeWorkflowRun(runId: number): Promise<void>;
  retryWorkflowStep(runId: number, stepPos: number): Promise<boolean>;
  skipWorkflowStep(runId: number, stepPos: number, actorId: number | null, reason: string): Promise<void>;
  logWorkflowMilestone(patientId: number, clinicianId: number, content: string): Promise<void>;
  getIntakeFormsForClinic(clinicId: number): Promise<Pick<schema.IntakeForm, "id" | "name" | "status">[]>;

  // ── Clinical Block Defaults (per-clinician ROS/PE customization) ─────────
  getClinicalBlockDefaults(clinicId: number, providerId: number): Promise<schema.ClinicalBlockDefaultsRow | null>;
  upsertClinicalBlockDefaults(clinicId: number, providerId: number, data: schema.UpdateClinicalBlockDefaults): Promise<schema.ClinicalBlockDefaultsRow>;

  // ── June AI Preference Memory ────────────────────────────────────────────
  getJunePreferences(clinicianId: number, staffId?: number | null): Promise<schema.JunePreference[]>;
  createJunePreference(data: schema.InsertJunePreference): Promise<schema.JunePreference>;
  updateJunePreference(id: number, clinicianId: number, data: Partial<Pick<schema.JunePreference, 'label' | 'instruction' | 'triggerPhrases' | 'isActive' | 'category'>>, staffId?: number | null): Promise<schema.JunePreference | undefined>;
  deleteJunePreference(id: number, clinicianId: number, staffId?: number | null): Promise<boolean>;
  getClinicById(id: number): Promise<schema.Clinic | undefined>;

  // ── Collaborating Physician Chart Review ─────────────────────────────────
  getChartReviewAgreementForMidLevel(midLevelUserId: number, clinicId: number): Promise<schema.ChartReviewAgreement | undefined>;
  getChartReviewAgreementById(id: number, clinicId: number): Promise<schema.ChartReviewAgreement | undefined>;
  createChartReviewAgreement(data: schema.InsertChartReviewAgreement, opts: { primaryPhysicianUserId: number }): Promise<schema.ChartReviewAgreement>;
  updateChartReviewAgreement(id: number, clinicId: number, data: Partial<schema.InsertChartReviewAgreement>, actor: { userId: number; isMidLevel: boolean; isPhysicianOnAgreement: boolean; isAdmin: boolean }): Promise<schema.ChartReviewAgreement | undefined>;
  setPhysicianOverride(agreementId: number, clinicId: number, lockedFields: string[], physicianUserId: number): Promise<schema.ChartReviewAgreement | undefined>;
  listChartReviewCollaborators(agreementId: number, clinicId?: number): Promise<schema.ChartReviewCollaborator[]>;
  addChartReviewCollaborator(agreementId: number, physicianUserId: number, role: 'primary' | 'backup', clinicId?: number): Promise<schema.ChartReviewCollaborator | null>;
  removeChartReviewCollaborator(id: number, agreementId: number, clinicId?: number): Promise<boolean>;
  // Returns agreements where the user is the mid-level OR a collaborator (any role).
  listChartReviewAgreementsForUser(userId: number, clinicId: number): Promise<Array<schema.ChartReviewAgreement & { role: 'midlevel' | 'physician'; collaboratorRole?: 'primary' | 'backup' }>>;
  // Returns mid-level summary cards for a collaborating physician.
  listMidLevelsForPhysician(physicianUserId: number, clinicId: number): Promise<Array<{
    agreement: schema.ChartReviewAgreement;
    midLevel: { id: number; firstName: string | null; lastName: string | null; title: string | null };
    role: 'primary' | 'backup';
    periodPctComplete: number;
    pendingCount: number;
    pastDueCount: number;
    maxDaysPastDue: number;
  }>>;
  // Queue feed.
  listChartReviewItemsForAgreement(agreementId: number, opts?: { status?: string; limit?: number; clinicId?: number }): Promise<Array<schema.ChartReviewItem & { patientName: string; encounterVisitDate: Date; encounterChiefComplaint: string | null }>>;
  getChartReviewItem(id: number, clinicId: number): Promise<schema.ChartReviewItem | undefined>;
  // Comments. clinicId is required to prevent cross-tenant comment access.
  listChartReviewComments(itemId: number, clinicId: number): Promise<schema.ChartReviewComment[]>;
  addChartReviewComment(data: schema.InsertChartReviewComment, clinicId: number): Promise<schema.ChartReviewComment | null>;
  // Status transitions.
  concurChartReviewItem(id: number, clinicId: number, physicianUserId: number, comment?: string): Promise<schema.ChartReviewItem | undefined>;
  rejectChartReviewItem(id: number, clinicId: number, physicianUserId: number, reason: string): Promise<schema.ChartReviewItem | undefined>;
  // Hook called from POST /api/encounters/:id/sign.
  // Returns the created item if one was queued (mandatory rule hit OR sendForReview true), null otherwise.
  enqueueChartForReviewIfApplicable(opts: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
    sendForReview: boolean;
  }): Promise<schema.ChartReviewItem | null>;
  // Mid-level manually flags an already-signed chart for review. Always queues
  // (idempotent — returns existing if already queued). Priority='midlevel_flag'
  // unless mandatory reasons apply (then 'mandatory').
  flagChartForReview(opts: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
  }): Promise<schema.ChartReviewItem | null>;
  // Used by the "Send for review?" prompt to compute mandatory flags before signing.
  previewChartReviewFlags(opts: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
  }): Promise<{
    hasAgreement: boolean;
    wouldBeMandatory: boolean;
    mandatoryReasons: string[];
    runningPeriodPct: number;
    quotaTargetPct: number;
  }>;
}

// ─── Patient scope helper ────────────────────────────────────────────────────
// Builds the WHERE condition for patient visibility:
//   • When clinicId is set → filter by clinic_id (immune to account/email changes)
//   • When clinicId is null → legacy fallback: filter by user_id where clinic_id IS NULL
// This dual-condition guarantees both clinic-enrolled and legacy patients are visible.
function patientScopeCondition(userId: number, clinicId: number | null) {
  if (clinicId) {
    // Show clinic patients AND this user's own legacy patients (clinic_id IS NULL).
    // The legacy OR ensures pre-backfill and auto-created patients without clinic_id
    // are never invisible. Each provider only sees their OWN legacy rows (by userId).
    return or(
      eq(schema.patients.clinicId, clinicId),
      and(eq(schema.patients.userId, userId), isNull(schema.patients.clinicId))
    );
  }
  // No clinic context: show only this user's own legacy patients
  return and(eq(schema.patients.userId, userId), isNull(schema.patients.clinicId));
}

export class DbStorage implements IStorage {
  // ── User operations ─────────────────────────────────────────────────────────
  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return result[0];
  }

  async createUser(user: Omit<InsertUser, 'passwordHash'> & { passwordHash: string }): Promise<User> {
    const result = await db.insert(schema.users).values(user as any).returning();
    return result[0];
  }

  async updateUser(id: number, user: Partial<Omit<InsertUser, 'passwordHash'>>): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  // ── HIPAA: Login security (lockout tracking) ──────────────────────────────────
  async recordLoginAttempt(userId: number, success: boolean): Promise<void> {
    const LOCKOUT_THRESHOLD = 5;
    const LOCKOUT_MINUTES = 15;
    if (success) {
      await db.update(schema.users)
        .set({ loginAttempts: 0, lockedUntil: null, updatedAt: new Date() } as any)
        .where(eq(schema.users.id, userId));
    } else {
      const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!user[0]) return;
      const attempts = (user[0].loginAttempts ?? 0) + 1;
      const lockedUntil = attempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
      await db.update(schema.users)
        .set({ loginAttempts: attempts, lockedUntil, updatedAt: new Date() } as any)
        .where(eq(schema.users.id, userId));
    }
  }

  async recordStaffLoginAttempt(staffId: number, success: boolean): Promise<void> {
    const LOCKOUT_THRESHOLD = 5;
    const LOCKOUT_MINUTES = 15;
    if (success) {
      await db.update(schema.clinicianStaff)
        .set({ loginAttempts: 0, lockedUntil: null } as any)
        .where(eq(schema.clinicianStaff.id, staffId));
    } else {
      const staff = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.id, staffId)).limit(1);
      if (!staff[0]) return;
      const attempts = (staff[0].loginAttempts ?? 0) + 1;
      const lockedUntil = attempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
      await db.update(schema.clinicianStaff)
        .set({ loginAttempts: attempts, lockedUntil } as any)
        .where(eq(schema.clinicianStaff.id, staffId));
    }
  }

  // ── Password reset / invite operations ───────────────────────────────────────
  async savePasswordResetToken(userId: number, token: string, expires: Date): Promise<void> {
    await db
      .update(schema.users)
      .set({ passwordResetToken: token, passwordResetExpires: expires, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.passwordResetToken, token));
    return result[0];
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    await db
      .update(schema.users)
      .set({ passwordResetToken: null, passwordResetExpires: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await db
      .update(schema.users)
      .set({ passwordHash, passwordResetToken: null, passwordResetExpires: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  // ── Staff password reset ─────────────────────────────────────────────────────
  async saveStaffPasswordResetToken(staffId: number, token: string, expires: Date): Promise<void> {
    await db
      .update(schema.clinicianStaff)
      .set({ passwordResetToken: token, passwordResetExpires: expires })
      .where(eq(schema.clinicianStaff.id, staffId));
  }

  async getStaffByResetToken(token: string): Promise<schema.ClinicianStaff | undefined> {
    const result = await db
      .select()
      .from(schema.clinicianStaff)
      .where(eq(schema.clinicianStaff.passwordResetToken, token));
    return result[0];
  }

  async updateStaffPassword(staffId: number, passwordHash: string): Promise<void> {
    await db
      .update(schema.clinicianStaff)
      .set({ passwordHash, passwordResetToken: null, passwordResetExpires: null, loginAttempts: 0, lockedUntil: null })
      .where(eq(schema.clinicianStaff.id, staffId));
  }

  // ── Admin operations ─────────────────────────────────────────────────────────
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  async promoteToAdmin(id: number): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async updateUserAdmin(id: number, data: Partial<Pick<User, 'subscriptionStatus' | 'role' | 'notes' | 'freeAccount'>>): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async getBaaSignature(userId: number): Promise<schema.BaaSignature | undefined> {
    const result = await db
      .select()
      .from(schema.baaSignatures)
      .where(eq(schema.baaSignatures.userId, userId))
      .orderBy(schema.baaSignatures.signedAt)
      .limit(1);
    return result[0];
  }

  async createBaaSignature(data: schema.InsertBaaSignature): Promise<schema.BaaSignature> {
    const result = await db
      .insert(schema.baaSignatures)
      .values(data)
      .returning();
    return result[0];
  }

  async updateUserStripe(id: number, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeCurrentPeriodEnd?: Date | null;
    stripeCancelAtPeriodEnd?: boolean;
    subscriptionStatus?: string;
  }): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async deleteUserAdmin(id: number): Promise<boolean> {
    const result = await db.delete(schema.users).where(eq(schema.users.id, id)).returning();
    return result.length > 0;
  }

  async getPatientCountByUser(userId: number, clinicId?: number | null): Promise<number> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select({ cnt: count() })
      .from(schema.patients)
      .where(scopeCondition);
    return Number(result[0]?.cnt ?? 0);
  }

  // ── Patient operations ───────────────────────────────────────────────────────
  async getPatient(id: number, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select()
      .from(schema.patients)
      .where(and(eq(schema.patients.id, id), scopeCondition));
    return result[0];
  }

  async getAllPatients(userId: number, clinicId?: number | null): Promise<Patient[]> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    return await db
      .select()
      .from(schema.patients)
      .where(scopeCondition)
      .orderBy(desc(schema.patients.updatedAt));
  }

  async searchPatients(searchTerm: string, userId: number, gender?: string, clinicId?: number | null): Promise<Patient[]> {
    const searchPattern = `%${searchTerm}%`;
    const nameCondition = or(
      ilike(schema.patients.firstName, searchPattern),
      ilike(schema.patients.lastName, searchPattern),
      sql`(${schema.patients.firstName} || ' ' || ${schema.patients.lastName}) ILIKE ${searchPattern}`,
    );
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    if (gender) {
      return await db
        .select()
        .from(schema.patients)
        .where(and(nameCondition, scopeCondition, eq(schema.patients.gender, gender)))
        .orderBy(desc(schema.patients.updatedAt));
    }
    return await db
      .select()
      .from(schema.patients)
      .where(and(nameCondition!, scopeCondition))
      .orderBy(desc(schema.patients.updatedAt));
  }

  async getPatientByName(firstName: string, lastName: string, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select()
      .from(schema.patients)
      .where(
        and(
          ilike(schema.patients.firstName, firstName),
          ilike(schema.patients.lastName, lastName),
          scopeCondition
        )
      );
    return result[0];
  }

  async getPatientByEmail(email: string, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select()
      .from(schema.patients)
      .where(
        and(
          ilike(schema.patients.email, email),
          scopeCondition
        )
      );
    return result[0];
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const result = await db.insert(schema.patients).values(patient).returning();
    return result[0];
  }

  async updatePatient(id: number, patient: Partial<InsertPatient>, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .update(schema.patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(and(eq(schema.patients.id, id), scopeCondition))
      .returning();
    return result[0];
  }

  async deletePatient(id: number, userId: number, clinicId?: number | null): Promise<boolean> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .delete(schema.patients)
      .where(and(eq(schema.patients.id, id), scopeCondition))
      .returning();
    return result.length > 0;
  }

  // ── Clinic management ────────────────────────────────────────────────────────
  async getClinicForUser(userId: number): Promise<schema.Clinic | undefined> {
    const membership = await db
      .select()
      .from(schema.clinicMemberships)
      .where(and(eq(schema.clinicMemberships.userId, userId), eq(schema.clinicMemberships.isActive, true)))
      .limit(1);
    if (!membership[0]) return undefined;
    const clinic = await db
      .select()
      .from(schema.clinics)
      .where(eq(schema.clinics.id, membership[0].clinicId))
      .limit(1);
    return clinic[0];
  }

  async getAllClinicsAdmin(): Promise<Array<schema.Clinic & { memberCount: number; patientCount: number; ownerEmail: string | null }>> {
    const allClinics = await db.select().from(schema.clinics).orderBy(schema.clinics.name);
    return await Promise.all(allClinics.map(async (c) => {
      const [memberRes, patientRes, adminRes] = await Promise.all([
        db.select({ cnt: count() }).from(schema.clinicMemberships).where(eq(schema.clinicMemberships.clinicId, c.id)),
        db.select({ cnt: count() }).from(schema.patients).where(eq(schema.patients.clinicId, c.id)),
        db.select({ email: schema.users.email })
          .from(schema.clinicMemberships)
          .innerJoin(schema.users, eq(schema.users.id, schema.clinicMemberships.userId))
          .where(and(
            eq(schema.clinicMemberships.clinicId, c.id),
            eq(schema.clinicMemberships.isPrimaryClinic, true),
          ))
          .limit(1),
      ]);
      return {
        ...c,
        memberCount: Number(memberRes[0]?.cnt ?? 0),
        patientCount: Number(patientRes[0]?.cnt ?? 0),
        ownerEmail: adminRes[0]?.email ?? null,
      };
    }));
  }

  async backfillPatientsToClinic(userId: number, clinicId: number): Promise<number> {
    // Stamp clinic_id on all patients owned by userId that don't yet have one
    const result = await db
      .update(schema.patients)
      .set({ clinicId, updatedAt: new Date() })
      .where(and(eq(schema.patients.userId, userId), isNull(schema.patients.clinicId)))
      .returning({ id: schema.patients.id });
    return result.length;
  }

  async addUserToClinic(clinicId: number, userId: number, role: string): Promise<schema.ClinicMembership> {
    const existing = await db
      .select()
      .from(schema.clinicMemberships)
      .where(and(eq(schema.clinicMemberships.clinicId, clinicId), eq(schema.clinicMemberships.userId, userId)));
    if (existing[0]) {
      const updated = await db
        .update(schema.clinicMemberships)
        .set({ role, isActive: true, updatedAt: new Date() })
        .where(eq(schema.clinicMemberships.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(schema.clinicMemberships)
      .values({ clinicId, userId, role, isActive: true, isPrimaryClinic: true })
      .returning();
    return inserted[0];
  }

  async getClinicMembers(clinicId: number): Promise<Array<schema.ClinicMembership & { userEmail: string; userName: string }>> {
    const members = await db
      .select()
      .from(schema.clinicMemberships)
      .where(eq(schema.clinicMemberships.clinicId, clinicId));
    return await Promise.all(members.map(async (m) => {
      const user = await db.select({ email: schema.users.email, firstName: schema.users.firstName, lastName: schema.users.lastName })
        .from(schema.users).where(eq(schema.users.id, m.userId)).limit(1);
      return {
        ...m,
        userEmail: user[0]?.email ?? "",
        userName: user[0] ? `${user[0].firstName} ${user[0].lastName}`.trim() : "",
      };
    }));
  }

  // ── Lab result operations ────────────────────────────────────────────────────
  async getLabResult(id: number): Promise<LabResult | undefined> {
    const result = await db.select().from(schema.labResults).where(eq(schema.labResults.id, id));
    return result[0];
  }

  async getLabResultsByPatient(patientId: number): Promise<LabResult[]> {
    return await db
      .select()
      .from(schema.labResults)
      .where(eq(schema.labResults.patientId, patientId))
      .orderBy(desc(schema.labResults.labDate));
  }

  async createLabResult(labResult: InsertLabResult): Promise<LabResult> {
    const result = await db.insert(schema.labResults).values(labResult as any).returning();
    return result[0];
  }

  async updateLabResult(id: number, labResult: Partial<InsertLabResult>): Promise<LabResult | undefined> {
    const result = await db
      .update(schema.labResults)
      .set({ ...labResult, updatedAt: new Date() } as any)
      .where(eq(schema.labResults.id, id))
      .returning();
    return result[0];
  }

  async deleteLabResult(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.labResults)
      .where(eq(schema.labResults.id, id))
      .returning();
    return result.length > 0;
  }

  async updateLabResultProviderOverrides(id: number, overrides: any): Promise<LabResult | undefined> {
    const result = await db
      .update(schema.labResults)
      .set({ providerOverrides: overrides, updatedAt: new Date() } as any)
      .where(eq(schema.labResults.id, id))
      .returning();
    return result[0];
  }

  // ── Simple lab upload operations ─────────────────────────────────────────────
  async getSimpleLabsByPatient(patientId: number): Promise<SimpleLabUpload[]> {
    return await db
      .select()
      .from(schema.simpleLabUploads)
      .where(eq(schema.simpleLabUploads.patientId, patientId))
      .orderBy(desc(schema.simpleLabUploads.labDate));
  }

  async createSimpleLabUpload(data: InsertSimpleLabUpload): Promise<SimpleLabUpload> {
    const result = await db.insert(schema.simpleLabUploads).values(data as any).returning();
    return result[0];
  }

  async deleteSimpleLabUpload(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.simpleLabUploads)
      .where(eq(schema.simpleLabUploads.id, id))
      .returning();
    return result.length > 0;
  }

  // ── Saved interpretation operations ─────────────────────────────────────────
  async getSavedInterpretation(id: number, userId: number): Promise<SavedInterpretation | undefined> {
    const result = await db
      .select()
      .from(schema.savedInterpretations)
      .where(and(eq(schema.savedInterpretations.id, id), eq(schema.savedInterpretations.userId, userId)));
    return result[0];
  }

  async getAllSavedInterpretations(userId: number, gender?: string): Promise<SavedInterpretation[]> {
    const userCondition = eq(schema.savedInterpretations.userId, userId);
    if (gender) {
      return await db
        .select()
        .from(schema.savedInterpretations)
        .where(and(userCondition, eq(schema.savedInterpretations.gender, gender)))
        .orderBy(desc(schema.savedInterpretations.createdAt));
    }
    return await db
      .select()
      .from(schema.savedInterpretations)
      .where(userCondition)
      .orderBy(desc(schema.savedInterpretations.createdAt));
  }

  async searchSavedInterpretations(searchTerm: string, userId: number, gender?: string): Promise<SavedInterpretation[]> {
    const searchPattern = `%${searchTerm}%`;
    const userCondition = eq(schema.savedInterpretations.userId, userId);
    if (gender) {
      return await db
        .select()
        .from(schema.savedInterpretations)
        .where(
          and(
            ilike(schema.savedInterpretations.patientName, searchPattern),
            userCondition,
            eq(schema.savedInterpretations.gender, gender)
          )
        )
        .orderBy(desc(schema.savedInterpretations.createdAt));
    }
    return await db
      .select()
      .from(schema.savedInterpretations)
      .where(and(ilike(schema.savedInterpretations.patientName, searchPattern), userCondition))
      .orderBy(desc(schema.savedInterpretations.createdAt));
  }

  async createSavedInterpretation(interpretation: InsertSavedInterpretation): Promise<SavedInterpretation> {
    const result = await db.insert(schema.savedInterpretations).values(interpretation as any).returning();
    return result[0];
  }

  async deleteSavedInterpretation(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(schema.savedInterpretations)
      .where(and(eq(schema.savedInterpretations.id, id), eq(schema.savedInterpretations.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Patient portal account operations ────────────────────────────────────────
  async getPatientById(id: number): Promise<Patient | undefined> {
    const result = await db.select().from(schema.patients).where(eq(schema.patients.id, id));
    return result[0];
  }

  async getPatientByPhoneForClinician(phone: string, clinicianId: number): Promise<Patient | undefined> {
    // Normalize: strip non-digits so "+1 (555) 123-4567" matches "5551234567"
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length < 7) return undefined;
    const last10 = digits.slice(-10);
    const result = await db
      .select()
      .from(schema.patients)
      .where(and(
        eq(schema.patients.userId, clinicianId),
        sql`regexp_replace(coalesce(${schema.patients.phone}, ''), '\\D', '', 'g') LIKE ${'%' + last10}`,
      ))
      .limit(1);
    return result[0];
  }

  async getPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined> {
    const normalized = (email || "").trim().toLowerCase();
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(sql`LOWER(${schema.patientPortalAccounts.email}) = ${normalized}`);
    return result[0];
  }

  async getPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.patientId, patientId));
    return result[0];
  }

  async getPortalAccountByInviteToken(token: string): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.inviteToken, token));
    return result[0];
  }

  async getPortalAccountByResetToken(token: string): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.passwordResetToken, token));
    return result[0];
  }

  async createPortalAccount(account: InsertPatientPortalAccount): Promise<PatientPortalAccount> {
    const result = await db
      .insert(schema.patientPortalAccounts)
      .values(account as any)
      .returning();
    return result[0];
  }

  async updatePortalAccount(patientId: number, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .update(schema.patientPortalAccounts)
      .set(data as any)
      .where(eq(schema.patientPortalAccounts.patientId, patientId))
      .returning();
    return result[0];
  }

  async updatePortalAccountByEmail(email: string, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined> {
    const normalized = (email || "").trim().toLowerCase();
    const result = await db
      .update(schema.patientPortalAccounts)
      .set(data as any)
      .where(sql`LOWER(${schema.patientPortalAccounts.email}) = ${normalized}`)
      .returning();
    return result[0];
  }

  // ── Published protocol operations ─────────────────────────────────────────────
  async publishProtocol(protocol: InsertPublishedProtocol): Promise<PublishedProtocol> {
    const result = await db
      .insert(schema.publishedProtocols)
      .values(protocol as any)
      .returning();
    return result[0];
  }

  async getLatestPublishedProtocol(patientId: number): Promise<PublishedProtocol | undefined> {
    const result = await db
      .select()
      .from(schema.publishedProtocols)
      .where(eq(schema.publishedProtocols.patientId, patientId))
      .orderBy(desc(schema.publishedProtocols.publishedAt))
      .limit(1);
    return result[0];
  }

  async getAllPublishedProtocols(patientId: number): Promise<PublishedProtocol[]> {
    return await db
      .select()
      .from(schema.publishedProtocols)
      .where(eq(schema.publishedProtocols.patientId, patientId))
      .orderBy(desc(schema.publishedProtocols.publishedAt));
  }

  async deleteProtocolsByLabResultId(labResultId: number): Promise<void> {
    await db
      .delete(schema.publishedProtocols)
      .where(eq(schema.publishedProtocols.labResultId, labResultId));
  }

  async markProtocolViewed(protocolId: number): Promise<void> {
    await db
      .update(schema.publishedProtocols)
      .set({ firstViewedAt: new Date() })
      .where(
        and(
          eq(schema.publishedProtocols.id, protocolId),
          isNull(schema.publishedProtocols.firstViewedAt),
        )
      );
  }

  // ── Portal message operations ─────────────────────────────────────────────────
  async getPortalMessages(patientId: number): Promise<PortalMessage[]> {
    // PATIENT SAFETY GATE: only return patient-visible messages.
    // Internal notes, memos, and workflow notes are NEVER returned here.
    return await db
      .select()
      .from(schema.portalMessages)
      .where(
        and(
          eq(schema.portalMessages.patientId, patientId),
          eq(schema.portalMessages.visibility, 'patient_visible'),
        )
      )
      .orderBy(schema.portalMessages.createdAt);
  }

  async createPortalMessage(msg: InsertPortalMessage): Promise<PortalMessage> {
    // Auto-derive visibility from messageType if not explicitly provided.
    // This ensures internal notes can never be accidentally set patient_visible.
    const messageType = (msg as any).messageType ?? 'message';
    const derivedVisibility = messageType === 'message' ? 'patient_visible' : 'internal_only';
    const visibility = (msg as any).visibility ?? derivedVisibility;
    const result = await db
      .insert(schema.portalMessages)
      .values({ ...msg, messageType, visibility } as any)
      .returning();
    return result[0];
  }

  async markPortalMessagesRead(patientId: number, readBySenderType: 'patient' | 'clinician'): Promise<void> {
    // Mark messages sent by the OTHER party as read.
    // Only mark patient-visible messages (internal notes have no read state for patients).
    const senderToMark = readBySenderType === 'patient' ? 'clinician' : 'patient';
    await db
      .update(schema.portalMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.portalMessages.patientId, patientId),
          eq(schema.portalMessages.senderType, senderToMark),
          eq(schema.portalMessages.visibility, 'patient_visible'),
          isNull(schema.portalMessages.readAt)
        )
      );
  }

  async getUnreadPortalMessageCount(patientId: number, unreadBySenderType: 'patient' | 'clinician'): Promise<number> {
    // Count patient-visible messages sent by the other party that haven't been read yet.
    const senderToCount = unreadBySenderType === 'patient' ? 'clinician' : 'patient';
    const result = await db
      .select({ cnt: count() })
      .from(schema.portalMessages)
      .where(
        and(
          eq(schema.portalMessages.patientId, patientId),
          eq(schema.portalMessages.senderType, senderToCount),
          eq(schema.portalMessages.visibility, 'patient_visible'),
          isNull(schema.portalMessages.readAt)
        )
      );
    return Number(result[0]?.cnt ?? 0);
  }

  async getPortalMessageByExternalId(externalMessageId: string): Promise<PortalMessage | undefined> {
    const result = await db
      .select()
      .from(schema.portalMessages)
      .where(eq(schema.portalMessages.externalMessageId, externalMessageId))
      .limit(1);
    return result[0];
  }

  // ── Phase 2: Internal notes, mentions, reply context ─────────────────────

  async createMessageMention(data: schema.InsertPatientMessageMention): Promise<schema.PatientMessageMention> {
    const result = await db
      .insert(schema.patientMessageMentions)
      .values(data as any)
      .returning();
    return result[0];
  }

  async createInternalNote(data: {
    patientId: number; clinicId: number; clinicianId: number;
    content: string; messageType?: string;
    mentionedUserIds?: number[];
  }): Promise<PortalMessage> {
    const messageType = data.messageType ?? 'internal_note';
    // All internal types are internal_only; june_memo / workflow_note too
    const visibility = messageType === 'message' ? 'patient_visible' : 'internal_only';

    const result = await db
      .insert(schema.portalMessages)
      .values({
        patientId: data.patientId,
        clinicianId: data.clinicianId,
        senderType: 'clinician',
        content: data.content,
        readAt: null,
        messageType,
        visibility,
        deliveryChannel: null,
        externalDeliveryId: null,
      } as any)
      .returning();
    const msg = result[0];

    // Create mention rows + inbox notifications for each tagged user
    if (data.mentionedUserIds && data.mentionedUserIds.length > 0) {
      for (const userId of data.mentionedUserIds) {
        // Mention record
        await db.insert(schema.patientMessageMentions).values({
          clinicId: data.clinicId,
          patientId: data.patientId,
          messageId: msg.id,
          mentionedUserId: userId,
        } as any);

        // Inbox notification → routes to the tagged staff member's bell
        const preview = data.content.length > 120
          ? data.content.slice(0, 120) + '…'
          : data.content;
        await db.insert(schema.providerInboxNotifications).values({
          clinicId: data.clinicId,
          patientId: data.patientId,
          providerId: userId,
          type: 'staff_mention',
          title: 'You were mentioned in a patient note',
          message: preview,
          relatedEntityType: 'portal_message',
          relatedEntityId: msg.id,
          severity: 'normal',
        } as any);
      }
    }

    return msg;
  }

  async getReplyContext(patientId: number, clinicId: number): Promise<ReplyContext> {
    // 1. Portal account check
    const portalAccount = await db
      .select({ id: schema.patientPortalAccounts.id })
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.patientId, patientId))
      .limit(1);
    const hasPortalAccount = portalAccount.length > 0;

    // 2. Most recent *real* Spruce message for this patient.
    //    First try by patientId (fast path — works when phone backfill has run).
    //    If nothing found, fall back to phone-number matching so clinics that haven't
    //    completed the backfill still see the correct channel default.
    //    System events (unknown / spruce_system_event) are always excluded.
    const spruceBaseConditions = and(
      eq(schema.spruceMessages.clinicId, clinicId),
      ne(schema.spruceMessages.messageDirection as any, 'unknown'),
      ne(schema.spruceMessages.messageDirection as any, 'spruce_system_event'),
    );

    let latestSpruce: { spruceConversationId: string | null; fromPhone: string | null } | null = null;

    const byIdRows = await db
      .select({
        spruceConversationId: schema.spruceMessages.spruceConversationId,
        fromPhone: schema.spruceMessages.fromPhone,
      })
      .from(schema.spruceMessages)
      .where(and(spruceBaseConditions, eq(schema.spruceMessages.patientId, patientId)))
      .orderBy(desc(schema.spruceMessages.receivedAt))
      .limit(1);
    latestSpruce = byIdRows[0] ?? null;

    // Phone-number fallback — used when patientId is not stamped on the Spruce row
    if (!latestSpruce) {
      const patientPhone = await db
        .select({
          phone: schema.patients.phone,
          messagingPhone: schema.patients.messagingPhone,
        })
        .from(schema.patients)
        .where(eq(schema.patients.id, patientId))
        .limit(1);
      const rawPhone = patientPhone[0]?.messagingPhone || patientPhone[0]?.phone || null;
      if (rawPhone) {
        const digits = rawPhone.replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length >= 7) {
          const byPhoneRows = await db
            .select({
              spruceConversationId: schema.spruceMessages.spruceConversationId,
              fromPhone: schema.spruceMessages.fromPhone,
            })
            .from(schema.spruceMessages)
            .where(
              and(
                spruceBaseConditions,
                sql`regexp_replace(coalesce(${schema.spruceMessages.fromPhone}, ''), '\\D', '', 'g') LIKE ${'%' + last10}`,
              ),
            )
            .orderBy(desc(schema.spruceMessages.receivedAt))
            .limit(1);
          latestSpruce = byPhoneRows[0] ?? null;
        }
      }
    }

    const hasSpruceConversation = latestSpruce !== null;
    const spruceConversationKey = latestSpruce
      ? (latestSpruce.spruceConversationId ?? latestSpruce.fromPhone ?? null)
      : null;

    // 3. Patient primaryCommunicationChannel override
    const patientRow = await db
      .select({ primaryCommunicationChannel: schema.patients.primaryCommunicationChannel })
      .from(schema.patients)
      .where(eq(schema.patients.id, patientId))
      .limit(1);
    const primaryPref = (patientRow[0]?.primaryCommunicationChannel ?? null) as 'portal' | 'spruce' | null;

    // 4. Determine available channels
    const availableChannels: Array<'portal' | 'spruce'> = [];
    if (hasPortalAccount) availableChannels.push('portal');
    if (hasSpruceConversation) availableChannels.push('spruce');

    // 5. Determine active channel.
    //    Priority: explicit patient preference → Spruce (when available) → portal → first available.
    //    Spruce is preferred by default because most patients message via Spruce SMS and
    //    replies should follow the channel the patient is already using.
    //    The patient (or clinician) can override via primaryCommunicationChannel.
    let activeChannel: 'portal' | 'spruce' | null = null;
    if (primaryPref && availableChannels.includes(primaryPref)) {
      activeChannel = primaryPref;
    } else if (hasSpruceConversation) {
      activeChannel = 'spruce';
    } else {
      activeChannel = availableChannels[0] ?? null;
    }

    return {
      availableChannels,
      activeChannel,
      hasPortalAccount,
      hasSpruceConversation,
      spruceConversationKey,
      primaryCommunicationChannel: primaryPref,
    };
  }

  // ── Clinician Staff ──────────────────────────────────────────────────────────
  async getClinicianStaffById(id: number): Promise<ClinicianStaff | undefined> {
    const result = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.id, id));
    return result[0];
  }

  async getClinicianStaffByEmail(email: string): Promise<ClinicianStaff | undefined> {
    const result = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.email, email.toLowerCase()));
    return result[0];
  }

  async getClinicianStaffByInviteToken(token: string): Promise<ClinicianStaff | undefined> {
    const result = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.inviteToken, token));
    return result[0];
  }

  async getAllStaffForClinician(clinicianId: number): Promise<ClinicianStaff[]> {
    return db.select().from(schema.clinicianStaff)
      .where(eq(schema.clinicianStaff.clinicianId, clinicianId))
      .orderBy(schema.clinicianStaff.createdAt);
  }

  // Returns all staff across every provider in a clinic — used by clinic admins
  // so any provider with admin rights can see and manage the full team.
  // Primary path: query directly on clinic_id (populated by backfill and new invites).
  // Fallback: JOIN through users.default_clinic_id for any rows not yet backfilled.
  async getAllStaffForClinic(clinicId: number): Promise<ClinicianStaff[]> {
    const direct = await db.select()
      .from(schema.clinicianStaff)
      .where(eq(schema.clinicianStaff.clinicId, clinicId))
      .orderBy(schema.clinicianStaff.createdAt);
    if (direct.length > 0) return direct;

    // Fallback — should only fire if a row was not backfilled
    const rows = await db.select({
      id: schema.clinicianStaff.id,
      clinicianId: schema.clinicianStaff.clinicianId,
      email: schema.clinicianStaff.email,
      firstName: schema.clinicianStaff.firstName,
      lastName: schema.clinicianStaff.lastName,
      role: schema.clinicianStaff.role,
      adminRole: schema.clinicianStaff.adminRole,
      passwordHash: schema.clinicianStaff.passwordHash,
      inviteToken: schema.clinicianStaff.inviteToken,
      inviteExpires: schema.clinicianStaff.inviteExpires,
      passwordResetToken: schema.clinicianStaff.passwordResetToken,
      passwordResetExpires: schema.clinicianStaff.passwordResetExpires,
      isActive: schema.clinicianStaff.isActive,
      loginAttempts: schema.clinicianStaff.loginAttempts,
      lockedUntil: schema.clinicianStaff.lockedUntil,
      createdAt: schema.clinicianStaff.createdAt,
    })
      .from(schema.clinicianStaff)
      .innerJoin(schema.users, eq(schema.clinicianStaff.clinicianId, schema.users.id))
      .where(eq(schema.users.defaultClinicId, clinicId))
      .orderBy(schema.clinicianStaff.createdAt);
    return rows as ClinicianStaff[];
  }

  async createClinicianStaff(data: Omit<InsertClinicianStaff, 'passwordHash'> & { passwordHash?: string | null }): Promise<ClinicianStaff> {
    const result = await db.insert(schema.clinicianStaff).values({
      ...data,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash ?? null,
    }).returning();
    return result[0];
  }

  async updateClinicianStaff(id: number, data: Partial<ClinicianStaff>): Promise<ClinicianStaff | undefined> {
    const result = await db.update(schema.clinicianStaff).set(data).where(eq(schema.clinicianStaff.id, id)).returning();
    return result[0];
  }

  async deleteClinicianStaff(id: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianStaff).where(eq(schema.clinicianStaff.id, id)).returning();
    return result.length > 0;
  }

  // ── Encounter Templates ───────────────────────────────────────────────────
  // Returns templates visible to this actor: own personal templates + any
  // clinic-wide templates from the same clinic.
  async getEncounterTemplates(clinicianId: number, clinicId?: number | null, callerRole?: string | null): Promise<schema.EncounterTemplate[]> {
    const conditions: any[] = [eq(schema.encounterTemplates.clinicianId, clinicianId)];
    if (clinicId) {
      // Clinic-wide templates are visible to everyone in the clinic
      conditions.push(
        and(
          eq(schema.encounterTemplates.clinicId, clinicId),
          eq(schema.encounterTemplates.isClinicWide, true)
        )
      );
      // Role-targeted templates: any same-clinic template restricted to the caller's role
      // is automatically visible to that role even if not marked clinic-wide.
      if (callerRole && callerRole !== "provider") {
        conditions.push(
          and(
            eq(schema.encounterTemplates.clinicId, clinicId),
            eq(schema.encounterTemplates.roleRestriction, callerRole)
          )
        );
      }
    }
    return db.select().from(schema.encounterTemplates)
      .where(or(...conditions))
      .orderBy(schema.encounterTemplates.createdAt);
  }

  async getEncounterTemplateById(id: number): Promise<schema.EncounterTemplate | undefined> {
    const result = await db.select().from(schema.encounterTemplates)
      .where(eq(schema.encounterTemplates.id, id));
    return result[0];
  }

  async createEncounterTemplate(data: schema.InsertEncounterTemplate & { clinicianId: number }): Promise<schema.EncounterTemplate> {
    const result = await db.insert(schema.encounterTemplates).values(data).returning();
    return result[0];
  }

  async updateEncounterTemplate(id: number, data: Partial<schema.EncounterTemplate>): Promise<schema.EncounterTemplate | undefined> {
    const result = await db.update(schema.encounterTemplates).set(data)
      .where(eq(schema.encounterTemplates.id, id)).returning();
    return result[0];
  }

  async deleteEncounterTemplate(id: number): Promise<boolean> {
    const result = await db.delete(schema.encounterTemplates)
      .where(eq(schema.encounterTemplates.id, id)).returning();
    return result.length > 0;
  }

  // ── Clinic Provider Invites ───────────────────────────────────────────────────
  async createClinicProviderInvite(data: schema.InsertClinicProviderInvite): Promise<schema.ClinicProviderInvite> {
    const result = await db.insert(schema.clinicProviderInvites).values(data).returning();
    return result[0];
  }

  async getClinicProviderInviteByToken(token: string): Promise<schema.ClinicProviderInvite | undefined> {
    const result = await db.select().from(schema.clinicProviderInvites)
      .where(eq(schema.clinicProviderInvites.inviteToken, token)).limit(1);
    return result[0];
  }

  async getClinicProviderInvites(clinicId: number): Promise<schema.ClinicProviderInvite[]> {
    return db.select().from(schema.clinicProviderInvites)
      .where(and(eq(schema.clinicProviderInvites.clinicId, clinicId), eq(schema.clinicProviderInvites.status, "pending")))
      .orderBy(desc(schema.clinicProviderInvites.createdAt));
  }

  async updateClinicProviderInviteStatus(id: number, status: string): Promise<void> {
    await db.update(schema.clinicProviderInvites).set({ status }).where(eq(schema.clinicProviderInvites.id, id));
  }

  async deleteClinicProviderInvite(id: number): Promise<boolean> {
    const result = await db.delete(schema.clinicProviderInvites).where(eq(schema.clinicProviderInvites.id, id)).returning();
    return result.length > 0;
  }

  // ── Saved Recipes ────────────────────────────────────────────────────────────
  async getSavedRecipes(patientId: number): Promise<SavedRecipe[]> {
    return db.select().from(schema.savedRecipes)
      .where(eq(schema.savedRecipes.patientId, patientId))
      .orderBy(desc(schema.savedRecipes.savedAt));
  }

  async saveRecipe(recipe: InsertSavedRecipe): Promise<SavedRecipe> {
    const result = await db.insert(schema.savedRecipes).values(recipe).returning();
    return result[0];
  }

  async deleteSavedRecipe(id: number, patientId: number): Promise<boolean> {
    const result = await db.delete(schema.savedRecipes)
      .where(and(eq(schema.savedRecipes.id, id), eq(schema.savedRecipes.patientId, patientId)))
      .returning();
    return result.length > 0;
  }

  // ── Supplement Orders ─────────────────────────────────────────────────────
  async createSupplementOrder(order: InsertSupplementOrder): Promise<SupplementOrder> {
    const result = await db.insert(schema.supplementOrders).values(order).returning();
    return result[0];
  }

  async getSupplementOrdersByPatient(patientId: number): Promise<SupplementOrder[]> {
    return db.select().from(schema.supplementOrders)
      .where(eq(schema.supplementOrders.patientId, patientId))
      .orderBy(desc(schema.supplementOrders.createdAt));
  }

  async getSupplementOrdersByClinicianPatient(clinicianId: number, patientId: number): Promise<SupplementOrder[]> {
    return db.select().from(schema.supplementOrders)
      .where(and(
        eq(schema.supplementOrders.clinicianId, clinicianId),
        eq(schema.supplementOrders.patientId, patientId),
      ))
      .orderBy(desc(schema.supplementOrders.createdAt));
  }

  async getPendingOrdersForClinician(clinicianId: number): Promise<Array<SupplementOrder & { patientFirstName: string; patientLastName: string }>> {
    const rows = await db
      .select({
        id: schema.supplementOrders.id,
        patientId: schema.supplementOrders.patientId,
        clinicianId: schema.supplementOrders.clinicianId,
        items: schema.supplementOrders.items,
        subtotal: schema.supplementOrders.subtotal,
        status: schema.supplementOrders.status,
        patientNotes: schema.supplementOrders.patientNotes,
        createdAt: schema.supplementOrders.createdAt,
        patientFirstName: schema.patients.firstName,
        patientLastName: schema.patients.lastName,
      })
      .from(schema.supplementOrders)
      .innerJoin(schema.patients, eq(schema.supplementOrders.patientId, schema.patients.id))
      .where(and(
        eq(schema.supplementOrders.clinicianId, clinicianId),
        eq(schema.supplementOrders.status, 'pending'),
      ))
      .orderBy(desc(schema.supplementOrders.createdAt));
    return rows;
  }

  async updateSupplementOrderStatus(orderId: number, clinicianId: number, status: string): Promise<SupplementOrder | undefined> {
    const result = await db.update(schema.supplementOrders)
      .set({ status })
      .where(and(eq(schema.supplementOrders.id, orderId), eq(schema.supplementOrders.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  // ── Patient Uploaded Documents ────────────────────────────────────────────
  async createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocumentSummary> {
    const result = await db.insert(schema.patientDocuments).values(doc).returning({
      id: schema.patientDocuments.id,
      clinicId: schema.patientDocuments.clinicId,
      patientId: schema.patientDocuments.patientId,
      uploadedByUserId: schema.patientDocuments.uploadedByUserId,
      uploadedByName: schema.patientDocuments.uploadedByName,
      fileName: schema.patientDocuments.fileName,
      mimeType: schema.patientDocuments.mimeType,
      sizeBytes: schema.patientDocuments.sizeBytes,
      category: schema.patientDocuments.category,
      notes: schema.patientDocuments.notes,
      source: schema.patientDocuments.source,
      createdAt: schema.patientDocuments.createdAt,
    });
    return result[0] as PatientDocumentSummary;
  }

  async listPatientDocuments(patientId: number, clinicId: number): Promise<PatientDocumentSummary[]> {
    const rows = await db.select({
      id: schema.patientDocuments.id,
      clinicId: schema.patientDocuments.clinicId,
      patientId: schema.patientDocuments.patientId,
      uploadedByUserId: schema.patientDocuments.uploadedByUserId,
      uploadedByName: schema.patientDocuments.uploadedByName,
      fileName: schema.patientDocuments.fileName,
      mimeType: schema.patientDocuments.mimeType,
      sizeBytes: schema.patientDocuments.sizeBytes,
      category: schema.patientDocuments.category,
      notes: schema.patientDocuments.notes,
      source: schema.patientDocuments.source,
      createdAt: schema.patientDocuments.createdAt,
    })
      .from(schema.patientDocuments)
      .where(and(
        eq(schema.patientDocuments.patientId, patientId),
        eq(schema.patientDocuments.clinicId, clinicId),
      ))
      .orderBy(desc(schema.patientDocuments.createdAt));
    return rows as PatientDocumentSummary[];
  }

  async getPatientDocument(docId: number, clinicId: number): Promise<PatientDocument | undefined> {
    const rows = await db.select().from(schema.patientDocuments)
      .where(and(
        eq(schema.patientDocuments.id, docId),
        eq(schema.patientDocuments.clinicId, clinicId),
      ))
      .limit(1);
    return rows[0];
  }

  async deletePatientDocument(docId: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.patientDocuments)
      .where(and(
        eq(schema.patientDocuments.id, docId),
        eq(schema.patientDocuments.clinicId, clinicId),
      ))
      .returning({ id: schema.patientDocuments.id });
    return result.length > 0;
  }

  async getUnreadMessageSummaryForClinician(clinicianId: number): Promise<Array<{ patientId: number; patientFirstName: string; patientLastName: string; count: number; lastAt: string }>> {
    const rows = await db.execute(sql`
      SELECT
        p.id          AS patient_id,
        p.first_name  AS patient_first_name,
        p.last_name   AS patient_last_name,
        COUNT(pm.id)::int  AS count,
        MAX(pm.created_at)::text AS last_at
      FROM portal_messages pm
      JOIN patients p ON pm.patient_id = p.id
      WHERE p.user_id = ${clinicianId}
        AND pm.sender_type = 'patient'
        AND pm.read_at IS NULL
      GROUP BY p.id, p.first_name, p.last_name
      ORDER BY last_at DESC
    `);
    return (rows.rows as any[]).map(r => ({
      patientId: Number(r.patient_id),
      patientFirstName: r.patient_first_name as string,
      patientLastName: r.patient_last_name as string,
      count: Number(r.count),
      lastAt: r.last_at as string,
    }));
  }

  // Pending patient-portal medication refill requests for this clinician.
  // Pulls from provider_inbox_notifications (type='med_refill_request') so
  // refill requests can be surfaced in the same dashboard widget as pending
  // supplement orders. Returns items not yet dismissed, scoped to the
  // clinician's clinic, and either targeted at the clinician (providerId
  // matches) or clinic-wide (providerId IS NULL).
  async getPendingRefillRequestsForClinician(
    clinicianId: number,
    clinicId: number | null,
  ): Promise<Array<{ id: number; patientId: number | null; patientFirstName: string | null; patientLastName: string | null; title: string; message: string; createdAt: string }>> {
    if (!clinicId) return [];
    const rows = await db.execute(sql`
      SELECT
        n.id            AS id,
        n.patient_id    AS patient_id,
        p.first_name    AS patient_first_name,
        p.last_name     AS patient_last_name,
        n.title         AS title,
        n.message       AS message,
        n.created_at::text AS created_at
      FROM provider_inbox_notifications n
      LEFT JOIN patients p ON p.id = n.patient_id
      WHERE n.clinic_id = ${clinicId}
        AND n.type = 'med_refill_request'
        AND n.dismissed_at IS NULL
        AND (n.provider_id = ${clinicianId} OR n.provider_id IS NULL)
      ORDER BY n.created_at DESC
      LIMIT 100
    `);
    return (rows.rows as any[]).map(r => ({
      id: Number(r.id),
      patientId: r.patient_id == null ? null : Number(r.patient_id),
      patientFirstName: (r.patient_first_name as string | null) ?? null,
      patientLastName: (r.patient_last_name as string | null) ?? null,
      title: r.title as string,
      message: r.message as string,
      createdAt: r.created_at as string,
    }));
  }

  // ── Clinician Supplement Settings ───────────────────────────────────────────
  async getClinicianSupplementSettings(clinicianId: number): Promise<ClinicianSupplementSettings | undefined> {
    const result = await db.select().from(schema.clinicianSupplementSettings).where(eq(schema.clinicianSupplementSettings.clinicianId, clinicianId));
    return result[0];
  }

  async upsertClinicianSupplementSettings(clinicianId: number, data: Partial<InsertClinicianSupplementSettings>): Promise<ClinicianSupplementSettings> {
    const existing = await this.getClinicianSupplementSettings(clinicianId);
    if (existing) {
      const result = await db.update(schema.clinicianSupplementSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.clinicianSupplementSettings.clinicianId, clinicianId))
        .returning();
      return result[0];
    }
    const result = await db.insert(schema.clinicianSupplementSettings)
      .values({ clinicianId, ...data } as InsertClinicianSupplementSettings)
      .returning();
    return result[0];
  }

  // ── Clinician Supplement Library ─────────────────────────────────────────────
  async getClinicianSupplements(clinicianId: number): Promise<ClinicianSupplement[]> {
    return db.select().from(schema.clinicianSupplements)
      .where(eq(schema.clinicianSupplements.clinicianId, clinicianId))
      .orderBy(schema.clinicianSupplements.sortOrder, schema.clinicianSupplements.name);
  }

  async getClinicianSupplement(id: number, clinicianId: number): Promise<ClinicianSupplement | undefined> {
    const result = await db.select().from(schema.clinicianSupplements)
      .where(and(eq(schema.clinicianSupplements.id, id), eq(schema.clinicianSupplements.clinicianId, clinicianId)));
    return result[0];
  }

  async createClinicianSupplement(supplement: InsertClinicianSupplement): Promise<ClinicianSupplement> {
    const result = await db.insert(schema.clinicianSupplements).values(supplement).returning();
    return result[0];
  }

  async updateClinicianSupplement(id: number, clinicianId: number, data: Partial<InsertClinicianSupplement>): Promise<ClinicianSupplement | undefined> {
    const result = await db.update(schema.clinicianSupplements)
      .set(data)
      .where(and(eq(schema.clinicianSupplements.id, id), eq(schema.clinicianSupplements.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteClinicianSupplement(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianSupplements)
      .where(and(eq(schema.clinicianSupplements.id, id), eq(schema.clinicianSupplements.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinician Supplement Rules ───────────────────────────────────────────────
  async getClinicianSupplementRules(supplementId: number, clinicianId: number): Promise<ClinicianSupplementRule[]> {
    return db.select().from(schema.clinicianSupplementRules)
      .where(and(
        eq(schema.clinicianSupplementRules.supplementId, supplementId),
        eq(schema.clinicianSupplementRules.clinicianId, clinicianId)
      ))
      .orderBy(schema.clinicianSupplementRules.priority);
  }

  async getAllClinicianSupplementRules(clinicianId: number): Promise<ClinicianSupplementRule[]> {
    return db.select().from(schema.clinicianSupplementRules)
      .where(eq(schema.clinicianSupplementRules.clinicianId, clinicianId));
  }

  async createClinicianSupplementRule(rule: InsertClinicianSupplementRule): Promise<ClinicianSupplementRule> {
    const result = await db.insert(schema.clinicianSupplementRules).values(rule).returning();
    return result[0];
  }

  async updateClinicianSupplementRule(id: number, clinicianId: number, data: Partial<InsertClinicianSupplementRule>): Promise<ClinicianSupplementRule | undefined> {
    const result = await db.update(schema.clinicianSupplementRules)
      .set(data)
      .where(and(eq(schema.clinicianSupplementRules.id, id), eq(schema.clinicianSupplementRules.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteClinicianSupplementRule(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianSupplementRules)
      .where(and(eq(schema.clinicianSupplementRules.id, id), eq(schema.clinicianSupplementRules.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinician Lab Preferences ────────────────────────────────────────────────
  async getClinicianLabPreferences(clinicianId: number): Promise<ClinicianLabPreference[]> {
    return db.select().from(schema.clinicianLabPreferences)
      .where(eq(schema.clinicianLabPreferences.clinicianId, clinicianId))
      .orderBy(schema.clinicianLabPreferences.markerKey);
  }

  async getClinicianLabPreference(clinicianId: number, markerKey: string, gender: string): Promise<ClinicianLabPreference | undefined> {
    const result = await db.select().from(schema.clinicianLabPreferences)
      .where(and(
        eq(schema.clinicianLabPreferences.clinicianId, clinicianId),
        eq(schema.clinicianLabPreferences.markerKey, markerKey),
        eq(schema.clinicianLabPreferences.gender, gender)
      ));
    return result[0];
  }

  async upsertClinicianLabPreference(clinicianId: number, data: InsertClinicianLabPreference): Promise<ClinicianLabPreference> {
    const existing = await this.getClinicianLabPreference(clinicianId, data.markerKey, data.gender ?? 'both');
    if (existing) {
      const result = await db.update(schema.clinicianLabPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.clinicianLabPreferences.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(schema.clinicianLabPreferences).values({ ...data, clinicianId }).returning();
    return result[0];
  }

  async deleteClinicianLabPreference(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianLabPreferences)
      .where(and(eq(schema.clinicianLabPreferences.id, id), eq(schema.clinicianLabPreferences.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinical Encounters ──────────────────────────────────────────────────────
  async getEncountersByClinicianId(clinicianId: number, patientId?: number, clinicId?: number | null): Promise<(ClinicalEncounter & { patientName: string })[]> {
    // Clinic-scoped: any provider in the clinic sees all clinic encounters.
    // Legacy fallback: if no clinicId, only the originating clinician sees them.
    const scope = clinicId
      ? or(
          eq(schema.clinicalEncounters.clinicId, clinicId),
          and(eq(schema.clinicalEncounters.clinicianId, clinicianId), isNull(schema.clinicalEncounters.clinicId))
        )
      : eq(schema.clinicalEncounters.clinicianId, clinicianId);
    const rows = await db
      .select({
        id: schema.clinicalEncounters.id,
        clinicianId: schema.clinicalEncounters.clinicianId,
        clinicId: schema.clinicalEncounters.clinicId,
        patientId: schema.clinicalEncounters.patientId,
        visitDate: schema.clinicalEncounters.visitDate,
        visitType: schema.clinicalEncounters.visitType,
        noteType: schema.clinicalEncounters.noteType,
        chiefComplaint: schema.clinicalEncounters.chiefComplaint,
        transcription: schema.clinicalEncounters.transcription,
        audioProcessed: schema.clinicalEncounters.audioProcessed,
        linkedLabResultId: schema.clinicalEncounters.linkedLabResultId,
        soapNote: schema.clinicalEncounters.soapNote,
        soapGeneratedAt: schema.clinicalEncounters.soapGeneratedAt,
        patientSummary: schema.clinicalEncounters.patientSummary,
        summaryPublished: schema.clinicalEncounters.summaryPublished,
        summaryPublishedAt: schema.clinicalEncounters.summaryPublishedAt,
        clinicianNotes: schema.clinicalEncounters.clinicianNotes,
        phoneContact: schema.clinicalEncounters.phoneContact,
        signedAt: schema.clinicalEncounters.signedAt,
        signedBy: schema.clinicalEncounters.signedBy,
        isAmended: schema.clinicalEncounters.isAmended,
        amendedAt: schema.clinicalEncounters.amendedAt,
        lockedAt: schema.clinicalEncounters.lockedAt,
        pendingCollabReview: schema.clinicalEncounters.pendingCollabReview,
        evidenceSuggestions: schema.clinicalEncounters.evidenceSuggestions,
        diarizedTranscript: schema.clinicalEncounters.diarizedTranscript,
        createdAt: schema.clinicalEncounters.createdAt,
        updatedAt: schema.clinicalEncounters.updatedAt,
        patientName: sql<string>`${schema.patients.firstName} || ' ' || ${schema.patients.lastName}`,
      })
      .from(schema.clinicalEncounters)
      .innerJoin(schema.patients, eq(schema.clinicalEncounters.patientId, schema.patients.id))
      .where(
        patientId
          ? and(scope, eq(schema.clinicalEncounters.patientId, patientId))
          : scope
      )
      .orderBy(desc(schema.clinicalEncounters.visitDate));
    return rows as (ClinicalEncounter & { patientName: string })[];
  }

  async getEncounter(id: number, clinicianId: number, clinicId?: number | null): Promise<ClinicalEncounter | undefined> {
    const scope = clinicId
      ? or(
          eq(schema.clinicalEncounters.clinicId, clinicId),
          and(eq(schema.clinicalEncounters.clinicianId, clinicianId), isNull(schema.clinicalEncounters.clinicId))
        )
      : eq(schema.clinicalEncounters.clinicianId, clinicianId);
    const result = await db.select().from(schema.clinicalEncounters)
      .where(and(eq(schema.clinicalEncounters.id, id), scope));
    return result[0];
  }

  async createEncounter(data: InsertClinicalEncounter): Promise<ClinicalEncounter> {
    const result = await db.insert(schema.clinicalEncounters).values(data).returning();
    return result[0];
  }

  async updateEncounter(id: number, clinicianId: number, data: any, _clinicId?: number | null): Promise<ClinicalEncounter | undefined> {
    // Edit/amend access is restricted to the encounter's original author, even
    // for clinic-shared encounters. Other providers can view but not modify.
    const result = await db.update(schema.clinicalEncounters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.clinicalEncounters.id, id), eq(schema.clinicalEncounters.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteEncounter(id: number, clinicianId: number, _clinicId?: number | null): Promise<boolean> {
    // Deletion is restricted to the encounter's original author.
    const result = await db.delete(schema.clinicalEncounters)
      .where(and(eq(schema.clinicalEncounters.id, id), eq(schema.clinicalEncounters.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  async getPublishedEncountersByPatient(patientId: number): Promise<Pick<ClinicalEncounter, 'id' | 'visitDate' | 'visitType' | 'chiefComplaint' | 'patientSummary' | 'summaryPublishedAt'>[]> {
    const result = await db
      .select({
        id: schema.clinicalEncounters.id,
        visitDate: schema.clinicalEncounters.visitDate,
        visitType: schema.clinicalEncounters.visitType,
        chiefComplaint: schema.clinicalEncounters.chiefComplaint,
        patientSummary: schema.clinicalEncounters.patientSummary,
        summaryPublishedAt: schema.clinicalEncounters.summaryPublishedAt,
      })
      .from(schema.clinicalEncounters)
      .where(and(
        eq(schema.clinicalEncounters.patientId, patientId),
        eq(schema.clinicalEncounters.summaryPublished, true)
      ))
      .orderBy(desc(schema.clinicalEncounters.visitDate));
    return result;
  }

  // ── Appointments (Boulevard sync via Zapier) ─────────────────────────────────
  async upsertAppointment(userId: number, boulevardId: string, data: Omit<schema.InsertAppointment, 'userId' | 'boulevardAppointmentId'>): Promise<schema.Appointment> {
    const existing = await db
      .select()
      .from(schema.appointments)
      .where(and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.boulevardAppointmentId, boulevardId)
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(schema.appointments)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.appointments.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(schema.appointments)
      .values({ userId, boulevardAppointmentId: boulevardId, ...data })
      .returning();
    return created;
  }

  async cancelAppointment(userId: number, boulevardId: string): Promise<void> {
    await db
      .update(schema.appointments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.boulevardAppointmentId, boulevardId)
      ));
  }

  async getAppointmentsByUserId(userId: number): Promise<schema.Appointment[]> {
    return db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.userId, userId))
      .orderBy(schema.appointments.appointmentStart);
  }

  async getAppointmentsByPatientEmail(email: string, userId: number): Promise<schema.Appointment[]> {
    return db
      .select()
      .from(schema.appointments)
      .where(and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.patientEmail, email)
      ))
      .orderBy(schema.appointments.appointmentStart);
  }

  async getAppointmentsByPatientId(patientId: number): Promise<schema.Appointment[]> {
    return db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.patientId, patientId))
      .orderBy(schema.appointments.appointmentStart);
  }

  async matchAppointmentToPatient(appointmentId: number, patientId: number): Promise<void> {
    await db
      .update(schema.appointments)
      .set({ patientId, updatedAt: new Date() })
      .where(eq(schema.appointments.id, appointmentId));
  }

  async getAppointmentsByClinicAndRange(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.Appointment[]> {
    const conds = [
      eq(schema.appointments.clinicId, clinicId),
      sql`${schema.appointments.appointmentStart} >= ${start}`,
      sql`${schema.appointments.appointmentStart} < ${end}`,
    ];
    if (providerId) conds.push(eq(schema.appointments.providerId, providerId));
    return db.select().from(schema.appointments).where(and(...conds)).orderBy(schema.appointments.appointmentStart);
  }

  async getAppointmentById(id: number): Promise<schema.Appointment | null> {
    const [row] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).limit(1);
    return row ?? null;
  }

  async createNativeAppointment(data: schema.InsertAppointment): Promise<schema.Appointment> {
    const [row] = await db.insert(schema.appointments).values({ ...data, source: "native" }).returning();
    return row;
  }

  async updateNativeAppointment(id: number, clinicId: number, data: Partial<schema.InsertAppointment>): Promise<schema.Appointment | null> {
    const [row] = await db
      .update(schema.appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.clinicId, clinicId),
        eq(schema.appointments.source, "native"),
      ))
      .returning();
    return row ?? null;
  }

  async deleteNativeAppointment(id: number, clinicId: number): Promise<boolean> {
    const result = await db
      .delete(schema.appointments)
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.clinicId, clinicId),
        eq(schema.appointments.source, "native"),
      ))
      .returning();
    return result.length > 0;
  }

  async markAppointmentReminderSent(id: number): Promise<void> {
    await db
      .update(schema.appointments)
      .set({ reminderSentAt: new Date() })
      .where(eq(schema.appointments.id, id));
  }

  async getAppointmentsNeedingReminder(now: Date, hoursAhead: number): Promise<schema.Appointment[]> {
    const horizon = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    return db
      .select()
      .from(schema.appointments)
      .where(and(
        isNull(schema.appointments.reminderSentAt),
        sql`${schema.appointments.appointmentStart} >= ${now}`,
        sql`${schema.appointments.appointmentStart} <= ${horizon}`,
        sql`${schema.appointments.status} NOT IN ('cancelled','no_show')`,
      ));
  }

  async detectAppointmentConflict(providerId: number, start: Date, end: Date, excludeId?: number): Promise<boolean> {
    const conds = [
      eq(schema.appointments.providerId, providerId),
      sql`${schema.appointments.status} NOT IN ('cancelled','no_show')`,
      sql`${schema.appointments.appointmentStart} < ${end}`,
      sql`COALESCE(${schema.appointments.appointmentEnd}, ${schema.appointments.appointmentStart} + INTERVAL '30 minutes') > ${start}`,
    ];
    if (excludeId) conds.push(sql`${schema.appointments.id} <> ${excludeId}`);
    const rows = await db.select({ id: schema.appointments.id }).from(schema.appointments).where(and(...conds)).limit(1);
    return rows.length > 0;
  }

  // ── Appointment Types ─────────────────────────────────────────────────────────
  async getAppointmentTypes(clinicId: number, includeInactive = false): Promise<schema.AppointmentType[]> {
    const conds = [eq(schema.appointmentTypes.clinicId, clinicId)];
    if (!includeInactive) conds.push(eq(schema.appointmentTypes.isActive, true));
    return db.select().from(schema.appointmentTypes).where(and(...conds)).orderBy(schema.appointmentTypes.name);
  }

  async getAppointmentTypeById(id: number, clinicId: number): Promise<schema.AppointmentType | null> {
    const [row] = await db.select().from(schema.appointmentTypes)
      .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.clinicId, clinicId)))
      .limit(1);
    return row ?? null;
  }

  async createAppointmentType(data: schema.InsertAppointmentType): Promise<schema.AppointmentType> {
    const [row] = await db.insert(schema.appointmentTypes).values(data).returning();
    return row;
  }

  async updateAppointmentType(id: number, clinicId: number, data: Partial<schema.InsertAppointmentType>): Promise<schema.AppointmentType | null> {
    const [row] = await db.update(schema.appointmentTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async deleteAppointmentType(id: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.appointmentTypes)
      .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  // ── Provider Availability ─────────────────────────────────────────────────────
  async getProviderAvailability(clinicId: number, providerId?: number | null): Promise<schema.ProviderAvailability[]> {
    const conds = [eq(schema.providerAvailability.clinicId, clinicId), eq(schema.providerAvailability.isActive, true)];
    if (providerId) conds.push(eq(schema.providerAvailability.providerId, providerId));
    return db.select().from(schema.providerAvailability).where(and(...conds))
      .orderBy(schema.providerAvailability.providerId, schema.providerAvailability.dayOfWeek, schema.providerAvailability.startTime);
  }

  async createProviderAvailability(data: schema.InsertProviderAvailability): Promise<schema.ProviderAvailability> {
    const [row] = await db.insert(schema.providerAvailability).values(data).returning();
    return row;
  }

  async updateProviderAvailability(id: number, clinicId: number, data: Partial<schema.InsertProviderAvailability>): Promise<schema.ProviderAvailability | null> {
    const [row] = await db.update(schema.providerAvailability)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.providerAvailability.id, id), eq(schema.providerAvailability.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async deleteProviderAvailability(id: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.providerAvailability)
      .where(and(eq(schema.providerAvailability.id, id), eq(schema.providerAvailability.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  // ── Calendar Blocks (time-off, breaks) ────────────────────────────────────────
  async getCalendarBlocks(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.CalendarBlock[]> {
    const conds = [
      eq(schema.calendarBlocks.clinicId, clinicId),
      sql`${schema.calendarBlocks.startAt} < ${end}`,
      sql`${schema.calendarBlocks.endAt} > ${start}`,
    ];
    if (providerId) conds.push(eq(schema.calendarBlocks.providerId, providerId));
    return db.select().from(schema.calendarBlocks).where(and(...conds)).orderBy(schema.calendarBlocks.startAt);
  }

  async createCalendarBlock(data: schema.InsertCalendarBlock): Promise<schema.CalendarBlock> {
    const [row] = await db.insert(schema.calendarBlocks).values(data).returning();
    return row;
  }

  async deleteCalendarBlock(id: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.calendarBlocks)
      .where(and(eq(schema.calendarBlocks.id, id), eq(schema.calendarBlocks.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  async getProvidersByClinic(clinicId: number, includeInactive = false): Promise<schema.Provider[]> {
    const conds = [eq(schema.providers.clinicId, clinicId)];
    if (!includeInactive) conds.push(eq(schema.providers.isActive, true));
    return db.select().from(schema.providers).where(and(...conds)).orderBy(schema.providers.displayName);
  }

  // ── Patient Chart ─────────────────────────────────────────────────────────────
  async getPatientChart(patientId: number, clinicianId: number): Promise<schema.PatientChart | null> {
    const [row] = await db
      .select()
      .from(schema.patientCharts)
      .where(and(
        eq(schema.patientCharts.patientId, patientId),
        eq(schema.patientCharts.clinicianId, clinicianId),
      ))
      .limit(1);
    return row ?? null;
  }

  async upsertPatientChart(
    patientId: number,
    clinicianId: number,
    data: Partial<Omit<schema.PatientChart, 'id' | 'patientId' | 'clinicianId' | 'updatedAt'>>,
  ): Promise<schema.PatientChart> {
    const existing = await this.getPatientChart(patientId, clinicianId);
    const now = new Date();
    if (existing) {
      const [updated] = await db
        .update(schema.patientCharts)
        .set({ ...data, updatedAt: now })
        .where(eq(schema.patientCharts.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(schema.patientCharts)
        .values({ patientId, clinicianId, ...data, updatedAt: now })
        .returning();
      return created;
    }
  }

  // ── Patient Medications (structured — Phase A) ────────────────────────────────
  async getPatientMedications(patientId: number, clinicId: number): Promise<schema.PatientMedication[]> {
    return db
      .select()
      .from(schema.patientMedications)
      .where(and(
        eq(schema.patientMedications.patientId, patientId),
        eq(schema.patientMedications.clinicId, clinicId),
      ))
      .orderBy(schema.patientMedications.createdAt);
  }

  async getPatientMedicationsByFormSubmission(formSubmissionId: number): Promise<schema.PatientMedication[]> {
    return db
      .select()
      .from(schema.patientMedications)
      .where(eq(schema.patientMedications.formSubmissionId, formSubmissionId));
  }

  async createPatientMedication(data: schema.InsertPatientMedication & { createdByUserId?: number | null; createdByStaffId?: number | null }): Promise<schema.PatientMedication> {
    const [row] = await db
      .insert(schema.patientMedications)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return row;
  }

  async updatePatientMedication(
    id: number,
    patientId: number,
    clinicId: number,
    data: Partial<schema.InsertPatientMedication> & { updatedByUserId?: number | null; updatedByStaffId?: number | null },
  ): Promise<schema.PatientMedication | null> {
    const [row] = await db
      .update(schema.patientMedications)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(schema.patientMedications.id, id),
        eq(schema.patientMedications.patientId, patientId),
        eq(schema.patientMedications.clinicId, clinicId),
      ))
      .returning();
    return row ?? null;
  }

  async discontinuePatientMedication(
    id: number,
    patientId: number,
    clinicId: number,
    opts: { discontinuedByUserId?: number | null; discontinuedByStaffId?: number | null; discontinuedReason?: string | null },
  ): Promise<schema.PatientMedication | null> {
    const [row] = await db
      .update(schema.patientMedications)
      .set({
        status: "discontinued",
        discontinuedAt: new Date(),
        discontinuedByUserId: opts.discontinuedByUserId ?? null,
        discontinuedByStaffId: opts.discontinuedByStaffId ?? null,
        discontinuedReason: opts.discontinuedReason ?? null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.patientMedications.id, id),
        eq(schema.patientMedications.patientId, patientId),
        eq(schema.patientMedications.clinicId, clinicId),
      ))
      .returning();
    return row ?? null;
  }

  // ── Patient Vitals ───────────────────────────────────────────────────────────
  async getPatientVitals(patientId: number, _clinicianId?: number | null): Promise<schema.PatientVital[]> {
    // Scope by patientId only — the caller already verified clinic access via
    // getPatient(). Filtering by clinicianId would hide vitals saved by other
    // staff (e.g. a nurse saving under their own userId) from the provider.
    return db
      .select()
      .from(schema.patientVitals)
      .where(eq(schema.patientVitals.patientId, patientId))
      .orderBy(desc(schema.patientVitals.recordedAt));
  }

  async createPatientVital(
    data: { patientId: number; clinicianId: number } & schema.InsertPatientVital & { bmi?: number | null },
  ): Promise<schema.PatientVital> {
    const recordedAt = data.recordedAt ? new Date(data.recordedAt as any) : new Date();
    const [row] = await db
      .insert(schema.patientVitals)
      .values({
        patientId: data.patientId,
        clinicianId: data.clinicianId,
        recordedAt,
        systolicBp: data.systolicBp ?? null,
        diastolicBp: data.diastolicBp ?? null,
        heartRate: data.heartRate ?? null,
        respiratoryRate: data.respiratoryRate ?? null,
        temperature: data.temperature ?? null,
        oxygenSaturation: data.oxygenSaturation ?? null,
        painScore: data.painScore ?? null,
        weightLbs: data.weightLbs ?? null,
        heightInches: data.heightInches ?? null,
        bmi: data.bmi ?? null,
        notes: data.notes ?? null,
        source: data.source ?? "clinic",
        timeOfDay: data.timeOfDay ?? null,
        symptoms: data.symptoms ?? [],
        monitoringEpisodeId: data.monitoringEpisodeId ?? null,
      })
      .returning();
    return row;
  }

  async deletePatientVital(id: number, clinicianId: number): Promise<boolean> {
    const result = await db
      .delete(schema.patientVitals)
      .where(and(
        eq(schema.patientVitals.id, id),
        eq(schema.patientVitals.clinicianId, clinicianId),
      ))
      .returning();
    return result.length > 0;
  }

  // ── Note Templates ───────────────────────────────────────────────────────────
  async getNoteTemplates(clinicId: number, providerId: number, noteType?: string): Promise<schema.NoteTemplate[]> {
    const conds: any[] = [
      eq(schema.noteTemplates.clinicId, clinicId),
      or(
        eq(schema.noteTemplates.isShared, true),
        eq(schema.noteTemplates.providerId, providerId),
      )!,
    ];
    if (noteType) conds.push(eq(schema.noteTemplates.noteType, noteType));
    return db.select().from(schema.noteTemplates).where(and(...conds)).orderBy(desc(schema.noteTemplates.updatedAt));
  }
  async getNoteTemplate(id: number, clinicId: number): Promise<schema.NoteTemplate | null> {
    const [row] = await db.select().from(schema.noteTemplates)
      .where(and(eq(schema.noteTemplates.id, id), eq(schema.noteTemplates.clinicId, clinicId)));
    return row || null;
  }
  async createNoteTemplate(data: schema.InsertNoteTemplate): Promise<schema.NoteTemplate> {
    const [row] = await db.insert(schema.noteTemplates).values(data).returning();
    return row;
  }
  async updateNoteTemplate(id: number, clinicId: number, data: Partial<schema.InsertNoteTemplate>): Promise<schema.NoteTemplate | null> {
    const [row] = await db.update(schema.noteTemplates).set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.noteTemplates.id, id), eq(schema.noteTemplates.clinicId, clinicId)))
      .returning();
    return row || null;
  }
  async deleteNoteTemplate(id: number, clinicId: number, providerId: number): Promise<boolean> {
    const tpl = await this.getNoteTemplate(id, clinicId);
    if (!tpl) return false;
    if (!tpl.isShared && tpl.providerId !== providerId) return false;
    const result = await db.delete(schema.noteTemplates)
      .where(and(eq(schema.noteTemplates.id, id), eq(schema.noteTemplates.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  // ── Note Phrases ─────────────────────────────────────────────────────────────
  async getNotePhrases(clinicId: number, providerId: number): Promise<schema.NotePhrase[]> {
    return db.select().from(schema.notePhrases)
      .where(and(
        eq(schema.notePhrases.clinicId, clinicId),
        or(eq(schema.notePhrases.isShared, true), eq(schema.notePhrases.providerId, providerId))!,
      ))
      .orderBy(desc(schema.notePhrases.updatedAt));
  }
  async createNotePhrase(data: schema.InsertNotePhrase): Promise<schema.NotePhrase> {
    const [row] = await db.insert(schema.notePhrases).values(data).returning();
    return row;
  }
  async updateNotePhrase(id: number, clinicId: number, data: Partial<schema.InsertNotePhrase>): Promise<schema.NotePhrase | null> {
    const [row] = await db.update(schema.notePhrases).set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.notePhrases.id, id), eq(schema.notePhrases.clinicId, clinicId)))
      .returning();
    return row || null;
  }
  async deleteNotePhrase(id: number, clinicId: number, providerId: number): Promise<boolean> {
    const [tpl] = await db.select().from(schema.notePhrases)
      .where(and(eq(schema.notePhrases.id, id), eq(schema.notePhrases.clinicId, clinicId)));
    if (!tpl) return false;
    if (!tpl.isShared && tpl.providerId !== providerId) return false;
    const result = await db.delete(schema.notePhrases)
      .where(and(eq(schema.notePhrases.id, id), eq(schema.notePhrases.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinical Block Defaults (per-clinician ROS/PE customization) ─────────
  async getClinicalBlockDefaults(clinicId: number, providerId: number): Promise<schema.ClinicalBlockDefaultsRow | null> {
    const [row] = await db.select().from(schema.clinicalBlockDefaults)
      .where(and(
        eq(schema.clinicalBlockDefaults.clinicId, clinicId),
        eq(schema.clinicalBlockDefaults.providerId, providerId),
      ));
    return row ?? null;
  }
  async upsertClinicalBlockDefaults(
    clinicId: number,
    providerId: number,
    data: schema.UpdateClinicalBlockDefaults,
  ): Promise<schema.ClinicalBlockDefaultsRow> {
    const existing = await this.getClinicalBlockDefaults(clinicId, providerId);
    const payload = {
      rosSystems: data.rosSystems ?? null,
      peSystems: data.peSystems ?? null,
    };
    if (existing) {
      const [row] = await db.update(schema.clinicalBlockDefaults)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(schema.clinicalBlockDefaults.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(schema.clinicalBlockDefaults).values({
      clinicId,
      providerId,
      ...payload,
    }).returning();
    return row;
  }

  // ── June AI Preference Memory ────────────────────────────────────────────
  async getJunePreferences(clinicianId: number, staffId?: number | null): Promise<schema.JunePreference[]> {
    if (staffId) {
      // Staff member — return only their own preferences
      return db.select().from(schema.junePreferences)
        .where(eq(schema.junePreferences.staffId, staffId))
        .orderBy(schema.junePreferences.createdAt);
    }
    // Clinician account owner — return preferences with no staffId
    return db.select().from(schema.junePreferences)
      .where(and(
        eq(schema.junePreferences.clinicianId, clinicianId),
        isNull(schema.junePreferences.staffId),
      ))
      .orderBy(schema.junePreferences.createdAt);
  }
  async createJunePreference(data: schema.InsertJunePreference): Promise<schema.JunePreference> {
    const [row] = await db.insert(schema.junePreferences).values(data).returning();
    return row;
  }
  async updateJunePreference(
    id: number,
    clinicianId: number,
    data: Partial<Pick<schema.JunePreference, 'label' | 'instruction' | 'triggerPhrases' | 'isActive' | 'category'>>,
    staffId?: number | null,
  ): Promise<schema.JunePreference | undefined> {
    const ownershipClause = staffId
      ? eq(schema.junePreferences.staffId, staffId)
      : and(eq(schema.junePreferences.clinicianId, clinicianId), isNull(schema.junePreferences.staffId));
    const [row] = await db.update(schema.junePreferences)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.junePreferences.id, id), ownershipClause))
      .returning();
    return row;
  }
  async deleteJunePreference(id: number, clinicianId: number, staffId?: number | null): Promise<boolean> {
    const ownershipClause = staffId
      ? eq(schema.junePreferences.staffId, staffId)
      : and(eq(schema.junePreferences.clinicianId, clinicianId), isNull(schema.junePreferences.staffId));
    const result = await db.delete(schema.junePreferences)
      .where(and(eq(schema.junePreferences.id, id), ownershipClause));
    return (result.rowCount ?? 0) > 0;
  }

  async getClinicById(id: number): Promise<schema.Clinic | undefined> {
    const result = await db.select().from(schema.clinics).where(eq(schema.clinics.id, id)).limit(1);
    return result[0];
  }

  // ── Medication Dictionary ────────────────────────────────────────────────────
  async getMedicationDictionaries(clinicianId: number): Promise<schema.MedicationDictionary[]> {
    return db
      .select()
      .from(schema.medicationDictionaries)
      .where(eq(schema.medicationDictionaries.clinicianId, clinicianId))
      .orderBy(desc(schema.medicationDictionaries.uploadedAt));
  }

  async createMedicationDictionary(data: schema.InsertMedicationDictionary): Promise<schema.MedicationDictionary> {
    const [row] = await db.insert(schema.medicationDictionaries).values(data).returning();
    return row;
  }

  async deleteMedicationDictionary(id: number, clinicianId: number): Promise<boolean> {
    const result = await db
      .delete(schema.medicationDictionaries)
      .where(and(
        eq(schema.medicationDictionaries.id, id),
        eq(schema.medicationDictionaries.clinicianId, clinicianId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async createMedicationEntries(entries: schema.InsertMedicationEntry[]): Promise<void> {
    if (!entries.length) return;
    for (let i = 0; i < entries.length; i += 100) {
      await db.insert(schema.medicationEntries).values(entries.slice(i, i + 100));
    }
  }

  async getAllMedicationEntries(clinicianId: number): Promise<schema.MedicationEntry[]> {
    const dbEntries = await db
      .select()
      .from(schema.medicationEntries)
      .where(eq(schema.medicationEntries.clinicianId, clinicianId));

    // Merge system seed entries — clinician DB entries take precedence for same generic name
    const dbNames = new Set(dbEntries.map(e => e.genericName.toLowerCase()));
    const seedEntries = getSeedAsEntries()
      .filter(s => !dbNames.has(s.genericName.toLowerCase()))
      .map(s => ({
        id: s.id,
        dictionaryId: s.dictionaryId,
        clinicianId: clinicianId,
        genericName: s.genericName,
        brandNames: s.brandNames,
        commonSpokenVariants: s.commonSpokenVariants,
        commonMisspellings: s.commonMisspellings,
        drugClass: s.drugClass,
        subclass: s.subclass,
        route: s.route,
        notes: s.notes,
      })) as schema.MedicationEntry[];

    return [...dbEntries, ...seedEntries];
  }

  async updateMedicationDictionaryCount(id: number, count: number): Promise<void> {
    await db
      .update(schema.medicationDictionaries)
      .set({ entryCount: count })
      .where(eq(schema.medicationDictionaries.id, id));
  }

  async getOrCreateManualDictionary(clinicianId: number): Promise<schema.MedicationDictionary> {
    const existing = await db
      .select()
      .from(schema.medicationDictionaries)
      .where(and(
        eq(schema.medicationDictionaries.clinicianId, clinicianId),
        eq(schema.medicationDictionaries.filename, "__manual__")
      ))
      .limit(1);
    if (existing.length) return existing[0];
    const [created] = await db
      .insert(schema.medicationDictionaries)
      .values({ clinicianId, filename: "__manual__", entryCount: 0 })
      .returning();
    return created;
  }

  async addSingleMedicationEntry(entry: schema.InsertMedicationEntry): Promise<schema.MedicationEntry> {
    const [row] = await db.insert(schema.medicationEntries).values(entry).returning();
    await db
      .update(schema.medicationDictionaries)
      .set({ entryCount: sql`entry_count + 1` })
      .where(eq(schema.medicationDictionaries.id, entry.dictionaryId));
    return row;
  }

  async updateMedicationEntryAliases(
    id: number,
    clinicianId: number,
    fields: Partial<Pick<schema.MedicationEntry, "brandNames" | "commonSpokenVariants" | "commonMisspellings" | "drugClass" | "subclass" | "route" | "notes">>
  ): Promise<schema.MedicationEntry | null> {
    const [updated] = await db
      .update(schema.medicationEntries)
      .set(fields)
      .where(and(
        eq(schema.medicationEntries.id, id),
        eq(schema.medicationEntries.clinicianId, clinicianId)
      ))
      .returning();
    return updated ?? null;
  }

  async deleteMedicationEntry(id: number, clinicianId: number): Promise<boolean> {
    const entry = await db
      .select()
      .from(schema.medicationEntries)
      .where(and(
        eq(schema.medicationEntries.id, id),
        eq(schema.medicationEntries.clinicianId, clinicianId)
      ))
      .limit(1);
    if (!entry.length) return false;
    const dictId = entry[0].dictionaryId;
    await db.delete(schema.medicationEntries).where(and(
      eq(schema.medicationEntries.id, id),
      eq(schema.medicationEntries.clinicianId, clinicianId)
    ));
    await db
      .update(schema.medicationDictionaries)
      .set({ entryCount: sql`GREATEST(entry_count - 1, 0)` })
      .where(eq(schema.medicationDictionaries.id, dictId));
    return true;
  }

  // ─── Intake Forms (raw SQL — production DB may lack clinic_id column) ───────

  async getIntakeForms(clinicianId: number): Promise<schema.IntakeForm[]> {
    const result = await db.execute(sql`SELECT * FROM intake_forms WHERE clinician_id = ${clinicianId} ORDER BY updated_at DESC`);
    return rawRows(result) as schema.IntakeForm[];
  }

  async getIntakeFormsByClinic(clinicId: number): Promise<schema.IntakeForm[]> {
    try {
      const result = await db.execute(sql`SELECT * FROM intake_forms WHERE clinic_id = ${clinicId} ORDER BY updated_at DESC`);
      return rawRows(result) as schema.IntakeForm[];
    } catch {
      return [];
    }
  }

  async getIntakeFormsByClinicOrClinician(clinicId: number | null, clinicianId: number): Promise<schema.IntakeForm[]> {
    if (clinicId) {
      try {
        const result = await db.execute(sql`SELECT * FROM intake_forms WHERE clinic_id = ${clinicId} OR clinician_id = ${clinicianId} ORDER BY updated_at DESC`);
        return rawRows(result) as schema.IntakeForm[];
      } catch {
        return this.getIntakeForms(clinicianId);
      }
    }
    return this.getIntakeForms(clinicianId);
  }

  async getIntakeForm(id: number, clinicianId: number): Promise<schema.IntakeForm | undefined> {
    const result = await db.execute(sql`SELECT * FROM intake_forms WHERE id = ${id} AND clinician_id = ${clinicianId} LIMIT 1`);
    return rawRows(result)[0] as schema.IntakeForm | undefined;
  }

  async getIntakeFormByIdAndClinic(id: number, clinicId: number | null, clinicianId: number): Promise<schema.IntakeForm | undefined> {
    if (clinicId) {
      try {
        const result = await db.execute(sql`SELECT * FROM intake_forms WHERE id = ${id} AND (clinic_id = ${clinicId} OR clinician_id = ${clinicianId}) LIMIT 1`);
        const row = rawRows(result)[0];
        if (row) return row as schema.IntakeForm;
      } catch { /* fall through to clinician-only */ }
    }
    return this.getIntakeForm(id, clinicianId);
  }

  async getIntakeFormById(id: number): Promise<schema.IntakeForm | undefined> {
    const result = await db.execute(sql`SELECT * FROM intake_forms WHERE id = ${id} LIMIT 1`);
    return rawRows(result)[0] as schema.IntakeForm | undefined;
  }

  async createIntakeForm(data: schema.InsertIntakeForm): Promise<schema.IntakeForm> {
    try {
      const result = await db.execute(sql`
        INSERT INTO intake_forms (clinician_id, clinic_id, name, description, category, version, status,
          allow_link, allow_embed, allow_tablet, is_public, requires_patient_signature, requires_staff_signature, expiration_type)
        VALUES (${data.clinicianId}, ${data.clinicId ?? null}, ${data.name}, ${data.description ?? null}, ${data.category ?? 'custom'}, ${data.version ?? 1}, ${data.status ?? 'draft'},
          ${data.allowLink ?? true}, ${data.allowEmbed ?? true}, ${data.allowTablet ?? true}, ${data.isPublic ?? false}, ${data.requiresPatientSignature ?? false}, ${data.requiresStaffSignature ?? false}, ${data.expirationType ?? 'none'})
        RETURNING *`);
      return rawRows(result)[0] as schema.IntakeForm;
    } catch (err: any) {
      if (err?.message?.includes('clinic_id')) {
        const result = await db.execute(sql`
          INSERT INTO intake_forms (clinician_id, name, description, category, version, status,
            allow_link, allow_embed, allow_tablet, is_public, requires_patient_signature, requires_staff_signature, expiration_type)
          VALUES (${data.clinicianId}, ${data.name}, ${data.description ?? null}, ${data.category ?? 'custom'}, ${data.version ?? 1}, ${data.status ?? 'draft'},
            ${data.allowLink ?? true}, ${data.allowEmbed ?? true}, ${data.allowTablet ?? true}, ${data.isPublic ?? false}, ${data.requiresPatientSignature ?? false}, ${data.requiresStaffSignature ?? false}, ${data.expirationType ?? 'none'})
          RETURNING *`);
        return rawRows(result)[0] as schema.IntakeForm;
      }
      throw err;
    }
  }

  async updateIntakeForm(id: number, clinicianId: number, data: Partial<schema.InsertIntakeForm>): Promise<schema.IntakeForm | undefined> {
    return this.updateIntakeFormByClinic(id, null, clinicianId, data);
  }

  async updateIntakeFormByClinic(id: number, clinicId: number | null, clinicianId: number, data: Partial<schema.InsertIntakeForm>): Promise<schema.IntakeForm | undefined> {
    const setClauses: string[] = [];
    const values: any[] = [];
    const fieldMap: Record<string, string> = {
      name: 'name', description: 'description', category: 'category', version: 'version',
      status: 'status', brandingJson: 'branding_json', settingsJson: 'settings_json',
      requiresPatientSignature: 'requires_patient_signature', requiresStaffSignature: 'requires_staff_signature',
      allowLink: 'allow_link', allowEmbed: 'allow_embed', allowTablet: 'allow_tablet',
      isPublic: 'is_public', expirationType: 'expiration_type', expirationIntervalDays: 'expiration_interval_days',
      slug: 'slug',
      ghlWebhookUrl: 'ghl_webhook_url', ghlWebhookEnabled: 'ghl_webhook_enabled',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        let val = (data as any)[key];
        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
          val = JSON.stringify(val);
        }
        setClauses.push(`${col} = $${values.length + 1}`);
        values.push(val);
      }
    }
    setClauses.push(`updated_at = NOW()`);
    if (setClauses.length <= 1) return undefined;
    const setStr = setClauses.join(', ');
    values.push(id, clinicianId);
    const queryStr = `UPDATE intake_forms SET ${setStr} WHERE id = $${values.length - 1} AND clinician_id = $${values.length} RETURNING *`;
    let result;
    try {
      result = await pool.query(queryStr, values);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      // Self-heal: if the GHL webhook columns are missing in prod, add them and retry once.
      if (msg.includes('ghl_webhook_url') || msg.includes('ghl_webhook_enabled')) {
        console.warn('[updateIntakeFormByClinic] adding missing ghl_webhook_* columns and retrying');
        await pool.query(`ALTER TABLE intake_forms
          ADD COLUMN IF NOT EXISTS ghl_webhook_url TEXT,
          ADD COLUMN IF NOT EXISTS ghl_webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
        result = await pool.query(queryStr, values);
      } else {
        throw err;
      }
    }
    return result.rows.map(mapRow)[0] as schema.IntakeForm | undefined;
  }

  async deleteIntakeForm(id: number, clinicianId: number): Promise<boolean> {
    return this.deleteIntakeFormByClinic(id, null, clinicianId);
  }

  async deleteIntakeFormByClinic(id: number, clinicId: number | null, clinicianId: number): Promise<boolean> {
    const result = await db.execute(sql`DELETE FROM intake_forms WHERE id = ${id} AND clinician_id = ${clinicianId}`);
    return ((result as any).rowCount ?? 0) > 0;
  }

  // ─── Form Sections ──────────────────────────────────────────────────────────

  async getFormSections(formId: number): Promise<schema.FormSection[]> {
    return db.select().from(schema.formSections)
      .where(eq(schema.formSections.formId, formId))
      .orderBy(schema.formSections.orderIndex);
  }

  async createFormSection(data: schema.InsertFormSection): Promise<schema.FormSection> {
    const [row] = await db.insert(schema.formSections).values(data).returning();
    return row;
  }

  async updateFormSection(id: number, data: Partial<schema.InsertFormSection>): Promise<schema.FormSection | undefined> {
    const [row] = await db.update(schema.formSections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.formSections.id, id))
      .returning();
    return row;
  }

  async deleteFormSection(id: number): Promise<boolean> {
    const result = await db.delete(schema.formSections).where(eq(schema.formSections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Form Fields ────────────────────────────────────────────────────────────

  async getFormFields(formId: number): Promise<schema.FormField[]> {
    return db.select().from(schema.formFields)
      .where(eq(schema.formFields.formId, formId))
      .orderBy(schema.formFields.orderIndex);
  }

  async createFormField(data: schema.InsertFormField): Promise<schema.FormField> {
    const [row] = await db.insert(schema.formFields).values(data).returning();
    return row;
  }

  async updateFormField(id: number, data: Partial<schema.InsertFormField>): Promise<schema.FormField | undefined> {
    const [row] = await db.update(schema.formFields)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.formFields.id, id))
      .returning();
    return row;
  }

  async deleteFormField(id: number): Promise<boolean> {
    const result = await db.delete(schema.formFields).where(eq(schema.formFields.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Form Publications ──────────────────────────────────────────────────────

  async getFormPublications(formId: number): Promise<schema.FormPublication[]> {
    return db.select().from(schema.formPublications).where(eq(schema.formPublications.formId, formId));
  }

  async getFormPublicationByToken(token: string): Promise<schema.FormPublication | undefined> {
    const rows = await db.select().from(schema.formPublications)
      .where(and(eq(schema.formPublications.publicToken, token), eq(schema.formPublications.status, "active")))
      .limit(1);
    return rows[0];
  }

  async createFormPublication(data: schema.InsertFormPublication): Promise<schema.FormPublication> {
    const [row] = await db.insert(schema.formPublications).values(data).returning();
    return row;
  }

  async updateFormPublication(id: number, data: Partial<schema.InsertFormPublication>): Promise<schema.FormPublication | undefined> {
    const [row] = await db.update(schema.formPublications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.formPublications.id, id))
      .returning();
    return row;
  }

  // ─── Patient Form Assignments ───────────────────────────────────────────────

  async getPatientFormAssignments(patientId: number): Promise<schema.PatientFormAssignment[]> {
    return db.select().from(schema.patientFormAssignments)
      .where(eq(schema.patientFormAssignments.patientId, patientId))
      .orderBy(desc(schema.patientFormAssignments.assignedAt));
  }

  async createPatientFormAssignment(data: schema.InsertPatientFormAssignment): Promise<schema.PatientFormAssignment> {
    const [row] = await db.insert(schema.patientFormAssignments).values(data).returning();
    return row;
  }

  async updatePatientFormAssignment(id: number, data: Partial<schema.InsertPatientFormAssignment>): Promise<schema.PatientFormAssignment | undefined> {
    const [row] = await db.update(schema.patientFormAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.patientFormAssignments.id, id))
      .returning();
    return row;
  }

  // ─── Form Bundles ─────────────────────────────────────────────────────────────

  async getFormBundles(clinicianId: number, clinicId: number | null): Promise<schema.FormBundle[]> {
    const conditions = clinicId
      ? or(eq(schema.formBundles.clinicianId, clinicianId), eq(schema.formBundles.clinicId, clinicId))
      : eq(schema.formBundles.clinicianId, clinicianId);
    return db.select().from(schema.formBundles).where(conditions).orderBy(desc(schema.formBundles.createdAt));
  }

  async getFormBundleById(id: number): Promise<schema.FormBundle | undefined> {
    const [row] = await db.select().from(schema.formBundles).where(eq(schema.formBundles.id, id)).limit(1);
    return row;
  }

  async createFormBundle(data: schema.InsertFormBundle): Promise<schema.FormBundle> {
    const [row] = await db.insert(schema.formBundles).values(data).returning();
    return row;
  }

  async updateFormBundle(id: number, data: Partial<schema.InsertFormBundle>): Promise<schema.FormBundle | undefined> {
    const [row] = await db.update(schema.formBundles).set(data).where(eq(schema.formBundles.id, id)).returning();
    return row;
  }

  async deleteFormBundle(id: number): Promise<void> {
    await db.delete(schema.formBundles).where(eq(schema.formBundles.id, id));
  }

  async getFormBundleItems(bundleId: number): Promise<schema.FormBundleItem[]> {
    return db.select().from(schema.formBundleItems)
      .where(eq(schema.formBundleItems.bundleId, bundleId))
      .orderBy(schema.formBundleItems.orderIndex);
  }

  async setFormBundleItems(bundleId: number, items: { formId: number; orderIndex: number }[]): Promise<void> {
    await db.delete(schema.formBundleItems).where(eq(schema.formBundleItems.bundleId, bundleId));
    if (items.length > 0) {
      await db.insert(schema.formBundleItems).values(items.map(i => ({ bundleId, ...i })));
    }
  }

  // ─── Patient Packet Assignments ───────────────────────────────────────────────

  async createPatientPacketAssignment(data: schema.InsertPatientPacketAssignment): Promise<schema.PatientPacketAssignment> {
    const [row] = await db.insert(schema.patientPacketAssignments).values(data).returning();
    return row;
  }

  async getPatientPacketAssignments(patientId: number): Promise<schema.PatientPacketAssignment[]> {
    return db.select().from(schema.patientPacketAssignments)
      .where(eq(schema.patientPacketAssignments.patientId, patientId))
      .orderBy(desc(schema.patientPacketAssignments.createdAt));
  }

  async getPatientPacketAssignmentByToken(token: string): Promise<schema.PatientPacketAssignment | undefined> {
    const [row] = await db.select().from(schema.patientPacketAssignments)
      .where(eq(schema.patientPacketAssignments.packetToken, token)).limit(1);
    return row;
  }

  async updatePatientPacketAssignment(id: number, data: Partial<schema.InsertPatientPacketAssignment>): Promise<schema.PatientPacketAssignment | undefined> {
    const [row] = await db.update(schema.patientPacketAssignments).set(data)
      .where(eq(schema.patientPacketAssignments.id, id)).returning();
    return row;
  }

  async deletePatientPacketAssignment(id: number): Promise<void> {
    await db.delete(schema.patientPacketAssignments)
      .where(eq(schema.patientPacketAssignments.id, id));
  }

  async deletePatientFormAssignment(id: number): Promise<void> {
    await db.delete(schema.patientFormAssignments)
      .where(eq(schema.patientFormAssignments.id, id));
  }

  // ─── Form Submissions (raw SQL — production DB may lack clinic_id column) ──

  async getFormSubmissionsByPatient(patientId: number): Promise<schema.FormSubmission[]> {
    const result = await db.execute(sql`SELECT * FROM form_submissions WHERE patient_id = ${patientId} ORDER BY submitted_at DESC`);
    return rawRows(result) as schema.FormSubmission[];
  }

  async getFormSubmissionsByClinician(clinicianId: number): Promise<schema.FormSubmission[]> {
    const result = await db.execute(sql`SELECT * FROM form_submissions WHERE clinician_id = ${clinicianId} ORDER BY submitted_at DESC`);
    return rawRows(result) as schema.FormSubmission[];
  }

  async getFormSubmissionsByClinic(clinicId: number | null, clinicianId: number): Promise<schema.FormSubmission[]> {
    if (clinicId) {
      try {
        // Three ways a submission belongs to this clinic:
        // 1. clinic_id matches directly (new submissions)
        // 2. clinician_id matches the logged-in user (legacy single-tenant submissions)
        // 3. patient_id belongs to a patient in this clinic (covers portal submissions
        //    created before clinic_id was backfilled on form_submissions)
        const result = await db.execute(sql`
          SELECT DISTINCT fs.*
          FROM form_submissions fs
          WHERE fs.clinic_id = ${clinicId}
             OR fs.clinician_id = ${clinicianId}
             OR (
               fs.patient_id IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM patients p
                 WHERE p.id = fs.patient_id AND p.clinic_id = ${clinicId}
               )
             )
          ORDER BY fs.submitted_at DESC
        `);
        return rawRows(result) as schema.FormSubmission[];
      } catch (err) {
        console.error("[storage] getFormSubmissionsByClinic primary query error — falling back to clinician-only query:", err);
        return this.getFormSubmissionsByClinician(clinicianId);
      }
    }
    return this.getFormSubmissionsByClinician(clinicianId);
  }

  async getFormSubmission(id: number): Promise<schema.FormSubmission | undefined> {
    const result = await db.execute(sql`SELECT * FROM form_submissions WHERE id = ${id} LIMIT 1`);
    return rawRows(result)[0] as schema.FormSubmission | undefined;
  }

  async createFormSubmission(data: schema.InsertFormSubmission): Promise<schema.FormSubmission> {
    try {
      const result = await db.execute(sql`
        INSERT INTO form_submissions (form_id, form_version, clinician_id, clinic_id, patient_id, assignment_id,
          submitted_by_patient, submitted_by_staff, submission_source, status, raw_submission_json,
          normalized_submission_json, signature_json, review_status, sync_status, submitter_name, submitter_email)
        VALUES (${data.formId}, ${data.formVersion ?? 1}, ${data.clinicianId ?? null}, ${data.clinicId ?? null}, ${data.patientId ?? null}, ${data.assignmentId ?? null},
          ${data.submittedByPatient ?? false}, ${data.submittedByStaff ?? false}, ${data.submissionSource ?? 'link'}, ${data.status ?? 'submitted'}, ${JSON.stringify(data.rawSubmissionJson)},
          ${data.normalizedSubmissionJson ? JSON.stringify(data.normalizedSubmissionJson) : null}, ${data.signatureJson ? JSON.stringify(data.signatureJson) : null}, ${data.reviewStatus ?? 'pending'}, ${data.syncStatus ?? 'not_synced'}, ${data.submitterName ?? null}, ${data.submitterEmail ?? null})
        RETURNING *`);
      return rawRows(result)[0] as schema.FormSubmission;
    } catch (err: any) {
      if (err?.message?.includes('clinic_id')) {
        const result = await db.execute(sql`
          INSERT INTO form_submissions (form_id, form_version, clinician_id, patient_id, assignment_id,
            submitted_by_patient, submitted_by_staff, submission_source, status, raw_submission_json,
            normalized_submission_json, signature_json, review_status, sync_status, submitter_name, submitter_email)
          VALUES (${data.formId}, ${data.formVersion ?? 1}, ${data.clinicianId ?? null}, ${data.patientId ?? null}, ${data.assignmentId ?? null},
            ${data.submittedByPatient ?? false}, ${data.submittedByStaff ?? false}, ${data.submissionSource ?? 'link'}, ${data.status ?? 'submitted'}, ${JSON.stringify(data.rawSubmissionJson)},
            ${data.normalizedSubmissionJson ? JSON.stringify(data.normalizedSubmissionJson) : null}, ${data.signatureJson ? JSON.stringify(data.signatureJson) : null}, ${data.reviewStatus ?? 'pending'}, ${data.syncStatus ?? 'not_synced'}, ${data.submitterName ?? null}, ${data.submitterEmail ?? null})
          RETURNING *`);
        return rawRows(result)[0] as schema.FormSubmission;
      }
      throw err;
    }
  }

  async updateFormSubmission(id: number, data: Partial<schema.InsertFormSubmission>): Promise<schema.FormSubmission | undefined> {
    const fieldMap: Record<string, string> = {
      formId: 'form_id', formVersion: 'form_version', clinicianId: 'clinician_id',
      patientId: 'patient_id', assignmentId: 'assignment_id', submittedByPatient: 'submitted_by_patient',
      submittedByStaff: 'submitted_by_staff', submissionSource: 'submission_source', status: 'status',
      rawSubmissionJson: 'raw_submission_json', normalizedSubmissionJson: 'normalized_submission_json',
      signatureJson: 'signature_json', reviewStatus: 'review_status', syncStatus: 'sync_status',
      syncSummaryJson: 'sync_summary_json', submitterName: 'submitter_name', submitterEmail: 'submitter_email',
    };
    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        let val = (data as any)[key];
        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
          val = JSON.stringify(val);
        }
        setClauses.push(`${col} = $${values.length + 1}`);
        values.push(val);
      }
    }
    setClauses.push('updated_at = NOW()');
    if (setClauses.length <= 1) return undefined;
    values.push(id);
    const queryStr = `UPDATE form_submissions SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(queryStr, values);
    return result.rows.map(mapRow)[0] as schema.FormSubmission | undefined;
  }

  async deleteFormSubmission(id: number): Promise<void> {
    await pool.query(`DELETE FROM form_sync_events WHERE submission_id = $1`, [id]);
    await pool.query(`DELETE FROM form_submissions WHERE id = $1`, [id]);
  }

  // ─── Form Sync Events ───────────────────────────────────────────────────────

  async getFormSyncEvents(submissionId: number): Promise<schema.FormSyncEvent[]> {
    return db.select().from(schema.formSyncEvents)
      .where(eq(schema.formSyncEvents.submissionId, submissionId))
      .orderBy(desc(schema.formSyncEvents.createdAt));
  }

  async createFormSyncEvent(data: schema.InsertFormSyncEvent): Promise<schema.FormSyncEvent> {
    const [row] = await db.insert(schema.formSyncEvents).values(data).returning();
    return row;
  }

  // ─── Form Expiration Tracking ───────────────────────────────────────────────

  async getFormExpirationTracking(patientId: number): Promise<schema.FormExpirationTracking[]> {
    return db.select().from(schema.formExpirationTracking)
      .where(eq(schema.formExpirationTracking.patientId, patientId));
  }

  async upsertFormExpirationTracking(patientId: number, formId: number, data: Partial<schema.InsertFormExpirationTracking>): Promise<schema.FormExpirationTracking> {
    const existing = await db.select().from(schema.formExpirationTracking)
      .where(and(eq(schema.formExpirationTracking.patientId, patientId), eq(schema.formExpirationTracking.formId, formId)))
      .limit(1);
    if (existing[0]) {
      const [row] = await db.update(schema.formExpirationTracking)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.formExpirationTracking.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db.insert(schema.formExpirationTracking)
      .values({ patientId, formId, ...data } as schema.InsertFormExpirationTracking)
      .returning();
    return row;
  }

  // ─── Encounter Drafts ────────────────────────────────────────────────────────
  async getEncounterDrafts(clinicianId: number): Promise<schema.EncounterDraft[]> {
    return db.select().from(schema.encounterDrafts)
      .where(eq(schema.encounterDrafts.clinicianId, clinicianId))
      .orderBy(desc(schema.encounterDrafts.createdAt));
  }

  async createEncounterDraft(draft: schema.InsertEncounterDraft): Promise<schema.EncounterDraft> {
    const [row] = await db.insert(schema.encounterDrafts).values(draft).returning();
    return row;
  }

  async deleteEncounterDraft(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.encounterDrafts)
      .where(and(eq(schema.encounterDrafts.id, id), eq(schema.encounterDrafts.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DbStorage() as unknown as IStorage;

// ─── Typed accessor for chart-review storage methods ──────────────────────
// The chart-review methods are attached to DbStorage.prototype dynamically
// (the codebase-wide pattern for non-IStorage methods). We expose a typed
// view here so that route handlers don't need to use `(storage as any).<m>`
// for chart-review work specifically.
export interface ChartReviewStorage {
  createChartReviewAgreement(
    data: schema.InsertChartReviewAgreement,
    opts: { primaryPhysicianUserId: number },
  ): Promise<schema.ChartReviewAgreement>;
  getChartReviewAgreementForMidLevel(
    midLevelUserId: number, clinicId: number,
  ): Promise<schema.ChartReviewAgreement | undefined>;
  getChartReviewAgreementById(
    id: number, clinicId: number,
  ): Promise<schema.ChartReviewAgreement | undefined>;
  listChartReviewAgreementsForUser(
    userId: number, clinicId: number,
  ): Promise<Array<schema.ChartReviewAgreement & { role: 'midlevel' | 'physician'; collaboratorRole?: 'primary' | 'backup' }>>;
  setPhysicianOverride(
    agreementId: number,
    clinicId: number,
    lockedFields: string[],
    physicianUserId: number,
  ): Promise<schema.ChartReviewAgreement | undefined>;
  listChartReviewCollaborators(
    agreementId: number, clinicId?: number,
  ): Promise<schema.ChartReviewCollaborator[]>;
  addChartReviewCollaborator(
    agreementId: number, physicianUserId: number, role: 'primary' | 'backup', clinicId?: number,
  ): Promise<schema.ChartReviewCollaborator | null>;
  removeChartReviewCollaborator(
    id: number, agreementId: number, clinicId?: number,
  ): Promise<boolean>;
  listMidLevelsForPhysician(
    physicianUserId: number, clinicId: number,
  ): Promise<Array<{
    agreement: schema.ChartReviewAgreement;
    midLevel: { id: number; firstName: string | null; lastName: string | null; title: string | null };
    role: 'primary' | 'backup';
    periodPctComplete: number;
    pendingCount: number;
    pastDueCount: number;
    maxDaysPastDue: number;
  }>>;
  listChartReviewItemsForAgreement(
    agreementId: number,
    opts?: { status?: string; limit?: number; clinicId?: number },
  ): Promise<Array<schema.ChartReviewItem & {
    patientName: string;
    encounterVisitDate: Date;
    encounterChiefComplaint: string | null;
  }>>;
  getChartReviewItem(
    id: number, clinicId: number,
  ): Promise<schema.ChartReviewItem | undefined>;
  listChartReviewComments(
    itemId: number, clinicId: number,
  ): Promise<schema.ChartReviewComment[]>;
  addChartReviewComment(
    data: schema.InsertChartReviewComment, clinicId: number,
  ): Promise<schema.ChartReviewComment | null>;
  concurChartReviewItem(
    id: number, clinicId: number, physicianUserId: number, comment?: string,
  ): Promise<schema.ChartReviewItem | undefined>;
  rejectChartReviewItem(
    id: number, clinicId: number, physicianUserId: number, reason: string,
  ): Promise<schema.ChartReviewItem | undefined>;
  flagChartForReview(input: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
    reason?: string | null;
  }): Promise<schema.ChartReviewItem | null>;
  enqueueChartForReviewIfApplicable(input: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
    sendForReview: boolean;
  }): Promise<schema.ChartReviewItem | null>;
  previewChartReviewFlags(input: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
  }): Promise<{
    hasAgreement: boolean;
    wouldBeMandatory: boolean;
    mandatoryReasons: string[];
    runningPeriodPct: number;
    quotaTargetPct: number;
    quotaKind: 'percent' | 'count';
    runningPeriodCount: number;
    quotaTargetCount: number;
    quotaTargetReached: boolean;
    prospectiveGate: boolean;
    reviewType: 'retrospective' | 'prospective';
  }>;
  // Slice 2: prospective gate — called by sign route to decide whether to
  // park the chart instead of finalizing the sign.
  getProspectiveGateState(opts: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
  }): Promise<{
    shouldGate: boolean;
    agreement: schema.ChartReviewAgreement | null;
    reasons: string[];
  }>;
  submitProspectiveChartForReview(opts: {
    encounterId: number;
    midLevelUserId: number;
    clinicId: number;
    agreement: schema.ChartReviewAgreement;
    reasons: string[];
    parkEncounter?: { signedBy: string };
  }): Promise<{
    item: schema.ChartReviewItem | null;
    encounter: schema.ClinicalEncounter | null;
  }>;
}

export const chartReviewStorage = storage as unknown as ChartReviewStorage;

// ─── Clinic plan stamping ─────────────────────────────────────────────────
/**
 * Called by the Stripe webhook when a subscription event is received.
 * Stamps the clinic with the correct plan, base limit, and max_providers.
 * Safe to call multiple times — all fields are idempotent.
 */
export async function updateClinicPlanFromStripe(opts: {
  clinicId: number;
  subscriptionPlan: string;      // 'solo' | 'suite'
  baseProviderLimit: number;     // 1 for solo, 2 for suite
  extraProviderSeats: number;    // current purchased extra seats (pass existing value)
  subscriptionStatus?: string;
  stripeSubscriptionId?: string;
}): Promise<void> {
  const maxProviders = opts.baseProviderLimit + opts.extraProviderSeats;
  await db
    .update(schema.clinics)
    .set({
      subscriptionPlan: opts.subscriptionPlan,
      baseProviderLimit: opts.baseProviderLimit,
      maxProviders,
      ...(opts.subscriptionStatus !== undefined && { subscriptionStatus: opts.subscriptionStatus }),
      ...(opts.stripeSubscriptionId !== undefined && { stripeSubscriptionId: opts.stripeSubscriptionId }),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinics.id, opts.clinicId));
}

// ─── Clinic seat management ───────────────────────────────────────────────
/** Update the seat counters on a clinic after a confirmed Stripe seat purchase. */
export async function updateClinicSeats(
  clinicId: number,
  extraProviderSeats: number
): Promise<void> {
  const baseProviderLimit = 2; // Suite includes 2 providers; matches SUITE_BASE_PROVIDER_LIMIT in clinic-plan.ts
  const maxProviders = baseProviderLimit + extraProviderSeats;
  await db
    .update(schema.clinics)
    .set({
      extraProviderSeats,
      maxProviders,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinics.id, clinicId));
}

/** Atomically create a provider row + clinic_membership in one transaction. */
export async function createProviderWithMembership(opts: {
  clinicId: number;
  userId?: number | null;
  displayName: string;
  credentials?: string | null;
  specialty?: string | null;
  npi?: string | null;
  email?: string | null; // for membership / future invite
  role?: string;
}): Promise<{ providerId: number }> {
  const [provider] = await db
    .insert(schema.providers)
    .values({
      clinicId: opts.clinicId,
      userId: opts.userId ?? null,
      displayName: opts.displayName,
      credentials: opts.credentials ?? null,
      specialty: opts.specialty ?? null,
      npi: opts.npi ?? null,
      isActive: true,
    })
    .returning();

  // Membership row — only if there is an associated user
  if (opts.userId) {
    const existing = await db
      .select({ id: schema.clinicMemberships.id })
      .from(schema.clinicMemberships)
      .where(
        and(
          eq(schema.clinicMemberships.clinicId, opts.clinicId),
          eq(schema.clinicMemberships.userId, opts.userId)
        )
      );
    if (existing.length === 0) {
      await db.insert(schema.clinicMemberships).values({
        clinicId: opts.clinicId,
        userId: opts.userId,
        role: opts.role ?? "provider",
        isActive: true,
        isPrimaryClinic: true,
      });
    }
  }

  return { providerId: provider.id };
}

// ─── Multi-clinic bootstrap ────────────────────────────────────────────────
// Called once immediately after a new user is created during registration.
// Creates the clinic, membership, and provider records so every account
// starts with a complete, consistent structure from day one.
// Solo plan: maxProviders = 1. Upgrade to Clinic plan = change that field only.
export async function setupClinicForNewUser(user: User): Promise<{ clinicId: number; providerId: number }> {
  const clinicName = (user as any).clinicName || `${user.firstName} ${user.lastName} Practice`;

  // 1. Create the clinic
  const [clinic] = await db
    .insert(schema.clinics)
    .values({
      name: clinicName,
      ownerUserId: user.id,
      isActive: true,
      subscriptionPlan: "solo",
      maxProviders: 1,
    })
    .returning();

  // 2. Membership: owner is always the admin
  await db.insert(schema.clinicMemberships).values({
    clinicId: clinic.id,
    userId: user.id,
    role: "admin",
    clinicalRole: "provider",
    adminRole: "owner",
    isActive: true,
    isPrimaryClinic: true,
  });

  // 3. Provider profile (the solo clinician IS the sole provider)
  const displayName = [user.title, user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ");
  const [provider] = await db
    .insert(schema.providers)
    .values({
      clinicId: clinic.id,
      userId: user.id,
      displayName,
      npi: (user as any).npi ?? null,
      isActive: true,
    })
    .returning();

  // 4. Stamp defaultClinicId + userType back onto the user row
  await db
    .update(schema.users)
    .set({ defaultClinicId: clinic.id, userType: "solo_admin" })
    .where(eq(schema.users.id, user.id));

  return { clinicId: clinic.id, providerId: provider.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Diagnosis Presets (clinic-wide /dx shortcuts) ─────────────────────────
// Implemented on DbStorage prototype to avoid disturbing the main class block.
// ═══════════════════════════════════════════════════════════════════════════
(DbStorage.prototype as any).getDiagnosisPresets = async function(clinicId: number): Promise<schema.DiagnosisPreset[]> {
  return await db
    .select()
    .from(schema.diagnosisPresets)
    .where(eq(schema.diagnosisPresets.clinicId, clinicId))
    .orderBy(desc(schema.diagnosisPresets.updatedAt));
};

(DbStorage.prototype as any).getDiagnosisPreset = async function(id: number, clinicId: number): Promise<schema.DiagnosisPreset | undefined> {
  const [row] = await db
    .select()
    .from(schema.diagnosisPresets)
    .where(and(eq(schema.diagnosisPresets.id, id), eq(schema.diagnosisPresets.clinicId, clinicId)))
    .limit(1);
  return row;
};

(DbStorage.prototype as any).createDiagnosisPreset = async function(data: schema.InsertDiagnosisPreset): Promise<schema.DiagnosisPreset> {
  const [row] = await db.insert(schema.diagnosisPresets).values(data).returning();
  return row;
};

(DbStorage.prototype as any).updateDiagnosisPreset = async function(
  id: number,
  clinicId: number,
  data: Partial<schema.InsertDiagnosisPreset>,
): Promise<schema.DiagnosisPreset | undefined> {
  const [row] = await db
    .update(schema.diagnosisPresets)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.diagnosisPresets.id, id), eq(schema.diagnosisPresets.clinicId, clinicId)))
    .returning();
  return row;
};

(DbStorage.prototype as any).deleteDiagnosisPreset = async function(id: number, clinicId: number): Promise<boolean> {
  const result = await db
    .delete(schema.diagnosisPresets)
    .where(and(eq(schema.diagnosisPresets.id, id), eq(schema.diagnosisPresets.clinicId, clinicId)))
    .returning({ id: schema.diagnosisPresets.id });
  return result.length > 0;
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Daily Check-In (Phase 1) ──────────────────────────────────────────────
// All implementations attached to DbStorage.prototype to keep the main class
// block stable. Tracking settings are upserted; daily check-ins are upserted
// per (patient, date); medication adherence and patient-reported meds are
// inserted; provider inbox notifications support unread/read/dismissed states.
// ═══════════════════════════════════════════════════════════════════════════

(DbStorage.prototype as any).getPatientTrackingSettings = async function(
  patientId: number,
): Promise<schema.PatientTrackingSettings | null> {
  const [row] = await db
    .select()
    .from(schema.patientTrackingSettings)
    .where(eq(schema.patientTrackingSettings.patientId, patientId))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).upsertPatientTrackingSettings = async function(
  patientId: number,
  partial: Partial<schema.InsertPatientTrackingSettings>,
): Promise<schema.PatientTrackingSettings> {
  const existing = await (this as any).getPatientTrackingSettings(patientId);
  if (existing) {
    const [row] = await db
      .update(schema.patientTrackingSettings)
      .set({ ...partial, updatedAt: new Date() })
      .where(eq(schema.patientTrackingSettings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.patientTrackingSettings)
    .values({ patientId, ...partial } as schema.InsertPatientTrackingSettings)
    .returning();
  return row;
};

(DbStorage.prototype as any).getPatientDailyCheckin = async function(
  patientId: number,
  date: string,
): Promise<schema.PatientDailyCheckin | null> {
  const [row] = await db
    .select()
    .from(schema.patientDailyCheckins)
    .where(and(
      eq(schema.patientDailyCheckins.patientId, patientId),
      eq(schema.patientDailyCheckins.date, date),
    ))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).getPatientDailyCheckins = async function(
  patientId: number,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<schema.PatientDailyCheckin[]> {
  const conditions: any[] = [eq(schema.patientDailyCheckins.patientId, patientId)];
  if (opts.from) conditions.push(sql`${schema.patientDailyCheckins.date} >= ${opts.from}`);
  if (opts.to) conditions.push(sql`${schema.patientDailyCheckins.date} <= ${opts.to}`);
  let query: any = db
    .select()
    .from(schema.patientDailyCheckins)
    .where(and(...conditions))
    .orderBy(desc(schema.patientDailyCheckins.date));
  if (opts.limit) query = query.limit(opts.limit);
  return await query;
};

(DbStorage.prototype as any).upsertPatientDailyCheckin = async function(
  patientId: number,
  date: string,
  partial: Partial<schema.InsertPatientDailyCheckin>,
): Promise<schema.PatientDailyCheckin> {
  const existing = await (this as any).getPatientDailyCheckin(patientId, date);
  if (existing) {
    const [row] = await db
      .update(schema.patientDailyCheckins)
      .set({ ...partial, updatedAt: new Date() })
      .where(eq(schema.patientDailyCheckins.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.patientDailyCheckins)
    .values({ patientId, date, ...partial } as schema.InsertPatientDailyCheckin)
    .returning();
  // Touch tracking settings.lastActivityAt so we know they're active.
  await db
    .update(schema.patientTrackingSettings)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.patientTrackingSettings.patientId, patientId));
  return row;
};

(DbStorage.prototype as any).logMedicationAdherence = async function(
  data: schema.InsertPatientMedicationAdherenceLog,
): Promise<schema.PatientMedicationAdherenceLog> {
  const [row] = await db
    .insert(schema.patientMedicationAdherenceLogs)
    .values(data)
    .returning();
  await db
    .update(schema.patientTrackingSettings)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.patientTrackingSettings.patientId, data.patientId));
  return row;
};

(DbStorage.prototype as any).getMedicationAdherence = async function(
  patientId: number,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<schema.PatientMedicationAdherenceLog[]> {
  const conditions: any[] = [eq(schema.patientMedicationAdherenceLogs.patientId, patientId)];
  if (opts.from) conditions.push(sql`${schema.patientMedicationAdherenceLogs.date} >= ${opts.from}`);
  if (opts.to) conditions.push(sql`${schema.patientMedicationAdherenceLogs.date} <= ${opts.to}`);
  let query: any = db
    .select()
    .from(schema.patientMedicationAdherenceLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.patientMedicationAdherenceLogs.date), desc(schema.patientMedicationAdherenceLogs.createdAt));
  if (opts.limit) query = query.limit(opts.limit);
  return await query;
};

(DbStorage.prototype as any).addPatientReportedMedication = async function(
  data: schema.InsertPatientReportedMedication,
): Promise<schema.PatientReportedMedication> {
  const [row] = await db
    .insert(schema.patientReportedMedications)
    .values(data)
    .returning();
  return row;
};

(DbStorage.prototype as any).listPatientReportedMedications = async function(
  patientId: number,
  opts: { status?: string } = {},
): Promise<schema.PatientReportedMedication[]> {
  const conditions: any[] = [eq(schema.patientReportedMedications.patientId, patientId)];
  if (opts.status) conditions.push(eq(schema.patientReportedMedications.status, opts.status));
  return await db
    .select()
    .from(schema.patientReportedMedications)
    .where(and(...conditions))
    .orderBy(desc(schema.patientReportedMedications.createdAt));
};

(DbStorage.prototype as any).getPatientReportedMedication = async function(
  id: number,
  patientId: number,
): Promise<schema.PatientReportedMedication | undefined> {
  const [row] = await db
    .select()
    .from(schema.patientReportedMedications)
    .where(and(
      eq(schema.patientReportedMedications.id, id),
      eq(schema.patientReportedMedications.patientId, patientId),
    ))
    .limit(1);
  return row;
};

(DbStorage.prototype as any).updatePatientReportedMedication = async function(
  id: number,
  patientId: number,
  partial: Partial<schema.InsertPatientReportedMedication>,
): Promise<schema.PatientReportedMedication | undefined> {
  const [row] = await db
    .update(schema.patientReportedMedications)
    .set({ ...partial, updatedAt: new Date() })
    .where(and(
      eq(schema.patientReportedMedications.id, id),
      eq(schema.patientReportedMedications.patientId, patientId),
    ))
    .returning();
  return row;
};

(DbStorage.prototype as any).markPatientReportedMedReviewed = async function(
  id: number,
  patientId: number,
  reviewedByUserId: number,
): Promise<schema.PatientReportedMedication | undefined> {
  const [row] = await db
    .update(schema.patientReportedMedications)
    .set({ reviewedByProvider: true, reviewedAt: new Date(), reviewedByUserId, updatedAt: new Date() })
    .where(and(
      eq(schema.patientReportedMedications.id, id),
      eq(schema.patientReportedMedications.patientId, patientId),
    ))
    .returning();
  return row;
};

(DbStorage.prototype as any).deletePatientReportedMedication = async function(
  id: number,
  patientId: number,
): Promise<boolean> {
  const result = await db
    .delete(schema.patientReportedMedications)
    .where(and(
      eq(schema.patientReportedMedications.id, id),
      eq(schema.patientReportedMedications.patientId, patientId),
    ))
    .returning({ id: schema.patientReportedMedications.id });
  return result.length > 0;
};

// ─── Provider inbox notifications ──────────────────────────────────────────

(DbStorage.prototype as any).createInboxNotification = async function(
  data: schema.InsertProviderInboxNotification,
): Promise<schema.ProviderInboxNotification> {
  const [row] = await db
    .insert(schema.providerInboxNotifications)
    .values(data)
    .returning();
  return row;
};

(DbStorage.prototype as any).listInboxNotifications = async function(
  clinicId: number,
  opts: { providerId?: number | null; includeDismissed?: boolean; limit?: number } = {},
): Promise<schema.ProviderInboxNotification[]> {
  const conditions: any[] = [eq(schema.providerInboxNotifications.clinicId, clinicId)];
  // If providerId given, include notifications targeted at that provider OR
  // clinic-wide notifications (providerId IS NULL).
  if (opts.providerId !== undefined && opts.providerId !== null) {
    conditions.push(or(
      eq(schema.providerInboxNotifications.providerId, opts.providerId),
      isNull(schema.providerInboxNotifications.providerId),
    ));
  }
  if (!opts.includeDismissed) {
    conditions.push(isNull(schema.providerInboxNotifications.dismissedAt));
  }
  let query: any = db
    .select()
    .from(schema.providerInboxNotifications)
    .where(and(...conditions))
    .orderBy(desc(schema.providerInboxNotifications.createdAt));
  query = query.limit(opts.limit ?? 100);
  return await query;
};

(DbStorage.prototype as any).countUnreadInboxNotifications = async function(
  clinicId: number,
  providerId?: number | null,
): Promise<number> {
  const conditions: any[] = [
    eq(schema.providerInboxNotifications.clinicId, clinicId),
    isNull(schema.providerInboxNotifications.readAt),
    isNull(schema.providerInboxNotifications.dismissedAt),
  ];
  if (providerId !== undefined && providerId !== null) {
    conditions.push(or(
      eq(schema.providerInboxNotifications.providerId, providerId),
      isNull(schema.providerInboxNotifications.providerId),
    ));
  }
  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.providerInboxNotifications)
    .where(and(...conditions));
  return Number(value ?? 0);
};

(DbStorage.prototype as any).markInboxNotificationRead = async function(
  id: number,
  clinicId: number,
  userId: number,
): Promise<schema.ProviderInboxNotification | undefined> {
  // Visibility scope: a user may only act on notifications they can see —
  // i.e. those targeted at them OR clinic-wide (provider_id IS NULL). This
  // matches `listInboxNotifications` and prevents intra-clinic IDOR where one
  // provider could mark another provider's targeted notification read by ID.
  const [row] = await db
    .update(schema.providerInboxNotifications)
    .set({ readAt: new Date(), readByUserId: userId })
    .where(and(
      eq(schema.providerInboxNotifications.id, id),
      eq(schema.providerInboxNotifications.clinicId, clinicId),
      or(
        eq(schema.providerInboxNotifications.providerId, userId),
        isNull(schema.providerInboxNotifications.providerId),
      )!,
    ))
    .returning();
  return row;
};

(DbStorage.prototype as any).markAllInboxNotificationsRead = async function(
  clinicId: number,
  providerId: number | null,
  userId: number,
): Promise<number> {
  const conditions: any[] = [
    eq(schema.providerInboxNotifications.clinicId, clinicId),
    isNull(schema.providerInboxNotifications.readAt),
    isNull(schema.providerInboxNotifications.dismissedAt),
  ];
  if (providerId !== null && providerId !== undefined) {
    conditions.push(or(
      eq(schema.providerInboxNotifications.providerId, providerId),
      isNull(schema.providerInboxNotifications.providerId),
    ));
  }
  const result = await db
    .update(schema.providerInboxNotifications)
    .set({ readAt: new Date(), readByUserId: userId })
    .where(and(...conditions))
    .returning({ id: schema.providerInboxNotifications.id });
  return result.length;
};

(DbStorage.prototype as any).dismissInboxNotification = async function(
  id: number,
  clinicId: number,
  userId: number,
): Promise<boolean> {
  // Visibility scope (see markInboxNotificationRead). Without this predicate,
  // any clinic member could dismiss a notification targeted at a specific
  // other provider just by knowing the ID — a real intra-clinic IDOR.
  const result = await db
    .update(schema.providerInboxNotifications)
    .set({ dismissedAt: new Date(), dismissedByUserId: userId })
    .where(and(
      eq(schema.providerInboxNotifications.id, id),
      eq(schema.providerInboxNotifications.clinicId, clinicId),
      or(
        eq(schema.providerInboxNotifications.providerId, userId),
        isNull(schema.providerInboxNotifications.providerId),
      )!,
    ))
    .returning({ id: schema.providerInboxNotifications.id });
  return result.length > 0;
};

// ─── Vitals Monitoring Mode ────────────────────────────────────────────────

(DbStorage.prototype as any).createVitalsMonitoringEpisode = async function(
  data: schema.InsertVitalsMonitoringEpisode & { clinicId: number; createdByUserId: number },
): Promise<schema.VitalsMonitoringEpisode> {
  const [row] = await db
    .insert(schema.vitalsMonitoringEpisodes)
    .values({
      patientId: data.patientId,
      clinicId: data.clinicId,
      createdByUserId: data.createdByUserId,
      vitalTypes: data.vitalTypes,
      startDate: data.startDate,
      endDate: data.endDate,
      frequencyPerDay: data.frequencyPerDay ?? 1,
      instructions: data.instructions ?? null,
    })
    .returning();
  return row;
};

(DbStorage.prototype as any).getVitalsMonitoringEpisode = async function(
  id: number,
): Promise<schema.VitalsMonitoringEpisode | undefined> {
  const [row] = await db
    .select()
    .from(schema.vitalsMonitoringEpisodes)
    .where(eq(schema.vitalsMonitoringEpisodes.id, id));
  return row;
};

(DbStorage.prototype as any).listVitalsMonitoringEpisodesForPatient = async function(
  patientId: number,
): Promise<schema.VitalsMonitoringEpisode[]> {
  return await db
    .select()
    .from(schema.vitalsMonitoringEpisodes)
    .where(eq(schema.vitalsMonitoringEpisodes.patientId, patientId))
    .orderBy(desc(schema.vitalsMonitoringEpisodes.createdAt));
};

(DbStorage.prototype as any).getActiveVitalsMonitoringEpisodes = async function(): Promise<schema.VitalsMonitoringEpisode[]> {
  return await db
    .select()
    .from(schema.vitalsMonitoringEpisodes)
    .where(eq(schema.vitalsMonitoringEpisodes.status, "active"));
};

(DbStorage.prototype as any).getActiveVitalsMonitoringEpisodeForPatient = async function(
  patientId: number,
): Promise<schema.VitalsMonitoringEpisode | undefined> {
  const [row] = await db
    .select()
    .from(schema.vitalsMonitoringEpisodes)
    .where(and(
      eq(schema.vitalsMonitoringEpisodes.patientId, patientId),
      eq(schema.vitalsMonitoringEpisodes.status, "active"),
    ))
    .orderBy(desc(schema.vitalsMonitoringEpisodes.createdAt))
    .limit(1);
  return row;
};

(DbStorage.prototype as any).endVitalsMonitoringEpisode = async function(
  id: number,
  opts: { status: "completed" | "ended_early" | "cancelled"; endedByUserId?: number; reason?: string },
): Promise<schema.VitalsMonitoringEpisode | undefined> {
  const set: any = {
    status: opts.status,
    completedAt: new Date(),
    updatedAt: new Date(),
  };
  if (opts.endedByUserId !== undefined) set.endedEarlyByUserId = opts.endedByUserId;
  if (opts.reason !== undefined) set.endedEarlyReason = opts.reason;
  const [row] = await db
    .update(schema.vitalsMonitoringEpisodes)
    .set(set)
    .where(eq(schema.vitalsMonitoringEpisodes.id, id))
    .returning();
  return row;
};

(DbStorage.prototype as any).createPatientLoggedVital = async function(
  data: schema.InsertPatientVital & { patientId: number; clinicianId: number },
): Promise<schema.PatientVital> {
  const insert: any = {
    patientId: data.patientId,
    clinicianId: data.clinicianId,
    systolicBp: data.systolicBp ?? null,
    diastolicBp: data.diastolicBp ?? null,
    heartRate: data.heartRate ?? null,
    weightLbs: data.weightLbs ?? null,
    heightInches: data.heightInches ?? null,
    notes: data.notes ?? null,
    source: "patient_logged",
    timeOfDay: data.timeOfDay ?? null,
    symptoms: data.symptoms ?? [],
    monitoringEpisodeId: data.monitoringEpisodeId ?? null,
  };
  if (data.recordedAt !== undefined) {
    insert.recordedAt = typeof data.recordedAt === "string" ? new Date(data.recordedAt) : data.recordedAt;
  }
  // Auto-compute BMI if both weight and height present
  if (data.weightLbs && data.heightInches) {
    insert.bmi = (Number(data.weightLbs) * 703) / (Number(data.heightInches) * Number(data.heightInches));
  }
  const [row] = await db.insert(schema.patientVitals).values(insert).returning();
  return row;
};

(DbStorage.prototype as any).listPatientLoggedVitalsForEpisode = async function(
  episodeId: number,
): Promise<schema.PatientVital[]> {
  return await db
    .select()
    .from(schema.patientVitals)
    .where(eq(schema.patientVitals.monitoringEpisodeId, episodeId))
    .orderBy(desc(schema.patientVitals.recordedAt));
};

(DbStorage.prototype as any).countPatientLoggedReadingsByDate = async function(
  episodeId: number,
  date: string,
): Promise<number> {
  // YYYY-MM-DD comparison against recorded_at::date
  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.patientVitals)
    .where(and(
      eq(schema.patientVitals.monitoringEpisodeId, episodeId),
      sql`(${schema.patientVitals.recordedAt})::date = ${date}::date`,
    ));
  return Number(value ?? 0);
};

(DbStorage.prototype as any).recordVitalsMonitoringAlert = async function(
  data: schema.InsertVitalsMonitoringAlert,
): Promise<schema.VitalsMonitoringAlert> {
  const [row] = await db.insert(schema.vitalsMonitoringAlerts).values(data).returning();
  return row;
};

(DbStorage.prototype as any).getVitalsMonitoringAlertsForEpisode = async function(
  episodeId: number,
): Promise<schema.VitalsMonitoringAlert[]> {
  return await db
    .select()
    .from(schema.vitalsMonitoringAlerts)
    .where(eq(schema.vitalsMonitoringAlerts.episodeId, episodeId))
    .orderBy(desc(schema.vitalsMonitoringAlerts.createdAt));
};

(DbStorage.prototype as any).hasVitalsMonitoringAlert = async function(
  episodeId: number,
  alertType: string,
  alertDate?: string,
): Promise<boolean> {
  const conds: any[] = [
    eq(schema.vitalsMonitoringAlerts.episodeId, episodeId),
    eq(schema.vitalsMonitoringAlerts.alertType, alertType),
  ];
  if (alertDate) conds.push(eq(schema.vitalsMonitoringAlerts.alertDate, alertDate));
  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.vitalsMonitoringAlerts)
    .where(and(...conds));
  return Number(value ?? 0) > 0;
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Collaborating Physician Chart Review ─────────────────────────────────
// Implemented on DbStorage prototype to keep the main class block clean.
// ═══════════════════════════════════════════════════════════════════════════

(DbStorage.prototype as any).getChartReviewAgreementForMidLevel = async function(
  midLevelUserId: number, clinicId: number
): Promise<schema.ChartReviewAgreement | undefined> {
  const [row] = await db.select().from(schema.chartReviewAgreements).where(and(
    eq(schema.chartReviewAgreements.midLevelUserId, midLevelUserId),
    eq(schema.chartReviewAgreements.clinicId, clinicId),
    eq(schema.chartReviewAgreements.active, true),
  )).limit(1);
  return row;
};

// Collaborating-physician supervision is a regulatory function in most US
// states (mid-level/PA/NP scope-of-practice rules). Only physicians (MD or DO)
// may serve as the collaborator of record. We normalize whitespace + case
// before comparing so "md", " MD ", "Md", etc. all pass.
const ALLOWED_COLLAB_TITLES = new Set(["MD", "DO"]);
function normalizeTitle(t: string | null | undefined): string {
  return (t ?? "").trim().toUpperCase();
}

(DbStorage.prototype as any).createChartReviewAgreement = async function(
  data: schema.InsertChartReviewAgreement,
  opts: { primaryPhysicianUserId: number },
): Promise<schema.ChartReviewAgreement> {
  // The whole point of collaborating-physician oversight is independent review;
  // a mid-level cannot designate themselves as their own collaborating physician.
  if (opts.primaryPhysicianUserId === data.midLevelUserId) {
    throw new Error("Primary physician must be a different user than the mid-level on the agreement");
  }
  return await db.transaction(async (tx) => {
    // Validate the primary physician is an active member of this clinic with
    // either clinicalRole='provider' (full clinician) OR
    // clinicalRole='external_reviewer' (chart-review-only collaborating MD/DO).
    // Prevents pinning a staff member or cross-tenant user as the collaborating
    // physician.
    const [m] = await tx.select({
      membershipId: schema.clinicMemberships.id,
      title: schema.users.title,
      clinicalRole: schema.clinicMemberships.clinicalRole,
      acceptanceStatus: schema.clinicMemberships.acceptanceStatus,
    })
      .from(schema.clinicMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.clinicMemberships.userId))
      .where(and(
        eq(schema.clinicMemberships.userId, opts.primaryPhysicianUserId),
        eq(schema.clinicMemberships.clinicId, data.clinicId),
        eq(schema.clinicMemberships.isActive, true),
      )).limit(1);
    if (!m || (m.clinicalRole !== 'provider' && m.clinicalRole !== 'external_reviewer')) {
      throw new Error("Primary physician must be an active provider or external collaborating physician in this clinic");
    }
    if (!ALLOWED_COLLAB_TITLES.has(normalizeTitle(m.title))) {
      throw new Error("Primary physician must be an MD or DO");
    }
    const [row] = await tx.insert(schema.chartReviewAgreements).values(data).returning();
    await tx.insert(schema.chartReviewCollaborators).values({
      agreementId: row.id,
      physicianUserId: opts.primaryPhysicianUserId,
      role: 'primary',
    });
    return row;
  });
};

const ALLOWED_AGREEMENT_FIELDS: ReadonlySet<string> = new Set([
  "reviewType", "quotaKind", "quotaValue", "quotaPeriod", "enforcementPeriod",
  "ruleControlledSubstance", "ruleNewDiagnosis", "active",
]);

(DbStorage.prototype as any).updateChartReviewAgreement = async function(
  id: number,
  clinicId: number,
  data: Partial<schema.InsertChartReviewAgreement>,
  actor: { userId: number; isMidLevel: boolean; isPhysicianOnAgreement: boolean; isAdmin: boolean },
): Promise<schema.ChartReviewAgreement | undefined> {
  const [existing] = await db.select().from(schema.chartReviewAgreements).where(and(
    eq(schema.chartReviewAgreements.id, id),
    eq(schema.chartReviewAgreements.clinicId, clinicId),
  )).limit(1);
  if (!existing) return undefined;

  const lockedFields: string[] = (existing.physicianLockedFields as string[] | null) ?? [];
  const sanitized: Partial<schema.InsertChartReviewAgreement> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!ALLOWED_AGREEMENT_FIELDS.has(k)) continue;
    // Mid-level cannot edit physician-locked fields. Admin and the physician
    // themselves can always edit.
    if (actor.isMidLevel && !actor.isPhysicianOnAgreement && !actor.isAdmin && lockedFields.includes(k)) {
      continue;
    }
    (sanitized as any)[k] = v;
  }

  // Enforce admin floor: if mid-level lowers below min_quota_value, reject.
  if (
    actor.isMidLevel && !actor.isAdmin && !actor.isPhysicianOnAgreement &&
    sanitized.quotaValue != null &&
    existing.minQuotaValue != null &&
    Number(sanitized.quotaValue) < existing.minQuotaValue
  ) {
    sanitized.quotaValue = existing.minQuotaValue;
  }

  if (Object.keys(sanitized).length === 0) return existing;

  const [updated] = await db.update(schema.chartReviewAgreements).set({
    ...sanitized,
    updatedAt: new Date(),
  }).where(eq(schema.chartReviewAgreements.id, id)).returning();
  return updated;
};

(DbStorage.prototype as any).setPhysicianOverride = async function(
  agreementId: number, clinicId: number, lockedFields: string[], physicianUserId: number,
): Promise<schema.ChartReviewAgreement | undefined> {
  const [updated] = await db.update(schema.chartReviewAgreements).set({
    physicianLockedFields: lockedFields,
    physicianOverriddenAt: new Date(),
    physicianOverriddenBy: physicianUserId,
    updatedAt: new Date(),
  }).where(and(
    eq(schema.chartReviewAgreements.id, agreementId),
    eq(schema.chartReviewAgreements.clinicId, clinicId),
  )).returning();
  return updated;
};

(DbStorage.prototype as any).getChartReviewAgreementById = async function(
  id: number, clinicId: number,
): Promise<schema.ChartReviewAgreement | undefined> {
  const [row] = await db.select().from(schema.chartReviewAgreements).where(and(
    eq(schema.chartReviewAgreements.id, id),
    eq(schema.chartReviewAgreements.clinicId, clinicId),
  )).limit(1);
  return row;
};

(DbStorage.prototype as any).listChartReviewCollaborators = async function(
  agreementId: number, clinicId?: number,
): Promise<schema.ChartReviewCollaborator[]> {
  // Defense-in-depth: when a clinicId is supplied, verify the agreement
  // belongs to that clinic before returning any collaborators.
  if (clinicId != null) {
    const [agr] = await db.select({ id: schema.chartReviewAgreements.id })
      .from(schema.chartReviewAgreements)
      .where(and(
        eq(schema.chartReviewAgreements.id, agreementId),
        eq(schema.chartReviewAgreements.clinicId, clinicId),
      )).limit(1);
    if (!agr) return [];
  }
  return await db.select().from(schema.chartReviewCollaborators).where(
    eq(schema.chartReviewCollaborators.agreementId, agreementId),
  ).orderBy(desc(schema.chartReviewCollaborators.role)); // 'primary' before 'backup' alphabetically wrong; fine for now
};

// Defense-in-depth: only inserts when the agreement actually belongs to the
// given clinic AND the proposed physician is an active provider in that clinic.
// Routes already check, but this guarantees we never write a collaborator
// across tenants or pin a non-clinical staff member as a "physician reviewer".
(DbStorage.prototype as any).addChartReviewCollaborator = async function(
  agreementId: number, physicianUserId: number, role: 'primary' | 'backup', clinicId?: number,
): Promise<schema.ChartReviewCollaborator | null> {
  if (clinicId != null) {
    const [agr] = await db.select({
      id: schema.chartReviewAgreements.id,
      midLevelUserId: schema.chartReviewAgreements.midLevelUserId,
    })
      .from(schema.chartReviewAgreements)
      .where(and(
        eq(schema.chartReviewAgreements.id, agreementId),
        eq(schema.chartReviewAgreements.clinicId, clinicId),
      )).limit(1);
    if (!agr) return null;
    // The mid-level cannot collaborate-on-themself; collaborating-physician
    // oversight requires an independent reviewer.
    if (agr.midLevelUserId === physicianUserId) return null;
    // Validate proposed physician is an active MD/DO member of this clinic
    // — either a full provider OR an external_reviewer (chart-review-only).
    // Returning null surfaces as a 400 in the route, which the UI handles.
    const [m] = await db.select({
      membershipId: schema.clinicMemberships.id,
      title: schema.users.title,
      clinicalRole: schema.clinicMemberships.clinicalRole,
    })
      .from(schema.clinicMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.clinicMemberships.userId))
      .where(and(
        eq(schema.clinicMemberships.userId, physicianUserId),
        eq(schema.clinicMemberships.clinicId, clinicId),
        eq(schema.clinicMemberships.isActive, true),
      )).limit(1);
    if (!m) return null;
    if (m.clinicalRole !== 'provider' && m.clinicalRole !== 'external_reviewer') return null;
    if (!ALLOWED_COLLAB_TITLES.has(normalizeTitle(m.title))) return null;
  }
  const [row] = await db.insert(schema.chartReviewCollaborators).values({
    agreementId, physicianUserId, role,
  }).returning();
  return row;
};

(DbStorage.prototype as any).removeChartReviewCollaborator = async function(
  id: number, agreementId: number, clinicId?: number,
): Promise<boolean> {
  if (clinicId != null) {
    const [agr] = await db.select({ id: schema.chartReviewAgreements.id })
      .from(schema.chartReviewAgreements)
      .where(and(
        eq(schema.chartReviewAgreements.id, agreementId),
        eq(schema.chartReviewAgreements.clinicId, clinicId),
      )).limit(1);
    if (!agr) return false;
  }
  const r = await db.delete(schema.chartReviewCollaborators).where(and(
    eq(schema.chartReviewCollaborators.id, id),
    eq(schema.chartReviewCollaborators.agreementId, agreementId),
  ));
  return (r.rowCount ?? 0) > 0;
};

(DbStorage.prototype as any).listChartReviewAgreementsForUser = async function(
  userId: number, clinicId: number,
): Promise<Array<schema.ChartReviewAgreement & { role: 'midlevel' | 'physician'; collaboratorRole?: 'primary' | 'backup' }>> {
  // Mid-level rows
  const asMidLevel = await db.select().from(schema.chartReviewAgreements).where(and(
    eq(schema.chartReviewAgreements.midLevelUserId, userId),
    eq(schema.chartReviewAgreements.clinicId, clinicId),
    eq(schema.chartReviewAgreements.active, true),
  ));
  // Physician rows (via collaborators join)
  const asPhysician = await db
    .select({ agreement: schema.chartReviewAgreements, collaboratorRole: schema.chartReviewCollaborators.role })
    .from(schema.chartReviewCollaborators)
    .innerJoin(schema.chartReviewAgreements, eq(schema.chartReviewAgreements.id, schema.chartReviewCollaborators.agreementId))
    .where(and(
      eq(schema.chartReviewCollaborators.physicianUserId, userId),
      eq(schema.chartReviewAgreements.clinicId, clinicId),
      eq(schema.chartReviewAgreements.active, true),
    ));
  const out: Array<schema.ChartReviewAgreement & { role: 'midlevel' | 'physician'; collaboratorRole?: 'primary' | 'backup' }> = [];
  for (const a of asMidLevel) out.push({ ...a, role: 'midlevel' });
  for (const r of asPhysician) out.push({ ...r.agreement, role: 'physician', collaboratorRole: r.collaboratorRole as 'primary' | 'backup' });
  return out;
};

(DbStorage.prototype as any).listMidLevelsForPhysician = async function(
  physicianUserId: number, clinicId: number,
) {
  const rows = await db
    .select({
      agreement: schema.chartReviewAgreements,
      collaboratorRole: schema.chartReviewCollaborators.role,
      midLevel: {
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        title: schema.users.title,
      },
    })
    .from(schema.chartReviewCollaborators)
    .innerJoin(schema.chartReviewAgreements, eq(schema.chartReviewAgreements.id, schema.chartReviewCollaborators.agreementId))
    .innerJoin(schema.users, eq(schema.users.id, schema.chartReviewAgreements.midLevelUserId))
    .where(and(
      eq(schema.chartReviewCollaborators.physicianUserId, physicianUserId),
      eq(schema.chartReviewAgreements.clinicId, clinicId),
      eq(schema.chartReviewAgreements.active, true),
    ));

  const now = new Date();
  if (rows.length === 0) return [];
  // Single batched fetch of all items for the agreements in scope, scoped to
  // each agreement's current quota period. Avoids N+1 against chart_review_items.
  const agreementIds = rows.map((r) => r.agreement.id);
  const periodKeyByAgreement = new Map<number, string>();
  for (const r of rows) {
    periodKeyByAgreement.set(
      r.agreement.id,
      computeQuotaPeriodKey(now, r.agreement.quotaPeriod as 'month' | 'quarter' | 'year'),
    );
  }
  const allItems = await db.select().from(schema.chartReviewItems).where(
    inArray(schema.chartReviewItems.agreementId, agreementIds),
  );
  const itemsByAgreement = new Map<number, typeof allItems>();
  for (const it of allItems) {
    if (it.quotaPeriodKey !== periodKeyByAgreement.get(it.agreementId)) continue;
    const arr = itemsByAgreement.get(it.agreementId) ?? [];
    arr.push(it);
    itemsByAgreement.set(it.agreementId, arr);
  }
  const out: any[] = [];
  for (const r of rows) {
    const items = itemsByAgreement.get(r.agreement.id) ?? [];
    const total = items.length;
    const completed = items.filter((i) => i.status === 'concurred' || i.status === 'amended_concurred').length;
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'amended_pending').length;
    let pastDue = 0;
    let maxDays = 0;
    for (const i of items) {
      if ((i.status === 'pending' || i.status === 'amended_pending') && i.enforcementDueAt) {
        const d = daysPastDue(now, new Date(i.enforcementDueAt));
        if (d > 0) {
          pastDue++;
          if (d > maxDays) maxDays = d;
        }
      }
    }
    const periodPctComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
    out.push({
      agreement: r.agreement,
      midLevel: r.midLevel,
      role: r.collaboratorRole,
      periodPctComplete,
      pendingCount: pending,
      pastDueCount: pastDue,
      maxDaysPastDue: maxDays,
    });
  }
  return out;
};

(DbStorage.prototype as any).listChartReviewItemsForAgreement = async function(
  agreementId: number, opts?: { status?: string; limit?: number; clinicId?: number },
) {
  // Defense-in-depth: if a clinicId is supplied, verify the agreement belongs
  // to that clinic before returning anything.
  if (opts?.clinicId != null) {
    const [agr] = await db.select({ id: schema.chartReviewAgreements.id })
      .from(schema.chartReviewAgreements)
      .where(and(
        eq(schema.chartReviewAgreements.id, agreementId),
        eq(schema.chartReviewAgreements.clinicId, opts.clinicId),
      )).limit(1);
    if (!agr) return [];
  }
  const conds = [eq(schema.chartReviewItems.agreementId, agreementId)];
  if (opts?.clinicId != null) conds.push(eq(schema.chartReviewItems.clinicId, opts.clinicId));
  if (opts?.status) conds.push(eq(schema.chartReviewItems.status, opts.status));
  const rows = await db
    .select({
      item: schema.chartReviewItems,
      patient: { firstName: schema.patients.firstName, lastName: schema.patients.lastName },
      enc: { visitDate: schema.clinicalEncounters.visitDate, chiefComplaint: schema.clinicalEncounters.chiefComplaint },
    })
    .from(schema.chartReviewItems)
    .leftJoin(schema.patients, eq(schema.patients.id, schema.chartReviewItems.patientId))
    .leftJoin(schema.clinicalEncounters, eq(schema.clinicalEncounters.id, schema.chartReviewItems.encounterId))
    .where(and(...conds))
    .orderBy(desc(schema.chartReviewItems.signedAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    ...r.item,
    patientName: `${r.patient?.firstName ?? ""} ${r.patient?.lastName ?? ""}`.trim() || "Unknown patient",
    encounterVisitDate: r.enc?.visitDate as Date,
    encounterChiefComplaint: r.enc?.chiefComplaint as string | null,
  }));
};

(DbStorage.prototype as any).getChartReviewItem = async function(
  id: number, clinicId: number,
): Promise<schema.ChartReviewItem | undefined> {
  const [row] = await db.select().from(schema.chartReviewItems).where(and(
    eq(schema.chartReviewItems.id, id),
    eq(schema.chartReviewItems.clinicId, clinicId),
  )).limit(1);
  return row;
};

(DbStorage.prototype as any).listChartReviewComments = async function(
  itemId: number, clinicId: number,
): Promise<schema.ChartReviewComment[]> {
  // Verify the item belongs to the caller's clinic before returning comments.
  const [item] = await db.select({ id: schema.chartReviewItems.id })
    .from(schema.chartReviewItems)
    .where(and(
      eq(schema.chartReviewItems.id, itemId),
      eq(schema.chartReviewItems.clinicId, clinicId),
    )).limit(1);
  if (!item) return [];
  return await db.select().from(schema.chartReviewComments).where(
    eq(schema.chartReviewComments.itemId, itemId),
  ).orderBy(schema.chartReviewComments.createdAt);
};

(DbStorage.prototype as any).addChartReviewComment = async function(
  data: schema.InsertChartReviewComment, clinicId: number,
): Promise<schema.ChartReviewComment | null> {
  // Defense-in-depth: verify the parent item belongs to the caller's clinic.
  const [item] = await db.select({ id: schema.chartReviewItems.id })
    .from(schema.chartReviewItems)
    .where(and(
      eq(schema.chartReviewItems.id, data.itemId),
      eq(schema.chartReviewItems.clinicId, clinicId),
    )).limit(1);
  if (!item) return null;
  const [row] = await db.insert(schema.chartReviewComments).values(data).returning();
  return row;
};

(DbStorage.prototype as any).concurChartReviewItem = async function(
  id: number, clinicId: number, physicianUserId: number, comment?: string,
): Promise<schema.ChartReviewItem | undefined> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.chartReviewItems).where(and(
      eq(schema.chartReviewItems.id, id),
      eq(schema.chartReviewItems.clinicId, clinicId),
    )).limit(1);
    if (!existing) return undefined;
    // If reassigned (i.e. previously rejected), only the assigned reviewer
    // may concur (per user requirement #3).
    if (existing.assignedReviewerUserId && existing.assignedReviewerUserId !== physicianUserId) {
      return undefined;
    }
    const isAmendmentFlow = existing.status === 'amended_pending';
    // Race-safe conditional update: only flip status if it's still in a
    // pending state. If two physicians click Concur at once, the second
    // update returns no row and we exit cleanly.
    const expectedStatus = isAmendmentFlow ? 'amended_pending' : 'pending';
    const reviewedAt = new Date();
    const [updated] = await tx.update(schema.chartReviewItems).set({
      status: isAmendmentFlow ? 'amended_concurred' : 'concurred',
      reviewedByUserId: physicianUserId,
      reviewedAt,
      updatedAt: reviewedAt,
    }).where(and(
      eq(schema.chartReviewItems.id, id),
      eq(schema.chartReviewItems.clinicId, clinicId),
      eq(schema.chartReviewItems.status, expectedStatus),
    )).returning();
    if (!updated) return undefined;
    if (comment && comment.trim()) {
      await tx.insert(schema.chartReviewComments).values({
        itemId: id,
        authorUserId: physicianUserId,
        authorRole: 'physician',
        body: comment.trim(),
        type: 'concur_note',
      });
    }

    // ── Slice 2 prospective gate finalization ────────────────────────────
    // If the encounter is parked awaiting this physician's concurrence,
    // finalize the sign here: stamp signedAt = reviewedAt, append a version
    // snapshot, clear the pending flag. signedBy was stashed on the
    // encounter at sign-attempt time so we don't have to recompute it.
    const [encounter] = await tx.select().from(schema.clinicalEncounters).where(and(
      eq(schema.clinicalEncounters.id, existing.encounterId),
      eq(schema.clinicalEncounters.clinicId, clinicId),
    )).limit(1);
    if (encounter && encounter.pendingCollabReview && !encounter.signedAt) {
      const existingVersions = (encounter.encounterVersions as any[] | null) ?? [];
      const newVersion = {
        version: existingVersions.length + 1,
        soapNote: encounter.soapNote,
        signedAt: reviewedAt.toISOString(),
        signedBy: encounter.signedBy ?? "(prospective concur)",
        action: "initial_sign",
        prospectiveConcurredBy: physicianUserId,
      };
      await tx.update(schema.clinicalEncounters).set({
        signedAt: reviewedAt,
        pendingCollabReview: false,
        // lockedAt stays — chart is now signed and locked normally.
        encounterVersions: [...existingVersions, newVersion],
        updatedAt: reviewedAt,
      }).where(and(
        eq(schema.clinicalEncounters.id, existing.encounterId),
        eq(schema.clinicalEncounters.clinicId, clinicId),
      ));
    }

    return updated;
  });
};

(DbStorage.prototype as any).rejectChartReviewItem = async function(
  id: number, clinicId: number, physicianUserId: number, reason: string,
): Promise<schema.ChartReviewItem | undefined> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.chartReviewItems).where(and(
      eq(schema.chartReviewItems.id, id),
      eq(schema.chartReviewItems.clinicId, clinicId),
    )).limit(1);
    if (!existing) return undefined;
    if (existing.assignedReviewerUserId && existing.assignedReviewerUserId !== physicianUserId) {
      return undefined;
    }
    // Conditional update: only reject if still pending (initial or amendment).
    // Prevents two physicians double-rejecting.
    const [updated] = await tx.update(schema.chartReviewItems).set({
      status: 'rejected',
      assignedReviewerUserId: physicianUserId, // lock re-review to this physician
      reviewedByUserId: physicianUserId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(schema.chartReviewItems.id, id),
      eq(schema.chartReviewItems.clinicId, clinicId),
      or(
        eq(schema.chartReviewItems.status, 'pending'),
        eq(schema.chartReviewItems.status, 'amended_pending'),
      ),
    )).returning();
    if (!updated) return undefined;
    await tx.insert(schema.chartReviewComments).values({
      itemId: id,
      authorUserId: physicianUserId,
      authorRole: 'physician',
      body: reason.trim() || "(no reason provided)",
      type: 'rejection_reason',
    });

    // ── Slice 2 prospective gate: rejection unlocks the chart ────────────
    // If the encounter was parked awaiting this physician's concurrence,
    // clear the pending flag and the lock so the mid-level can edit and
    // re-submit. signedAt was never set, so nothing to clear there.
    const [encounter] = await tx.select().from(schema.clinicalEncounters).where(and(
      eq(schema.clinicalEncounters.id, existing.encounterId),
      eq(schema.clinicalEncounters.clinicId, clinicId),
    )).limit(1);
    if (encounter && encounter.pendingCollabReview) {
      await tx.update(schema.clinicalEncounters).set({
        pendingCollabReview: false,
        lockedAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(schema.clinicalEncounters.id, existing.encounterId),
        eq(schema.clinicalEncounters.clinicId, clinicId),
      ));
    }

    return updated;
  });
};

async function _resolveMandatoryReasons(
  encounterId: number, midLevelUserId: number, agreement: schema.ChartReviewAgreement,
): Promise<string[]> {
  const [encounter] = await db.select().from(schema.clinicalEncounters).where(and(
    eq(schema.clinicalEncounters.id, encounterId),
    eq(schema.clinicalEncounters.clinicId, agreement.clinicId),
  )).limit(1);
  if (!encounter) return [];
  const reasons: string[] = [];
  if (agreement.ruleControlledSubstance) {
    const cs = detectControlledSubstances(encounter);
    for (const c of cs) reasons.push(`controlled_substance:${c}`);
  }
  if (agreement.ruleNewDiagnosis) {
    // Scope priors to (clinicId, clinicianId, patientId) so we never leak
    // diagnoses from other tenants and so a mid-level's "new dx" is judged
    // only against their own patient history. Exclude the current encounter.
    const priorRows = await db.select({
      id: schema.clinicalEncounters.id,
      clinicalExtraction: schema.clinicalEncounters.clinicalExtraction,
    }).from(schema.clinicalEncounters).where(and(
      eq(schema.clinicalEncounters.clinicId, agreement.clinicId),
      eq(schema.clinicalEncounters.clinicianId, midLevelUserId),
      eq(schema.clinicalEncounters.patientId, encounter.patientId),
      ne(schema.clinicalEncounters.id, encounterId),
    ));
    const newDx = detectNewDiagnoses(encounter, priorRows);
    for (const d of newDx) reasons.push(`new_diagnosis:${d}`);
  }
  return reasons;
}

(DbStorage.prototype as any).enqueueChartForReviewIfApplicable = async function(opts: {
  encounterId: number;
  midLevelUserId: number;
  clinicId: number;
  sendForReview: boolean;
}): Promise<schema.ChartReviewItem | null> {
  const agreement = await (this as any).getChartReviewAgreementForMidLevel(opts.midLevelUserId, opts.clinicId);
  if (!agreement) return null;

  // Don't double-queue if an item already exists for this encounter (scoped
  // to clinic for defense-in-depth, since encounter ids are unique anyway).
  const [existing] = await db.select().from(schema.chartReviewItems).where(and(
    eq(schema.chartReviewItems.encounterId, opts.encounterId),
    eq(schema.chartReviewItems.clinicId, opts.clinicId),
  )).limit(1);
  if (existing) return existing;

  const reasons = await _resolveMandatoryReasons(opts.encounterId, opts.midLevelUserId, agreement);
  const isMandatory = reasons.length > 0;
  if (!isMandatory && !opts.sendForReview) return null;

  // Scope encounter lookup by clinicId AND clinicianId — same defense-in-depth
  // as flagChartForReview so we never queue an encounter from another tenant.
  const [encounter] = await db.select().from(schema.clinicalEncounters).where(and(
    eq(schema.clinicalEncounters.id, opts.encounterId),
    eq(schema.clinicalEncounters.clinicId, opts.clinicId),
    eq(schema.clinicalEncounters.clinicianId, opts.midLevelUserId),
  )).limit(1);
  if (!encounter || !encounter.signedAt) return null;

  const signedAt = new Date(encounter.signedAt);
  const quotaPeriodKey = computeQuotaPeriodKey(signedAt, agreement.quotaPeriod as 'month' | 'quarter' | 'year');
  const enforcementDueAt = computeEnforcementDueAt(signedAt, agreement.enforcementPeriod as 'month' | 'quarter' | 'year');

  // Race-safe insert: unique index on (clinic_id, encounter_id) blocks duplicates
  // when sign-hook + manual flag fire concurrently or when sign is retried.
  const [created] = await db.insert(schema.chartReviewItems).values({
    agreementId: agreement.id,
    clinicId: opts.clinicId,
    encounterId: opts.encounterId,
    patientId: encounter.patientId,
    midLevelUserId: opts.midLevelUserId,
    status: 'pending',
    priority: isMandatory ? 'mandatory' : 'sample',
    mandatoryReasons: isMandatory ? reasons : null,
    signedAt,
    quotaPeriodKey,
    enforcementDueAt,
  }).onConflictDoNothing({ target: [schema.chartReviewItems.clinicId, schema.chartReviewItems.encounterId] }).returning();
  if (created) return created;
  const [raced] = await db.select().from(schema.chartReviewItems).where(and(
    eq(schema.chartReviewItems.encounterId, opts.encounterId),
    eq(schema.chartReviewItems.clinicId, opts.clinicId),
  )).limit(1);
  return raced ?? null;
};

(DbStorage.prototype as any).flagChartForReview = async function(opts: {
  encounterId: number;
  midLevelUserId: number;
  clinicId: number;
}): Promise<schema.ChartReviewItem | null> {
  const agreement = await (this as any).getChartReviewAgreementForMidLevel(opts.midLevelUserId, opts.clinicId);
  if (!agreement) return null;

  // Idempotent: if already queued, return existing row.
  const [existing] = await db.select().from(schema.chartReviewItems).where(and(
    eq(schema.chartReviewItems.encounterId, opts.encounterId),
    eq(schema.chartReviewItems.clinicId, opts.clinicId),
  )).limit(1);
  if (existing) return existing;

  // Verify the encounter belongs to this mid-level AND this clinic and is signed.
  // Scoping by clinicId is required to prevent a clinician with encounters in
  // multiple clinics from flagging an external encounter into the current clinic.
  const [encounter] = await db.select().from(schema.clinicalEncounters).where(and(
    eq(schema.clinicalEncounters.id, opts.encounterId),
    eq(schema.clinicalEncounters.clinicianId, opts.midLevelUserId),
    eq(schema.clinicalEncounters.clinicId, opts.clinicId),
  )).limit(1);
  if (!encounter || !encounter.signedAt) return null;

  const reasons = await _resolveMandatoryReasons(opts.encounterId, opts.midLevelUserId, agreement);
  const isMandatory = reasons.length > 0;
  const signedAt = new Date(encounter.signedAt);
  const quotaPeriodKey = computeQuotaPeriodKey(signedAt, agreement.quotaPeriod as 'month' | 'quarter' | 'year');
  const enforcementDueAt = computeEnforcementDueAt(signedAt, agreement.enforcementPeriod as 'month' | 'quarter' | 'year');

  // Race-safe insert: a unique index on (clinic_id, encounter_id) prevents
  // double-queue. If a concurrent sign-hook already inserted the row,
  // onConflictDoNothing returns no row — re-fetch the existing one.
  const [created] = await db.insert(schema.chartReviewItems).values({
    agreementId: agreement.id,
    clinicId: opts.clinicId,
    encounterId: opts.encounterId,
    patientId: encounter.patientId,
    midLevelUserId: opts.midLevelUserId,
    status: 'pending',
    priority: isMandatory ? 'mandatory' : 'midlevel_flag',
    mandatoryReasons: isMandatory ? reasons : null,
    signedAt,
    quotaPeriodKey,
    enforcementDueAt,
  }).onConflictDoNothing({ target: [schema.chartReviewItems.clinicId, schema.chartReviewItems.encounterId] }).returning();
  if (created) return created;
  const [raced] = await db.select().from(schema.chartReviewItems).where(and(
    eq(schema.chartReviewItems.encounterId, opts.encounterId),
    eq(schema.chartReviewItems.clinicId, opts.clinicId),
  )).limit(1);
  return raced ?? null;
};

(DbStorage.prototype as any).previewChartReviewFlags = async function(opts: {
  encounterId: number;
  midLevelUserId: number;
  clinicId: number;
}) {
  const agreement = await (this as any).getChartReviewAgreementForMidLevel(opts.midLevelUserId, opts.clinicId);
  if (!agreement) {
    return {
      hasAgreement: false,
      wouldBeMandatory: false,
      mandatoryReasons: [],
      runningPeriodPct: 0,
      quotaTargetPct: 0,
      quotaKind: 'percent' as 'percent' | 'count',
      runningPeriodCount: 0,
      quotaTargetCount: 0,
      quotaTargetReached: false,
      prospectiveGate: false,
      reviewType: 'retrospective' as 'retrospective' | 'prospective',
    };
  }
  const reasons = await _resolveMandatoryReasons(opts.encounterId, opts.midLevelUserId, agreement);
  // Approximation of "running pace" — count of this period's submissions
  // by this mid-level. Compute both percent and count so the dialog can
  // honor whichever quota kind the agreement uses.
  const now = new Date();
  const periodKey = computeQuotaPeriodKey(now, agreement.quotaPeriod as 'month' | 'quarter' | 'year');
  const submitted = await db.select({ id: schema.chartReviewItems.id }).from(schema.chartReviewItems).where(and(
    eq(schema.chartReviewItems.agreementId, agreement.id),
    eq(schema.chartReviewItems.quotaPeriodKey, periodKey),
  ));
  const runningPeriodCount = submitted.length;
  // Total signed encounters this period for this mid-level — denominator
  // for the percent calculation. Encounters parked for prospective review
  // (signedAt null but pendingCollabReview true) intentionally don't count
  // until they are concurred and signed.
  const all = await db.select({ id: schema.clinicalEncounters.id, signedAt: schema.clinicalEncounters.signedAt })
    .from(schema.clinicalEncounters)
    .where(and(
      eq(schema.clinicalEncounters.clinicianId, opts.midLevelUserId),
      eq(schema.clinicalEncounters.clinicId, opts.clinicId),
    ));
  const periodTotal = all.filter((e) => e.signedAt && computeQuotaPeriodKey(new Date(e.signedAt), agreement.quotaPeriod as any) === periodKey).length;
  const runningPeriodPct = periodTotal > 0 ? Math.round((runningPeriodCount / periodTotal) * 100) : 0;
  const quotaKind = (agreement.quotaKind ?? 'percent') as 'percent' | 'count';
  const quotaTargetPct = quotaKind === 'percent' ? agreement.quotaValue : 0;
  const quotaTargetCount = quotaKind === 'count' ? agreement.quotaValue : 0;
  // "Have I already met my voluntary quota?" — used by the sign dialog to
  // suppress the "Send for review?" prompt when the answer is yes. Mandatory
  // reviews still queue regardless.
  const quotaTargetReached = quotaKind === 'percent'
    ? (quotaTargetPct > 0 && runningPeriodPct >= quotaTargetPct)
    : (quotaTargetCount > 0 && runningPeriodCount >= quotaTargetCount);
  const reviewType = (agreement.reviewType ?? 'retrospective') as 'retrospective' | 'prospective';
  // Prospective gate fires on mandatory charts under a prospective agreement;
  // voluntary submissions still flow through the standard sign-then-queue path.
  const prospectiveGate = reviewType === 'prospective' && reasons.length > 0;
  return {
    hasAgreement: true,
    wouldBeMandatory: reasons.length > 0,
    mandatoryReasons: reasons,
    runningPeriodPct,
    quotaTargetPct,
    quotaKind,
    runningPeriodCount,
    quotaTargetCount,
    quotaTargetReached,
    prospectiveGate,
    reviewType,
  };
};

// Used by the sign route: should this sign attempt be parked for prospective
// physician review instead of finalized? Returns the agreement + the mandatory
// reasons so the route can persist them on the chart_review_item.
(DbStorage.prototype as any).getProspectiveGateState = async function(opts: {
  encounterId: number;
  midLevelUserId: number;
  clinicId: number;
}): Promise<{ shouldGate: boolean; agreement: schema.ChartReviewAgreement | null; reasons: string[] }> {
  const agreement = await (this as any).getChartReviewAgreementForMidLevel(opts.midLevelUserId, opts.clinicId);
  if (!agreement || agreement.reviewType !== 'prospective') {
    return { shouldGate: false, agreement: agreement ?? null, reasons: [] };
  }
  const reasons = await _resolveMandatoryReasons(opts.encounterId, opts.midLevelUserId, agreement);
  return { shouldGate: reasons.length > 0, agreement, reasons };
};

// Variant of enqueue used by the prospective gate. Unlike the standard
// enqueue (which is called *after* a successful sign and uses the
// encounter.signedAt as the submission timestamp), this one is called
// before the encounter is signed, so it uses `now` as the submission time
// for quota tracking. It also reopens an existing rejected item so the
// edit-and-resubmit cycle uses one chart_review_items row per encounter.
(DbStorage.prototype as any).submitProspectiveChartForReview = async function(opts: {
  encounterId: number;
  midLevelUserId: number;
  clinicId: number;
  agreement: schema.ChartReviewAgreement;
  reasons: string[];
  // Slice 2: when supplied, the encounter is atomically parked (locked +
  // pendingCollabReview) inside the same transaction as the queue insert.
  // signedBy is stashed on the encounter so the physician's concur step
  // can finalize the sign without recomputing the mid-level's identity.
  parkEncounter?: { signedBy: string };
}): Promise<{
  item: schema.ChartReviewItem | null;
  encounter: schema.ClinicalEncounter | null;
}> {
  const now = new Date();
  const quotaPeriodKey = computeQuotaPeriodKey(now, opts.agreement.quotaPeriod as 'month' | 'quarter' | 'year');
  const enforcementDueAt = computeEnforcementDueAt(now, opts.agreement.enforcementPeriod as 'month' | 'quarter' | 'year');

  // ── Atomic park-and-queue ──────────────────────────────────────────────
  // Wrap encounter parking + queue row write in one transaction so the
  // encounter can never be left locked-pending without a queue item (or
  // vice versa). On rollback, both side-effects unwind together.
  return await db.transaction(async (tx) => {
    // Verify encounter ownership / clinic scope under the same tx.
    const [encounter] = await tx.select().from(schema.clinicalEncounters).where(and(
      eq(schema.clinicalEncounters.id, opts.encounterId),
      eq(schema.clinicalEncounters.clinicId, opts.clinicId),
      eq(schema.clinicalEncounters.clinicianId, opts.midLevelUserId),
    )).limit(1);
    if (!encounter) return { item: null, encounter: null };

    // Park the encounter atomically (only if caller asked us to). We
    // intentionally do this BEFORE the queue insert: if the queue write
    // fails (e.g. unexpected DB error), the lock is rolled back too.
    let parkedEncounter: schema.ClinicalEncounter = encounter;
    if (opts.parkEncounter) {
      const [updated] = await tx.update(schema.clinicalEncounters).set({
        lockedAt: now,
        pendingCollabReview: true,
        signedBy: opts.parkEncounter.signedBy,
        updatedAt: now,
      }).where(and(
        eq(schema.clinicalEncounters.id, opts.encounterId),
        eq(schema.clinicalEncounters.clinicId, opts.clinicId),
      )).returning();
      if (!updated) return { item: null, encounter: null };
      parkedEncounter = updated;
    }

    // If there's already a row for this encounter (e.g. rejected last time),
    // reopen it instead of trying to insert and hitting the unique index.
    const [existing] = await tx.select().from(schema.chartReviewItems).where(and(
      eq(schema.chartReviewItems.encounterId, opts.encounterId),
      eq(schema.chartReviewItems.clinicId, opts.clinicId),
    )).limit(1);

    if (existing) {
      if (existing.status === 'rejected') {
        const [reopened] = await tx.update(schema.chartReviewItems).set({
          status: 'pending',
          priority: 'mandatory',
          mandatoryReasons: opts.reasons,
          signedAt: now,                 // re-submission time for quota tracking
          quotaPeriodKey,
          enforcementDueAt,
          reviewedAt: null,
          reviewedByUserId: null,
          // assignedReviewerUserId intentionally retained — same physician
          // who rejected it sees the rework.
          updatedAt: now,
        }).where(eq(schema.chartReviewItems.id, existing.id)).returning();
        return { item: reopened ?? existing, encounter: parkedEncounter };
      }
      return { item: existing, encounter: parkedEncounter };
    }

    const [created] = await tx.insert(schema.chartReviewItems).values({
      agreementId: opts.agreement.id,
      clinicId: opts.clinicId,
      encounterId: opts.encounterId,
      patientId: parkedEncounter.patientId,
      midLevelUserId: opts.midLevelUserId,
      status: 'pending',
      priority: 'mandatory',
      mandatoryReasons: opts.reasons,
      signedAt: now,
      quotaPeriodKey,
      enforcementDueAt,
    }).onConflictDoNothing({ target: [schema.chartReviewItems.clinicId, schema.chartReviewItems.encounterId] }).returning();
    if (created) return { item: created, encounter: parkedEncounter };

    const [raced] = await tx.select().from(schema.chartReviewItems).where(and(
      eq(schema.chartReviewItems.encounterId, opts.encounterId),
      eq(schema.chartReviewItems.clinicId, opts.clinicId),
    )).limit(1);
    return { item: raced ?? null, encounter: parkedEncounter };
  });
};

// ── Clinic Spruce settings ────────────────────────────────────────────────────

(DbStorage.prototype as any).getClinicSpruceSettings = async function(
  clinicId: number,
): Promise<schema.ClinicSpruceSettings | null> {
  const [row] = await db
    .select()
    .from(schema.clinicSpruceSettings)
    .where(eq(schema.clinicSpruceSettings.clinicId, clinicId));
  return row ?? null;
};

(DbStorage.prototype as any).upsertClinicSpruceSettings = async function(
  clinicId: number,
  data: Partial<Pick<schema.ClinicSpruceSettings,
    "isEnabled" | "spruceAutoReplyEnabled" | "spruceJuneAcknowledgmentsEnabled"
    | "generalMessageAcknowledgmentEnabled"
    | "spruceOrgId" | "spruceWebhookEndpointId"
    | "spruceReceivingPhone" | "webhookSecretEncrypted" | "apiTokenEncrypted"
  >>,
): Promise<schema.ClinicSpruceSettings> {
  const now = new Date();
  const [row] = await db
    .insert(schema.clinicSpruceSettings)
    .values({ ...data, clinicId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.clinicSpruceSettings.clinicId,
      set: { ...data, updatedAt: now },
    })
    .returning();
  return row;
};

// ── Spruce routing ────────────────────────────────────────────────────────────

(DbStorage.prototype as any).getSpruceRoutingRulesByClinic = async function(
  clinicId: number,
): Promise<schema.SpruceRoutingRule[]> {
  return db
    .select()
    .from(schema.spruceRoutingRules)
    .where(eq(schema.spruceRoutingRules.clinicId, clinicId))
    .orderBy(desc(schema.spruceRoutingRules.createdAt));
};

// Routing priority for inbound Spruce events:
//   1. clinicSpruceSettings.spruceReceivingPhone — E.164 phone number saved per
//      clinic during setup; primary match for shared-org multi-location setups.
//   2. spruceRoutingRules.toPhoneNumber — legacy / admin-managed explicit rules.
//   3. spruceRoutingRules.sprucePhoneLineId — opaque Spruce line ID (fallback).
//   4. spruceRoutingRules.spruceTeamId — team ID (last resort).
//
// All active rules are loaded in a single query; the in-memory scan is fast
// because the table remains small (one row per Spruce line, typically < 50).
// ── findPatientByPhoneForClinic ───────────────────────────────────────────────
// Searches for a ClinIQ patient within a single clinic using the caller's phone
// number.  Phone normalisation: strip all non-digits, then match on last-10.
// This handles "+1 (555) 123-4567", "5551234567", "+15551234567" equally.
//
// Safety guarantees:
//   • Strictly clinic_id scoped — will NEVER match across other tenants.
//   • Returns null (not an error) when no match is found.
//   • If the normalised number is < 7 digits, returns null rather than guessing.
(DbStorage.prototype as any).findPatientByPhoneForClinic = async function(
  phone: string,
  clinicId: number,
): Promise<{ id: number; firstName: string; lastName: string } | null> {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const last10 = digits.slice(-10);
  const result = await db
    .select({
      id: schema.patients.id,
      firstName: schema.patients.firstName,
      lastName: schema.patients.lastName,
    })
    .from(schema.patients)
    .where(and(
      eq(schema.patients.clinicId, clinicId),
      sql`regexp_replace(coalesce(${schema.patients.phone}, ''), '\\D', '', 'g') LIKE ${'%' + last10}`,
    ))
    .limit(1);
  return result[0] ?? null;
};

(DbStorage.prototype as any).findSpruceClinicId = async function(
  phoneLineId?: string | null,
  teamId?: string | null,
  toPhone?: string | null,
): Promise<number | null> {
  // 1. Match against spruceReceivingPhone stored directly on clinic settings.
  //    This is the primary routing mechanism for shared-org multi-location setups.
  if (toPhone) {
    const settingsMatch = await db
      .select({ clinicId: schema.clinicSpruceSettings.clinicId })
      .from(schema.clinicSpruceSettings)
      .where(
        and(
          eq(schema.clinicSpruceSettings.spruceReceivingPhone, toPhone),
          eq(schema.clinicSpruceSettings.isEnabled, true),
        ),
      )
      .limit(1);
    if (settingsMatch.length > 0) return settingsMatch[0].clinicId;
  }

  // 2-4. Fall back to explicit routing rules table.
  const rules = await db
    .select()
    .from(schema.spruceRoutingRules)
    .where(eq(schema.spruceRoutingRules.isActive, true));

  if (toPhone) {
    const match = rules.find((r) => r.toPhoneNumber === toPhone);
    if (match) return match.clinicId;
  }
  if (phoneLineId) {
    const match = rules.find((r) => r.sprucePhoneLineId === phoneLineId);
    if (match) return match.clinicId;
  }
  if (teamId) {
    const match = rules.find((r) => r.spruceTeamId === teamId);
    if (match) return match.clinicId;
  }
  return null;
};

// Deduplication: check whether a Spruce event has already been stored for a
// clinic by its dedupe key ("<eventType>:<spruceObjectId>").
(DbStorage.prototype as any).findSpruceMessageByDedupeKey = async function(
  clinicId: number,
  dedupeKey: string,
): Promise<schema.SpruceMessage | null> {
  const [row] = await db
    .select()
    .from(schema.spruceMessages)
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        eq(schema.spruceMessages.spruceEventDedupeKey, dedupeKey),
      ),
    )
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).findSpruceOutboundByDeliveryId = async function(
  clinicId: number,
  spruceDeliveryId: string,
): Promise<schema.SpruceOutboundMessage | null> {
  const [row] = await db
    .select()
    .from(schema.spruceOutboundMessages)
    .where(
      and(
        eq(schema.spruceOutboundMessages.clinicId, clinicId),
        eq(schema.spruceOutboundMessages.spruceDeliveryId, spruceDeliveryId),
      ),
    )
    .limit(1);
  return row ?? null;
};

// ── findSpruceEchoMirrorByConvAndBody ────────────────────────────────────
// Race-condition-safe echo suppression fallback.
// The mirror spruce_messages row (rawPayload->>'source' = 'cliniq') is
// always written BEFORE the outgoing Spruce API call, so it is guaranteed
// to exist by the time the echo webhook arrives — unlike the delivery-ID
// stamp which is set AFTER the API response and can lose the race.
(DbStorage.prototype as any).findSpruceEchoMirrorByConvAndBody = async function(
  clinicId: number,
  spruceConversationId: string,
  messageBody: string,
): Promise<schema.SpruceMessage | null> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5-minute window
  const [row] = await db
    .select()
    .from(schema.spruceMessages)
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        eq(schema.spruceMessages.spruceConversationId, spruceConversationId),
        eq(schema.spruceMessages.messageBody as any, messageBody),
        eq(schema.spruceMessages.messageDirection as any, "outbound_staff"),
        sql`${schema.spruceMessages.rawPayload}->>'source' = 'cliniq'`,
        sql`${schema.spruceMessages.receivedAt} >= ${cutoff}`,
      ),
    )
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).createSpruceRoutingRule = async function(
  data: schema.InsertSpruceRoutingRule & { clinicId: number },
): Promise<schema.SpruceRoutingRule> {
  const [row] = await db.insert(schema.spruceRoutingRules).values(data).returning();
  return row;
};

(DbStorage.prototype as any).updateSpruceRoutingRule = async function(
  id: number,
  data: Partial<schema.InsertSpruceRoutingRule>,
): Promise<schema.SpruceRoutingRule | undefined> {
  const [row] = await db
    .update(schema.spruceRoutingRules)
    .set(data)
    .where(eq(schema.spruceRoutingRules.id, id))
    .returning();
  return row;
};

(DbStorage.prototype as any).deleteSpruceRoutingRule = async function(
  id: number,
): Promise<void> {
  await db.delete(schema.spruceRoutingRules).where(eq(schema.spruceRoutingRules.id, id));
};

(DbStorage.prototype as any).createSpruceUnroutedEvent = async function(
  data: schema.InsertSpruceUnroutedEvent,
): Promise<schema.SpruceUnroutedEvent> {
  const [row] = await db.insert(schema.spruceUnroutedEvents).values(data).returning();
  return row;
};

(DbStorage.prototype as any).listSpruceUnroutedEvents = async function(
  opts?: { limit?: number; unreviewedOnly?: boolean },
): Promise<schema.SpruceUnroutedEvent[]> {
  const conditions = [];
  if (opts?.unreviewedOnly) {
    conditions.push(isNull(schema.spruceUnroutedEvents.reviewedAt));
  }
  return db
    .select()
    .from(schema.spruceUnroutedEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.spruceUnroutedEvents.receivedAt))
    .limit(opts?.limit ?? 100);
};

(DbStorage.prototype as any).markSpruceUnroutedEventReviewed = async function(
  id: number,
  userId: number,
): Promise<void> {
  await db
    .update(schema.spruceUnroutedEvents)
    .set({ reviewedAt: new Date(), reviewedByUserId: userId })
    .where(eq(schema.spruceUnroutedEvents.id, id));
};

// ── Spruce message + workflow request persistence ─────────────────────────

(DbStorage.prototype as any).createSpruceMessage = async function(
  data: schema.InsertSpruceMessage,
): Promise<schema.SpruceMessage> {
  const [row] = await db.insert(schema.spruceMessages).values(data).returning();
  return row;
};

(DbStorage.prototype as any).createSpruceWorkflowRequest = async function(
  data: schema.InsertSpruceWorkflowRequest,
): Promise<schema.SpruceWorkflowRequest> {
  const [row] = await db.insert(schema.spruceWorkflowRequests).values(data).returning();
  return row;
};

(DbStorage.prototype as any).getPendingSpruceWorkflowRequests = async function(
  clinicId: number,
): Promise<(schema.SpruceWorkflowRequest & { patientFirstName: string | null; patientLastName: string | null })[]> {
  return db
    .select({
      // All columns from spruceWorkflowRequests
      id: schema.spruceWorkflowRequests.id,
      clinicId: schema.spruceWorkflowRequests.clinicId,
      spruceMessageId: schema.spruceWorkflowRequests.spruceMessageId,
      patientId: schema.spruceWorkflowRequests.patientId,
      workflow: schema.spruceWorkflowRequests.workflow,
      status: schema.spruceWorkflowRequests.status,
      patientPhone: schema.spruceWorkflowRequests.patientPhone,
      patientNameExtracted: schema.spruceWorkflowRequests.patientNameExtracted,
      requestSummary: schema.spruceWorkflowRequests.requestSummary,
      spruceConversationUrl: schema.spruceWorkflowRequests.spruceConversationUrl,
      resolvedAt: schema.spruceWorkflowRequests.resolvedAt,
      resolvedByUserId: schema.spruceWorkflowRequests.resolvedByUserId,
      createdAt: schema.spruceWorkflowRequests.createdAt,
      // Joined patient name columns (null when no patient match)
      patientFirstName: schema.patients.firstName,
      patientLastName: schema.patients.lastName,
    })
    .from(schema.spruceWorkflowRequests)
    .leftJoin(schema.patients, eq(schema.spruceWorkflowRequests.patientId, schema.patients.id))
    .where(
      and(
        eq(schema.spruceWorkflowRequests.clinicId, clinicId),
        eq(schema.spruceWorkflowRequests.status, "pending"),
      ),
    )
    .orderBy(desc(schema.spruceWorkflowRequests.createdAt));
};

// ── Spruce conversation inbox queries ─────────────────────────────────────
export interface SpruceConversationSummary {
  conversationKey: string;
  spruceConversationId: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  patientId: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  spruceContactName: string | null;
  lastMessage: string | null;
  lastMessageDirection: string | null;
  lastMessageAt: Date;
  messageCount: number;
  hasStaffReply: boolean;
  // True when there is a pending urgent_safety workflow request for this conversation.
  // Used by the inbox to show the "Urgent" folder — keeps it in sync with the
  // dashboard's urgent tile which reads from the same workflow requests table.
  hasOpenUrgentRequest: boolean;
  // Archive state (Phase 3)
  isArchived: boolean;
  archivedAt: Date | null;
  // Viewed / assigned tracking (Phase 4)
  staffLastViewedAt: Date | null;
  taggedClinicianId: number | null;
}

// ── ReplyContext ──────────────────────────────────────────────────────────
// Returned by GET /api/patients/:id/reply-context.
// Tells the chart composer which channels are available, what the active
// channel is, and whether the patient has a portal account.
export interface ReplyContext {
  availableChannels: Array<'portal' | 'spruce'>
  // The channel the composer should default to.
  // Derived from: primaryCommunicationChannel override → most recent inbound source → fallback
  activeChannel: 'portal' | 'spruce' | null
  hasPortalAccount: boolean
  hasSpruceConversation: boolean
  // Key of the most recently active Spruce conversation for this patient
  spruceConversationKey: string | null
  // null = patient has no explicit preference set (auto-derived)
  primaryCommunicationChannel: 'portal' | 'spruce' | null
}

// ── CommunicationTimelineItem ─────────────────────────────────────────────
// Normalized shape for the unified patient communication timeline, merging
// portal_messages (patient-visible + internal), spruce_messages (inbound),
// and spruce_outbound_messages.
export interface CommunicationTimelineItem {
  id: string                      // "portal:123" | "spruce_in:456" | "spruce_out:789" | "june_memo:101"
  source: 'portal' | 'spruce'
  direction: 'inbound' | 'outbound' | 'system'
  senderLabel: string             // "Patient" | "Staff" | "June AI"
  body: string | null             // null for non-text Spruce events
  timestamp: string               // ISO 8601
  conversationKey: string | null  // Spruce conversation key for Inbox deep-link
  patientId: number
  clinicianId: number | null      // set for portal messages
  userId: number | null           // set for Spruce outbound (sentByUserId)
  readAt: string | null           // portal inbound only
  sentByAI: boolean
  eventType: string | null        // Spruce eventType for non-text events; workflow name for june_memo
  spruceMessageId: string | null
  spruceConversationId: string | null
  spruceDeliveryId: string | null
  // ── Phase 2 fields ───────────────────────────────────────────────────────
  // 'message' | 'internal_note' | 'system_event' | 'june_memo' | 'workflow_note'
  messageType: string
  // 'patient_visible' | 'internal_only'
  visibility: string
  // null | 'portal' | 'spruce'
  deliveryChannel: string | null
  // IDs of mentioned staff users (for @mention highlighting in the UI)
  mentionedUserIds: number[]
  // ── Phase 3A fields (june_memo items only) ───────────────────────────────
  spruceWorkflowRequestId: number | null
  spruceWorkflowRequestStatus: string | null
}

export interface SpruceConversationMessageRow {
  id: number;
  spruceConversationId: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  messageBody: string | null;
  messageDirection: string | null;
  eventType: string | null;
  staffRepliedAt: Date | null;
  receivedAt: Date;
  patientId: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  spruceContactName: string | null;
  // 'spruce' = came from spruce_messages; 'portal' = came from portal_messages
  source: 'spruce' | 'portal';
  // messageType from portal_messages; null for spruce-source rows
  portalMessageType: string | null;
}

(DbStorage.prototype as any).listSpruceConversations = async function(
  clinicId: number,
): Promise<SpruceConversationSummary[]> {
  // Fetch all messages for this clinic, newest first, with patient join
  const rows = await db
    .select({
      id: schema.spruceMessages.id,
      spruceConversationId: schema.spruceMessages.spruceConversationId,
      fromPhone: schema.spruceMessages.fromPhone,
      toPhone: schema.spruceMessages.toPhone,
      patientId: schema.spruceMessages.patientId,
      messageBody: schema.spruceMessages.messageBody,
      messageDirection: schema.spruceMessages.messageDirection,
      staffRepliedAt: schema.spruceMessages.staffRepliedAt,
      receivedAt: schema.spruceMessages.receivedAt,
      spruceContactName: schema.spruceMessages.spruceContactName,
      patientFirstName: schema.patients.firstName,
      patientLastName: schema.patients.lastName,
    })
    .from(schema.spruceMessages)
    .leftJoin(schema.patients, eq(schema.spruceMessages.patientId, schema.patients.id))
    .where(eq(schema.spruceMessages.clinicId, clinicId))
    .orderBy(desc(schema.spruceMessages.receivedAt));

  // Fetch all conversation state rows for this clinic (archive + viewed + assignment)
  const stateRows = await db
    .select({
      conversationKey: schema.spruceConversationState.conversationKey,
      archivedAt: schema.spruceConversationState.archivedAt,
      staffLastViewedAt: schema.spruceConversationState.staffLastViewedAt,
      taggedClinicianId: schema.spruceConversationState.taggedClinicianId,
    })
    .from(schema.spruceConversationState)
    .where(eq(schema.spruceConversationState.clinicId, clinicId));
  const stateByKey = new Map(stateRows.map(r => [r.conversationKey, r]));

  // Group by conversation key (conversationId → phone → message id fallback).
  //
  // Direction-aware phone extraction:
  //   inbound_patient  → fromPhone = patient, toPhone = clinic
  //   outbound_staff   → fromPhone = clinic,  toPhone = patient
  //
  // We always want the *patient* phone for grouping and display, so we flip
  // outbound rows.  spruceContactName on outbound rows contains the staff
  // sender name (not the patient's contact name from Spruce) so we never
  // inherit it for patient-identity purposes.
  const isOutboundRow = (dir: string | null) => dir === 'outbound_staff';

  const patientPhoneOf = (row: { fromPhone: string | null; toPhone: string | null; messageDirection: string | null }) =>
    isOutboundRow(row.messageDirection) ? row.toPhone : row.fromPhone;

  const map = new Map<string, SpruceConversationSummary>();
  for (const row of rows) {
    const patientPhone = patientPhoneOf(row);
    const key = row.spruceConversationId || patientPhone || `msg_${row.id}`;
    if (!map.has(key)) {
      const stateRow = stateByKey.get(key);
      map.set(key, {
        conversationKey: key,
        spruceConversationId: row.spruceConversationId,
        // Always store the external/patient phone in fromPhone so the UI
        // never accidentally displays the clinic's internal endpoint.
        fromPhone: patientPhone,
        toPhone: isOutboundRow(row.messageDirection) ? row.fromPhone : row.toPhone,
        patientId: row.patientId,
        patientFirstName: row.patientFirstName ?? null,
        patientLastName: row.patientLastName ?? null,
        // Only inherit spruceContactName from inbound/unknown rows —
        // outbound rows carry the staff sender name, not the patient's.
        spruceContactName: !isOutboundRow(row.messageDirection) ? (row.spruceContactName ?? null) : null,
        lastMessage: row.messageBody,
        lastMessageDirection: row.messageDirection,
        lastMessageAt: row.receivedAt,
        messageCount: 1,
        hasStaffReply: row.staffRepliedAt !== null,
        isArchived: stateRow?.archivedAt != null,
        archivedAt: stateRow?.archivedAt ?? null,
        staffLastViewedAt: stateRow?.staffLastViewedAt ?? null,
        taggedClinicianId: stateRow?.taggedClinicianId ?? null,
      });
    } else {
      const existing = map.get(key)!;
      existing.messageCount++;
      if (row.staffRepliedAt) existing.hasStaffReply = true;
      // patientId / name: prefer the row that has a match
      if (!existing.patientId && row.patientId) {
        existing.patientId = row.patientId;
        existing.patientFirstName = row.patientFirstName ?? null;
        existing.patientLastName = row.patientLastName ?? null;
      }
      // fromPhone: inbound_patient rows are the authoritative source for the
      // patient's phone — Spruce always puts the external participant's number
      // in fromPhone on inbound events.  Outbound / system rows may carry the
      // clinic's own number (from internalEndpoint.rawValue) as patientPhone;
      // we must override that whenever we encounter a reliable inbound row.
      if (row.messageDirection === 'inbound_patient' && patientPhone) {
        existing.fromPhone = patientPhone;          // always prefer inbound
      } else if (!existing.fromPhone && patientPhone) {
        existing.fromPhone = patientPhone;          // fallback: fill if empty
      }
      // contact name: only inherit from inbound/unknown rows (outbound rows
      // carry staff names, not the patient's Spruce contact name).
      if (!existing.spruceContactName && row.spruceContactName && !isOutboundRow(row.messageDirection)) {
        existing.spruceContactName = row.spruceContactName;
      }
    }
  }

  // Initialize hasOpenUrgentRequest to false for all conversations; will be
  // stamped true below for any conversation with a pending urgent_safety request.
  for (const conv of map.values()) {
    conv.hasOpenUrgentRequest = false;
  }

  // Fetch pending urgent_safety workflow requests and cross-reference them with
  // conversations so the inbox urgent folder matches the dashboard urgent tile.
  // Both read from the same spruce_workflow_requests table — this keeps them in sync.
  const urgentRequests = await db
    .select({
      spruceConversationUrl: schema.spruceWorkflowRequests.spruceConversationUrl,
      spruceMessageId: schema.spruceWorkflowRequests.spruceMessageId,
    })
    .from(schema.spruceWorkflowRequests)
    .where(
      and(
        eq(schema.spruceWorkflowRequests.clinicId, clinicId),
        eq(schema.spruceWorkflowRequests.workflow, "urgent_safety"),
        eq(schema.spruceWorkflowRequests.status, "pending"),
      ),
    );

  for (const req of urgentRequests) {
    // spruceConversationUrl is in the form https://app.sprucehealth.com/conversations/<key>
    if (req.spruceConversationUrl) {
      const urlKey = req.spruceConversationUrl.split("/conversations/").pop();
      if (urlKey && map.has(urlKey)) {
        map.get(urlKey)!.hasOpenUrgentRequest = true;
      }
    }
    // Also check by spruceMessageId in case the URL isn't present
    if (req.spruceMessageId) {
      for (const conv of map.values()) {
        if (conv.spruceConversationId === req.spruceMessageId) {
          conv.hasOpenUrgentRequest = true;
        }
      }
    }
  }

  // Sort by lastMessageAt desc (already ordered from DB, but Map insertion is stable)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
};

(DbStorage.prototype as any).getSpruceConversationMessages = async function(
  clinicId: number,
  conversationKey: string,
): Promise<SpruceConversationMessageRow[]> {
  // ── 1. Spruce messages for this conversation ─────────────────────────────
  // conversationKey is either a spruceConversationId or a phone number
  const spruceRows = await db
    .select({
      id: schema.spruceMessages.id,
      spruceConversationId: schema.spruceMessages.spruceConversationId,
      fromPhone: schema.spruceMessages.fromPhone,
      toPhone: schema.spruceMessages.toPhone,
      messageBody: schema.spruceMessages.messageBody,
      messageDirection: schema.spruceMessages.messageDirection,
      eventType: schema.spruceMessages.eventType,
      staffRepliedAt: schema.spruceMessages.staffRepliedAt,
      receivedAt: schema.spruceMessages.receivedAt,
      patientId: schema.spruceMessages.patientId,
      patientFirstName: schema.patients.firstName,
      patientLastName: schema.patients.lastName,
      spruceContactName: schema.spruceMessages.spruceContactName,
    })
    .from(schema.spruceMessages)
    .leftJoin(schema.patients, eq(schema.spruceMessages.patientId, schema.patients.id))
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        or(
          eq(schema.spruceMessages.spruceConversationId, conversationKey),
          and(
            isNull(schema.spruceMessages.spruceConversationId),
            eq(schema.spruceMessages.fromPhone, conversationKey),
          ),
        ),
      ),
    )
    .orderBy(asc(schema.spruceMessages.receivedAt));

  const tagged: SpruceConversationMessageRow[] = spruceRows.map(r => ({
    ...r,
    source: 'spruce' as const,
    portalMessageType: null,
  }));

  // ── 2. Portal messages for the matched patient ───────────────────────────
  // Use a negative-ID offset for portal rows so React keys never collide with
  // spruce message IDs (both come from separate auto-increment sequences).
  const patientId = spruceRows.find(r => r.patientId != null)?.patientId ?? null;
  if (!patientId) return tagged;

  const portalRows = await db
    .select()
    .from(schema.portalMessages)
    .where(eq(schema.portalMessages.patientId, patientId))
    .orderBy(asc(schema.portalMessages.createdAt));

  const portalTagged: SpruceConversationMessageRow[] = portalRows.map(p => {
    const messageType = (p as any).messageType ?? 'message';
    const senderType = p.senderType;
    // Map portal senderType + messageType → Spruce-compatible messageDirection
    let messageDirection: string;
    if (messageType !== 'message') {
      // internal_note, june_memo, workflow_note, system_event — render as system
      messageDirection = 'spruce_system_event';
    } else {
      messageDirection = senderType === 'patient' ? 'inbound_patient' : 'outbound_staff';
    }
    return {
      id: -(p.id),                  // negative = portal; guarantees no collision
      spruceConversationId: null,
      fromPhone: null,
      toPhone: null,
      messageBody: p.content,
      messageDirection,
      eventType: messageType !== 'message' ? messageType : null,
      staffRepliedAt: null,
      receivedAt: p.createdAt,
      patientId,
      patientFirstName: null,
      patientLastName: null,
      spruceContactName: senderType === 'clinician' ? 'Staff (Portal)' : null,
      source: 'portal' as const,
      portalMessageType: messageType,
    };
  });

  // ── 3. Merge and sort chronologically ───────────────────────────────────
  const all = [...tagged, ...portalTagged];
  all.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  return all;
};

(DbStorage.prototype as any).updateSpruceWorkflowRequestStatus = async function(
  id: number,
  status: string,
  resolvedByUserId?: number,
): Promise<schema.SpruceWorkflowRequest | undefined> {
  const isResolved = status !== "pending";
  const [row] = await db
    .update(schema.spruceWorkflowRequests)
    .set({
      status,
      ...(isResolved
        ? { resolvedAt: new Date(), resolvedByUserId: resolvedByUserId ?? null }
        : { resolvedAt: null, resolvedByUserId: null }),
    })
    .where(eq(schema.spruceWorkflowRequests.id, id))
    .returning();
  return row;
};

// ── backfillSprucePatientLinks ─────────────────────────────────────────────
// When a patient is created/updated with a phone number, retroactively link
// all unmatched spruce_messages and spruce_workflow_requests in this clinic
// whose fromPhone / patientPhone normalizes to the same last-10 digits.
(DbStorage.prototype as any).backfillSprucePatientLinks = async function(
  clinicId: number,
  patientId: number,
  phone: string,
): Promise<void> {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 7) return;
  const last10 = digits.slice(-10);

  // Update spruce_messages
  await db
    .update(schema.spruceMessages)
    .set({ patientId })
    .where(and(
      eq(schema.spruceMessages.clinicId, clinicId),
      isNull(schema.spruceMessages.patientId),
      sql`regexp_replace(coalesce(${schema.spruceMessages.fromPhone}, ''), '\\D', '', 'g') LIKE ${'%' + last10}`,
    ));

  // Update spruce_workflow_requests
  await db
    .update(schema.spruceWorkflowRequests)
    .set({ patientId })
    .where(and(
      eq(schema.spruceWorkflowRequests.clinicId, clinicId),
      isNull(schema.spruceWorkflowRequests.patientId),
      sql`regexp_replace(coalesce(${schema.spruceWorkflowRequests.patientPhone}, ''), '\\D', '', 'g') LIKE ${'%' + last10}`,
    ));
};

// ── linkSpruceConversationToPatient ───────────────────────────────────────
// Manually links all messages in a conversation to a specific patient.
// Used when auto-matching fails and the clinician knows which patient this is.
// Overwrites any existing patientId on those messages (intentional override).
(DbStorage.prototype as any).linkSpruceConversationToPatient = async function(
  clinicId: number,
  conversationKey: string,
  patientId: number,
): Promise<{ updatedMessages: number }> {
  // conversationKey is either a spruceConversationId or a fromPhone
  const result = await db
    .update(schema.spruceMessages)
    .set({ patientId })
    .where(and(
      eq(schema.spruceMessages.clinicId, clinicId),
      or(
        eq(schema.spruceMessages.spruceConversationId, conversationKey),
        and(
          isNull(schema.spruceMessages.spruceConversationId),
          eq(schema.spruceMessages.fromPhone, conversationKey),
        ),
      ),
    ))
    .returning({ id: schema.spruceMessages.id });
  return { updatedMessages: result.length };
};

// ── archiveSpruceConversation ─────────────────────────────────────────────
// Sets archivedAt + audit fields on the conversation state row.
// Uses upsert so it works even if no state row exists yet.
// Safe: never deletes messages — archive is a display flag only.
(DbStorage.prototype as any).archiveSpruceConversation = async function(
  clinicId: number,
  conversationKey: string,
  archivedByUserId: number | null,
  source: 'cliniq' | 'spruce' | 'sync',
  spruceArchiveSyncedAt?: Date | null,
  spruceArchiveError?: string | null,
): Promise<schema.SpruceConversationStateRow> {
  const now = new Date();
  const rows = await db
    .insert(schema.spruceConversationState)
    .values({
      clinicId,
      conversationKey,
      state: "archived",
      archivedAt: now,
      archivedByUserId: archivedByUserId ?? null,
      archiveSource: source,
      spruceArchiveSyncedAt: spruceArchiveSyncedAt ?? null,
      spruceArchiveError: spruceArchiveError ?? null,
      lastActivityAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.spruceConversationState.clinicId, schema.spruceConversationState.conversationKey],
      set: {
        state: "archived",
        archivedAt: now,
        archivedByUserId: archivedByUserId ?? null,
        archiveSource: source,
        spruceArchiveSyncedAt: spruceArchiveSyncedAt ?? null,
        spruceArchiveError: spruceArchiveError ?? null,
        lastActivityAt: now,
      },
    })
    .returning();
  return rows[0];
};

// ── markSpruceConversationViewed ──────────────────────────────────────────
// Stamps staffLastViewedAt when a staff member opens a conversation in ClinIQ.
// Uses upsert so it works even if no state row exists yet.
(DbStorage.prototype as any).markSpruceConversationViewed = async function(
  clinicId: number,
  conversationKey: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.spruceConversationState)
    .values({
      clinicId,
      conversationKey,
      state: "open",
      lastActivityAt: now,
      staffLastViewedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.spruceConversationState.clinicId, schema.spruceConversationState.conversationKey],
      set: {
        staffLastViewedAt: now,
        lastActivityAt: now,
      },
    });
};

// ── setSpruceConversationTaggedClinician ──────────────────────────────────
// Sets (or clears) the taggedClinicianId when Spruce reports an assignment.
(DbStorage.prototype as any).setSpruceConversationTaggedClinician = async function(
  clinicId: number,
  conversationKey: string,
  userId: number | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.spruceConversationState)
    .values({
      clinicId,
      conversationKey,
      state: "open",
      lastActivityAt: now,
      taggedClinicianId: userId,
    })
    .onConflictDoUpdate({
      target: [schema.spruceConversationState.clinicId, schema.spruceConversationState.conversationKey],
      set: {
        taggedClinicianId: userId,
        lastActivityAt: now,
      },
    });
};

// ── getSpruceConversationState ────────────────────────────────────────────
(DbStorage.prototype as any).getSpruceConversationState = async function(
  clinicId: number,
  conversationKey: string,
): Promise<schema.SpruceConversationStateRow | null> {
  const rows = await db
    .select()
    .from(schema.spruceConversationState)
    .where(and(
      eq(schema.spruceConversationState.clinicId, clinicId),
      eq(schema.spruceConversationState.conversationKey, conversationKey),
    ))
    .limit(1);
  return rows[0] ?? null;
};

// ── upsertSpruceConversationState ─────────────────────────────────────────
(DbStorage.prototype as any).upsertSpruceConversationState = async function(
  clinicId: number,
  conversationKey: string,
  data: Partial<Pick<schema.SpruceConversationStateRow, 'state' | 'aiMutedAt' | 'aiMutedByUserId' | 'lastActivityAt'>>,
): Promise<schema.SpruceConversationStateRow> {
  const now = new Date();
  const rows = await db
    .insert(schema.spruceConversationState)
    .values({
      clinicId,
      conversationKey,
      state: data.state ?? "open",
      aiMutedAt: data.aiMutedAt ?? null,
      aiMutedByUserId: data.aiMutedByUserId ?? null,
      lastActivityAt: data.lastActivityAt ?? now,
    })
    .onConflictDoUpdate({
      target: [schema.spruceConversationState.clinicId, schema.spruceConversationState.conversationKey],
      set: {
        ...(data.state !== undefined && { state: data.state }),
        ...(data.aiMutedAt !== undefined && { aiMutedAt: data.aiMutedAt }),
        ...(data.aiMutedByUserId !== undefined && { aiMutedByUserId: data.aiMutedByUserId }),
        lastActivityAt: data.lastActivityAt ?? now,
      },
    })
    .returning();
  return rows[0];
};

// ── createSpruceOutboundMessage ───────────────────────────────────────────
(DbStorage.prototype as any).createSpruceOutboundMessage = async function(
  data: schema.InsertSpruceOutboundMessage,
): Promise<schema.SpruceOutboundMessage> {
  const rows = await db
    .insert(schema.spruceOutboundMessages)
    .values(data)
    .returning();
  return rows[0];
};

// ── updateSpruceOutboundDeliveryId ────────────────────────────────────────
(DbStorage.prototype as any).updateSpruceOutboundDeliveryId = async function(
  id: number,
  spruceDeliveryId: string,
): Promise<void> {
  await db
    .update(schema.spruceOutboundMessages)
    .set({ spruceDeliveryId })
    .where(eq(schema.spruceOutboundMessages.id, id));
};

// ── updateSpruceMessageEchoIds ────────────────────────────────────────────
// Stamps the mirrored spruce_messages row (created by ClinIQ reply / June ack)
// with the real Spruce-assigned message ID and a matching dedupeKey so that
// when Spruce echoes the message back via webhook the existing dedup check
// (findSpruceMessageByDedupeKey) finds this row and suppresses the duplicate.
(DbStorage.prototype as any).updateSpruceMessageEchoIds = async function(
  id: number,
  spruceMessageId: string,
  dedupeKey: string,
): Promise<void> {
  await db
    .update(schema.spruceMessages)
    .set({ spruceMessageId, spruceEventDedupeKey: dedupeKey })
    .where(eq(schema.spruceMessages.id, id));
};

// ── Spruce June Phase 3A — Workflow Settings ──────────────────────────────

(DbStorage.prototype as any).getSpruceWorkflowSetting = async function(
  clinicId: number,
  workflow: string,
): Promise<schema.SpruceWorkflowSettings | null> {
  const [row] = await db
    .select()
    .from(schema.spruceWorkflowSettings)
    .where(and(
      eq(schema.spruceWorkflowSettings.clinicId, clinicId),
      eq(schema.spruceWorkflowSettings.workflow, workflow),
    ))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).upsertSpruceWorkflowSetting = async function(
  clinicId: number,
  workflow: string,
  data: { allowAcknowledgment?: boolean; allowFollowUpQuestion?: boolean; maxJuneTurns?: number },
): Promise<schema.SpruceWorkflowSettings> {
  const [row] = await db
    .insert(schema.spruceWorkflowSettings)
    .values({
      clinicId,
      workflow,
      allowAcknowledgment: data.allowAcknowledgment ?? false,
      allowFollowUpQuestion: data.allowFollowUpQuestion ?? false,
      maxJuneTurns: data.maxJuneTurns ?? 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.spruceWorkflowSettings.clinicId, schema.spruceWorkflowSettings.workflow],
      set: {
        ...(data.allowAcknowledgment !== undefined && { allowAcknowledgment: data.allowAcknowledgment }),
        ...(data.allowFollowUpQuestion !== undefined && { allowFollowUpQuestion: data.allowFollowUpQuestion }),
        ...(data.maxJuneTurns !== undefined && { maxJuneTurns: data.maxJuneTurns }),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
};

(DbStorage.prototype as any).listSpruceWorkflowSettings = async function(
  clinicId: number,
): Promise<schema.SpruceWorkflowSettings[]> {
  return db
    .select()
    .from(schema.spruceWorkflowSettings)
    .where(eq(schema.spruceWorkflowSettings.clinicId, clinicId))
    .orderBy(schema.spruceWorkflowSettings.workflow);
};

// ── getPatientCommunicationTimeline ───────────────────────────────────────
// Merges portal_messages (ALL — patient-visible + internal), spruce_messages
// (patient-matched inbound + system events), and spruce_outbound_messages
// into one chronological timeline for STAFF.
//
// Patient portal uses getPortalMessages() which filters visibility='patient_visible'.
//
// Dedup strategy for Spruce outbound:
//   spruce_messages with messageDirection='outbound_staff' are EXCLUDED.
//   ClinIQ-sent replies are covered by spruce_outbound_messages (richer
//   metadata).  Phase 2 adds portal_messages rows with deliveryChannel='spruce'
//   for new replies; old spruce_outbound_messages rows remain for historical data.
(DbStorage.prototype as any).getPatientCommunicationTimeline = async function(
  patientId: number,
  clinicId: number,
): Promise<CommunicationTimelineItem[]> {
  const items: CommunicationTimelineItem[] = [];

  // ── 1. Portal messages (ALL — includes internal notes, staff replies) ───
  const portalRows = await db
    .select()
    .from(schema.portalMessages)
    .where(eq(schema.portalMessages.patientId, patientId))
    .orderBy(asc(schema.portalMessages.createdAt));

  // Fetch all mention records for this patient in one query
  const mentionRows = await db
    .select({
      messageId: schema.patientMessageMentions.messageId,
      mentionedUserId: schema.patientMessageMentions.mentionedUserId,
    })
    .from(schema.patientMessageMentions)
    .where(eq(schema.patientMessageMentions.patientId, patientId));

  const mentionsByMessageId = new Map<number, number[]>();
  for (const m of mentionRows) {
    const arr = mentionsByMessageId.get(m.messageId) ?? [];
    arr.push(m.mentionedUserId);
    mentionsByMessageId.set(m.messageId, arr);
  }

  for (const msg of portalRows) {
    const messageType = (msg as any).messageType ?? 'message';
    const visibility = (msg as any).visibility ?? 'patient_visible';
    const deliveryChannel = (msg as any).deliveryChannel ?? null;

    // For internal notes, direction is 'system' so the UI can render them
    // differently (centered / amber badge) regardless of senderType.
    const direction: 'inbound' | 'outbound' | 'system' =
      messageType !== 'message'
        ? 'system'
        : msg.senderType === 'patient' ? 'inbound' : 'outbound';

    const senderLabel =
      messageType === 'internal_note' ? 'Internal Note'
      : messageType === 'june_memo'   ? 'June Memo'
      : messageType === 'workflow_note' ? 'Workflow Note'
      : messageType === 'system_event'  ? 'System'
      : msg.senderType === 'patient'    ? 'Patient'
      : 'Staff';

    items.push({
      id: `portal:${msg.id}`,
      source: 'portal',
      direction,
      senderLabel,
      body: msg.content,
      timestamp: msg.createdAt.toISOString(),
      conversationKey: null,
      patientId: msg.patientId,
      clinicianId: msg.clinicianId,
      userId: null,
      readAt: msg.readAt ? msg.readAt.toISOString() : null,
      sentByAI: false,
      eventType: null,
      spruceMessageId: null,
      spruceConversationId: null,
      spruceDeliveryId: null,
      messageType,
      visibility,
      deliveryChannel,
      mentionedUserIds: mentionsByMessageId.get(msg.id) ?? [],
      spruceWorkflowRequestId: null,
      spruceWorkflowRequestStatus: null,
    });
  }

  // ── 2. Spruce inbound messages (patient-matched, excl. outbound_staff) ───
  const spruceInRows = await db
    .select()
    .from(schema.spruceMessages)
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        eq(schema.spruceMessages.patientId, patientId),
        ne(schema.spruceMessages.messageDirection as any, 'outbound_staff'),
        ne(schema.spruceMessages.messageDirection as any, 'spruce_system_event'),
      ),
    )
    .orderBy(asc(schema.spruceMessages.receivedAt));

  // Collect conversation keys for the outbound lookup below
  const convKeySet = new Set<string>();
  for (const msg of spruceInRows) {
    const key = msg.spruceConversationId ?? msg.fromPhone ?? null;
    if (key) convKeySet.add(key);
  }

  for (const msg of spruceInRows) {
    const convKey = msg.spruceConversationId ?? msg.fromPhone ?? null;
    const hasBody = !!msg.messageBody;
    // Non-text events (attachments, calls, etc.) are system-type items
    const direction: 'inbound' | 'system' =
      hasBody && msg.messageDirection === 'inbound_patient' ? 'inbound' : 'system';
    const senderLabel =
      direction === 'inbound'
        ? (msg.spruceContactName ?? 'Patient')
        : 'System';

    items.push({
      id: `spruce_in:${msg.id}`,
      source: 'spruce',
      direction,
      senderLabel,
      body: msg.messageBody,
      timestamp: msg.receivedAt.toISOString(),
      conversationKey: convKey,
      patientId,
      clinicianId: null,
      userId: null,
      readAt: null,
      sentByAI: false,
      eventType: msg.eventType,
      spruceMessageId: msg.spruceMessageId,
      spruceConversationId: msg.spruceConversationId,
      spruceDeliveryId: null,
      messageType: 'message',
      visibility: 'patient_visible',
      deliveryChannel: 'spruce',
      mentionedUserIds: [],
      spruceWorkflowRequestId: null,
      spruceWorkflowRequestStatus: null,
    });
  }

  // ── 3. Spruce outbound messages (ClinIQ-sent into Spruce, historical) ────
  // Phase 2: new outbound replies also write a portal_messages row with
  // deliveryChannel='spruce'. Old spruce_outbound_messages rows remain here
  // so historical data is not lost. Future dedup by spruceDeliveryId ↔
  // externalDeliveryId will eliminate duplicates once Phase 3 stamps them.
  if (convKeySet.size > 0) {
    const convKeys = Array.from(convKeySet);
    const spruceOutRows = await db
      .select()
      .from(schema.spruceOutboundMessages)
      .where(
        and(
          eq(schema.spruceOutboundMessages.clinicId, clinicId),
          inArray(schema.spruceOutboundMessages.conversationKey, convKeys),
        ),
      )
      .orderBy(asc(schema.spruceOutboundMessages.sentAt));

    for (const msg of spruceOutRows) {
      items.push({
        id: `spruce_out:${msg.id}`,
        source: 'spruce',
        direction: 'outbound',
        senderLabel: msg.sentByAI ? 'June AI' : 'Staff',
        body: msg.messageBody,
        timestamp: msg.sentAt.toISOString(),
        conversationKey: msg.conversationKey,
        patientId,
        clinicianId: null,
        userId: msg.sentByUserId,
        readAt: null,
        sentByAI: msg.sentByAI,
        eventType: null,
        spruceMessageId: null,
        spruceConversationId: null,
        spruceDeliveryId: msg.spruceDeliveryId,
        messageType: 'message',
        visibility: 'patient_visible',
        deliveryChannel: 'spruce',
        mentionedUserIds: [],
        spruceWorkflowRequestId: null,
        spruceWorkflowRequestStatus: null,
      });
    }
  }

  // ── 4. June memos from spruce_workflow_requests ───────────────────────────
  // Requests matched to this patient that have an AI-generated staff memo.
  const juneMemoRows = await db
    .select()
    .from(schema.spruceWorkflowRequests)
    .where(
      and(
        eq(schema.spruceWorkflowRequests.clinicId, clinicId),
        eq(schema.spruceWorkflowRequests.patientId, patientId),
        isNotNull(schema.spruceWorkflowRequests.juneMemoText),
      ),
    )
    .orderBy(asc(schema.spruceWorkflowRequests.createdAt));

  for (const req of juneMemoRows) {
    items.push({
      id: `june_memo:${req.id}`,
      source: 'portal' as const,
      direction: 'system' as const,
      senderLabel: 'June',
      body: req.juneMemoText ?? '',
      timestamp: (req.juneAckSentAt ?? req.createdAt).toISOString(),
      conversationKey: req.spruceConversationUrl
        ? (req.spruceConversationUrl.split('/conversations/')[1] ?? null)
        : null,
      patientId,
      clinicianId: null,
      userId: null,
      readAt: null,
      sentByAI: true,
      eventType: req.workflow,
      spruceMessageId: null,
      spruceConversationId: null,
      spruceDeliveryId: null,
      messageType: 'june_memo',
      visibility: 'internal_only',
      deliveryChannel: null,
      mentionedUserIds: [],
      spruceWorkflowRequestId: req.id,
      spruceWorkflowRequestStatus: req.status,
    });
  }

  // ── 5. Sort all items chronologically ────────────────────────────────────
  items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return items;
};

// ── Spruce June Phase 3A — Workflow Request June fields ───────────────────

(DbStorage.prototype as any).updateSpruceWorkflowRequestJune = async function(
  id: number,
  data: { juneAckSentAt?: Date; juneMemoText?: string; juneTurnCount?: number },
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.juneAckSentAt !== undefined) updates.juneAckSentAt = data.juneAckSentAt;
  if (data.juneMemoText !== undefined) updates.juneMemoText = data.juneMemoText;
  if (data.juneTurnCount !== undefined) updates.juneTurnCount = data.juneTurnCount;
  if (Object.keys(updates).length === 0) return;
  await db
    .update(schema.spruceWorkflowRequests)
    .set(updates)
    .where(eq(schema.spruceWorkflowRequests.id, id));
};

(DbStorage.prototype as any).getOpenSpruceWorkflowRequestByConversation = async function(
  clinicId: number,
  conversationKey: string,
): Promise<schema.SpruceWorkflowRequest | null> {
  // Match on the conversation URL which embeds the Spruce conversation ID.
  // Only return pending requests — resolved ones don't participate in multi-turn.
  const [row] = await db
    .select()
    .from(schema.spruceWorkflowRequests)
    .where(
      and(
        eq(schema.spruceWorkflowRequests.clinicId, clinicId),
        eq(schema.spruceWorkflowRequests.status, "pending"),
        like(schema.spruceWorkflowRequests.spruceConversationUrl, `%${conversationKey}%`),
      ),
    )
    .orderBy(desc(schema.spruceWorkflowRequests.createdAt))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).getLatestSpruceWorkflowRequest = async function(
  clinicId: number,
  conversationKey: string,
): Promise<schema.SpruceWorkflowRequest | null> {
  // Returns the most recent workflow request regardless of status (for UI display).
  const [row] = await db
    .select()
    .from(schema.spruceWorkflowRequests)
    .where(
      and(
        eq(schema.spruceWorkflowRequests.clinicId, clinicId),
        like(schema.spruceWorkflowRequests.spruceConversationUrl, `%${conversationKey}%`),
      ),
    )
    .orderBy(desc(schema.spruceWorkflowRequests.createdAt))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).markSpruceConversationReplied = async function(
  clinicId: number,
  conversationKey: string,
): Promise<void> {
  // Sets staffRepliedAt = now() on all messages for this conversation that have
  // not yet been marked replied.  Matches on spruceConversationId OR phone
  // so both ID-keyed and phone-keyed conversations are handled.
  await db
    .update(schema.spruceMessages)
    .set({ staffRepliedAt: new Date() })
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        isNull(schema.spruceMessages.staffRepliedAt),
        or(
          eq(schema.spruceMessages.spruceConversationId, conversationKey),
          eq(schema.spruceMessages.fromPhone, conversationKey),
          eq(schema.spruceMessages.toPhone, conversationKey),
        ),
      ),
    );
};

// ── Spruce June Playbook implementations ─────────────────────────────────

(DbStorage.prototype as any).getClinicJunePlaybook = async function(clinicId: number): Promise<schema.ClinicJunePlaybook | null> {
  const [row] = await db
    .select()
    .from(schema.clinicJunePlaybook)
    .where(eq(schema.clinicJunePlaybook.clinicId, clinicId))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).upsertClinicJunePlaybook = async function(clinicId: number, data: Partial<schema.InsertClinicJunePlaybook>): Promise<schema.ClinicJunePlaybook> {
  const payload = { ...data, clinicId, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.clinicJunePlaybook)
    .values(payload)
    .onConflictDoUpdate({
      target: schema.clinicJunePlaybook.clinicId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row;
};

(DbStorage.prototype as any).getClinicKnowledgeEntries = async function(clinicId: number): Promise<schema.ClinicKnowledgeEntry[]> {
  return db
    .select()
    .from(schema.clinicKnowledgeEntries)
    .where(eq(schema.clinicKnowledgeEntries.clinicId, clinicId))
    .orderBy(asc(schema.clinicKnowledgeEntries.sortOrder), asc(schema.clinicKnowledgeEntries.id));
};

(DbStorage.prototype as any).upsertClinicKnowledgeEntry = async function(clinicId: number, data: schema.InsertClinicKnowledgeEntry): Promise<schema.ClinicKnowledgeEntry> {
  const payload = { ...data, clinicId, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.clinicKnowledgeEntries)
    .values(payload)
    .onConflictDoUpdate({
      target: [schema.clinicKnowledgeEntries.clinicId, schema.clinicKnowledgeEntries.topicKey],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row;
};

(DbStorage.prototype as any).deleteClinicKnowledgeEntry = async function(id: number, clinicId: number): Promise<boolean> {
  const result = await db
    .delete(schema.clinicKnowledgeEntries)
    .where(
      and(
        eq(schema.clinicKnowledgeEntries.id, id),
        eq(schema.clinicKnowledgeEntries.clinicId, clinicId),
      ),
    )
    .returning({ id: schema.clinicKnowledgeEntries.id });
  return result.length > 0;
};

(DbStorage.prototype as any).getSpruceWorkflowPlaybook = async function(clinicId: number, workflow: string): Promise<schema.SpruceWorkflowPlaybook | null> {
  const [row] = await db
    .select()
    .from(schema.spruceWorkflowPlaybooks)
    .where(
      and(
        eq(schema.spruceWorkflowPlaybooks.clinicId, clinicId),
        eq(schema.spruceWorkflowPlaybooks.workflow, workflow),
      ),
    )
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).getAllSpruceWorkflowPlaybooks = async function(clinicId: number): Promise<schema.SpruceWorkflowPlaybook[]> {
  return db
    .select()
    .from(schema.spruceWorkflowPlaybooks)
    .where(eq(schema.spruceWorkflowPlaybooks.clinicId, clinicId))
    .orderBy(asc(schema.spruceWorkflowPlaybooks.workflow));
};

(DbStorage.prototype as any).upsertSpruceWorkflowPlaybook = async function(clinicId: number, workflow: string, data: Partial<schema.InsertSpruceWorkflowPlaybook>): Promise<schema.SpruceWorkflowPlaybook> {
  const payload = { ...data, clinicId, workflow, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.spruceWorkflowPlaybooks)
    .values(payload)
    .onConflictDoUpdate({
      target: [schema.spruceWorkflowPlaybooks.clinicId, schema.spruceWorkflowPlaybooks.workflow],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row;
};

(DbStorage.prototype as any).setAfterHoursNoticeSentAt = async function(clinicId: number, conversationKey: string, sentAt: Date): Promise<void> {
  await db
    .update(schema.spruceConversationState)
    .set({ afterHoursNoticeSentAt: sentAt })
    .where(
      and(
        eq(schema.spruceConversationState.clinicId, clinicId),
        eq(schema.spruceConversationState.conversationKey, conversationKey),
      ),
    );
};

// ── Form Workflow Builder (Layer 1) ────────────────────────────────────────

(DbStorage.prototype as any).listFormWorkflows = async function(clinicId: number): Promise<schema.FormWorkflow[]> {
  return db
    .select()
    .from(schema.formWorkflows)
    .where(eq(schema.formWorkflows.clinicId, clinicId))
    .orderBy(asc(schema.formWorkflows.createdAt));
};

(DbStorage.prototype as any).getFormWorkflow = async function(id: number, clinicId: number): Promise<schema.FormWorkflow | null> {
  const [row] = await db
    .select()
    .from(schema.formWorkflows)
    .where(and(eq(schema.formWorkflows.id, id), eq(schema.formWorkflows.clinicId, clinicId)))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).createFormWorkflow = async function(clinicId: number, data: Omit<schema.InsertFormWorkflow, "clinicId">): Promise<schema.FormWorkflow> {
  const [row] = await db
    .insert(schema.formWorkflows)
    .values({ ...data, clinicId, updatedAt: new Date() })
    .returning();
  return row;
};

(DbStorage.prototype as any).updateFormWorkflow = async function(id: number, clinicId: number, data: Partial<Omit<schema.InsertFormWorkflow, "clinicId">>): Promise<schema.FormWorkflow | null> {
  const [row] = await db
    .update(schema.formWorkflows)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.formWorkflows.id, id), eq(schema.formWorkflows.clinicId, clinicId)))
    .returning();
  return row ?? null;
};

(DbStorage.prototype as any).deleteFormWorkflow = async function(id: number, clinicId: number): Promise<boolean> {
  const result = await db
    .delete(schema.formWorkflows)
    .where(and(eq(schema.formWorkflows.id, id), eq(schema.formWorkflows.clinicId, clinicId)))
    .returning({ id: schema.formWorkflows.id });
  return result.length > 0;
};

(DbStorage.prototype as any).listFormWorkflowSteps = async function(workflowId: number): Promise<schema.FormWorkflowStep[]> {
  return db
    .select()
    .from(schema.formWorkflowSteps)
    .where(eq(schema.formWorkflowSteps.workflowId, workflowId))
    .orderBy(asc(schema.formWorkflowSteps.position));
};

(DbStorage.prototype as any).replaceFormWorkflowSteps = async function(workflowId: number, steps: Omit<schema.InsertFormWorkflowStep, "workflowId">[]): Promise<schema.FormWorkflowStep[]> {
  return db.transaction(async (tx) => {
    await tx.delete(schema.formWorkflowSteps).where(eq(schema.formWorkflowSteps.workflowId, workflowId));
    if (steps.length === 0) return [];
    return tx
      .insert(schema.formWorkflowSteps)
      .values(steps.map((s, i) => ({ ...s, workflowId, position: i, updatedAt: new Date() })))
      .returning();
  });
};

(DbStorage.prototype as any).getIntakeFormsForClinic = async function(clinicId: number): Promise<Pick<schema.IntakeForm, "id" | "name" | "status">[]> {
  return db
    .select({ id: schema.intakeForms.id, name: schema.intakeForms.name, status: schema.intakeForms.status })
    .from(schema.intakeForms)
    .where(eq(schema.intakeForms.clinicId, clinicId))
    .orderBy(asc(schema.intakeForms.name));
};

// ── Layer 2: Form Workflow Execution Engine ─────────────────────────────────

(DbStorage.prototype as any).findEnabledWorkflowForForm = async function(
  clinicId: number,
  formId: number,
): Promise<schema.FormWorkflow | null> {
  const [row] = await db
    .select()
    .from(schema.formWorkflows)
    .where(
      and(
        eq(schema.formWorkflows.clinicId, clinicId),
        eq(schema.formWorkflows.triggerFormId, formId),
        eq(schema.formWorkflows.enabled, true),
      ),
    )
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).createWorkflowRun = async function(
  data: schema.InsertFormWorkflowRun,
): Promise<schema.FormWorkflowRun> {
  const [row] = await db
    .insert(schema.formWorkflowRuns)
    .values(data)
    .returning();
  return row;
};

(DbStorage.prototype as any).getWorkflowRun = async function(
  id: number,
): Promise<schema.FormWorkflowRun | null> {
  const [row] = await db
    .select()
    .from(schema.formWorkflowRuns)
    .where(eq(schema.formWorkflowRuns.id, id))
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).updateWorkflowRun = async function(
  id: number,
  data: Partial<Pick<schema.FormWorkflowRun, "status" | "currentStepPosition" | "stoppedReason" | "completedAt" | "contextJson">>,
): Promise<void> {
  await db
    .update(schema.formWorkflowRuns)
    .set(data as any)
    .where(eq(schema.formWorkflowRuns.id, id));
};

(DbStorage.prototype as any).getWorkflowRunBySubmission = async function(
  workflowId: number,
  submissionId: number,
): Promise<schema.FormWorkflowRun | null> {
  const [row] = await db
    .select()
    .from(schema.formWorkflowRuns)
    .where(
      and(
        eq(schema.formWorkflowRuns.workflowId, workflowId),
        eq(schema.formWorkflowRuns.submissionId, submissionId),
      ),
    )
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).listWaitingStepStates = async function(
  limit: number,
): Promise<schema.FormWorkflowStepState[]> {
  return db
    .select()
    .from(schema.formWorkflowStepStates)
    .where(
      and(
        eq(schema.formWorkflowStepStates.status, "waiting"),
        isNotNull(schema.formWorkflowStepStates.dueAt),
        sql`${schema.formWorkflowStepStates.dueAt} <= NOW()`,
        isNull(schema.formWorkflowStepStates.lockedAt),
      ),
    )
    .orderBy(asc(schema.formWorkflowStepStates.dueAt))
    .limit(limit);
};

(DbStorage.prototype as any).getWorkflowStepState = async function(
  runId: number,
  stepPosition: number,
): Promise<schema.FormWorkflowStepState | null> {
  const [row] = await db
    .select()
    .from(schema.formWorkflowStepStates)
    .where(
      and(
        eq(schema.formWorkflowStepStates.runId, runId),
        eq(schema.formWorkflowStepStates.stepPosition, stepPosition),
      ),
    )
    .limit(1);
  return row ?? null;
};

(DbStorage.prototype as any).upsertWorkflowStepState = async function(
  runId: number,
  stepPosition: number,
  data: { stepType: string; status: string; executedAt?: Date | null; resultJson?: any; dueAt?: Date | null; lockedAt?: Date | null },
): Promise<schema.FormWorkflowStepState> {
  const existing = await (this as any).getWorkflowStepState(runId, stepPosition);
  if (existing) {
    const [row] = await db
      .update(schema.formWorkflowStepStates)
      .set({
        status: data.status,
        ...(data.executedAt !== undefined ? { executedAt: data.executedAt } : {}),
        ...(data.resultJson !== undefined ? { resultJson: data.resultJson } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
        ...(data.lockedAt !== undefined ? { lockedAt: data.lockedAt } : {}),
      })
      .where(eq(schema.formWorkflowStepStates.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.formWorkflowStepStates)
    .values({
      runId,
      stepPosition,
      stepType: data.stepType,
      status: data.status,
      executedAt: data.executedAt ?? null,
      resultJson: data.resultJson ?? null,
      dueAt: data.dueAt ?? null,
      lockedAt: data.lockedAt ?? null,
    })
    .returning();
  return row;
};

// Atomic optimistic lock for the background runner.
// Returns true if the lock was acquired (this process owns the step).
(DbStorage.prototype as any).lockWaitingStep = async function(
  id: number,
): Promise<boolean> {
  const result = await db
    .update(schema.formWorkflowStepStates)
    .set({ lockedAt: new Date() })
    .where(
      and(
        eq(schema.formWorkflowStepStates.id, id),
        isNull(schema.formWorkflowStepStates.lockedAt),
        eq(schema.formWorkflowStepStates.status, "waiting"),
      ),
    )
    .returning({ id: schema.formWorkflowStepStates.id });
  return result.length > 0;
};

(DbStorage.prototype as any).clearWaitingStepLock = async function(id: number): Promise<void> {
  await db
    .update(schema.formWorkflowStepStates)
    .set({ lockedAt: null })
    .where(eq(schema.formWorkflowStepStates.id, id));
};

(DbStorage.prototype as any).listActiveRunsForPatient = async function(
  clinicId: number,
  patientId: number,
): Promise<schema.FormWorkflowRun[]> {
  return db
    .select()
    .from(schema.formWorkflowRuns)
    .where(
      and(
        eq(schema.formWorkflowRuns.clinicId, clinicId),
        eq(schema.formWorkflowRuns.patientId, patientId),
        eq(schema.formWorkflowRuns.status, "running"),
      ),
    );
};

(DbStorage.prototype as any).findSpruceConversationByPatient = async function(
  clinicId: number,
  patientId: number,
): Promise<{ conversationKey: string; spruceConversationId: string | null; fromPhone: string | null; toPhone: string | null } | null> {
  const [row] = await db
    .select({
      conversationKey: schema.spruceMessages.spruceConversationId,
      spruceConversationId: schema.spruceMessages.spruceConversationId,
      fromPhone: schema.spruceMessages.fromPhone,
      toPhone: schema.spruceMessages.toPhone,
    })
    .from(schema.spruceMessages)
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        eq(schema.spruceMessages.patientId, patientId),
        isNotNull(schema.spruceMessages.spruceConversationId),
      ),
    )
    .orderBy(desc(schema.spruceMessages.receivedAt))
    .limit(1);
  if (!row || !row.conversationKey) return null;
  return row as { conversationKey: string; spruceConversationId: string | null; fromPhone: string | null; toPhone: string | null };
};

(DbStorage.prototype as any).hasPatientRespondedSince = async function(
  clinicId: number,
  patientId: number,
  since: Date,
): Promise<boolean> {
  // Check spruce_messages for inbound patient message after the given time
  const [spruceRow] = await db
    .select({ id: schema.spruceMessages.id })
    .from(schema.spruceMessages)
    .where(
      and(
        eq(schema.spruceMessages.clinicId, clinicId),
        eq(schema.spruceMessages.patientId, patientId),
        eq(schema.spruceMessages.messageDirection as any, "inbound_patient"),
        sql`${schema.spruceMessages.receivedAt} > ${since}`,
      ),
    )
    .limit(1);
  if (spruceRow) return true;
  // Also check portal_messages for patient-sent messages
  const [portalRow] = await db
    .select({ id: schema.portalMessages.id })
    .from(schema.portalMessages)
    .where(
      and(
        eq(schema.portalMessages.patientId, patientId),
        eq(schema.portalMessages.senderType as any, "patient"),
        sql`${schema.portalMessages.createdAt} > ${since}`,
      ),
    )
    .limit(1);
  return !!portalRow;
};

(DbStorage.prototype as any).createWorkflowInboxNotification = async function(
  data: { clinicId: number; patientId?: number | null; providerId?: number | null; type: string; title: string; message: string; severity?: string; relatedEntityId?: number | null },
): Promise<void> {
  await db.insert(schema.providerInboxNotifications).values({
    clinicId: data.clinicId,
    patientId: data.patientId ?? null,
    providerId: data.providerId ?? null,
    type: data.type,
    title: data.title,
    message: data.message,
    severity: data.severity ?? "normal",
    relatedEntityType: data.relatedEntityId ? "patient" : null,
    relatedEntityId: data.relatedEntityId ?? null,
  });
};

(DbStorage.prototype as any).listFormWorkflowRunsByWorkflow = async function(
  workflowId: number,
  clinicId: number,
): Promise<schema.FormWorkflowRun[]> {
  return db
    .select()
    .from(schema.formWorkflowRuns)
    .where(
      and(
        eq(schema.formWorkflowRuns.workflowId, workflowId),
        eq(schema.formWorkflowRuns.clinicId, clinicId),
      ),
    )
    .orderBy(desc(schema.formWorkflowRuns.createdAt))
    .limit(100);
};

// ── Layer 2.5: monitoring & manual controls ────────────────────────────────

(DbStorage.prototype as any).listStepStatesByRun = async function(
  runId: number,
): Promise<schema.FormWorkflowStepState[]> {
  return db
    .select()
    .from(schema.formWorkflowStepStates)
    .where(eq(schema.formWorkflowStepStates.runId, runId))
    .orderBy(asc(schema.formWorkflowStepStates.stepPosition));
};

(DbStorage.prototype as any).pauseWorkflowRun = async function(runId: number): Promise<void> {
  await db
    .update(schema.formWorkflowRuns)
    .set({ status: "paused", pausedAt: new Date() } as any)
    .where(
      and(
        eq(schema.formWorkflowRuns.id, runId),
        sql`${schema.formWorkflowRuns.status} IN ('running','waiting')`,
      ),
    );
};

(DbStorage.prototype as any).resumeWorkflowRun = async function(runId: number): Promise<void> {
  await db
    .update(schema.formWorkflowRuns)
    .set({ status: "running", pausedAt: null } as any)
    .where(
      and(
        eq(schema.formWorkflowRuns.id, runId),
        eq(schema.formWorkflowRuns.status, "paused"),
      ),
    );
};

// Returns true if step was eligible for retry (was failed) and was reset.
(DbStorage.prototype as any).retryWorkflowStep = async function(
  runId: number,
  stepPos: number,
): Promise<boolean> {
  const result = await db
    .update(schema.formWorkflowStepStates)
    .set({ status: "pending", lockedAt: null, executedAt: null, resultJson: null })
    .where(
      and(
        eq(schema.formWorkflowStepStates.runId, runId),
        eq(schema.formWorkflowStepStates.stepPosition, stepPos),
        eq(schema.formWorkflowStepStates.status, "failed"),
      ),
    )
    .returning({ id: schema.formWorkflowStepStates.id });
  return result.length > 0;
};

(DbStorage.prototype as any).skipWorkflowStep = async function(
  runId: number,
  stepPos: number,
  actorId: number | null,
  reason: string,
): Promise<void> {
  const existing = await (this as any).getWorkflowStepState(runId, stepPos);
  const auditJson = { manualAction: "skip", actorId, reason, at: new Date().toISOString() };

  if (existing) {
    await db
      .update(schema.formWorkflowStepStates)
      .set({
        status: "skipped",
        executedAt: new Date(),
        lockedAt: null,
        resultJson: { ...(existing.resultJson as any ?? {}), ...auditJson },
      })
      .where(eq(schema.formWorkflowStepStates.id, existing.id));
  } else {
    await db.insert(schema.formWorkflowStepStates).values({
      runId,
      stepPosition: stepPos,
      stepType: "manual_skip",
      status: "skipped",
      executedAt: new Date(),
      resultJson: auditJson,
    });
  }
  // Advance the run pointer past this step
  await db
    .update(schema.formWorkflowRuns)
    .set({ currentStepPosition: stepPos + 1 })
    .where(eq(schema.formWorkflowRuns.id, runId));
};

(DbStorage.prototype as any).logWorkflowMilestone = async function(
  patientId: number,
  clinicianId: number,
  content: string,
): Promise<void> {
  await db.insert(schema.portalMessages).values({
    patientId,
    clinicianId,
    senderType: "clinician",
    content,
    readAt: null,
    messageType: "system_event",
    visibility: "internal_only",
    deliveryChannel: null,
    externalDeliveryId: null,
    externalMessageId: null,
  });
};

// ─── Clinical Orders ──────────────────────────────────────────────────────────

(DbStorage.prototype as any).getClinicalOrdersByPatient = async function(
  patientId: number,
  clinicId: number,
): Promise<any[]> {
  const orders = await db
    .select()
    .from(schema.clinicalOrders)
    .where(and(eq(schema.clinicalOrders.patientId, patientId), eq(schema.clinicalOrders.clinicId, clinicId)))
    .orderBy(desc(schema.clinicalOrders.createdAt));
  if (!orders.length) return [];
  const orderIds = orders.map(o => o.id);
  const completions = await db.select().from(schema.orderTaskCompletions)
    .where(inArray(schema.orderTaskCompletions.orderId, orderIds));
  const byOrder = completions.reduce((acc, c) => {
    (acc[c.orderId] ??= []).push(c); return acc;
  }, {} as Record<number, typeof completions>);
  const providerIds = [...new Set(orders.map(o => o.orderingProviderUserId).filter((id): id is number => id != null))];
  const providerMap: Record<number, { firstName: string; lastName: string; title: string | null; npi: string | null; signatureImage: string | null }> = {};
  if (providerIds.length) {
    const providers = await db.select({
      id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName,
      title: schema.users.title, npi: schema.users.npi, signatureImage: schema.users.signatureImage,
    }).from(schema.users).where(inArray(schema.users.id, providerIds));
    for (const p of providers) providerMap[p.id] = p;
  }
  return orders.map(o => ({
    ...o,
    taskCompletions: byOrder[o.id] ?? [],
    orderingProvider: o.orderingProviderUserId ? (providerMap[o.orderingProviderUserId] ?? null) : null,
  }));
};

(DbStorage.prototype as any).getActiveClinicalOrders = async function(
  clinicId: number,
): Promise<any[]> {
  // Auto-promote any scheduled orders whose activateOn date has arrived
  const todayStr = new Date().toISOString().slice(0, 10);
  await db
    .update(schema.clinicalOrders)
    .set({ status: 'active' })
    .where(and(
      eq(schema.clinicalOrders.clinicId, clinicId),
      eq(schema.clinicalOrders.status, 'scheduled'),
      isNotNull(schema.clinicalOrders.activateOn),
      lte(schema.clinicalOrders.activateOn, todayStr),
    ));
  const orders = await db
    .select()
    .from(schema.clinicalOrders)
    .where(and(eq(schema.clinicalOrders.clinicId, clinicId), eq(schema.clinicalOrders.status, 'active')))
    .orderBy(desc(schema.clinicalOrders.createdAt));
  if (!orders.length) return [];
  const orderIds = orders.map(o => o.id);
  const completions = await db.select().from(schema.orderTaskCompletions)
    .where(inArray(schema.orderTaskCompletions.orderId, orderIds));
  const patientIds = [...new Set(orders.map(o => o.patientId))];
  const patients = await db
    .select({ id: schema.patients.id, firstName: schema.patients.firstName, lastName: schema.patients.lastName })
    .from(schema.patients).where(inArray(schema.patients.id, patientIds));
  const patientMap = Object.fromEntries(patients.map(p => [p.id, p]));
  const byOrder = completions.reduce((acc, c) => {
    (acc[c.orderId] ??= []).push(c); return acc;
  }, {} as Record<number, typeof completions>);
  const providerIds = [...new Set(orders.map(o => o.orderingProviderUserId).filter((id): id is number => id != null))];
  const providerMap: Record<number, { firstName: string; lastName: string; title: string | null; npi: string | null; signatureImage: string | null }> = {};
  if (providerIds.length) {
    const providers = await db.select({
      id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName,
      title: schema.users.title, npi: schema.users.npi, signatureImage: schema.users.signatureImage,
    }).from(schema.users).where(inArray(schema.users.id, providerIds));
    for (const p of providers) providerMap[p.id] = p;
  }
  return orders.map(o => ({
    ...o,
    taskCompletions: byOrder[o.id] ?? [],
    patientFirstName: patientMap[o.patientId]?.firstName ?? '',
    patientLastName: patientMap[o.patientId]?.lastName ?? '',
    orderingProvider: o.orderingProviderUserId ? (providerMap[o.orderingProviderUserId] ?? null) : null,
  }));
};

(DbStorage.prototype as any).createClinicalOrder = async function(
  data: schema.InsertClinicalOrder,
): Promise<schema.ClinicalOrder> {
  const [order] = await db
    .insert(schema.clinicalOrders)
    .values({ ...data, icd10Codes: data.icd10Codes ?? [] })
    .returning();
  return order;
};

(DbStorage.prototype as any).updateClinicalOrder = async function(
  id: number,
  data: Partial<schema.InsertClinicalOrder>,
  clinicId: number,
): Promise<schema.ClinicalOrder | undefined> {
  const [order] = await db
    .update(schema.clinicalOrders).set(data)
    .where(and(eq(schema.clinicalOrders.id, id), eq(schema.clinicalOrders.clinicId, clinicId)))
    .returning();
  return order;
};

(DbStorage.prototype as any).completeClinicalOrderTask = async function(
  orderId: number,
  taskKey: string,
  completedByUserId: number | null,
  completedByStaffId: number | null,
  note: string | null,
  clinicId: number,
  allTaskKeys: string[],
): Promise<{ completion: schema.OrderTaskCompletion | null; orderCompleted: boolean }> {
  const rows = await db
    .insert(schema.orderTaskCompletions)
    .values({ orderId, taskKey, completedByUserId, completedByStaffId, note })
    .onConflictDoNothing()
    .returning();
  const completion = rows[0] ?? null;
  const existing = await db.select({ taskKey: schema.orderTaskCompletions.taskKey })
    .from(schema.orderTaskCompletions).where(eq(schema.orderTaskCompletions.orderId, orderId));
  const doneKeys = new Set(existing.map(c => c.taskKey));
  const allDone = allTaskKeys.every(k => doneKeys.has(k));
  if (allDone) {
    await db.update(schema.clinicalOrders)
      .set({ status: 'completed', completedAt: new Date() })
      .where(and(eq(schema.clinicalOrders.id, orderId), eq(schema.clinicalOrders.clinicId, clinicId)));
  }
  return { completion, orderCompleted: allDone };
};

(DbStorage.prototype as any).uncompleteClinicalOrderTask = async function(
  orderId: number,
  taskKey: string,
  clinicId: number,
): Promise<void> {
  await db.delete(schema.orderTaskCompletions)
    .where(and(eq(schema.orderTaskCompletions.orderId, orderId), eq(schema.orderTaskCompletions.taskKey, taskKey)));
  await db.update(schema.clinicalOrders)
    .set({ status: 'active', completedAt: null })
    .where(and(eq(schema.clinicalOrders.id, orderId), eq(schema.clinicalOrders.clinicId, clinicId), eq(schema.clinicalOrders.status, 'completed')));
};

(DbStorage.prototype as any).cancelClinicalOrder = async function(
  id: number,
  clinicId: number,
  reason: string | null,
): Promise<schema.ClinicalOrder | undefined> {
  const [order] = await db.update(schema.clinicalOrders)
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason })
    .where(and(eq(schema.clinicalOrders.id, id), eq(schema.clinicalOrders.clinicId, clinicId)))
    .returning();
  return order;
};
