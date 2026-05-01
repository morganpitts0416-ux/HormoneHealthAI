-- ============================================================
-- SAFE PRODUCTION SCHEMA MIGRATION
-- Uses IF NOT EXISTS throughout — safe to run multiple times.
-- Does NOT touch primary keys or existing constraints.
-- ============================================================

-- ── users ───────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS npi VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_account BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS messaging_preference VARCHAR(20) NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS messaging_phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_messaging_provider VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_messaging_api_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_messaging_channel_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_messaging_webhook_secret VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_clinic_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_logo TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ── clinician_staff ─────────────────────────────────────────
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- ── providers ───────────────────────────────────────────────
-- Allow staff (nurses, MAs, aestheticians) to appear on the scheduling
-- calendar without requiring a row in the `users` table.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS staff_id INTEGER
  REFERENCES clinician_staff(id) ON DELETE SET NULL;

-- ── patients ────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_provider_id INTEGER;
-- Structured pharmacy details from Google Places lookup. Existing free-text
-- preferred_pharmacy column is left intact so legacy values keep displaying.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_address TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_phone VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_fax VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_ncpdp_id VARCHAR(30);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_place_id VARCHAR(200);

-- ── clinical_encounters ─────────────────────────────────────
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS diarized_transcript JSONB;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS clinical_extraction JSONB;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS evidence_suggestions JSONB;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS pattern_match JSONB;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS signed_by VARCHAR(300);
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS is_amended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS amended_at TIMESTAMP;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS encounter_versions JSONB;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS provider_id INTEGER;

-- ── New tables (created only if they don't exist) ────────────

CREATE TABLE IF NOT EXISTS baa_signatures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  signed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  signature_name VARCHAR(255) NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  baa_version VARCHAR(20) NOT NULL DEFAULT '1.0'
);

