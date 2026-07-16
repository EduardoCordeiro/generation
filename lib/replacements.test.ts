import { describe, expect, it } from "vitest";
import type { DiscoveryTrack } from "./discovery";
import { isValidReplacement } from "./replacements";

function track(uri: string, artist: string): DiscoveryTrack {
  return { uri, name: uri, artist, primaryArtist: artist, album: "Album" };
}

describe("replacement validity", () => {
  const tracks = [track("1", "A"), track("2", "B"), track("3", "C"), track("4", "A")];

  it("requires a different artist and URI", () => {
    expect(isValidReplacement(track("5", "A"), tracks[0], tracks, 0)).toBe(false);
    expect(isValidReplacement(track("2", "D"), tracks[0], tracks, 0)).toBe(false);
  });

  it("preserves the two-thirds diversity rule", () => {
    expect(isValidReplacement(track("5", "B"), tracks[2], tracks, 2)).toBe(false);
    expect(isValidReplacement(track("5", "D"), tracks[0], tracks, 0)).toBe(true);
  });
});
