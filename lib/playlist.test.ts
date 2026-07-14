import { describe, expect, it } from "vitest";
import type { SpotifyItem } from "./spotify";
import {
  collectArtistNames,
  excludeCandidatesByArtist,
  excludeSavedTracks,
  normalizeDiscoveryArtist,
  normalizeDiscoveryTrack,
  parsePlaylistSize,
  selectDiverseTracks,
  toPlaylistTracks,
  uniqueCandidates,
  uniquePrimaryArtistCount,
  uniqueResolvedTracks,
} from "./playlist";

function track(uri: string, name = uri, artist = "Artist"): SpotifyItem {
  return {
    id: uri.split(":").at(-1) || uri,
    uri,
    name,
    type: "track",
    artists: [{ name: artist }],
    album: { name: "Album", images: [{ url: "small" }, { url: "medium" }] },
  };
}

describe("uniqueCandidates", () => {
  it("deduplicates artist and track names without changing their order", () => {
    const candidates = [
      { artist: "Björk", name: "Jóga" },
      { artist: " björk ", name: " jóga " },
      { artist: "FKA twigs", name: "Cellophane" },
    ];

    expect(uniqueCandidates(candidates)).toEqual([candidates[0], candidates[2]]);
  });

  it("limits work after deduplication", () => {
    const candidates = Array.from({ length: 45 }, (_, index) => ({ artist: "Artist", name: `Track ${index}` }));
    expect(uniqueCandidates(candidates)).toHaveLength(40);
  });
});

describe("liked-song artist exclusions", () => {
  it("collects every credited artist from liked tracks", () => {
    const collaboration = track("spotify:track:collab", "Collab", "Primary");
    collaboration.artists = [{ name: "Primary" }, { name: "Featured Artist" }];

    expect(collectArtistNames([collaboration, track("spotify:track:solo", "Solo", "Another Artist")])).toEqual([
      "Primary",
      "Featured Artist",
      "Another Artist",
    ]);
  });

  it("removes candidates by liked artist case-insensitively", () => {
    const candidates = [
      { artist: "Björk", name: "Jóga" },
      { artist: "FKA twigs", name: "Cellophane" },
    ];

    expect(excludeCandidatesByArtist(candidates, [" björk "])).toEqual([candidates[1]]);
  });
});

describe("uniqueResolvedTracks", () => {
  it("removes duplicate provider URIs and keeps the first resolved track", () => {
    const first = track("youtube:video:duplicate", "First resolution");
    const duplicate = track("youtube:video:duplicate", "Second resolution");

    expect(uniqueResolvedTracks([first, duplicate], [])).toEqual([first]);
  });

  it("removes seed tracks and empty search resolutions", () => {
    const seed = track("spotify:track:seed");
    const discovery = track("spotify:track:new");

    expect(uniqueResolvedTracks([seed, undefined, discovery], [seed.uri])).toEqual([discovery]);
  });
});

describe("playlist filtering and presentation", () => {
  it("excludes saved tracks while treating missing flags as unsaved", () => {
    const tracks = [track("spotify:track:1"), track("spotify:track:2"), track("spotify:track:3")];
    expect(excludeSavedTracks(tracks, [true, false])).toEqual([tracks[1], tracks[2]]);
  });

  it("returns at most 20 playlist tracks with stable unique URIs", () => {
    const items = Array.from({ length: 25 }, (_, index) => track(`spotify:track:${index}`));
    const playlist = toPlaylistTracks(items);

    expect(playlist).toHaveLength(20);
    expect(new Set(playlist.map((item) => item.uri)).size).toBe(20);
    expect(playlist[0]).toMatchObject({ artist: "Artist", primaryArtist: "Artist", album: "Album", image: "medium" });
  });
});

describe("playlist size", () => {
  it("accepts whole-number sizes from 10 through 50", () => {
    expect(parsePlaylistSize(10)).toBe(10);
    expect(parsePlaylistSize("35")).toBe(35);
    expect(parsePlaylistSize(50)).toBe(50);
  });

  it.each([9, 51, 20.5, "many", undefined])("rejects invalid size %s", (size) => {
    expect(() => parsePlaylistSize(size)).toThrow("between 10 and 50");
  });
});

describe("discovery seed normalization", () => {
  it("normalizes YouTube channel names for Last.fm", () => {
    expect(normalizeDiscoveryArtist("SZA - Topic")).toBe("SZA");
    expect(normalizeDiscoveryArtist("FrankOceanVEVO")).toBe("FrankOcean");
  });

  it("removes common YouTube decorations from track titles", () => {
    expect(normalizeDiscoveryTrack("SZA - Snooze (Official Video)", "SZA")).toBe("Snooze");
    expect(normalizeDiscoveryTrack("Pink &amp; White | Official Audio", "Frank Ocean")).toBe("Pink & White");
  });
});

describe("artist diversity", () => {
  it("introduces each artist before selecting repeat tracks", () => {
    const items = [
      track("spotify:track:a1", "A1", "Artist A"),
      track("spotify:track:a2", "A2", "Artist A"),
      track("spotify:track:b1", "B1", "Artist B"),
      track("spotify:track:b2", "B2", "Artist B"),
      track("spotify:track:c1", "C1", "Artist C"),
      track("spotify:track:d1", "D1", "Artist D"),
    ];

    const selected = selectDiverseTracks(items, 5, []);

    expect(selected.map((item) => item.name)).toEqual(["A1", "B1", "C1", "D1", "A2"]);
    expect(uniquePrimaryArtistCount(selected)).toBe(4);
    expect(uniquePrimaryArtistCount(selected)).toBeGreaterThanOrEqual(Math.ceil(selected.length * 2 / 3));
  });

  it("excludes every track involving a seed artist", () => {
    const items = [
      track("spotify:track:seed", "Seed", "Seed Artist"),
      track("spotify:track:new", "Discovery", "New Artist"),
    ];

    expect(selectDiverseTracks(items, 10, ["seed artist"])).toEqual([items[1]]);
  });

  it("returns the available tracks when diversity is insufficient so the route can reject the mix", () => {
    const items = [
      track("spotify:track:a1", "A1", "Artist A"),
      track("spotify:track:a2", "A2", "Artist A"),
      track("spotify:track:b1", "B1", "Artist B"),
    ];

    const selected = selectDiverseTracks(items, 10, []);
    expect(selected).toHaveLength(3);
    expect(uniquePrimaryArtistCount(selected)).toBe(2);
  });
});
