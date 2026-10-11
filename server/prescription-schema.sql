-- REVIEW ONLY: not applied. Prescription tables only; no existing patient tables altered.
BEGIN;
CREATE TABLE IF NOT EXISTS "prescriber_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "clinic_id" integer NOT NULL,
  "license_state" varchar(2) NOT NULL,
  "license_number" varchar(100) NOT NULL,
  "license_type" varchar(50) NOT NULL,
  "license_expires_at" date,
  "dea_number" varchar(20),
  "dea_expires_at" date,
  "dea_state" varchar(2),
  "prescribing_authorized" boolean NOT NULL DEFAULT false,
  "verified_at" timestamp,
  "verified_by_user_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE no action ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "prescriber_credentials_user_clinic_idx" ON "prescriber_credentials" ("user_id", "clinic_id");
CREATE TABLE IF NOT EXISTS "prescription_pharmacies" (
  "id" serial PRIMARY KEY NOT NULL,
  "clinic_id" integer NOT NULL,
  "name" varchar(300) NOT NULL,
  "address" text,
  "phone" varchar(50),
  "fax" varchar(50),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "prescription_pharmacies_clinic_idx" ON "prescription_pharmacies" ("clinic_id");
CREATE TABLE IF NOT EXISTS "prescription_medication_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "clinic_id" integer NOT NULL,
  "owner_user_id" integer NOT NULL,
  "shared_with_clinic" boolean NOT NULL DEFAULT false,
  "medication_name" varchar(300) NOT NULL,
  "strength" varchar(100),
  "dosage_form" varchar(100),
  "dose" varchar(150),
  "route" varchar(100),
  "frequency" varchar(150),
  "sig" text NOT NULL,
  "quantity" varchar(100),
  "days_supply" integer,
  "refills" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "prescription_templates_clinic_idx" ON "prescription_medication_templates" ("clinic_id");
CREATE INDEX IF NOT EXISTS "prescription_templates_owner_idx" ON "prescription_medication_templates" ("owner_user_id");
CREATE TABLE IF NOT EXISTS "prescription_batches" (
  "id" serial PRIMARY KEY NOT NULL,
  "clinic_id" integer NOT NULL,
  "patient_id" integer NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "prescription_batches_patient_clinic_idx" ON "prescription_batches" ("patient_id", "clinic_id");
CREATE TABLE IF NOT EXISTS "prescriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" integer,
  "clinic_id" integer NOT NULL,
  "patient_id" integer NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "created_by_staff_id" integer,
  "prescriber_user_id" integer,
  "medication_name" varchar(300) NOT NULL,
  "strength" varchar(100),
  "dosage_form" varchar(100),
  "dose" varchar(150),
  "route" varchar(100),
  "frequency" varchar(150),
  "sig" text NOT NULL,
  "quantity" varchar(100) NOT NULL,
  "days_supply" integer,
  "refills" integer NOT NULL DEFAULT 0,
  "indication" text,
  "substitution_allowed" boolean NOT NULL DEFAULT true,
  "is_controlled_substance" boolean NOT NULL DEFAULT false,
  "pharmacy_name" varchar(300),
  "pharmacy_address" text,
  "pharmacy_phone" varchar(50),
  "pharmacy_fax" varchar(50),
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "signed_at" timestamp,
  "signed_by_user_id" integer,
  "prescriber_name_snapshot" varchar(200),
  "prescriber_title_snapshot" varchar(100),
  "prescriber_npi_snapshot" varchar(20),
  "prescriber_license_snapshot" varchar(100),
  "prescriber_license_state_snapshot" varchar(2),
  "prescriber_dea_snapshot" varchar(20),
  "prescriber_dea_expires_snapshot" date,
  "prescriber_dea_state_snapshot" varchar(2),
  "cancelled_at" timestamp,
  "cancelled_by_user_id" integer,
  "cancellation_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("batch_id") REFERENCES "prescription_batches" ("id") ON DELETE no action ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "prescriptions_patient_clinic_idx" ON "prescriptions" ("patient_id", "clinic_id");
CREATE INDEX IF NOT EXISTS "prescriptions_prescriber_idx" ON "prescriptions" ("prescriber_user_id");
CREATE INDEX IF NOT EXISTS "prescriptions_status_idx" ON "prescriptions" ("status");
CREATE TABLE IF NOT EXISTS "prescription_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "prescription_id" integer NOT NULL,
  "clinic_id" integer NOT NULL,
  "storage_key" text NOT NULL,
  "sha256_hash" varchar(64) NOT NULL,
  "mime_type" varchar(100) NOT NULL DEFAULT 'application/pdf',
  "signed_by_user_id" integer NOT NULL,
  "signed_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions" ("id") ON DELETE no action ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "prescription_documents_prescription_idx" ON "prescription_documents" ("prescription_id");
CREATE INDEX IF NOT EXISTS "prescription_documents_clinic_idx" ON "prescription_documents" ("clinic_id");
CREATE TABLE IF NOT EXISTS "prescription_transmissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "prescription_id" integer NOT NULL,
  "document_id" integer NOT NULL,
  "clinic_id" integer NOT NULL,
  "destination_fax" varchar(50) NOT NULL,
  "destination_name" varchar(300),
  "provider" varchar(50) NOT NULL DEFAULT 'spruce',
  "provider_transmission_id" varchar(200),
  "status" varchar(30) NOT NULL DEFAULT 'queued',
  "idempotency_key" varchar(100) NOT NULL,
  "requested_by_user_id" integer NOT NULL,
  "submitted_at" timestamp,
  "delivered_at" timestamp,
  "failed_at" timestamp,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions" ("id") ON DELETE no action ON UPDATE no action,
  FOREIGN KEY ("document_id") REFERENCES "prescription_documents" ("id") ON DELETE no action ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "prescription_transmissions_prescription_idx" ON "prescription_transmissions" ("prescription_id");
CREATE INDEX IF NOT EXISTS "prescription_transmissions_clinic_idx" ON "prescription_transmissions" ("clinic_id");
CREATE UNIQUE INDEX IF NOT EXISTS "prescription_transmissions_idempotency_idx" ON "prescription_transmissions" ("idempotency_key");
CREATE TABLE IF NOT EXISTS "prescription_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "prescription_id" integer NOT NULL,
  "clinic_id" integer NOT NULL,
  "actor_user_id" integer,
  "actor_staff_id" integer,
  "action" varchar(60) NOT NULL,
  "details" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("prescription_id") REFERENCES "prescriptions" ("id") ON DELETE no action ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "prescription_audit_events_prescription_idx" ON "prescription_audit_events" ("prescription_id");
CREATE INDEX IF NOT EXISTS "prescription_audit_events_clinic_idx" ON "prescription_audit_events" ("clinic_id");
CREATE INDEX IF NOT EXISTS "prescription_audit_events_created_at_idx" ON "prescription_audit_events" ("created_at");
CREATE TABLE IF NOT EXISTS "prescriber_credential_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "credential_id" integer NOT NULL,
  "clinic_id" integer NOT NULL,
  "provider_user_id" integer NOT NULL,
  "verifier_user_id" integer NOT NULL,
  "action" varchar(40) NOT NULL,
  "verification_source" varchar(300),
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  FOREIGN KEY ("credential_id") REFERENCES "prescriber_credentials" ("id") ON DELETE no action ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "prescriber_credential_audit_credential_idx" ON "prescriber_credential_audit_events" ("credential_id");
CREATE INDEX IF NOT EXISTS "prescriber_credential_audit_clinic_idx" ON "prescriber_credential_audit_events" ("clinic_id");
COMMIT;
