-- REVIEW ONLY. Not applied, not included in automatic startup migrations.
-- Apply only after approval, following prescription-schema.sql if needed.
BEGIN;
CREATE TABLE IF NOT EXISTS prescription_medications (
  id serial PRIMARY KEY,
  clinic_id integer NOT NULL,
  medication_name varchar(300) NOT NULL,
  strength varchar(100) NOT NULL,
  dosage_form varchar(100) NOT NULL,
  identity_key varchar(64) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prescription_medications_identity_idx
  ON prescription_medications (clinic_id, identity_key);
CREATE INDEX IF NOT EXISTS prescription_medications_clinic_idx
  ON prescription_medications (clinic_id);
CREATE TABLE IF NOT EXISTS prescription_sigs (
  id serial PRIMARY KEY,
  clinic_id integer NOT NULL,
  medication_id integer NOT NULL REFERENCES prescription_medications(id),
  sig text NOT NULL,
  dose varchar(150),
  route varchar(100),
  frequency varchar(150),
  identity_key varchar(64) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id integer NOT NULL,
  created_by_staff_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prescription_sigs_identity_idx
  ON prescription_sigs (clinic_id, medication_id, identity_key);
CREATE INDEX IF NOT EXISTS prescription_sigs_clinic_medication_idx
  ON prescription_sigs (clinic_id, medication_id);
COMMIT;
