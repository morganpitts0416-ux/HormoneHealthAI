import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";

/**
 * Development-only synthetic credential lookup.  The table is deliberately
 * absent from shared/schema.ts and prod-migrate.sql; the harness owns its
 * lifecycle.  Missing tables fail closed.
 */
export async function verifySyntheticCredential(
  executor: { execute: (query: any) => Promise<any> },
  email: string,
  password: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || !email.endsWith(".invalid")) return false;
  try {
    const result = await executor.execute(sql`
      SELECT password_hash
        FROM synthetic_patient_credentials
       WHERE normalized_email = ${email}
       LIMIT 1
    `);
    const row = result?.rows?.[0];
    return !!row?.password_hash && await bcrypt.compare(password, row.password_hash);
  } catch {
    return false;
  }
}