import { describe, expect, it } from "vitest";
import { isMusicProvider, MUSIC_PROVIDERS, providerName, providerPlaylistEndpoint, providerSearchEndpoint } from "./providers";

describe("music provider contracts", () => {
  it("defines distinct search and playlist routes for every provider", () => {
    expect(new Set(MUSIC_PROVIDERS.map(providerSearchEndpoint)).size).toBe(2);
    expect(new Set(MUSIC_PROVIDERS.map(providerPlaylistEndpoint)).size).toBe(2);
  });

  it("exposes stable display names", () => {
    expect(MUSIC_PROVIDERS.map(providerName)).toEqual(["Spotify", "YouTube"]);
  });

  it("rejects unsupported providers", () => {
    expect(isMusicProvider("spotify")).toBe(true);
    expect(isMusicProvider("soundcloud")).toBe(false);
    expect(isMusicProvider(undefined)).toBe(false);
  });
});
