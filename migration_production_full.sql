-- ============================================================================
-- ClinIQ — COMPREHENSIVE Production Migration
-- All schema changes required before deploying latest codebase
-- ============================================================================
-- SAFE:  All CREATE TABLE use IF NOT EXISTS
-- SAFE:  All ADD COLUMN use IF NOT EXISTS via DO blocks
-- SAFE:  All ADD CONSTRAINT use IF NOT EXISTS via DO blocks
-- SAFE:  No DROP, no TRUNCATE, no ALTER TYPE, no constraint removal
-- IDEMPOTENT:  Safe to run multiple times without side effects
-- ORDER:  Tables created in FK-dependency order
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A — USERS TABLE: Additive columns (Stripe billing, clinic, branding)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='role') THEN
    ALTER TABLE users ADD COLUMN role varchar(20) NOT NULL DEFAULT 'clinician';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='subscription_status') THEN
    ALTER TABLE users ADD COLUMN subscription_status varchar(30) NOT NULL DEFAULT 'active';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='stripe_customer_id') THEN
    ALTER TABLE users ADD COLUMN stripe_customer_id varchar(100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='stripe_subscription_id') THEN
    ALTER TABLE users ADD COLUMN stripe_subscription_id varchar(100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='stripe_current_period_end') THEN
    ALTER TABLE users ADD COLUMN stripe_current_period_end timestamp;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='stripe_cancel_at_period_end') THEN
    ALTER TABLE users ADD COLUMN stripe_cancel_at_period_end boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='free_account') THEN
    ALTER TABLE users ADD COLUMN free_account boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='notes') THEN
    ALTER TABLE users ADD COLUMN notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_reset_token') THEN
    ALTER TABLE users ADD COLUMN password_reset_token varchar(255);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_reset_expires') THEN
    ALTER TABLE users ADD COLUMN password_reset_expires timestamp;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='login_attempts') THEN
    ALTER TABLE users ADD COLUMN login_attempts integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='locked_until') THEN
    ALTER TABLE users ADD COLUMN locked_until timestamp;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='messaging_preference') THEN
    ALTER TABLE users ADD COLUMN messaging_preference varchar(20) NOT NULL DEFAULT 'none';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='messaging_phone') THEN
    ALTER TABLE users ADD COLUMN messaging_phone varchar(30);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='external_messaging_provider') THEN
    ALTER TABLE users ADD COLUMN external_messaging_provider varchar(30);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='external_messaging_api_key') THEN
    ALTER TABLE users ADD COLUMN external_messaging_api_key text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='external_messaging_channel_id') THEN
    ALTER TABLE users ADD COLUMN external_messaging_channel_id varchar(100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='external_messaging_webhook_secret') THEN
    ALTER TABLE users ADD COLUMN external_messaging_webhook_secret varchar(100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='default_clinic_id') THEN
    ALTER TABLE users ADD COLUMN default_clinic_id integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='user_type') THEN
    ALTER TABLE users ADD COLUMN user_type varchar(30);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='clinic_logo') THEN
    ALTER TABLE users ADD COLUMN clinic_logo text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='signature_image') THEN
    ALTER TABLE users ADD COLUMN signature_image text;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B — BAA SIGNATURES TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS baa_signatures (
  id              serial       PRIMARY KEY,
  user_id         integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signed_at       timestamp    NOT NULL DEFAULT now(),
  signature_name  varchar(255) NOT NULL,
  ip_address      varchar(100),
  user_agent      text,
  baa_version     varchar(20)  NOT NULL DEFAULT '1.0'
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION C — PATIENTS TABLE: Additive columns (multi-clinic)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients' AND column_name='clinic_id') THEN
    ALTER TABLE patients ADD COLUMN clinic_id integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients' AND column_name='primary_provider_id') THEN
    ALTER TABLE patients ADD COLUMN primary_provider_id integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients' AND column_name='primary_provider') THEN
    ALTER TABLE patients ADD COLUMN primary_provider varchar(100);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION D — CLINICIAN STAFF TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinician_staff (
  id              serial       PRIMARY KEY,
  clinician_id    integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email           varchar(255) NOT NULL UNIQUE,
  first_name      varchar(100) NOT NULL,
  last_name       varchar(100) NOT NULL,
  role            varchar(50)  NOT NULL DEFAULT 'staff',
  password_hash   varchar(255),
  invite_token    varchar(255),
  invite_expires  timestamp,
  is_active       boolean      NOT NULL DEFAULT true,
  login_attempts  integer      NOT NULL DEFAULT 0,
  locked_until    timestamp,
  created_at      timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION E — PATIENT PORTAL ACCOUNTS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_portal_accounts (
  id                    serial       PRIMARY KEY,
  patient_id            integer      NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
  email                 varchar(255) NOT NULL UNIQUE,
  password_hash         varchar(255),
  invite_token          varchar(255),
  invite_expires        timestamp,
  password_reset_token  varchar(255),
  password_reset_expires timestamp,
  is_active             boolean      NOT NULL DEFAULT true,
  last_login_at         timestamp,
  created_at            timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION F — PUBLISHED PROTOCOLS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS published_protocols (
  id               serial       PRIMARY KEY,
  patient_id       integer      NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_result_id    integer      REFERENCES lab_results(id) ON DELETE CASCADE,
  clinician_id     integer      NOT NULL REFERENCES users(id),
  supplements      jsonb        NOT NULL,
  clinician_notes  text,
  dietary_guidance text,
  lab_date         timestamp,
  published_at     timestamp    NOT NULL DEFAULT now(),
  first_viewed_at  timestamp
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION G — PORTAL MESSAGES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portal_messages (
  id                   serial       PRIMARY KEY,
  patient_id           integer      NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id         integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_type          varchar(20)  NOT NULL,
  content              text         NOT NULL,
  read_at              timestamp,
  external_message_id  varchar(100),
  created_at           timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION H — SAVED RECIPES (portal)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_recipes (
  id          serial    PRIMARY KEY,
  patient_id  integer   NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  food_name   text      NOT NULL,
  recipe_name text      NOT NULL,
  recipe_data jsonb     NOT NULL,
  saved_at    timestamp NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION I — SUPPLEMENT ORDERS (portal)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supplement_orders (
  id            serial       PRIMARY KEY,
  patient_id    integer      NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id  integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items         jsonb        NOT NULL,
  subtotal      text         NOT NULL,
  status        varchar(30)  NOT NULL DEFAULT 'pending',
  patient_notes text,
  created_at    timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION J — AUDIT LOGS (HIPAA)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id             serial       PRIMARY KEY,
  clinician_id   integer      REFERENCES users(id) ON DELETE SET NULL,
  staff_id       integer,
  action         varchar(100) NOT NULL,
  resource_type  varchar(50),
  resource_id    integer,
  patient_id     integer      REFERENCES patients(id) ON DELETE SET NULL,
  ip_address     varchar(45),
  user_agent     text,
  details        jsonb,
  created_at     timestamp    NOT NULL DEFAULT now()
);

-- Add staff_id FK only if clinician_staff exists (it was created above)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_logs_staff_id_clinician_staff_id_fk' AND table_name = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_staff_id_clinician_staff_id_fk
      FOREIGN KEY (staff_id) REFERENCES clinician_staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION K — CLINICIAN SUPPLEMENT SETTINGS + CATALOG + RULES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinician_supplement_settings (
  id                serial       PRIMARY KEY,
  clinician_id      integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  discount_type     varchar(20)  NOT NULL DEFAULT 'percent',
  discount_percent  integer      NOT NULL DEFAULT 20,
  discount_flat_cents integer    NOT NULL DEFAULT 0,
  updated_at        timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinician_supplements (
  id                  serial       PRIMARY KEY,
  clinician_id        integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                varchar(200) NOT NULL,
  brand               varchar(100),
  dose                varchar(200) NOT NULL,
  category            varchar(50)  NOT NULL DEFAULT 'general',
  description         text,
  clinical_rationale  text,
  price_cents         integer      NOT NULL DEFAULT 0,
  is_active           boolean      NOT NULL DEFAULT true,
  gender              varchar(10)  NOT NULL DEFAULT 'both',
  sort_order          integer      NOT NULL DEFAULT 0,
  created_at          timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinician_supplement_rules (
  id                serial       PRIMARY KEY,
  supplement_id     integer      NOT NULL REFERENCES clinician_supplements(id) ON DELETE CASCADE,
  clinician_id      integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type      varchar(20)  NOT NULL DEFAULT 'lab',
  lab_marker        varchar(50),
  lab_min           real,
  lab_max           real,
  symptom_key       varchar(50),
  combination_logic varchar(5)   NOT NULL DEFAULT 'OR',
  priority          varchar(10)  NOT NULL DEFAULT 'medium',
  indication_text   text,
  created_at        timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION L — CLINICIAN LAB PREFERENCES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinician_lab_preferences (
  id            serial       PRIMARY KEY,
  clinician_id  integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marker_key    varchar(50)  NOT NULL,
  gender        varchar(10)  NOT NULL DEFAULT 'both',
  display_name  varchar(100),
  unit          varchar(30),
  optimal_min   real,
  optimal_max   real,
  normal_min    real,
  normal_max    real,
  notes         text,
  updated_at    timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION M — CLINICAL ENCOUNTERS (with signing/amendment + multi-clinic cols)
-- ════════════════════════════════════════════════════════════════════════════

-- The table likely already exists; add newer columns if missing

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='signed_at') THEN
    ALTER TABLE clinical_encounters ADD COLUMN signed_at timestamp;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='signed_by') THEN
    ALTER TABLE clinical_encounters ADD COLUMN signed_by varchar(300);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='is_amended') THEN
    ALTER TABLE clinical_encounters ADD COLUMN is_amended boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='amended_at') THEN
    ALTER TABLE clinical_encounters ADD COLUMN amended_at timestamp;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='encounter_versions') THEN
    ALTER TABLE clinical_encounters ADD COLUMN encounter_versions jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='clinic_id') THEN
    ALTER TABLE clinical_encounters ADD COLUMN clinic_id integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='provider_id') THEN
    ALTER TABLE clinical_encounters ADD COLUMN provider_id integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='diarized_transcript') THEN
    ALTER TABLE clinical_encounters ADD COLUMN diarized_transcript jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='clinical_extraction') THEN
    ALTER TABLE clinical_encounters ADD COLUMN clinical_extraction jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='evidence_suggestions') THEN
    ALTER TABLE clinical_encounters ADD COLUMN evidence_suggestions jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinical_encounters' AND column_name='pattern_match') THEN
    ALTER TABLE clinical_encounters ADD COLUMN pattern_match jsonb;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION N — PATIENT CHARTS (EHR)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_charts (
  id                       serial    PRIMARY KEY,
  patient_id               integer   NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id             integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_medications      jsonb     NOT NULL DEFAULT '[]'::jsonb,
  medical_history          jsonb     NOT NULL DEFAULT '[]'::jsonb,
  family_history           jsonb     NOT NULL DEFAULT '[]'::jsonb,
  social_history           jsonb     NOT NULL DEFAULT '[]'::jsonb,
  allergies                jsonb     NOT NULL DEFAULT '[]'::jsonb,
  surgical_history         jsonb     NOT NULL DEFAULT '[]'::jsonb,
  draft_extraction         jsonb,
  draft_from_encounter_id  integer,
  last_reviewed_at         timestamp,
  updated_at               timestamp NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION O — MEDICATION DICTIONARY
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS medication_dictionaries (
  id            serial       PRIMARY KEY,
  clinician_id  integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      varchar(255) NOT NULL,
  entry_count   integer      NOT NULL DEFAULT 0,
  uploaded_at   timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medication_entries (
  id                      serial       PRIMARY KEY,
  dictionary_id           integer      NOT NULL REFERENCES medication_dictionaries(id) ON DELETE CASCADE,
  clinician_id            integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generic_name            varchar(255) NOT NULL,
  brand_names             text[]       NOT NULL DEFAULT '{}',
  common_spoken_variants  text[]       NOT NULL DEFAULT '{}',
  common_misspellings     text[]       NOT NULL DEFAULT '{}',
  drug_class              varchar(255),
  subclass                varchar(255),
  route                   varchar(100),
  notes                   text
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION P — MULTI-CLINIC SUITE TABLES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinics (
  id                    serial       PRIMARY KEY,
  name                  varchar(200) NOT NULL,
  slug                  varchar(100),
  owner_user_id         integer      REFERENCES users(id) ON DELETE SET NULL,
  is_active             boolean      NOT NULL DEFAULT true,
  subscription_status   varchar(30),
  subscription_plan     varchar(30),
  max_providers         integer      NOT NULL DEFAULT 1,
  base_provider_limit   integer      NOT NULL DEFAULT 1,
  extra_provider_seats  integer      NOT NULL DEFAULT 0,
  stripe_customer_id    varchar(100),
  stripe_subscription_id varchar(100),
  trial_ends_at         timestamp,
  created_at            timestamp    NOT NULL DEFAULT now(),
  updated_at            timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinic_memberships (
  id                serial       PRIMARY KEY,
  clinic_id         integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id           integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              varchar(30)  NOT NULL DEFAULT 'provider',
  is_active         boolean      NOT NULL DEFAULT true,
  is_primary_clinic boolean      NOT NULL DEFAULT true,
  created_at        timestamp    NOT NULL DEFAULT now(),
  updated_at        timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS providers (
  id            serial       PRIMARY KEY,
  clinic_id     integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id       integer      REFERENCES users(id) ON DELETE SET NULL,
  display_name  varchar(200) NOT NULL,
  credentials   varchar(100),
  specialty     varchar(100),
  npi           varchar(20),
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamp    NOT NULL DEFAULT now(),
  updated_at    timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_assignments (
  id                 serial       PRIMARY KEY,
  clinic_id          integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id         integer      NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id        integer      NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  assignment_type    varchar(30)  NOT NULL DEFAULT 'primary',
  is_active          boolean      NOT NULL DEFAULT true,
  assigned_at        timestamp    NOT NULL DEFAULT now(),
  assigned_by_user_id integer    REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamp    NOT NULL DEFAULT now(),
  updated_at         timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_messages (
  id                 serial       PRIMARY KEY,
  clinic_id          integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  sender_user_id     integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id  integer      REFERENCES users(id) ON DELETE SET NULL,
  patient_id         integer      REFERENCES patients(id) ON DELETE SET NULL,
  subject            varchar(255),
  body               text         NOT NULL,
  thread_id          integer,
  message_type       varchar(30)  NOT NULL DEFAULT 'direct',
  is_read            boolean      NOT NULL DEFAULT false,
  created_at         timestamp    NOT NULL DEFAULT now(),
  updated_at         timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_message_participants (
  id                serial       PRIMARY KEY,
  message_thread_id integer      NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  user_id           integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at      timestamp,
  created_at        timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_types (
  id                serial       PRIMARY KEY,
  clinic_id         integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name              varchar(100) NOT NULL,
  description       text,
  duration_minutes  integer      NOT NULL DEFAULT 30,
  color             varchar(20),
  is_active         boolean      NOT NULL DEFAULT true,
  created_at        timestamp    NOT NULL DEFAULT now(),
  updated_at        timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_availability (
  id           serial       PRIMARY KEY,
  clinic_id    integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id  integer      NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week  integer      NOT NULL,
  start_time   time         NOT NULL,
  end_time     time         NOT NULL,
  timezone     varchar(50),
  is_active    boolean      NOT NULL DEFAULT true,
  created_at   timestamp    NOT NULL DEFAULT now(),
  updated_at   timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_blocks (
  id           serial       PRIMARY KEY,
  clinic_id    integer      NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id  integer      NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  title        varchar(200) NOT NULL,
  start_at     timestamp    NOT NULL,
  end_at       timestamp    NOT NULL,
  block_type   varchar(30)  NOT NULL DEFAULT 'other',
  notes        text,
  created_at   timestamp    NOT NULL DEFAULT now(),
  updated_at   timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION Q — SMART INTAKE + DIGITAL FORMS (8 tables + additive columns)
-- ════════════════════════════════════════════════════════════════════════════

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'intake_forms_clinician_id_users_id_fk' AND table_name = 'intake_forms'
  ) THEN
    ALTER TABLE intake_forms
      ADD CONSTRAINT intake_forms_clinician_id_users_id_fk
      FOREIGN KEY (clinician_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sections_form_id_intake_forms_id_fk' AND table_name = 'form_sections'
  ) THEN
    ALTER TABLE form_sections
      ADD CONSTRAINT form_sections_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_fields_form_id_intake_forms_id_fk' AND table_name = 'form_fields'
  ) THEN
    ALTER TABLE form_fields
      ADD CONSTRAINT form_fields_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_fields_section_id_form_sections_id_fk' AND table_name = 'form_fields'
  ) THEN
    ALTER TABLE form_fields
      ADD CONSTRAINT form_fields_section_id_form_sections_id_fk
      FOREIGN KEY (section_id) REFERENCES form_sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Additive column in case form_fields existed before layout_json was added
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='form_fields' AND column_name='layout_json') THEN
    ALTER TABLE form_fields ADD COLUMN layout_json jsonb;
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_publications_form_id_intake_forms_id_fk' AND table_name = 'form_publications'
  ) THEN
    ALTER TABLE form_publications
      ADD CONSTRAINT form_publications_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_form_assignments_patient_id_patients_id_fk' AND table_name = 'patient_form_assignments'
  ) THEN
    ALTER TABLE patient_form_assignments
      ADD CONSTRAINT patient_form_assignments_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_form_assignments_form_id_intake_forms_id_fk' AND table_name = 'patient_form_assignments'
  ) THEN
    ALTER TABLE patient_form_assignments
      ADD CONSTRAINT patient_form_assignments_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_form_assignments_assigned_by_users_id_fk' AND table_name = 'patient_form_assignments'
  ) THEN
    ALTER TABLE patient_form_assignments
      ADD CONSTRAINT patient_form_assignments_assigned_by_users_id_fk
      FOREIGN KEY (assigned_by) REFERENCES users(id);
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_form_id_intake_forms_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_clinician_id_users_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_clinician_id_users_id_fk
      FOREIGN KEY (clinician_id) REFERENCES users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_patient_id_patients_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_submissions_assignment_id_patient_form_assignments_id_fk' AND table_name = 'form_submissions'
  ) THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_assignment_id_patient_form_assignments_id_fk
      FOREIGN KEY (assignment_id) REFERENCES patient_form_assignments(id) ON DELETE SET NULL;
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sync_events_submission_id_form_submissions_id_fk' AND table_name = 'form_sync_events'
  ) THEN
    ALTER TABLE form_sync_events
      ADD CONSTRAINT form_sync_events_submission_id_form_submissions_id_fk
      FOREIGN KEY (submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sync_events_patient_id_patients_id_fk' AND table_name = 'form_sync_events'
  ) THEN
    ALTER TABLE form_sync_events
      ADD CONSTRAINT form_sync_events_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_sync_events_created_by_users_id_fk' AND table_name = 'form_sync_events'
  ) THEN
    ALTER TABLE form_sync_events
      ADD CONSTRAINT form_sync_events_created_by_users_id_fk
      FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_expiration_tracking_patient_id_patients_id_fk' AND table_name = 'form_expiration_tracking'
  ) THEN
    ALTER TABLE form_expiration_tracking
      ADD CONSTRAINT form_expiration_tracking_patient_id_patients_id_fk
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_expiration_tracking_form_id_intake_forms_id_fk' AND table_name = 'form_expiration_tracking'
  ) THEN
    ALTER TABLE form_expiration_tracking
      ADD CONSTRAINT form_expiration_tracking_form_id_intake_forms_id_fk
      FOREIGN KEY (form_id) REFERENCES intake_forms(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'form_expiration_tracking_latest_submission_id_form_submissions_' AND table_name = 'form_expiration_tracking'
  ) THEN
    ALTER TABLE form_expiration_tracking
      ADD CONSTRAINT form_expiration_tracking_latest_submission_id_form_submissions_
      FOREIGN KEY (latest_submission_id) REFERENCES form_submissions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION R — CORE DATA TABLES (lab_results, saved_interpretations, appointments)
