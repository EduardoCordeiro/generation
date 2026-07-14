import { describe, expect, it } from "vitest";
import type { SpotifyItem } from "./spotify";
import {
  excludeSavedTracks,
  toPlaylistTracks,
  uniqueCandidates,
  uniqueResolvedTracks,
} from "./playlist";

function track(uri: string, name = uri): SpotifyItem {
  return {
    id: uri.split(":").at(-1) || uri,
    uri,
    name,
    type: "track",
    artists: [{ name: "Artist" }],
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

describe("uniqueResolvedTracks", () => {
  it("removes duplicate Spotify URIs and keeps the first resolved track", () => {
    const first = track("spotify:track:duplicate", "First resolution");
    const duplicate = track("spotify:track:duplicate", "Second resolution");

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
    expect(playlist[0]).toMatchObject({ artist: "Artist", album: "Album", image: "medium" });
  });
});
