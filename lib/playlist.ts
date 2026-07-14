import type { SpotifyItem } from "./spotify";

export type Candidate = { name: string; artist: string; image?: string };

export type SeedArtistSource = {
  name: string;
  subtitle: string;
  type: "artist" | "album" | "track";
  artists?: string[];
};

export type PlaylistTrack = {
  uri: string;
  name: string;
  artist: string;
  primaryArtist: string;
  album: string;
  image?: string;
};

export const MIN_PLAYLIST_SIZE = 10;
export const MAX_PLAYLIST_SIZE = 50;

export function parsePlaylistSize(value: unknown) {
  const size = Number(value);
  if (!Number.isInteger(size) || size < MIN_PLAYLIST_SIZE || size > MAX_PLAYLIST_SIZE) {
    throw new RangeError(`Playlist size must be a whole number between ${MIN_PLAYLIST_SIZE} and ${MAX_PLAYLIST_SIZE}.`);
  }
  return size;
}

function decodeMusicText(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeDiscoveryArtist(value: string) {
  return decodeMusicText(value)
    .trim()
    .replace(/\s+-\s+Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
}

export function normalizeDiscoveryTrack(value: string, artist?: string) {
  let track = decodeMusicText(value)
    .replace(/\s*[[(](?:official\s+)?(?:music\s+)?(?:video|audio|visuali[sz]er|lyrics?|live)(?:\s+video)?[^\])]*[\])]/gi, "")
    .replace(/\s*\|\s*(?:official\s+)?(?:music\s+)?(?:video|audio|visuali[sz]er|lyrics?).*$/i, "")
    .trim();
  const canonicalArtist = artist ? normalizeDiscoveryArtist(artist) : "";
  if (canonicalArtist) {
    const prefix = `${canonicalArtist} -`;
    if (track.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) track = track.slice(prefix.length).trim();
  }
  return track;
}

function normalizeArtist(name: string) {
  return name.trim().toLocaleLowerCase();
}

function primaryArtist(item: SpotifyItem) {
  return item.artists?.[0]?.name;
}

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

export function excludeCandidatesByArtist(
  candidates: Candidate[],
  excludedArtists: Iterable<string>,
) {
  const excluded = new Set([...excludedArtists].map(normalizeArtist));
  return candidates.filter((candidate) => !excluded.has(normalizeArtist(candidate.artist)));
}

export function collectArtistNames(items: SpotifyItem[]) {
  const artists = new Set<string>();
  for (const item of items) {
    for (const artist of item.artists || []) artists.add(artist.name);
  }
  return [...artists];
}

export function collectSeedArtistNames(seeds: SeedArtistSource[]) {
  const artists = new Map<string, string>();
  for (const seed of seeds) {
    const names = seed.type === "artist"
      ? [seed.name]
      : seed.artists?.length
        ? seed.artists
        : seed.subtitle.split(" · ")[0].split(", ");
    for (const name of names) {
      const normalized = normalizeDiscoveryArtist(name);
      if (normalized) artists.set(normalizeArtist(normalized), normalized);
    }
  }
  return [...artists.values()];
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

export function selectDiverseTracks(
  items: SpotifyItem[],
  size: number,
  seedArtists: Iterable<string>,
) {
  const seeds = new Set([...seedArtists].map(normalizeArtist));
  const groups = new Map<string, SpotifyItem[]>();

  for (const item of items) {
    const artists = item.artists?.map((artist) => normalizeArtist(artist.name)) || [];
    const primary = primaryArtist(item);
    if (!primary || artists.some((artist) => seeds.has(artist))) continue;

    const key = normalizeArtist(primary);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const selected: SpotifyItem[] = [];

  // Introduce every available artist once before repeating any artist.
  for (const group of groups.values()) {
    selected.push(group[0]);
    if (selected.length === size) return selected;
  }

  // Fill remaining slots round-robin to avoid clusters from one artist.
  for (let depth = 1; selected.length < size; depth += 1) {
    let added = false;
    for (const group of groups.values()) {
      if (group[depth]) {
        selected.push(group[depth]);
        added = true;
        if (selected.length === size) return selected;
      }
    }
    if (!added) break;
  }

  return selected;
}

export function uniquePrimaryArtistCount(items: SpotifyItem[]) {
  return new Set(items.map(primaryArtist).filter(Boolean).map((artist) => normalizeArtist(artist!))).size;
}

export function toPlaylistTracks(items: SpotifyItem[], limit = 20): PlaylistTrack[] {
  return items.slice(0, limit).map((item) => ({
    uri: item.uri,
    name: item.name,
    artist: item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    primaryArtist: item.artists?.[0]?.name || "Unknown artist",
    album: item.album?.name || "",
    image: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url,
  }));
}
