/** Resolve the Postgres URL to use for tests, isolated from the dev database. */
export function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set; cannot derive a test database URL");
  }

  const url = new URL(databaseUrl);
  url.pathname = "/crypto_dashboard_test";
  return url.toString();
}
