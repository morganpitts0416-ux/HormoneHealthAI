-- ============================================================
-- SAFE PRODUCTION SCHEMA MIGRATION
-- Uses IF NOT EXISTS throughout — safe to run multiple times.
-- Does NOT touch primary keys or existing constraints.
-- ============================================================

-- ── users ───────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS npi VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinical_role VARCHAR(50) NOT NULL DEFAULT 'provider';
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
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS signature_image TEXT;
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS clinic_id INTEGER;

-- ── providers ───────────────────────────────────────────────
-- Allow staff (nurses, MAs, aestheticians) to appear on the scheduling
-- calendar without requiring a row in the `users` table.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS staff_id INTEGER
  REFERENCES clinician_staff(id) ON DELETE SET NULL;

-- ── patients ────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_provider_id INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;
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
-- patient_summary was added to the Drizzle schema after initial deploy
ALTER TABLE published_protocols ADD COLUMN IF NOT EXISTS patient_summary TEXT;

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
-- Columns added to patient_vitals after initial deploy
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS temperature REAL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'clinic';
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(5);
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS symptoms TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS respiratory_rate INTEGER;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS oxygen_saturation REAL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS pain_score INTEGER;

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
-- shortcut column added to note_templates after initial deploy
ALTER TABLE note_templates ADD COLUMN IF NOT EXISTS shortcut VARCHAR(50);

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

-- Add temperature column to patient_vitals for Vital Signs block (idempotent).
ALTER TABLE patient_vitals
  ADD COLUMN IF NOT EXISTS temperature REAL;

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

