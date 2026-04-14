-- ============================================================================
-- ClinIQ Production Migration Script
-- Run this on your Cloud Run / Cloud SQL production database
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================================================

-- 1. Missing column: patients.preferred_pharmacy
ALTER TABLE patients ADD COLUMN IF NOT EXISTS preferred_pharmacy TEXT;

-- 2. Missing column: clinician_staff.admin_role
ALTER TABLE clinician_staff ADD COLUMN IF NOT EXISTS admin_role VARCHAR(30) NOT NULL DEFAULT 'standard';

-- 3. Table: clinic_provider_invites (provider invite system)
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

-- 4. Table: intake_forms
CREATE TABLE IF NOT EXISTS intake_forms (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug VARCHAR(120),
  description TEXT,
  category VARCHAR(60) NOT NULL DEFAULT 'custom',
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  branding_json JSONB,
  settings_json JSONB,
  requires_patient_signature BOOLEAN NOT NULL DEFAULT FALSE,
  requires_staff_signature BOOLEAN NOT NULL DEFAULT FALSE,
  allow_link BOOLEAN NOT NULL DEFAULT TRUE,
  allow_embed BOOLEAN NOT NULL DEFAULT TRUE,
  allow_tablet BOOLEAN NOT NULL DEFAULT TRUE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  expiration_type VARCHAR(20) NOT NULL DEFAULT 'none',
  expiration_interval_days INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. Table: form_sections
CREATE TABLE IF NOT EXISTS form_sections (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_repeatable BOOLEAN NOT NULL DEFAULT FALSE,
  conditional_logic_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Table: form_fields
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
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
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
-- Ensure smart_field_key exists if table was previously created without it
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS smart_field_key VARCHAR(60);
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 7. Table: form_publications
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

-- 8. Table: patient_form_assignments
CREATE TABLE IF NOT EXISTS patient_form_assignments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  due_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  completion_required BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 9. Table: form_submissions
CREATE TABLE IF NOT EXISTS form_submissions (
  id SERIAL PRIMARY KEY,
  form_id INTEGER NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  form_version INTEGER NOT NULL DEFAULT 1,
  clinician_id INTEGER REFERENCES users(id),
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  assignment_id INTEGER REFERENCES patient_form_assignments(id) ON DELETE SET NULL,
  submitted_by_patient BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_by_staff BOOLEAN NOT NULL DEFAULT FALSE,
  submission_source VARCHAR(20) NOT NULL DEFAULT 'link',
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  raw_submission_json JSONB NOT NULL DEFAULT '{}',
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

-- 10. Table: form_sync_events
CREATE TABLE IF NOT EXISTS form_sync_events (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  target_domain VARCHAR(40) NOT NULL,
  target_record_id INTEGER,
  action_type VARCHAR(30) NOT NULL,
  result_status VARCHAR(20) NOT NULL DEFAULT 'success',
  review_required BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_detected BOOLEAN NOT NULL DEFAULT FALSE,
  details_json JSONB,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 11. Table: form_expiration_tracking
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

-- 12. Table: encounter_drafts
CREATE TABLE IF NOT EXISTS encounter_drafts (
  id SERIAL PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transcription TEXT NOT NULL,
  visit_date VARCHAR(20) NOT NULL,
  visit_type VARCHAR(50) NOT NULL DEFAULT 'follow-up',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 14. Add clinic_id to intake_forms (clinic-scoped forms)
ALTER TABLE intake_forms ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE;

-- 15. Add clinic_id to form_submissions (clinic-scoped submissions)
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS clinic_id INTEGER REFERENCES clinics(id) ON DELETE CASCADE;

-- 16. Backfill clinic_id on existing intake_forms from the creating clinician's defaultClinicId
UPDATE intake_forms SET clinic_id = u.default_clinic_id
FROM users u
WHERE intake_forms.clinician_id = u.id AND intake_forms.clinic_id IS NULL AND u.default_clinic_id IS NOT NULL;

-- 17. Backfill clinic_id on existing form_submissions from the linked form
UPDATE form_submissions SET clinic_id = f.clinic_id
FROM intake_forms f
WHERE form_submissions.form_id = f.id AND form_submissions.clinic_id IS NULL AND f.clinic_id IS NOT NULL;

-- ============================================================================
-- Done! All missing columns and tables have been added.
-- ============================================================================
