export function databaseName(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must use the postgresql protocol.");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name || name.includes("/")) throw new Error("TEST_DATABASE_URL must identify one database.");
  return name;
}

function normalizedDatabaseIdentity(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${databaseName(databaseUrl)}`;
}

export function authorizedTestEnvironment(environment) {
  const testUrl = environment.TEST_DATABASE_URL?.trim();
  if (!testUrl) throw new Error("TEST_DATABASE_URL is required for database-backed tests.");

  const allowed = new Set(
    (environment.AUTHORIZED_TEST_DATABASES ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const name = databaseName(testUrl);
  if (!allowed.size || !allowed.has(name)) {
    throw new Error(`Test database ${JSON.stringify(name)} is not listed in AUTHORIZED_TEST_DATABASES.`);
  }

  const testIdentity = normalizedDatabaseIdentity(testUrl);
  for (const [label, candidate] of [
    ["development", environment.DEVELOPMENT_DATABASE_URL ?? environment.DATABASE_URL],
    ["production", environment.PRODUCTION_DATABASE_URL],
  ]) {
    if (candidate?.trim() && normalizedDatabaseIdentity(candidate.trim()) === testIdentity) {
      throw new Error(`Refusing to use the ${label} database for automated tests.`);
    }
  }

  return {
    ...environment,
    NODE_ENV: "test",
    DATABASE_URL: testUrl,
    AUTH_URL: environment.TEST_AUTH_URL ?? environment.AUTH_URL ?? "",
    SMTP_URL: environment.TEST_SMTP_URL ?? "",
    MAIL_FROM: environment.TEST_MAIL_FROM ?? environment.MAIL_FROM ?? "",
  };
}
