import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Tables NOT defined in shared/schema.ts that drizzle should leave alone.
  // The "session" table is created and managed by connect-pg-simple
  // (express-session store). It is intentionally not in our schema and
  // drizzle should never attempt to drop or alter it.
  tablesFilter: ["!session"],
});
