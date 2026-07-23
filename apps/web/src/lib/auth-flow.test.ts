import { describe, expect, it } from "vitest";
import { classifyAuthIssue, normalizeOtp, resendSeconds } from "./auth-flow";

describe("account verification safeguards", () => {
  it("normalizes pasted codes without accepting extra digits", () => {
    expect(normalizeOtp("12 3-4567")).toBe("123456");
  });

  it("does not allow immediate repeated email sends", () => {
    expect(resendSeconds(1_000, 1_000)).toBe(60);
    expect(resendSeconds(1_000, 62_000)).toBe(0);
  });

  it("routes existing accounts into recovery instead of generic failure", () => {
    expect(classifyAuthIssue("A user with this email already exists")).toBe("conflict");
    expect(classifyAuthIssue("email rate limit exceeded")).toBe("rate-limit");
    expect(classifyAuthIssue("Token has expired")).toBe("expired");
  });
});
