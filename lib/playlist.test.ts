import { describe, expect, it } from "vitest";
import type { SpotifyItem } from "./spotify";
import {
  collectArtistNames,
  collectSeedArtistNames,
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

  it("keeps artwork from the first duplicate candidate", () => {
    const candidates = [
      { artist: "Björk", name: "Jóga", image: "first.jpg" },
      { artist: "björk", name: "jóga", image: "second.jpg" },
    ];

    expect(uniqueCandidates(candidates)).toEqual([candidates[0]]);
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

  it("does not exclude artists whose names only partially match", () => {
    const candidates = [
      { artist: "The Smile", name: "Friend of a Friend" },
      { artist: "Smile", name: "Dream" },
    ];

    expect(excludeCandidatesByArtist(candidates, ["Smile"])).toEqual([candidates[0]]);
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

  it("deduplicates without mutating the resolved result objects", () => {
    const first = track("youtube:video:same", "First");
    const duplicate = track("youtube:video:same", "Duplicate");
    const input = [first, duplicate];

    expect(uniqueResolvedTracks(input, [])).toEqual([first]);
    expect(input).toEqual([first, duplicate]);
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

  it("honors a custom playlist limit", () => {
    const items = Array.from({ length: 12 }, (_, index) => track(`spotify:track:${index}`));
    expect(toPlaylistTracks(items, 10)).toHaveLength(10);
  });

  it("formats incomplete catalog metadata safely", () => {
    const item: SpotifyItem = { id: "bare", uri: "spotify:track:bare", name: "Bare", type: "track" };
    expect(toPlaylistTracks([item])).toEqual([{
      uri: item.uri,
      name: "Bare",
      artist: "Unknown artist",
      primaryArtist: "Unknown artist",
      album: "",
      image: undefined,
    }]);
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

  it("decodes common entities and removes lyric and visualizer labels", () => {
    expect(normalizeDiscoveryTrack("Love &quot;Again&quot; [Lyrics Video]")).toBe('Love "Again"');
    expect(normalizeDiscoveryTrack("New Song (Official Visualizer)")).toBe("New Song");
    expect(normalizeDiscoveryArtist("  Artist &amp; Friend - Topic  ")).toBe("Artist & Friend");
  });
});

describe("seed artist exclusions", () => {
  it("collects the artist behind a song seed", () => {
    expect(collectSeedArtistNames([{
      name: "Jóga",
      subtitle: "Björk · Homogenic",
      type: "track",
      artists: ["Björk"],
    }])).toEqual(["Björk"]);
  });

  it("collects every credited artist behind album and song seeds", () => {
    expect(collectSeedArtistNames([
      { name: "Album", subtitle: "Display text · Album", type: "album", artists: ["Artist One", "Artist Two"] },
      { name: "Song", subtitle: "Display text · Single", type: "track", artists: ["Artist Two", "Featured Artist"] },
    ])).toEqual(["Artist One", "Artist Two", "Featured Artist"]);
  });

  it("does not split a structured artist name containing a comma", () => {
    expect(collectSeedArtistNames([{
      name: "September",
      subtitle: "Earth, Wind & Fire · The Best of Earth, Wind & Fire, Vol. 1",
      type: "track",
      artists: ["Earth, Wind & Fire"],
    }])).toEqual(["Earth, Wind & Fire"]);
  });

  it("falls back to legacy subtitle data and normalizes provider channel names", () => {
    expect(collectSeedArtistNames([
      { name: "Snooze", subtitle: "SZA - Topic · YouTube", type: "track" },
      { name: "Solange", subtitle: "Artist", type: "artist" },
    ])).toEqual(["SZA", "Solange"]);
  });

  it("removes every track by an artist inferred from a song seed", () => {
    const seedArtists = collectSeedArtistNames([{
      name: "Jóga",
      subtitle: "Björk · Homogenic",
      type: "track",
      artists: ["Björk"],
    }]);
    const collaboration = track("spotify:track:collab", "Collab", "New Artist");
    collaboration.artists = [{ name: "New Artist" }, { name: "Björk" }];

    expect(selectDiverseTracks([
      track("spotify:track:bjork", "Hidden Place", "Björk"),
      collaboration,
      track("spotify:track:new", "Discovery", "New Artist"),
    ], 10, seedArtists)).toEqual([
      expect.objectContaining({ uri: "spotify:track:new" }),
    ]);
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

  it("excludes a collaboration when any credited artist is a seed", () => {
    const collaboration = track("spotify:track:collaboration", "Collaboration", "New Artist");
    collaboration.artists = [{ name: "New Artist" }, { name: "Seed Artist" }];

    expect(selectDiverseTracks([collaboration], 10, ["seed artist"])).toEqual([]);
  });

  it("counts primary artists case-insensitively", () => {
    expect(uniquePrimaryArtistCount([
      track("spotify:track:1", "One", "Björk"),
      track("spotify:track:2", "Two", " björk "),
      track("spotify:track:3", "Three", "FKA twigs"),
    ])).toBe(2);
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
