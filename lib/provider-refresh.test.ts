import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { sealToken } from "./session";
import { accessToken } from "./spotify";
import { youtube } from "./youtube";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function cookieStore(provider: "spotify" | "youtube") {
  const values: Record<string, string> = {
    [`${provider}_refresh_token`]: sealToken("refresh-token"),
    [`${provider}_session_deadline`]: String(Date.now() + 60_000),
  };
  return {
    get: vi.fn((name: string) => values[name] ? { value: values[name] } : undefined),
    set: vi.fn(),
  };
}

describe("automatic provider token refresh", () => {
  it("refreshes Spotify when its access token has expired", async () => {
    vi.stubEnv("SESSION_SECRET", "provider-refresh-test-secret");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
    const store = cookieStore("spotify");
    mocks.cookies.mockResolvedValue(store);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await accessToken()).toBe("new-access");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("refresh_token=refresh-token");
    expect(store.set).toHaveBeenCalledWith("spotify_access_token", "new-access", expect.objectContaining({ maxAge: expect.any(Number) }));
  });

  it("refreshes YouTube before retrying the requested API operation", async () => {
    vi.stubEnv("SESSION_SECRET", "provider-refresh-test-secret");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    const store = cookieStore("youtube");
    mocks.cookies.mockResolvedValue(store);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await youtube("/channels?mine=true")).toEqual({ items: [] });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer new-access" });
    expect(store.set).toHaveBeenCalledWith("youtube_access_token", "new-access", expect.objectContaining({ maxAge: expect.any(Number) }));
  });
});
