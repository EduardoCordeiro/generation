import { afterEach, describe, expect, it, vi } from "vitest";
import { remainingSessionSeconds, sealToken, SESSION_MAX_AGE, sessionCookie, unsealToken } from "./session";

afterEach(() => vi.unstubAllEnvs());

describe("provider session tokens", () => {
  it("encrypts and decrypts refresh tokens", () => {
    vi.stubEnv("SESSION_SECRET", "a-long-test-only-session-secret");
    const sealed = sealToken("refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(unsealToken(sealed)).toBe("refresh-token");
  });

  it("rejects tampered tokens", () => {
    vi.stubEnv("SESSION_SECRET", "a-long-test-only-session-secret");
    expect(unsealToken(`${sealToken("refresh-token")}broken`)).toBeUndefined();
  });

  it("caps cookies at 24 hours", () => {
    expect(sessionCookie(SESSION_MAX_AGE * 2).maxAge).toBe(SESSION_MAX_AGE);
  });

  it("does not extend an existing session deadline", () => {
    expect(remainingSessionSeconds(String(Date.now() + 60_000))).toBeGreaterThanOrEqual(59);
    expect(remainingSessionSeconds(String(Date.now() - 1))).toBe(0);
  });
});
