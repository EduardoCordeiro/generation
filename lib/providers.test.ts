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

  it("maps providers to their exact API routes", () => {
    expect(providerSearchEndpoint("spotify")).toBe("/api/spotify/search");
    expect(providerPlaylistEndpoint("spotify")).toBe("/api/spotify/playlists");
    expect(providerSearchEndpoint("youtube")).toBe("/api/youtube/search");
    expect(providerPlaylistEndpoint("youtube")).toBe("/api/youtube/playlists");
  });

  it("rejects unsupported providers", () => {
    expect(isMusicProvider("spotify")).toBe(true);
    expect(isMusicProvider("youtube")).toBe(true);
    expect(isMusicProvider("YouTube")).toBe(false);
    expect(isMusicProvider(1)).toBe(false);
    expect(isMusicProvider("soundcloud")).toBe(false);
    expect(isMusicProvider(undefined)).toBe(false);
  });
});
