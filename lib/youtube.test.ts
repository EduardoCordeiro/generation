import { describe, expect, it } from "vitest";
import type { SpotifyItem } from "./spotify";
import { asYouTubeTrack } from "./youtube";

const fallback: SpotifyItem = {
  id: "candidate-1",
  uri: "discovery:track:1",
  name: "Discovery",
  type: "track",
  artists: [{ name: "New Artist" }],
  album: { name: "Discovery" },
};

describe("YouTube track resolution", () => {
  it("adds the video URI and best available thumbnail", () => {
    const track = asYouTubeTrack({
      id: { videoId: "video-123" },
      snippet: { thumbnails: { default: { url: "small.jpg" }, high: { url: "large.jpg" } } },
    }, fallback);

    expect(track).toMatchObject({
      uri: "youtube:video:video-123",
      album: { name: "YouTube", images: [{ url: "large.jpg" }] },
    });
  });

  it("keeps the discovery candidate when YouTube has no match", () => {
    expect(asYouTubeTrack(undefined, fallback)).toBe(fallback);
  });
});
