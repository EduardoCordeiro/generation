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

  it("uses medium and default thumbnails as fallbacks", () => {
    const medium = asYouTubeTrack({ id: { videoId: "medium" }, snippet: { thumbnails: { medium: { url: "medium.jpg" } } } }, fallback);
    const small = asYouTubeTrack({ id: { videoId: "small" }, snippet: { thumbnails: { default: { url: "small.jpg" } } } }, fallback);

    expect(medium.album?.images?.[0]?.url).toBe("medium.jpg");
    expect(small.album?.images?.[0]?.url).toBe("small.jpg");
  });

  it("preserves fallback artwork when the video has no thumbnail", () => {
    const withArtwork: SpotifyItem = { ...fallback, album: { name: "Discovery", images: [{ url: "fallback.jpg" }] } };
    const result = asYouTubeTrack({ id: { videoId: "video-without-image" } }, withArtwork);

    expect(result.album).toEqual({ name: "YouTube", images: [{ url: "fallback.jpg" }] });
  });

  it("does not mutate the fallback candidate", () => {
    const before = structuredClone(fallback);
    asYouTubeTrack({ id: { videoId: "video-456" }, snippet: { thumbnails: { high: { url: "image.jpg" } } } }, fallback);
    expect(fallback).toEqual(before);
  });
});
