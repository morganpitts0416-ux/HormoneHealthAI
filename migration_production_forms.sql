-- ============================================================================
-- ClinIQ — FULL Production Migration: Smart Intake + Digital Forms Module
-- ============================================================================
-- SAFE:  All CREATE TABLE use IF NOT EXISTS
-- SAFE:  All ADD COLUMN use IF NOT EXISTS via DO blocks
-- SAFE:  All ADD CONSTRAINT use IF NOT EXISTS via DO blocks
-- SAFE:  No DROP, no TRUNCATE, no ALTER TYPE, no constraint removal
-- IDEMPOTENT:  Safe to run multiple times
-- ORDER:  Tables created in FK-dependency order
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. patients.primary_provider  (additive column on existing table)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'primary_provider'
  ) THEN
    ALTER TABLE patients ADD COLUMN primary_provider varchar(100);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. intake_forms  (root table — no FK dependencies on other form tables)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_forms (
  id            serial       PRIMARY KEY,
  clinician_id  integer      NOT NULL,
  name          text         NOT NULL,
  slug          varchar(120),
  description   text,
  category      varchar(60)  NOT NULL DEFAULT 'custom',
  version       integer      NOT NULL DEFAULT 1,
  status        varchar(20)  NOT NULL DEFAULT 'draft',
  branding_json jsonb,
  settings_json jsonb,
  requires_patient_signature boolean NOT NULL DEFAULT false,
  requires_staff_signature   boolean NOT NULL DEFAULT false,
  allow_link    boolean      NOT NULL DEFAULT true,
  allow_embed   boolean      NOT NULL DEFAULT true,
  allow_tablet  boolean      NOT NULL DEFAULT true,
  is_public     boolean      NOT NULL DEFAULT false,
  expiration_type           varchar(20) NOT NULL DEFAULT 'none',
  expiration_interval_days  integer,
  created_at    timestamp    NOT NULL DEFAULT now(),
  updated_at    timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'intake_forms_clinician_id_users_id_fk' AND table_name = 'intake_forms'
  ) THEN
    ALTER TABLE intake_forms
      ADD CONSTRAINT intake_forms_clinician_id_users_id_fk
      FOREIGN KEY (clinician_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. form_sections  (depends on intake_forms)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_sections (
  id                     serial    PRIMARY KEY,
  form_id                integer   NOT NULL,
  title                  text      NOT NULL,
  description            text,
  order_index            integer   NOT NULL DEFAULT 0,
  is_repeatable          boolean   NOT NULL DEFAULT false,
  conditional_logic_json jsonb,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sections_form_id_intake_forms_id_fk' AND table_name = 'form_sections'
  ) THEN
    ALTER TABLE form_sections
      ADD CONSTRAINT form_sections_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. form_fields  (depends on intake_forms, form_sections)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_fields (
  id                     serial       PRIMARY KEY,
  form_id                integer      NOT NULL,
  section_id             integer,
  field_key              varchar(120) NOT NULL,
  label                  text         NOT NULL,
  field_type             varchar(40)  NOT NULL,
  help_text              text,
  placeholder            text,
  is_required            boolean      NOT NULL DEFAULT false,
  is_hidden              boolean      NOT NULL DEFAULT false,
  default_value_json     jsonb,
  options_json           jsonb,
  validation_json        jsonb,
  conditional_logic_json jsonb,
  layout_json            jsonb,
  sync_config_json       jsonb,
  duplicate_handling_json jsonb,
  order_index            integer      NOT NULL DEFAULT 0,
  created_at             timestamp    NOT NULL DEFAULT now(),
  updated_at             timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_fields_form_id_intake_forms_id_fk' AND table_name = 'form_fields'
  ) THEN
    ALTER TABLE form_fields
      ADD CONSTRAINT form_fields_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_fields_section_id_form_sections_id_fk' AND table_name = 'form_fields'
  ) THEN
    ALTER TABLE form_fields
      ADD CONSTRAINT form_fields_section_id_form_sections_id_fk
      FOREIGN KEY (section_id) REFERENCES form_sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Additive column: layout_json (in case table existed before this column was added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'form_fields' AND column_name = 'layout_json'
  ) THEN
    ALTER TABLE form_fields ADD COLUMN layout_json jsonb;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. form_publications  (depends on intake_forms)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_publications (
  id                  serial       PRIMARY KEY,
  form_id             integer      NOT NULL,
  public_token        varchar(80)  NOT NULL UNIQUE,
  mode                varchar(20)  NOT NULL DEFAULT 'link',
  status              varchar(20)  NOT NULL DEFAULT 'active',
  embed_settings_json jsonb,
  link_settings_json  jsonb,
  expires_at          timestamp,
  created_at          timestamp    NOT NULL DEFAULT now(),
  updated_at          timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_publications_form_id_intake_forms_id_fk' AND table_name = 'form_publications'
  ) THEN
    ALTER TABLE form_publications
      ADD CONSTRAINT form_publications_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. patient_form_assignments  (depends on patients, intake_forms, users)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_form_assignments (
  id                   serial       PRIMARY KEY,
  patient_id           integer      NOT NULL,
  form_id              integer      NOT NULL,
  assigned_by          integer      NOT NULL,
  assigned_at          timestamp    NOT NULL DEFAULT now(),
  due_at               timestamp,
  status               varchar(20)  NOT NULL DEFAULT 'pending',
  completion_required  boolean      NOT NULL DEFAULT false,
  notes                text,
  created_at           timestamp    NOT NULL DEFAULT now(),
  updated_at           timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_form_assignments_patient_id_patients_id_fk' AND table_name = 'patient_form_assignments'
  ) THEN
    ALTER TABLE patient_form_assignments
      ADD CONSTRAINT patient_form_assignments_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_form_assignments_form_id_intake_forms_id_fk' AND table_name = 'patient_form_assignments'
  ) THEN
    ALTER TABLE patient_form_assignments
      ADD CONSTRAINT patient_form_assignments_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_form_assignments_assigned_by_users_id_fk' AND table_name = 'patient_form_assignments'
  ) THEN
    ALTER TABLE patient_form_assignments
      ADD CONSTRAINT patient_form_assignments_assigned_by_users_id_fk
      FOREIGN KEY (assigned_by) REFERENCES users(id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. form_submissions  (depends on intake_forms, users, patients, patient_form_assignments)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id                        serial       PRIMARY KEY,
  form_id                   integer      NOT NULL,
  form_version              integer      NOT NULL DEFAULT 1,
  clinician_id              integer,
  patient_id                integer,
  assignment_id             integer,
  submitted_by_patient      boolean      NOT NULL DEFAULT false,
  submitted_by_staff        boolean      NOT NULL DEFAULT false,
  submission_source         varchar(20)  NOT NULL DEFAULT 'link',
  status                    varchar(20)  NOT NULL DEFAULT 'submitted',
  submitted_at              timestamp    NOT NULL DEFAULT now(),
  expires_at                timestamp,
  raw_submission_json       jsonb        NOT NULL,
  normalized_submission_json jsonb,
  signature_json            jsonb,
  review_status             varchar(20)  NOT NULL DEFAULT 'pending',
  sync_status               varchar(20)  NOT NULL DEFAULT 'not_synced',
  sync_summary_json         jsonb,
  submitter_name            text,
  submitter_email           text,
  created_at                timestamp    NOT NULL DEFAULT now(),
  updated_at                timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_form_id_intake_forms_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_clinician_id_users_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_clinician_id_users_id_fk
      FOREIGN KEY (clinician_id) REFERENCES users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_patient_id_patients_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_assignment_id_patient_form_assignments_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_assignment_id_patient_form_assignments_id_fk
      FOREIGN KEY (assignment_id) REFERENCES patient_form_assignments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. form_sync_events  (depends on form_submissions, patients, users)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_sync_events (
  id                 serial       PRIMARY KEY,
  submission_id      integer      NOT NULL,
  patient_id         integer      NOT NULL,
  target_domain      varchar(40)  NOT NULL,
  target_record_id   integer,
  action_type        varchar(30)  NOT NULL,
  result_status      varchar(20)  NOT NULL DEFAULT 'success',
  review_required    boolean      NOT NULL DEFAULT false,
  duplicate_detected boolean      NOT NULL DEFAULT false,
  details_json       jsonb,
  created_by         integer,
  created_at         timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sync_events_submission_id_form_submissions_id_fk' AND table_name = 'form_sync_events'
  ) THEN
    ALTER TABLE form_sync_events
      ADD CONSTRAINT form_sync_events_submission_id_form_submissions_id_fk
      FOREIGN KEY (submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sync_events_patient_id_patients_id_fk' AND table_name = 'form_sync_events'
  ) THEN
    ALTER TABLE form_sync_events
      ADD CONSTRAINT form_sync_events_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sync_events_created_by_users_id_fk' AND table_name = 'form_sync_events'
  ) THEN
    ALTER TABLE form_sync_events
      ADD CONSTRAINT form_sync_events_created_by_users_id_fk
      FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. form_expiration_tracking  (depends on patients, intake_forms, form_submissions)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_expiration_tracking (
  id                    serial       PRIMARY KEY,
  patient_id            integer      NOT NULL,
  form_id               integer      NOT NULL,
  latest_submission_id  integer,
  expires_at            timestamp,
  renewal_status        varchar(20)  NOT NULL DEFAULT 'current',
  notified_at           timestamp,
  created_at            timestamp    NOT NULL DEFAULT now(),
  updated_at            timestamp    NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_expiration_tracking_patient_id_patients_id_fk' AND table_name = 'form_expiration_tracking'
  ) THEN
    ALTER TABLE form_expiration_tracking
      ADD CONSTRAINT form_expiration_tracking_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_expiration_tracking_form_id_intake_forms_id_fk' AND table_name = 'form_expiration_tracking'
  ) THEN
    ALTER TABLE form_expiration_tracking
      ADD CONSTRAINT form_expiration_tracking_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_expiration_tracking_latest_submission_id_form_submissions_' AND table_name = 'form_expiration_tracking'
  ) THEN
    ALTER TABLE form_expiration_tracking
      ADD CONSTRAINT form_expiration_tracking_latest_submission_id_form_submissions_
      FOREIGN KEY (latest_submission_id) REFERENCES form_submissions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- MIGRATION INVENTORY SUMMARY
