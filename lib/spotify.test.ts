import { describe, expect, it } from "vitest";
import { asSeed, type SpotifyItem } from "./spotify";

describe("Spotify seed mapping", () => {
  it("maps an artist with its profile image", () => {
    const artist: SpotifyItem = {
      id: "artist-1",
      uri: "spotify:artist:1",
      name: "Björk",
      type: "artist",
      images: [{ url: "artist.jpg" }],
    };

    expect(asSeed(artist)).toEqual({
      id: "artist-1",
      uri: "spotify:artist:1",
      name: "Björk",
      type: "artist",
      image: "artist.jpg",
      subtitle: "Artist",
    });
  });

  it("maps an album with all credited artists", () => {
    const album: SpotifyItem = {
      id: "album-1",
      uri: "spotify:album:1",
      name: "Album",
      type: "album",
      artists: [{ name: "Artist One" }, { name: "Artist Two" }],
      images: [{ url: "album.jpg" }],
    };

    expect(asSeed(album)).toMatchObject({ image: "album.jpg", subtitle: "Artist One, Artist Two · Album" });
  });

  it("maps a track using its album name and artwork", () => {
    const track: SpotifyItem = {
      id: "track-1",
      uri: "spotify:track:1",
      name: "Track",
      type: "track",
      artists: [{ name: "Artist" }],
      album: { name: "Record", images: [{ url: "cover.jpg" }] },
    };

    expect(asSeed(track)).toMatchObject({ image: "cover.jpg", subtitle: "Artist · Record" });
  });

  it("uses readable fallbacks for incomplete metadata", () => {
    const track: SpotifyItem = { id: "track-2", uri: "spotify:track:2", name: "Track", type: "track" };
    expect(asSeed(track)).toMatchObject({ image: undefined, subtitle: "Unknown artist · Track" });
  });
});
