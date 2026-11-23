import { describe, expect, it } from "vitest";
import { accountNameSchema, emailSchema, passwordSchema } from "@/lib/auth-validation";

describe("account validation", () => {
  it("normalizes email and validates its format", () => {
    expect(emailSchema.parse("  Manager@Example.test ")).toBe("manager@example.test");
    expect(emailSchema.safeParse("manager").success).toBe(false);
  });

  it("trims names and rejects blank or excessively long names", () => {
    expect(accountNameSchema.parse(" Demo Manager ")).toBe("Demo Manager");
    expect(accountNameSchema.safeParse("  ").success).toBe(false);
    expect(accountNameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });

  it("enforces password length without altering whitespace", () => {
    expect(passwordSchema.safeParse("x".repeat(11)).success).toBe(false);
    expect(passwordSchema.parse(" password 12 ")).toBe(" password 12 ");
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });
});
