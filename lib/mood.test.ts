import { describe, expect, it } from "vitest";
import { inferMoodTags, rankWeightedCandidates } from "./mood";

describe("mood interpretation", () => {
  it("maps emotional, activity, genre, and era language", () => {
    const tags = inferMoodTags("A melancholic 90s trip-hop night drive");
    expect(tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: "melancholy", weight: 1 }),
      expect.objectContaining({ tag: "trip-hop", weight: 1 }),
      expect.objectContaining({ tag: "driving", weight: 1 }),
      expect.objectContaining({ tag: "90s", weight: 0.9 }),
    ]));
  });

  it("returns no tags for an unknown description", () => {
    expect(inferMoodTags("purple teaspoons orbit sideways")).toEqual([]);
  });
});

describe("weighted candidate ranking", () => {
  it("favors candidates supported by multiple tag pools", () => {
    const shared = { artist: "Shared", name: "Track" };
    const ranked = rankWeightedCandidates([
      { tag: { tag: "calm", weight: 1 }, candidates: [{ artist: "First", name: "One" }, shared] },
      { tag: { tag: "ambient", weight: 0.45 }, candidates: [shared, { artist: "Second", name: "Two" }] },
    ]);
    expect(ranked[0]).toEqual(shared);
  });
});
