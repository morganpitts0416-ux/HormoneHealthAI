-- READ ONLY; safe operator template, NOT automatically executed.
-- Verify the actual target, approved schema baseline and backing database first.
SELECT table_name, column_name, data_type, is_nullable, column_default,
       character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' AND (
  table_name LIKE 'prescription_%' OR table_name = 'prescriptions' OR
  table_name IN ('prescriber_credentials','prescriber_credential_audit_events') OR
  (table_name = 'clinics' AND column_name IN ('id','address','phone'))
) ORDER BY table_name, ordinal_position;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND (
  tablename LIKE 'prescription_%' OR tablename IN ('prescriptions','prescriber_credentials','prescriber_credential_audit_events')
) ORDER BY tablename, indexname;
SELECT conrelid::regclass AS relation, conname, pg_get_constraintdef(oid), convalidated
FROM pg_constraint
WHERE conrelid::regclass::text LIKE 'prescription_%'
   OR conrelid::regclass::text IN ('prescriptions','prescriber_credentials','prescriber_credential_audit_events');
-- Run the following ONLY when the corresponding tables exist. These expose
-- aggregate counts, not patient or signature data. Stop on any nonzero count.
SELECT count(*) AS duplicate_documents FROM
  (SELECT prescription_id FROM prescription_documents GROUP BY prescription_id HAVING count(*) > 1) duplicates;
SELECT count(*) AS cross_clinic_documents FROM prescription_documents d
JOIN prescriptions p ON p.id = d.prescription_id WHERE d.clinic_id <> p.clinic_id;
SELECT count(*) AS cross_clinic_sigs FROM prescription_sigs s
JOIN prescription_medications m ON m.id = s.medication_id WHERE s.clinic_id <> m.clinic_id;
