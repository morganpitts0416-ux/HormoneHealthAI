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

-- ── patients ────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_provider_id INTEGER;

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
