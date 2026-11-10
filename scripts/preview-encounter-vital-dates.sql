-- READ ONLY. Review in the intended environment only with separate permission.
-- No names, measurement values or note content are selected. No UPDATE/repair
-- is included. Multiple linked readings require human review, not deduplication.
BEGIN READ ONLY;
SELECT e.clinic_id, e.id AS encounter_id, e.patient_id, v.id AS vital_id,
       e.visit_date::date AS proposed_clinical_date,
       v.recorded_at::date AS existing_reading_date,
       v.created_at AS vital_created_at, e.created_at AS encounter_created_at,
       e.signed_at AS actual_signed_at,
       count(*) OVER (PARTITION BY e.id) AS linked_reading_count
FROM clinical_encounters e
JOIN patients p ON p.id = e.patient_id
JOIN patient_vitals v ON v.source_encounter_id = e.id AND v.patient_id = e.patient_id
WHERE v.source = 'clinic' AND v.monitoring_episode_id IS NULL
  AND ((e.clinic_id IS NOT NULL AND p.clinic_id = e.clinic_id)
       OR (e.clinic_id IS NULL AND p.clinic_id IS NULL AND p.user_id = e.clinician_id))
  AND v.recorded_at::date IS DISTINCT FROM e.visit_date::date
ORDER BY e.clinic_id, e.id, v.id;
ROLLBACK;