-- ── clinic_memberships: columns added after initial table creation ───────
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS clinical_role VARCHAR(30) NOT NULL DEFAULT 'provider';
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS admin_role VARCHAR(30) NOT NULL DEFAULT 'standard';
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS access_scope VARCHAR(30) NOT NULL DEFAULT 'full';
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS acceptance_status VARCHAR(30) NOT NULL DEFAULT 'active';
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS is_primary_clinic BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ── clinic_provider_invites ──────────────────────────────────────────────
-- Full table creation for fresh deployments.
CREATE TABLE IF NOT EXISTS clinic_provider_invites (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  clinical_role VARCHAR(50) NOT NULL DEFAULT 'provider',
  admin_role VARCHAR(30) NOT NULL DEFAULT 'standard',
  invite_token VARCHAR(255) NOT NULL UNIQUE,
  invite_expires TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Columns added after initial table creation (safe to run on existing tables).
ALTER TABLE clinic_provider_invites ADD COLUMN IF NOT EXISTS access_scope VARCHAR(30) NOT NULL DEFAULT 'full';
ALTER TABLE clinic_provider_invites ADD COLUMN IF NOT EXISTS credentials VARCHAR(20);
ALTER TABLE clinic_provider_invites ADD COLUMN IF NOT EXISTS npi VARCHAR(20);
ALTER TABLE clinic_provider_invites ADD COLUMN IF NOT EXISTS dea VARCHAR(30);
ALTER TABLE clinic_provider_invites ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE clinic_provider_invites ADD COLUMN IF NOT EXISTS agreement_id INTEGER;

-- ── simple_lab_uploads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simple_lab_uploads (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lab_date TIMESTAMP NOT NULL,
  entries JSONB NOT NULL,
  notes TEXT,
  ai_insight TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS simple_lab_uploads_patient_idx
  ON simple_lab_uploads (patient_id, lab_date DESC);
CREATE INDEX IF NOT EXISTS simple_lab_uploads_clinic_idx
  ON simple_lab_uploads (clinic_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE SCHEMA SYNC
-- All tables below use CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so this block is fully idempotent and safe on both existing and fresh DBs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── users (core — created at initial deploy; ALTER for columns added later) ─
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  title VARCHAR(50) NOT NULL,
  npi VARCHAR(20),
  clinic_name VARCHAR(200) NOT NULL,
  phone VARCHAR(30),
  address TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'clinician',
  subscription_status VARCHAR(30) NOT NULL DEFAULT 'active',
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_account BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
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

-- ── patients (core — created at initial deploy; ALTER for columns added later) ─
CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth TIMESTAMP,
  gender VARCHAR(10) NOT NULL DEFAULT 'male',
  mrn VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(30),
  preferred_pharmacy TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_address TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_phone VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_fax VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_ncpdp_id VARCHAR(30);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pharmacy_place_id VARCHAR(200);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS drivers_license VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_carrier VARCHAR(150);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_member_id VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_provider_id INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_provider VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;

-- ── lab_results (core — created at initial deploy) ───────────────────────
CREATE TABLE IF NOT EXISTS lab_results (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_date TIMESTAMP NOT NULL,
  lab_values JSONB NOT NULL,
  interpretation_result JSONB,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS provider_overrides JSONB;

-- ── saved_interpretations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_interpretations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  patient_name VARCHAR(200) NOT NULL,
  gender VARCHAR(10) NOT NULL,
  lab_date TIMESTAMP NOT NULL DEFAULT NOW(),
  lab_values JSONB NOT NULL,
  interpretation JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── clinician_staff ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinician_staff (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'staff',
  admin_role VARCHAR(30) NOT NULL DEFAULT 'standard',
  password_hash VARCHAR(255),
  invite_token VARCHAR(255),
  invite_expires TIMESTAMP,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── audit_logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  staff_id INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── providers ────────────────────────────────────────────────────────────
-- CRITICAL: queried by getActiveProviderCount() in every invite attempt.
CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  staff_id INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  display_name VARCHAR(200) NOT NULL,
  credentials VARCHAR(100),
  specialty VARCHAR(100),
  npi VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS providers_clinic_idx ON providers (clinic_id);

-- ── patient_assignments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_assignments (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  assignment_type VARCHAR(30) NOT NULL DEFAULT 'primary',
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── internal_messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_messages (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  thread_id INTEGER,
  message_type VARCHAR(30) NOT NULL DEFAULT 'direct',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── internal_message_participants ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_message_participants (
  id SERIAL PRIMARY KEY,
  message_thread_id INTEGER NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── intake_forms (created at initial deploy; ADD COLUMN for newer fields) ─
CREATE TABLE IF NOT EXISTS intake_forms (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug VARCHAR(120),
  description TEXT,
  category VARCHAR(60) NOT NULL DEFAULT 'custom',
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  branding_json JSONB,
  settings_json JSONB,
  requires_patient_signature BOOLEAN NOT NULL DEFAULT false,
  requires_staff_signature BOOLEAN NOT NULL DEFAULT false,
  allow_link BOOLEAN NOT NULL DEFAULT true,
  allow_embed BOOLEAN NOT NULL DEFAULT true,
  allow_tablet BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT false,
  expiration_type VARCHAR(20) NOT NULL DEFAULT 'none',
  expiration_interval_days INTEGER,
  ghl_webhook_url TEXT,
  ghl_webhook_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── form_sections ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_sections (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_repeatable BOOLEAN NOT NULL DEFAULT false,
  conditional_logic_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── form_fields ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_fields (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES form_sections(id) ON DELETE SET NULL,
  field_key VARCHAR(120) NOT NULL,
  smart_field_key VARCHAR(60),
  label TEXT NOT NULL,
  field_type VARCHAR(40) NOT NULL,
  help_text TEXT,
  placeholder TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  default_value_json JSONB,
  options_json JSONB,
  validation_json JSONB,
  conditional_logic_json JSONB,
  layout_json JSONB,
  sync_config_json JSONB,
  duplicate_handling_json JSONB,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── form_publications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_publications (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  public_token VARCHAR(80) NOT NULL UNIQUE,
  mode VARCHAR(20) NOT NULL DEFAULT 'link',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  embed_settings_json JSONB,
  link_settings_json JSONB,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── patient_form_assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_form_assignments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  due_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  completion_required BOOLEAN NOT NULL DEFAULT false,
  delivery_mode VARCHAR(20) NOT NULL DEFAULT 'portal',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── form_submissions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  form_version INTEGER NOT NULL DEFAULT 1,
  clinician_id INTEGER REFERENCES users(id),
  clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  assignment_id INTEGER REFERENCES patient_form_assignments(id) ON DELETE SET NULL,
  submitted_by_patient BOOLEAN NOT NULL DEFAULT false,
  submitted_by_staff BOOLEAN NOT NULL DEFAULT false,
  submission_source VARCHAR(20) NOT NULL DEFAULT 'link',
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  raw_submission_json JSONB NOT NULL,
  normalized_submission_json JSONB,
  signature_json JSONB,
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  sync_status VARCHAR(20) NOT NULL DEFAULT 'not_synced',
  sync_summary_json JSONB,
  submitter_name TEXT,
  submitter_email TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── form_sync_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_sync_events (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  target_domain VARCHAR(40) NOT NULL,
  target_record_id INTEGER,
  action_type VARCHAR(30) NOT NULL,
  result_status VARCHAR(20) NOT NULL DEFAULT 'success',
  review_required BOOLEAN NOT NULL DEFAULT false,
  duplicate_detected BOOLEAN NOT NULL DEFAULT false,
  details_json JSONB,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── form_expiration_tracking ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_expiration_tracking (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  latest_submission_id INTEGER REFERENCES form_submissions(id) ON DELETE SET NULL,
  expires_at TIMESTAMP,
  renewal_status VARCHAR(20) NOT NULL DEFAULT 'current',
  notified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── encounter_drafts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encounter_drafts (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transcription TEXT NOT NULL,
  visit_date VARCHAR(20) NOT NULL,
  visit_type VARCHAR(50) NOT NULL DEFAULT 'follow-up',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── diagnosis_presets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnosis_presets (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  codes JSONB NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── clinical_block_defaults ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_block_defaults (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ros_systems JSONB,
  pe_systems JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT clinical_block_defaults_clinic_provider_uq UNIQUE (clinic_id, provider_id)
);

-- ── encounter_templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encounter_templates (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER,
  name TEXT NOT NULL,
  note_type VARCHAR(30) NOT NULL DEFAULT 'soap',
  role_restriction VARCHAR(20) NOT NULL DEFAULT 'any',
  is_clinic_wide BOOLEAN NOT NULL DEFAULT FALSE,
  fields JSONB DEFAULT '[]',
  standing_instructions TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Spruce integration tables ─────────────────────────────────────────────────
-- All five tables are optional. The app starts and runs normally if they are
-- empty. Spruce features are gated behind is_enabled=false per clinic.

CREATE TABLE IF NOT EXISTS clinic_spruce_settings (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  spruce_org_id VARCHAR(200),
  spruce_webhook_endpoint_id VARCHAR(200),
  webhook_secret_encrypted TEXT,
  api_token_encrypted TEXT,
  spruce_auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spruce_routing_rules (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  spruce_phone_line_id VARCHAR(100),
  spruce_team_id VARCHAR(100),
  to_phone_number VARCHAR(30),
  label VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spruce_unrouted_events (
  id SERIAL PRIMARY KEY,
  raw_payload JSONB NOT NULL,
  event_type VARCHAR(100),
  routing_attempted JSONB,
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS spruce_messages (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  spruce_message_id VARCHAR(200),
  spruce_conversation_id VARCHAR(200),
  from_phone VARCHAR(30),
  to_phone VARCHAR(30),
  message_body TEXT,
  event_type VARCHAR(100),
  raw_payload JSONB NOT NULL,
  classified_workflow VARCHAR(50),
  classification_confidence VARCHAR(20),
  staff_replied_at TIMESTAMP,
  received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spruce_workflow_requests (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  spruce_message_id INTEGER REFERENCES spruce_messages(id) ON DELETE SET NULL,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  workflow VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  patient_phone VARCHAR(30),
  patient_name_extracted VARCHAR(200),
  request_summary TEXT,
  spruce_conversation_url TEXT,
  resolved_at TIMESTAMP,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── june_preferences ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS june_preferences (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER,
  category TEXT NOT NULL DEFAULT 'instruction',
  label TEXT NOT NULL,
  instruction TEXT NOT NULL,
  trigger_phrases TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Spruce shared-org routing columns (2025 Q2 update) ────────────────────────
-- spruceReceivingPhone: E.164 phone number for this clinic's Spruce line.
-- Primary routing key for the global webhook (/api/integrations/spruce/webhook).
-- Inbound events are matched via internalEndpoint.rawValue → this column → clinic_id.
ALTER TABLE clinic_spruce_settings
  ADD COLUMN IF NOT EXISTS spruce_receiving_phone VARCHAR(30);

-- spruceEventDedupeKey: prevents duplicate workflow requests when Spruce retries.
-- Format: "<eventType>:<objectId>" truncated to 220 chars, scoped per clinic_id.
ALTER TABLE spruce_messages
  ADD COLUMN IF NOT EXISTS spruce_event_dedupe_key VARCHAR(220);
ALTER TABLE spruce_messages
  ADD COLUMN IF NOT EXISTS message_direction VARCHAR(20);

-- patient_id: matched ClinIQ patient for this inbound Spruce message.
-- Populated at receipt time by phone-number lookup (clinic-scoped).
-- NULL = caller not found in patient list (new contact or unmatched phone).
ALTER TABLE spruce_messages
  ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL;

-- spruce_contact_name: Spruce external-participant display name, extracted from
-- externalParticipants[0].name|displayName at webhook receipt time.
-- Used to pre-fill "Add as new patient" dialog for unmatched contacts.
ALTER TABLE spruce_messages
  ADD COLUMN IF NOT EXISTS spruce_contact_name VARCHAR(200);

-- Phase 2: Spruce conversation state machine
-- One row per (clinic, conversationKey). Tracks staff-takeover / AI-mute state.
CREATE TABLE IF NOT EXISTS spruce_conversation_state (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_key VARCHAR(200) NOT NULL,
  state VARCHAR(30) NOT NULL DEFAULT 'open',
  ai_muted_at TIMESTAMP,
  ai_muted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS spruce_conv_state_clinic_key
  ON spruce_conversation_state(clinic_id, conversation_key);

-- Phase 2: Outbound message audit log
-- Immutable record of every message sent FROM ClinIQ into Spruce.
CREATE TABLE IF NOT EXISTS spruce_outbound_messages (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_key VARCHAR(200) NOT NULL,
  message_body TEXT NOT NULL,
  sent_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_request_id INTEGER REFERENCES spruce_workflow_requests(id) ON DELETE SET NULL,
  spruce_delivery_id VARCHAR(200),
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Phase 3: Archive support for Spruce conversation state
ALTER TABLE spruce_conversation_state
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS archived_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS spruce_archive_synced_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS spruce_archive_error TEXT;

-- Phase 3A: Spruce June acknowledgment + staff memo system
-- All new columns default OFF / null — no behaviour change for existing rows.
ALTER TABLE clinic_spruce_settings
  ADD COLUMN IF NOT EXISTS spruce_june_acknowledgments_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clinic_spruce_settings
  ADD COLUMN IF NOT EXISTS general_message_acknowledgment_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS spruce_workflow_settings (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  workflow VARCHAR(50) NOT NULL,
  allow_acknowledgment BOOLEAN NOT NULL DEFAULT FALSE,
  allow_follow_up_question BOOLEAN NOT NULL DEFAULT FALSE,
  max_june_turns INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS spruce_workflow_settings_clinic_workflow_idx
  ON spruce_workflow_settings(clinic_id, workflow);

ALTER TABLE spruce_workflow_requests
  ADD COLUMN IF NOT EXISTS june_ack_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS june_memo_text TEXT,
  ADD COLUMN IF NOT EXISTS june_turn_count INTEGER NOT NULL DEFAULT 0;

-- Resolution tracking columns — added after initial table creation.
-- resolved_at / resolved_by_user_id were included in the CREATE TABLE block
-- above (for fresh installs) but must also be added here for existing DBs.
ALTER TABLE spruce_workflow_requests
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE spruce_workflow_requests
  ADD COLUMN IF NOT EXISTS resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── Phase 2: Unified communication timeline ───────────────────────────────
-- portal_messages: message classification, patient-safety visibility gate,
-- channel routing label, and external dedup ID.
-- Defaults are set to the pre-existing behaviour so all existing rows remain
-- fully functional with no data changes required.
ALTER TABLE portal_messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(30) NOT NULL DEFAULT 'message';
ALTER TABLE portal_messages
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'patient_visible';
ALTER TABLE portal_messages
  ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(20);
ALTER TABLE portal_messages
  ADD COLUMN IF NOT EXISTS external_delivery_id VARCHAR(200);

-- patients: optional clinician-set preferred outbound channel (portal | spruce).
-- NULL = auto-derived from most-recent inbound activity.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS primary_communication_channel VARCHAR(20);

-- patient_message_mentions: records which staff users were @-mentioned in an
-- internal note, and drives staff_mention inbox notifications.
CREATE TABLE IF NOT EXISTS patient_message_mentions (
  id SERIAL PRIMARY KEY,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES portal_messages(id) ON DELETE CASCADE,
  mentioned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS patient_message_mentions_msg_user_idx
  ON patient_message_mentions(message_id, mentioned_user_id);

-- spruce_messages: atomic dedup guard — prevents concurrent webhook calls for
-- the same Spruce event from both passing the SELECT-based pre-check and
-- triggering duplicate June responses.  NULLs are exempt (PostgreSQL unique
-- indexes treat each NULL as distinct, so rows without a dedupeKey are
-- unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS spruce_messages_clinic_dedupe_key_idx
  ON spruce_messages(clinic_id, spruce_event_dedupe_key)
  WHERE spruce_event_dedupe_key IS NOT NULL;

-- ── Spruce June Playbook (T001) ───────────────────────────────────────────
-- 7 new tables + 2 new conv-state columns.
-- All IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to run multiple times.
-- All automation tables default isEnabled=FALSE — zero behaviour activates
-- without explicit clinic opt-in. Playbook tables are schema-only until a
-- clinic sets playbookEnabled=TRUE via the settings UI.

-- clinic_june_playbook: one row per clinic, controls all playbook settings.
CREATE TABLE IF NOT EXISTS clinic_june_playbook (
  id                       SERIAL PRIMARY KEY,
  clinic_id                INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  playbook_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  clinic_display_name      VARCHAR(200),
  timezone                 VARCHAR(100),
  business_hours           JSONB,
  holiday_closures         JSONB,
  after_hours_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  after_hours_instructions TEXT,
  emergency_language       TEXT,
  voice_style              VARCHAR(50),
  additional_tone_guidance TEXT,
  expected_response_time   TEXT,
  general_handoff_language TEXT,
  provider_naming_preference TEXT,
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_june_playbook_clinic_idx
  ON clinic_june_playbook(clinic_id);

-- clinic_knowledge_entries: per-clinic knowledge base topics June can reference.
CREATE TABLE IF NOT EXISTS clinic_knowledge_entries (
  id          SERIAL PRIMARY KEY,
  clinic_id   INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  topic_key   VARCHAR(100) NOT NULL,
  topic_label VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL,
  link        VARCHAR(500),
  link_label  VARCHAR(200),
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_knowledge_clinic_topic_idx
  ON clinic_knowledge_entries(clinic_id, topic_key);

-- spruce_workflow_playbooks: per-clinic, per-workflow AI instructions for June.
CREATE TABLE IF NOT EXISTS spruce_workflow_playbooks (
  id                    SERIAL PRIMARY KEY,
  clinic_id             INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  workflow              VARCHAR(50) NOT NULL,
  is_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  playbook_instructions TEXT,
  custom_links          JSONB,
  expected_next_step    TEXT,
  handoff_notes         TEXT,
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS spruce_workflow_playbook_clinic_workflow_idx
  ON spruce_workflow_playbooks(clinic_id, workflow);

-- clinic_automation_workflows: defines proactive outbound sequences.
-- Schema-only in this release — no execution logic is wired.
CREATE TABLE IF NOT EXISTS clinic_automation_workflows (
  id                          SERIAL PRIMARY KEY,
  clinic_id                   INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                        VARCHAR(200) NOT NULL,
  description                 TEXT,
  trigger_type                VARCHAR(50) NOT NULL,
  trigger_conditions          JSONB,
  stop_on_staff_reply         BOOLEAN NOT NULL DEFAULT TRUE,
  stop_on_patient_response    BOOLEAN NOT NULL DEFAULT TRUE,
  max_enrollments_per_patient INTEGER NOT NULL DEFAULT 1,
  cooldown_hours              INTEGER NOT NULL DEFAULT 72,
  is_enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
  cloned_from_template_id     INTEGER,
  created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- clinic_workflow_steps: ordered steps for a clinic_automation_workflow.
CREATE TABLE IF NOT EXISTS clinic_workflow_steps (
  id          SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES clinic_automation_workflows(id) ON DELETE CASCADE,
  step_order  INTEGER NOT NULL,
  step_type   VARCHAR(50) NOT NULL,
  config      JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- clinic_workflow_enrollments: one row per patient per workflow run.
CREATE TABLE IF NOT EXISTS clinic_workflow_enrollments (
  id                    SERIAL PRIMARY KEY,
  clinic_id             INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  workflow_id           INTEGER NOT NULL REFERENCES clinic_automation_workflows(id) ON DELETE CASCADE,
  patient_id            INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_phone         VARCHAR(30),
  spruce_conversation_key VARCHAR(200),
  trigger_source        JSONB,
  current_step_order    INTEGER NOT NULL DEFAULT 1,
  status                VARCHAR(30) NOT NULL DEFAULT 'active',
  lead_status           VARCHAR(30),
  next_action_at        TIMESTAMP,
  enrolled_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMP,
  stopped_reason        TEXT
);

-- clinic_workflow_execution_log: immutable audit trail — append-only.
CREATE TABLE IF NOT EXISTS clinic_workflow_execution_log (
  id                  SERIAL PRIMARY KEY,
  enrollment_id       INTEGER NOT NULL REFERENCES clinic_workflow_enrollments(id) ON DELETE CASCADE,
  step_id             INTEGER REFERENCES clinic_workflow_steps(id) ON DELETE SET NULL,
  step_order          INTEGER NOT NULL,
  step_type           VARCHAR(50) NOT NULL,
  outcome             VARCHAR(20) NOT NULL,
  outbound_message_id INTEGER REFERENCES spruce_outbound_messages(id) ON DELETE SET NULL,
  notes               TEXT,
  executed_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- spruce_conversation_state: two new columns for after-hours dedup and
-- workflow enrollment tracking. Both nullable — existing rows unaffected.
ALTER TABLE spruce_conversation_state
  ADD COLUMN IF NOT EXISTS after_hours_notice_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS active_workflow_enrollment_id INTEGER;

-- spruce_conversation_state: read-tracking and staff-assignment columns
-- added for viewed-state and Spruce assignment sync. Nullable; safe to add
-- to any existing deployment.
ALTER TABLE spruce_conversation_state
  ADD COLUMN IF NOT EXISTS staff_last_viewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS tagged_clinician_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── Form Workflow Builder (Layer 1) ─────────────────────────────────────────
-- Schema-only. No execution engine is wired in Layer 1.
-- All four tables are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- form_workflows: one row per clinic-defined workflow.
-- enabled defaults FALSE — workflows are off until explicitly turned on.
CREATE TABLE IF NOT EXISTS form_workflows (
  id               SERIAL PRIMARY KEY,
  clinic_id        INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name             VARCHAR(200) NOT NULL,
  description      TEXT,
  trigger_form_id  INTEGER REFERENCES intake_forms(id) ON DELETE SET NULL,
  enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  stop_conditions  JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- form_workflow_steps: ordered steps within a workflow.
-- config is pure JSONB — shape depends on step_type.
-- if_then_branch stores trueBranch/falseBranch inline as JSONB arrays.
CREATE TABLE IF NOT EXISTS form_workflow_steps (
  id          SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES form_workflows(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  step_type   VARCHAR(40) NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- form_workflow_runs: stub table for Layer 2 execution engine.
-- Layer 1 creates the schema; Layer 2 writes rows. No rows written in Layer 1.
CREATE TABLE IF NOT EXISTS form_workflow_runs (
  id                    SERIAL PRIMARY KEY,
  workflow_id           INTEGER NOT NULL REFERENCES form_workflows(id) ON DELETE CASCADE,
  clinic_id             INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  submission_id         INTEGER REFERENCES form_submissions(id) ON DELETE SET NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_step_position INTEGER NOT NULL DEFAULT 0,
  stopped_reason        TEXT,
  started_at            TIMESTAMP,
  completed_at          TIMESTAMP,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Layer 2 additions
ALTER TABLE form_workflow_runs ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE form_workflow_runs ADD COLUMN IF NOT EXISTS context_json JSONB;

-- form_workflow_step_states: per-step execution state within a run (stub for Layer 2).
CREATE TABLE IF NOT EXISTS form_workflow_step_states (
  id          SERIAL PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES form_workflow_runs(id) ON DELETE CASCADE,
  step_position INTEGER NOT NULL,
  step_type   VARCHAR(40) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  result_json JSONB,
  executed_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Layer 2 additions
ALTER TABLE form_workflow_step_states ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
ALTER TABLE form_workflow_step_states ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
-- Layer 2.5 additions
ALTER TABLE form_workflow_runs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP;

-- form_workflow_steps: branch columns added for if_then_branch step type.
-- Stores inline sub-step configs as JSONB arrays; used by the Layer 2 engine.
ALTER TABLE form_workflow_steps ADD COLUMN IF NOT EXISTS branch_true_steps  JSONB;
ALTER TABLE form_workflow_steps ADD COLUMN IF NOT EXISTS branch_false_steps JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Platform Admin / Ops Portal tables
-- Additive-only — no existing table is altered here.
-- ─────────────────────────────────────────────────────────────────────────────

-- platform_admins: one row per ops-portal user (separate from clinic staff).
CREATE TABLE IF NOT EXISTS platform_admins (
  id                    SERIAL PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  password_changed_at   TIMESTAMP,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'admin',
  status                TEXT NOT NULL DEFAULT 'active',
  mfa_secret_encrypted  TEXT,
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP,
  created_by_id         INTEGER,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at         TIMESTAMP,
  last_login_ip         TEXT,
  last_login_user_agent TEXT
);
CREATE INDEX IF NOT EXISTS platform_admins_email_idx ON platform_admins (email);

-- ops_sessions: session tokens for the ops portal (separate from clinic sessions).
-- Identified by a UUIDv4 stored in the ops.sid cookie (httpOnly, sameSite=strict).
CREATE TABLE IF NOT EXISTS ops_sessions (
  id         TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_sessions_admin_id_idx  ON ops_sessions (admin_id);
CREATE INDEX IF NOT EXISTS ops_sessions_expires_at_idx ON ops_sessions (expires_at);

-- ops_audit_log: append-only trail of all platform-admin actions.
CREATE TABLE IF NOT EXISTS ops_audit_log (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES platform_admins(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_audit_log_admin_id_idx  ON ops_audit_log (admin_id);
CREATE INDEX IF NOT EXISTS ops_audit_log_action_idx    ON ops_audit_log (action);
CREATE INDEX IF NOT EXISTS ops_audit_log_created_at_idx ON ops_audit_log (created_at);
CREATE INDEX IF NOT EXISTS ops_audit_log_target_idx    ON ops_audit_log (target_type, target_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- phi_access_log: append-only audit trail for every PHI read event.
-- Writes are fire-and-forget; failures are logged but never surface to clients.
-- Covers: patient profile views, lab result views, encounter views,
--         document downloads, and equivalent patient-portal endpoints.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phi_access_log (
  id          SERIAL PRIMARY KEY,
  accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  actor_type  TEXT NOT NULL,   -- 'clinician' | 'patient_portal' | 'ops_admin'
  actor_id    INTEGER,         -- clinician id or patient id
  clinic_id   INTEGER,
  action      TEXT NOT NULL,   -- e.g. 'view_patient_profile' | 'view_lab_results'
  patient_id  INTEGER,
  resource_id TEXT,            -- encounter id, document id, etc.
  ip_address  TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS phi_access_log_actor_idx       ON phi_access_log (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS phi_access_log_patient_idx     ON phi_access_log (patient_id);
CREATE INDEX IF NOT EXISTS phi_access_log_accessed_at_idx ON phi_access_log (accessed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema Drift Patch — 2026-06
-- Root cause: patient_vitals.respiratory_rate / oxygen_saturation / pain_score
-- were missing from production, causing 500 errors on vitals endpoints.
-- This section covers all tables/columns identified during the post-incident
-- audit that existed in shared/schema.ts but were absent from prod-migrate.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── clinic_memberships.created_at ───────────────────────────────────────────
-- The original CREATE TABLE above used 'joined_at' as the timestamp column.
-- shared/schema.ts maps 'created_at' (Drizzle camelCase: createdAt) which is
-- the column name used by all ORM queries.  Add it safely for existing rows.
ALTER TABLE clinic_memberships ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- ── form_bundles ─────────────────────────────────────────────────────────────
-- Packet / bundle feature: groups multiple intake forms into a single
-- patient-facing packet.  Added to schema.ts but never in prod-migrate.sql.
CREATE TABLE IF NOT EXISTS form_bundles (
  id           SERIAL PRIMARY KEY,
  clinic_id    INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS form_bundles_clinic_idx ON form_bundles (clinic_id);

-- ── form_bundle_items ────────────────────────────────────────────────────────
-- Junction table: which intake forms belong to which bundle, and in what order.
CREATE TABLE IF NOT EXISTS form_bundle_items (
  id          SERIAL PRIMARY KEY,
  bundle_id   INTEGER NOT NULL REFERENCES form_bundles(id) ON DELETE CASCADE,
  form_id     INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS form_bundle_items_bundle_idx ON form_bundle_items (bundle_id);

-- ── patient_packet_assignments ───────────────────────────────────────────────
-- One row per patient per bundle assignment.  Tracks completion state and
-- stores the secure token used by the patient-portal packet URL.
CREATE TABLE IF NOT EXISTS patient_packet_assignments (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  bundle_id        INTEGER NOT NULL REFERENCES form_bundles(id),
  clinician_id     INTEGER NOT NULL REFERENCES users(id),
  clinic_id        INTEGER REFERENCES clinics(id) ON DELETE CASCADE,
  packet_token     VARCHAR(80) NOT NULL UNIQUE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  form_order_json  JSONB,
  prefill_json     JSONB,
  return_url       TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS patient_packet_assignments_patient_idx
  ON patient_packet_assignments (patient_id, status);
CREATE INDEX IF NOT EXISTS patient_packet_assignments_token_idx
  ON patient_packet_assignments (packet_token);

-- ── clinical_orders ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_orders (
  id                    SERIAL PRIMARY KEY,
  clinic_id             INTEGER NOT NULL,
  patient_id            INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by_user_id    INTEGER NOT NULL,
  created_by_staff_id   INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  order_type            VARCHAR(30) NOT NULL,
  subtype               VARCHAR(150) NOT NULL,
  referring_to          VARCHAR(200),
  facility_address      TEXT,
  facility_fax          VARCHAR(30),
  reason                TEXT,
  icd10_codes           TEXT[],
  diagnosis_code        TEXT,
  diagnosis_name        TEXT,
  cpt_code              TEXT,
  cpt_description       TEXT,
  priority              VARCHAR(20) NOT NULL DEFAULT 'routine',
  target_date           TEXT,
  draw_date             TEXT,
  activate_on           TEXT,
  recurrence_months     INTEGER,
  assigned_to_user_id   INTEGER,
  assigned_to_staff_id  INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  notes                 TEXT,
  completed_at          TIMESTAMP,
  cancelled_at          TIMESTAMP,
  cancel_reason         TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clinical_orders_clinic_patient_idx
  ON clinical_orders (clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS clinical_orders_status_idx
  ON clinical_orders (clinic_id, status);

-- Add new columns to clinical_orders if table already existed without them
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS diagnosis_code   TEXT;
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS diagnosis_name   TEXT;
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS cpt_code         TEXT;
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS cpt_description  TEXT;
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS draw_date        TEXT;
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS activate_on      TEXT;

-- ── order_task_completions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_task_completions (
  id                    SERIAL PRIMARY KEY,
  order_id              INTEGER NOT NULL REFERENCES clinical_orders(id) ON DELETE CASCADE,
  task_key              VARCHAR(50) NOT NULL,
  completed_by_user_id  INTEGER,
  completed_by_staff_id INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  completed_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  note                  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS order_task_completions_order_task_idx
  ON order_task_completions (order_id, task_key);

-- ── ordering provider on clinical_orders ──────────────────────────────────────
ALTER TABLE clinical_orders ADD COLUMN IF NOT EXISTS ordering_provider_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── Phase C: Extended demographic columns on patients ─────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS race                           VARCHAR(80);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ethnicity                      VARCHAR(60);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status                 VARCHAR(40);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation                     VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name         VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(60);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone        VARCHAR(30);

-- ── Phase A: Structured patient medications ───────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_medications (
  id                             SERIAL PRIMARY KEY,
  patient_id                     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id                      INTEGER NOT NULL,
  drug_name                      VARCHAR(200) NOT NULL,
  generic_name                   VARCHAR(200),
  strength                       VARCHAR(50),
  strength_unit                  VARCHAR(20),
  form                           VARCHAR(50),
  route                          VARCHAR(50),
  sig                            TEXT,
  quantity                       VARCHAR(50),
  days_supply                    INTEGER,
  refills                        INTEGER,
  prescribing_provider           VARCHAR(200),
  start_date                     TIMESTAMP,
  indication                     TEXT,
  status                         VARCHAR(20) NOT NULL DEFAULT 'active',
  discontinued_at                TIMESTAMP,
  discontinued_reason            TEXT,
  discontinued_by_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  discontinued_by_staff_id       INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  source                         VARCHAR(30) NOT NULL DEFAULT 'staff',
  source_raw_text                TEXT,
  form_submission_id             INTEGER,
  reviewed_by_provider           BOOLEAN NOT NULL DEFAULT TRUE,
  reviewed_by_provider_id        INTEGER,
  last_reviewed_at               TIMESTAMP,
  created_at                     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_staff_id            INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL,
  updated_by_user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_staff_id            INTEGER REFERENCES clinician_staff(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS patient_medications_patient_id_idx
  ON patient_medications (patient_id);
CREATE INDEX IF NOT EXISTS patient_medications_clinic_id_idx
  ON patient_medications (clinic_id);
CREATE INDEX IF NOT EXISTS patient_medications_patient_clinic_idx
  ON patient_medications (patient_id, clinic_id);
CREATE INDEX IF NOT EXISTS patient_medications_status_idx
  ON patient_medications (status);
CREATE INDEX IF NOT EXISTS patient_medications_source_idx
  ON patient_medications (source);
CREATE INDEX IF NOT EXISTS patient_medications_form_submission_id_idx
  ON patient_medications (form_submission_id);

-- Fix clinic owners whose membership row was created with admin_role = 'standard'
-- instead of 'owner'. Idempotent: only updates rows that still need fixing.
UPDATE clinic_memberships cm
SET admin_role = 'owner'
FROM clinics c
WHERE cm.clinic_id = c.id
  AND cm.user_id = c.owner_user_id
  AND cm.admin_role = 'standard';

-- ── Clinic branding columns (added after initial clinics table creation) ──────
-- These were missing from the original CREATE TABLE statement, causing
-- GET /api/clinic/branding and PATCH /api/clinic/branding to 500 in production
-- with "column does not exist" errors.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS primary_color        VARCHAR(7);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS accent_color         VARCHAR(7);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS form_background_color VARCHAR(7);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_logo          TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS footer_text          TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS fax                  VARCHAR(30);

-- ── form_submissions.clinic_id (added after initial table creation) ───────────
-- Without this column dashboard notifications and staff submission viewing both
-- fail in production: getFormSubmissionsByClinic can't scope by clinic so staff
-- see 0 results; GET /api/form-submissions/:id returns 404 for clinic members
-- because the NULL clinicId never matches the session clinic.
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE;

-- Backfill clinic_id for existing submissions that were created before this
-- column existed, using the owning intake_form's clinic_id.
UPDATE form_submissions fs
SET    clinic_id = f.clinic_id
FROM   intake_forms f
WHERE  fs.form_id   = f.id
  AND  fs.clinic_id IS NULL
  AND  f.clinic_id  IS NOT NULL;

-- ── form_submissions indexes (performance) ────────────────────────────────────
-- Without these, getFormSubmissionsByClinic does full-table correlated subquery
-- scans that hang on large datasets. Applied idempotently.
CREATE INDEX IF NOT EXISTS form_submissions_clinic_id_idx     ON form_submissions (clinic_id);
CREATE INDEX IF NOT EXISTS form_submissions_clinician_id_idx  ON form_submissions (clinician_id);
CREATE INDEX IF NOT EXISTS form_submissions_patient_id_idx    ON form_submissions (patient_id);
CREATE INDEX IF NOT EXISTS form_submissions_form_id_idx       ON form_submissions (form_id);
