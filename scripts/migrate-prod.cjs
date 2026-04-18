/**
 * One-time production database migration script.
 * Run from Cloud Shell:
 *   export DATABASE_URL="<your-cloud-run-database-url>"
 *   node scripts/migrate-prod.cjs
 */

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrations = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(100)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(100)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamp`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end boolean NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS free_account boolean NOT NULL DEFAULT false`,
  `ALTER TABLE patient_form_assignments ADD COLUMN IF NOT EXISTS delivery_mode varchar(20) NOT NULL DEFAULT 'portal'`,
];

async function run() {
  const client = await pool.connect();
  try {
    console.log("Running production migrations...\n");
    for (const sql of migrations) {
      await client.query(sql);
      const col = sql.match(/ADD COLUMN IF NOT EXISTS (\S+)/)[1];
      console.log(`  OK: ${col}`);
    }
    console.log("\nAll migrations complete. Login should work now.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
