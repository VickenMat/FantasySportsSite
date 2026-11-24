import { describe, expect, it } from "vitest";
import { authorizedTestEnvironment, databaseName } from "../../scripts/test-environment.mjs";

const testUrl = "postgresql://fantasy:secret@127.0.0.1:5432/fantasy_evolution_test";
const base = {
  TEST_DATABASE_URL: testUrl,
  AUTHORIZED_TEST_DATABASES: "fantasy_evolution_test,fantasy_evolution_ci",
  DEVELOPMENT_DATABASE_URL: "postgresql://fantasy:secret@127.0.0.1:5432/fantasy_evolution",
  PRODUCTION_DATABASE_URL: "postgresql://prod:secret@db.example.com:5432/fantasy_evolution_prod",
};

describe("test database isolation", () => {
  it("accepts an explicitly authorized database and replaces inherited DATABASE_URL", () => {
    const environment = authorizedTestEnvironment({ ...base, DATABASE_URL: base.DEVELOPMENT_DATABASE_URL });
    expect(environment.DATABASE_URL).toBe(testUrl);
    expect(environment.NODE_ENV).toBe("test");
  });

  it("fails closed without an explicit URL and allowlist", () => {
    expect(() => authorizedTestEnvironment({})).toThrow(/TEST_DATABASE_URL is required/);
    expect(() => authorizedTestEnvironment({ TEST_DATABASE_URL: testUrl })).toThrow(/not listed/);
  });

  it("rejects development and production database identities", () => {
    expect(() => authorizedTestEnvironment({ ...base, DEVELOPMENT_DATABASE_URL: testUrl })).toThrow(/development/);
    expect(() => authorizedTestEnvironment({ ...base, PRODUCTION_DATABASE_URL: testUrl })).toThrow(/production/);
  });

  it("requires the exact database name rather than a test-like prefix", () => {
    expect(() => authorizedTestEnvironment({ ...base, TEST_DATABASE_URL: `${testUrl}_copy` })).toThrow(/not listed/);
    expect(databaseName(testUrl)).toBe("fantasy_evolution_test");
  });
});
