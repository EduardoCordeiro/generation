import { describe, expect, it } from "vitest";
import { enrichDiscoverySeeds, type DiscoverySeed } from "./discovery";

function seed(overrides: Partial<DiscoverySeed> = {}): DiscoverySeed {
  return { id: "lastfm", uri: "lastfm:track:1", name: "Teardrop", subtitle: "Massive Attack · Track", type: "track", artists: ["Massive Attack"], ...overrides };
}

describe("provider seed enrichment", () => {
  it("adds Spotify artwork and structured credits without replacing the neutral URI", () => {
    const neutral = seed();
    const enriched = enrichDiscoverySeeds([neutral], [seed({ id: "spotify", uri: "spotify:track:1", image: "spotify.jpg", artists: ["Massive Attack", "Elizabeth Fraser"] })]);
    expect(enriched[0]).toMatchObject({ uri: neutral.uri, image: "spotify.jpg", artists: ["Massive Attack", "Elizabeth Fraser"] });
  });

  it("does not attach artwork from a different artist with the same title", () => {
    const neutral = seed();
    const enriched = enrichDiscoverySeeds([neutral], [seed({ image: "wrong.jpg", artists: ["Different Artist"] })]);
    expect(enriched[0]).toEqual(neutral);
  });
});