CREATE TABLE IF NOT EXISTS patient_portal_accounts (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  invite_token VARCHAR(255),
  invite_expires TIMESTAMP,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS published_protocols (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_result_id INTEGER REFERENCES lab_results(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id),
  supplements JSONB NOT NULL,
  clinician_notes TEXT,
  dietary_guidance TEXT,
  lab_date TIMESTAMP,
  published_at TIMESTAMP DEFAULT NOW() NOT NULL,
  first_viewed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_messages (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMP,
  external_message_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_recipes (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  recipe_data JSONB NOT NULL,
  saved_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS supplement_orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL,
  subtotal TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  patient_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clinician_supplement_settings (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
  discount_percent INTEGER NOT NULL DEFAULT 20,
  discount_flat_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clinician_supplements (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(100),
  dose VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  description TEXT,
  clinical_rationale TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  gender VARCHAR(10) NOT NULL DEFAULT 'both',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clinician_supplement_rules (
  id SERIAL PRIMARY KEY,
  supplement_id INTEGER NOT NULL REFERENCES clinician_supplements(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) NOT NULL DEFAULT 'lab',
  lab_marker VARCHAR(50),
  lab_min REAL,
  lab_max REAL,
  symptom_key VARCHAR(50),
  combination_logic VARCHAR(5) NOT NULL DEFAULT 'OR',
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  indication_text TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clinician_lab_preferences (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marker_key VARCHAR(50) NOT NULL,
  gender VARCHAR(10) NOT NULL DEFAULT 'both',
  display_name VARCHAR(100),
  unit VARCHAR(30),
  optimal_min REAL,
  optimal_max REAL,
  normal_min REAL,
  normal_max REAL,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clinical_encounters (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date TIMESTAMP NOT NULL,
  visit_type VARCHAR(50) NOT NULL DEFAULT 'follow-up',
  chief_complaint TEXT,
  transcription TEXT,
  audio_processed BOOLEAN NOT NULL DEFAULT false,
  linked_lab_result_id INTEGER REFERENCES lab_results(id) ON DELETE SET NULL,
  soap_note JSONB,
  soap_generated_at TIMESTAMP,
  patient_summary TEXT,
  summary_published BOOLEAN NOT NULL DEFAULT false,
  summary_published_at TIMESTAMP,
  clinician_notes TEXT,
  diarized_transcript JSONB,
  clinical_extraction JSONB,
  evidence_suggestions JSONB,
  pattern_match JSONB,
  signed_at TIMESTAMP,
  signed_by VARCHAR(300),
  is_amended BOOLEAN NOT NULL DEFAULT false,
  amended_at TIMESTAMP,
  encounter_versions JSONB,
  clinic_id INTEGER,
  provider_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  boulevard_appointment_id VARCHAR(255) NOT NULL,
  patient_name VARCHAR(200) NOT NULL,
  patient_email VARCHAR(255),
  patient_phone VARCHAR(50),
  service_type VARCHAR(255),
  staff_name VARCHAR(200),
  location_name VARCHAR(255),
  appointment_start TIMESTAMP NOT NULL,
  appointment_end TIMESTAMP,
  duration_minutes INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_charts (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_medications JSONB NOT NULL DEFAULT '[]',
  medical_history JSONB NOT NULL DEFAULT '[]',
  family_history JSONB NOT NULL DEFAULT '[]',
  social_history JSONB NOT NULL DEFAULT '[]',
  allergies JSONB NOT NULL DEFAULT '[]',
  surgical_history JSONB NOT NULL DEFAULT '[]',
  draft_extraction JSONB,
  draft_from_encounter_id INTEGER,
  last_reviewed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS medication_dictionaries (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  entry_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS medication_entries (
  id SERIAL PRIMARY KEY,
  dictionary_id INTEGER NOT NULL REFERENCES medication_dictionaries(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generic_name VARCHAR(255) NOT NULL,
  brand_names TEXT[] NOT NULL DEFAULT '{}',
  common_spoken_variants TEXT[] NOT NULL DEFAULT '{}',
  common_misspellings TEXT[] NOT NULL DEFAULT '{}',
  drug_class VARCHAR(255),
  subclass VARCHAR(255),
  route VARCHAR(100),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS clinics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100),
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  subscription_status VARCHAR(30),
  subscription_plan VARCHAR(30),
  max_providers INTEGER NOT NULL DEFAULT 1,
  base_provider_limit INTEGER NOT NULL DEFAULT 1,
  extra_provider_seats INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS clinic_memberships (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'provider',
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ── intake_forms (GHL webhook columns) ──────────────────────────────
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS ghl_webhook_url TEXT;
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS ghl_webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ── appointments (native scheduling additions) ──────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_id INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_type_id INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'native';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;
ALTER TABLE appointments ALTER COLUMN boulevard_appointment_id DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN patient_name DROP NOT NULL;

-- ── appointment_types ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_types (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  color VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ── provider_availability ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_availability (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ── calendar_blocks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_blocks (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  block_type VARCHAR(30) NOT NULL DEFAULT 'other',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ── patient_vitals ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_vitals (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  heart_rate INTEGER,
  weight_lbs REAL,
  height_inches REAL,
  bmi REAL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Note typing on clinical_encounters ──────────────────────────────
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS note_type VARCHAR(30) NOT NULL DEFAULT 'soap_provider';
ALTER TABLE clinical_encounters ADD COLUMN IF NOT EXISTS phone_contact JSONB;

-- ── note_templates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_templates (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  provider_id INTEGER,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  note_type VARCHAR(30) NOT NULL,
  blocks JSONB NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── note_phrases ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_phrases (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  provider_id INTEGER,
  title VARCHAR(200) NOT NULL,
  shortcut VARCHAR(50),
  content TEXT NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Backfill clinical_encounters.clinic_id from owning clinician's
--    default_clinic_id. Older encounters were created without a clinic
--    stamp, which made them invisible to other providers/staff in the
--    same clinic. This is a one-shot, idempotent fix — the API now
--    always stamps clinic_id on creation.
UPDATE clinical_encounters ce
SET clinic_id = u.default_clinic_id
FROM users u
WHERE ce.clinic_id IS NULL
  AND ce.clinician_id = u.id
  AND u.default_clinic_id IS NOT NULL;

-- ── Daily Check-In (Phase 1) ────────────────────────────────────────
-- All tables are new + additive. Default-off: absence of a settings row
-- means tracking is off for that patient. No existing tables are altered.
CREATE TABLE IF NOT EXISTS patient_tracking_settings (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tracking_mode VARCHAR(20) NOT NULL DEFAULT 'off',
  enabled BOOLEAN NOT NULL DEFAULT false,
  setup_completed BOOLEAN NOT NULL DEFAULT false,
  still_has_cycle BOOLEAN,
  cycles_regular BOOLEAN,
  on_hormone_therapy BOOLEAN,
  hysterectomy_status BOOLEAN,
  ovaries_status VARCHAR(20),
  last_activity_at TIMESTAMP,
  last_reminder_dismissed_at TIMESTAMP,
  reminder_preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS patient_tracking_settings_patient_idx
  ON patient_tracking_settings (patient_id);

CREATE TABLE IF NOT EXISTS patient_daily_checkins (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date VARCHAR(10) NOT NULL,
  weight REAL,
  food_protein_level VARCHAR(20),
  water_level VARCHAR(20),
  fiber_veggie_level VARCHAR(20),
  processed_food_level VARCHAR(20),
  alcohol_use BOOLEAN,
  food_notes TEXT,
  protein_grams REAL,
  calories REAL,
  carbs REAL,
  fat REAL,
  fiber_grams REAL,
  water_ounces REAL,
  sleep_hours REAL,
  sleep_quality INTEGER,
  night_sweats BOOLEAN,
  woke_during_night BOOLEAN,
  exercise_done BOOLEAN,
  exercise_type VARCHAR(100),
  exercise_minutes INTEGER,
  exercise_intensity VARCHAR(20),
  mood_score INTEGER,
  energy_score INTEGER,
  cravings_score INTEGER,
  hunger_score INTEGER,
  brain_fog_score INTEGER,
  anxiety_irritability_score INTEGER,
  gi_symptoms JSONB DEFAULT '[]'::jsonb,
  unexpected_bleeding BOOLEAN,
  other_symptoms TEXT,
  cycle_data JSONB,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS patient_daily_checkins_patient_date_idx
  ON patient_daily_checkins (patient_id, date);
CREATE INDEX IF NOT EXISTS patient_daily_checkins_patient_idx
  ON patient_daily_checkins (patient_id, date DESC);

CREATE TABLE IF NOT EXISTS patient_medication_adherence_logs (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medication_name VARCHAR(200) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'patient_chart',
  patient_reported_medication_id INTEGER,
  date VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patient_med_adherence_patient_date_idx
  ON patient_medication_adherence_logs (patient_id, date DESC);

CREATE TABLE IF NOT EXISTS patient_reported_medications (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  dose VARCHAR(100),
  frequency VARCHAR(100),
  type VARCHAR(20) NOT NULL DEFAULT 'supplement',
  route VARCHAR(50),
  reason TEXT,
  start_date VARCHAR(10),
  source VARCHAR(30) NOT NULL DEFAULT 'patient_reported',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  reviewed_by_provider BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMP,
  reviewed_by_user_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patient_reported_meds_patient_idx
  ON patient_reported_medications (patient_id, status);

CREATE TABLE IF NOT EXISTS provider_inbox_notifications (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  provider_id INTEGER,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id INTEGER,
  severity VARCHAR(20) NOT NULL DEFAULT 'normal',
  read_at TIMESTAMP,
  read_by_user_id INTEGER,
  dismissed_at TIMESTAMP,
  dismissed_by_user_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS provider_inbox_clinic_unread_idx
  ON provider_inbox_notifications (clinic_id, dismissed_at, read_at, created_at DESC);

-- ─── Vitals Monitoring Mode ──────────────────────────────────────────────
-- Add source-labeling + monitoring columns to patient_vitals (idempotent).
ALTER TABLE patient_vitals
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'clinic';
ALTER TABLE patient_vitals
  ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(5);
ALTER TABLE patient_vitals
  ADD COLUMN IF NOT EXISTS symptoms TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE patient_vitals
  ADD COLUMN IF NOT EXISTS monitoring_episode_id INTEGER;

CREATE INDEX IF NOT EXISTS patient_vitals_source_idx
  ON patient_vitals (patient_id, source, recorded_at DESC);
CREATE INDEX IF NOT EXISTS patient_vitals_episode_idx
  ON patient_vitals (monitoring_episode_id);

-- Clinician-prescribed vital monitoring episodes.
CREATE TABLE IF NOT EXISTS vitals_monitoring_episodes (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  vital_types TEXT[] NOT NULL,
  start_date VARCHAR(10) NOT NULL,
  end_date VARCHAR(10) NOT NULL,
  frequency_per_day INTEGER NOT NULL DEFAULT 1,
  instructions TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  completed_at TIMESTAMP,
  ended_early_by_user_id INTEGER,
  ended_early_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vitals_monitoring_episodes_patient_idx
  ON vitals_monitoring_episodes (patient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS vitals_monitoring_episodes_active_idx
  ON vitals_monitoring_episodes (status, end_date);

-- Audit + dedupe of fired alerts (urgent BP, missed-day, completion, etc).
CREATE TABLE IF NOT EXISTS vitals_monitoring_alerts (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES vitals_monitoring_episodes(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL,
  clinic_id INTEGER NOT NULL,
  alert_type VARCHAR(60) NOT NULL,
  trigger_vital_id INTEGER,
  alert_date VARCHAR(10),
  inbox_notification_id INTEGER,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vitals_monitoring_alerts_episode_idx
  ON vitals_monitoring_alerts (episode_id, alert_type);
CREATE INDEX IF NOT EXISTS vitals_monitoring_alerts_dedupe_idx
  ON vitals_monitoring_alerts (episode_id, alert_type, alert_date);

-- ── chart_review (collaborating physician chart review) ────
CREATE TABLE IF NOT EXISTS chart_review_agreements (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  mid_level_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_type VARCHAR(20) NOT NULL DEFAULT 'retrospective',
  quota_kind VARCHAR(10) NOT NULL DEFAULT 'percent',
  quota_value INTEGER NOT NULL DEFAULT 20,
  quota_period VARCHAR(10) NOT NULL DEFAULT 'month',
  enforcement_period VARCHAR(10) NOT NULL DEFAULT 'quarter',
  rule_controlled_substance BOOLEAN NOT NULL DEFAULT false,
  rule_new_diagnosis BOOLEAN NOT NULL DEFAULT false,
  min_quota_value INTEGER,
  physician_locked_fields TEXT[],
  physician_overridden_at TIMESTAMP,
  physician_overridden_by INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chart_review_agreements_clinic_idx
  ON chart_review_agreements (clinic_id, mid_level_user_id);

CREATE TABLE IF NOT EXISTS chart_review_collaborators (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES chart_review_agreements(id) ON DELETE CASCADE,
  physician_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL DEFAULT 'primary',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chart_review_collaborators_agreement_idx
  ON chart_review_collaborators (agreement_id);
CREATE INDEX IF NOT EXISTS chart_review_collaborators_physician_idx
  ON chart_review_collaborators (physician_user_id);

CREATE TABLE IF NOT EXISTS chart_review_items (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES chart_review_agreements(id) ON DELETE CASCADE,
  clinic_id INTEGER NOT NULL,
  encounter_id INTEGER NOT NULL REFERENCES clinical_encounters(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL,
  mid_level_user_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority VARCHAR(20) NOT NULL DEFAULT 'sample',
  mandatory_reasons TEXT[],
  signed_at TIMESTAMP NOT NULL,
  quota_period_key VARCHAR(10) NOT NULL,
  enforcement_due_at TIMESTAMP NOT NULL,
  assigned_reviewer_user_id INTEGER,
  reviewed_by_user_id INTEGER,
  reviewed_at TIMESTAMP,
  amendment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS chart_review_items_clinic_encounter_uq
  ON chart_review_items (clinic_id, encounter_id);
CREATE INDEX IF NOT EXISTS chart_review_items_agreement_status_idx
  ON chart_review_items (agreement_id, status);
CREATE INDEX IF NOT EXISTS chart_review_items_midlevel_idx
  ON chart_review_items (mid_level_user_id, status);
CREATE INDEX IF NOT EXISTS chart_review_items_period_idx
  ON chart_review_items (agreement_id, quota_period_key);

CREATE TABLE IF NOT EXISTS chart_review_comments (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES chart_review_items(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL,
  author_role VARCHAR(10) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'comment',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chart_review_comments_item_idx
  ON chart_review_comments (item_id, created_at);

-- ─── Chart Review Slice 2: prospective full-gate columns ───────────────────
ALTER TABLE clinical_encounters
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
ALTER TABLE clinical_encounters
  ADD COLUMN IF NOT EXISTS pending_collab_review BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Chart Review Slice 2: quotaKind backfill ─────────────────────────────
-- The CREATE TABLE above only fires for fresh deployments. Existing
-- production clinics created before Slice 2 still need this column added.
ALTER TABLE chart_review_agreements
  ADD COLUMN IF NOT EXISTS quota_kind VARCHAR(10) NOT NULL DEFAULT 'percent';

-- ─── Patient Documents (uploads + camera scans) ───────────────────────────
CREATE TABLE IF NOT EXISTS patient_documents (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  uploaded_by_user_id INTEGER,
  uploaded_by_name TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  notes TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'upload',
  file_data TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patient_documents_patient_idx
  ON patient_documents (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS patient_documents_clinic_idx
  ON patient_documents (clinic_id);

-- ── note_templates: optional /shortcut field (mirrors note_phrases) ─────
ALTER TABLE note_templates ADD COLUMN IF NOT EXISTS shortcut VARCHAR(50);
