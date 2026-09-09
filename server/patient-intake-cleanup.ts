/**
 * Internal, idempotent expiry transition.  It never deletes rows or touches
 * active flows, submissions, invites, or events.
 */
export async function cleanupExpiredPatientIntakeFlows(executor: { query: (text: string, values?: unknown[]) => Promise<any> }) {
  const result = await executor.query(
    `UPDATE patient_portal_invite_flows
        SET status = 'expired'
      WHERE status IN ('exchanged', 'authenticated')
        AND expires_at <= NOW()`,
  );
  const expired = Number(result.rowCount ?? 0);
  console.info(`[patient-intake-cleanup] expired=${expired}`);
  return { expired };
}