-- ════════════════════════════════════════════════════════════════════════════
-- These three tables are core to the original app and should already exist
-- in production. Included here for completeness / safety net.

CREATE TABLE IF NOT EXISTS lab_results (
  id                     serial    PRIMARY KEY,
  patient_id             integer   NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_date               timestamp NOT NULL,
  lab_values             jsonb     NOT NULL,
  interpretation_result  jsonb,
  notes                  text,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_interpretations (
  id             serial       PRIMARY KEY,
  user_id        integer      REFERENCES users(id) ON DELETE CASCADE,
  patient_name   varchar(200) NOT NULL,
  gender         varchar(10)  NOT NULL,
  lab_date       timestamp    NOT NULL DEFAULT now(),
  lab_values     jsonb        NOT NULL,
  interpretation jsonb        NOT NULL,
  created_at     timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id                        serial       PRIMARY KEY,
  user_id                   integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id                integer      REFERENCES patients(id) ON DELETE SET NULL,
  boulevard_appointment_id  varchar(255) NOT NULL,
  patient_name              varchar(200) NOT NULL,
  patient_email             varchar(255),
  patient_phone             varchar(50),
  service_type              varchar(255),
  staff_name                varchar(200),
  location_name             varchar(255),
  appointment_start         timestamp    NOT NULL,
  appointment_end           timestamp,
  duration_minutes          integer,
  status                    varchar(50)  NOT NULL DEFAULT 'scheduled',
  notes                     text,
  raw_payload               jsonb,
  created_at                timestamp    NOT NULL DEFAULT now(),
  updated_at                timestamp    NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION S — SESSION TABLE (express-session / connect-pg-simple)
-- ════════════════════════════════════════════════════════════════════════════
-- connect-pg-simple auto-creates this, but ensure it exists for safety

CREATE TABLE IF NOT EXISTS session (
  sid    varchar      NOT NULL PRIMARY KEY,
  sess   jsonb        NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- NOTHING DROPPED. NOTHING TRUNCATED. NOTHING ALTERED DESTRUCTIVELY.
-- SAFE TO RUN MULTIPLE TIMES (fully idempotent).
-- ============================================================================
