import { describe, expect, it } from "vitest";
import { trustedAuthOrigins } from "@/lib/auth";

describe("authentication trusted origins", () => {
  it("trusts both exact development origins with localhost canonical", () => {
    expect(trustedAuthOrigins("http://localhost:3000")).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("keeps a configured loopback test port and the two development origins", () => {
    expect(trustedAuthOrigins("http://127.0.0.1:3200")).toEqual([
      "http://127.0.0.1:3200",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("trusts only the exact configured production origin", () => {
    expect(trustedAuthOrigins("https://fantasy.example.com/api/auth")).toEqual([
      "https://fantasy.example.com",
    ]);
  });
});
