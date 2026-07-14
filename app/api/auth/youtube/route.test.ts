import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("YouTube authorization route", () => {
  it("reports missing OAuth credentials without exposing secrets", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
    expect(body.requestId).toMatch(/^[\da-f]{8}$/);
  });

  it("builds a state-protected authorization redirect", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:3000/api/auth/youtube/callback");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await GET();
    const location = new URL(response.headers.get("location")!);
    const stateCookie = response.cookies.get("youtube_oauth_state");

    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe("google-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/auth/youtube/callback");
    expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("state")).toBe(stateCookie?.value);
    expect(stateCookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});
