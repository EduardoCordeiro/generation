import type { SpotifyItem } from "./spotify";

export type Candidate = { name: string; artist: string };

export type PlaylistTrack = {
  uri: string;
  name: string;
  artist: string;
  album: string;
  image?: string;
};

function candidateKey(candidate: Candidate) {
  return `${candidate.artist.trim().toLocaleLowerCase()}\u0000${candidate.name.trim().toLocaleLowerCase()}`;
}

export function uniqueCandidates(candidates: Candidate[], limit = 40) {
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!unique.has(key)) unique.set(key, candidate);
    if (unique.size === limit) break;
  }
  return [...unique.values()];
}

export function uniqueResolvedTracks(
  resolved: Array<SpotifyItem | undefined>,
  seedUris: Iterable<string>,
) {
  const seeds = new Set(seedUris);
  const unique = new Map<string, SpotifyItem>();
  for (const item of resolved) {
    if (item && !seeds.has(item.uri) && !unique.has(item.uri)) {
      unique.set(item.uri, item);
    }
  }
  return [...unique.values()];
}

export function excludeSavedTracks(items: SpotifyItem[], contains: boolean[]) {
  return items.filter((_, index) => contains[index] !== true);
}

export function toPlaylistTracks(items: SpotifyItem[], limit = 20): PlaylistTrack[] {
  return items.slice(0, limit).map((item) => ({
    uri: item.uri,
    name: item.name,
    artist: item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: item.album?.name || "",
    image: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url,
  }));
}
