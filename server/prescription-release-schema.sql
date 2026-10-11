-- REVIEW ONLY: never invoked by application startup.
-- Apply AFTER target-schema inspection, backup and explicit approval.
BEGIN;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS prescription_address text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS prescription_phone varchar(50);
ALTER TABLE prescriber_credentials ADD COLUMN IF NOT EXISTS verified_npi varchar(10);
ALTER TABLE prescriber_credential_audit_events ADD COLUMN IF NOT EXISTS credential_snapshot jsonb;
-- No backfill from users.phone/address: these can be personal or another clinic.
-- Existing approvals need independent NPI re-verification; never auto-authorize.
CREATE UNIQUE INDEX IF NOT EXISTS prescriptions_id_clinic_idx ON prescriptions(id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS prescription_medications_id_clinic_idx ON prescription_medications(id, clinic_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prescription_documents_tenant_fk' AND conrelid='prescription_documents'::regclass) THEN
    ALTER TABLE prescription_documents ADD CONSTRAINT prescription_documents_tenant_fk
      FOREIGN KEY (prescription_id, clinic_id) REFERENCES prescriptions(id, clinic_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prescription_sigs_tenant_fk' AND conrelid='prescription_sigs'::regclass) THEN
    ALTER TABLE prescription_sigs ADD CONSTRAINT prescription_sigs_tenant_fk
      FOREIGN KEY (medication_id, clinic_id) REFERENCES prescription_medications(id, clinic_id) NOT VALID;
  END IF;
END $$;
-- Fail/roll back if historical rows have tenant mismatches; NEVER repair/delete
-- them automatically. Preflight and explicit review are prerequisites.
ALTER TABLE prescription_documents VALIDATE CONSTRAINT prescription_documents_tenant_fk;
ALTER TABLE prescription_sigs VALIDATE CONSTRAINT prescription_sigs_tenant_fk;
COMMIT;