-- ============================================================================
-- EXISTING TABLE CHANGES:
--   patients              → ADD COLUMN primary_provider varchar(100) [nullable]
--   form_fields            → ADD COLUMN layout_json jsonb [nullable] (if table pre-existed)
--
-- NEW TABLES (8):
--   1. intake_forms             (root — FK → users)
--   2. form_sections            (FK → intake_forms)
--   3. form_fields              (FK → intake_forms, form_sections)
--   4. form_publications        (FK → intake_forms; UNIQUE on public_token)
--   5. patient_form_assignments (FK → patients, intake_forms, users)
--   6. form_submissions         (FK → intake_forms, users, patients, patient_form_assignments)
--   7. form_sync_events         (FK → form_submissions, patients, users)
--   8. form_expiration_tracking (FK → patients, intake_forms, form_submissions)
--
-- INDEXES (auto-created):
--   - 8 primary key indexes (one per table, auto via serial PRIMARY KEY)
--   - 1 unique index: form_publications_public_token_unique
--
-- FOREIGN KEY CONSTRAINTS (16 total):
--   intake_forms:              1 FK  (clinician_id → users)
--   form_sections:             1 FK  (form_id → intake_forms)
--   form_fields:               2 FKs (form_id → intake_forms, section_id → form_sections)
--   form_publications:         1 FK  (form_id → intake_forms)
--   patient_form_assignments:  3 FKs (patient_id → patients, form_id → intake_forms, assigned_by → users)
--   form_submissions:          4 FKs (form_id → intake_forms, clinician_id → users, patient_id → patients, assignment_id → patient_form_assignments)
--   form_sync_events:          3 FKs (submission_id → form_submissions, patient_id → patients, created_by → users)
--   form_expiration_tracking:  3 FKs (patient_id → patients, form_id → intake_forms, latest_submission_id → form_submissions)
--
-- NOTHING DROPPED. NOTHING TRUNCATED. NOTHING ALTERED DESTRUCTIVELY.
-- ============================================================================
