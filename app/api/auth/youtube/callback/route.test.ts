import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("YouTube OAuth callback", () => {
  it("stores a refreshable session and redirects to the clean home page", async () => {
    vi.stubEnv("SESSION_SECRET", "youtube-callback-test-secret");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:3000/api/auth/youtube/callback");
    const store = { get: vi.fn((name: string) => name === "youtube_oauth_state" ? { value: "state" } : undefined) };
    mocks.cookies.mockResolvedValue(store);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }), { status: 200 })));

    const response = await GET(new NextRequest("http://127.0.0.1:3000/api/auth/youtube/callback?code=code&state=state"));

    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/");
    expect(response.cookies.get("youtube_access_token")?.value).toBe("access");
    expect(response.cookies.get("youtube_refresh_token")?.value).not.toContain("refresh");
    expect(response.cookies.get("youtube_session_deadline")).toBeDefined();
  });
});
