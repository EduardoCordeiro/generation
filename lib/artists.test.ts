import { describe, expect, it } from "vitest";
import { artistIdentity, artistNamesMatch, creditedArtists, uniqueArtistNames } from "./artists";

describe("artist identity", () => {
  it("matches provider channel decorations and compact names", () => {
    expect(artistNamesMatch("thevervevevo", "The Verve")).toBe(true);
    expect(artistNamesMatch("Beyoncé Official Music", "Beyonce")).toBe(true);
    expect(artistNamesMatch("SZA - Topic", "sza")).toBe(true);
  });

  it("does not match arbitrary partial names", () => {
    expect(artistNamesMatch("Smile", "The Smile")).toBe(false);
    expect(artistNamesMatch("Muse", "Museum")).toBe(false);
  });

  it("deduplicates normalized identities", () => {
    expect(uniqueArtistNames(["Björk", " bjork ", "SZA - Topic"])).toEqual(["Björk", "SZA"]);
    expect(artistIdentity("Earth, Wind & Fire")).toBe("earthwindfire");
  });

  it("extracts explicit featured artists", () => {
    expect(creditedArtists("Primary feat. Guest ft Second")).toEqual(["Primary", "Guest", "Second"]);
  });
});
