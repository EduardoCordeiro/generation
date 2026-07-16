import type { MusicProvider } from "./providers";
import { artistIdentity } from "./artists";

export type DiscoveryMode = "music" | "mood";

export type DiscoverySeed = {
  id: string;
  uri: string;
  name: string;
  subtitle: string;
  type: "artist" | "album" | "track";
  artists?: string[];
  image?: string;
};

export type DiscoveryTrack = {
  uri: string;
  name: string;
  artist: string;
  primaryArtist: string;
  album: string;
  image?: string;
};

export type GenerationRequest = {
  provider: MusicProvider;
  mode: DiscoveryMode;
  size: number;
  seeds?: DiscoverySeed[];
  mood?: string;
  purpose?: "playlist" | "replacement";
  excludeUris?: string[];
};

export function enrichDiscoverySeeds(seeds: DiscoverySeed[], providerSeeds: DiscoverySeed[]) {
  return seeds.map((seed) => {
    const match = providerSeeds.find((candidate) => {
      if (candidate.type !== seed.type || artistIdentity(candidate.name) !== artistIdentity(seed.name)) return false;
      const seedArtist = seed.artists?.[0];
      const candidateArtist = candidate.artists?.[0];
      return !seedArtist || !candidateArtist || artistIdentity(seedArtist) === artistIdentity(candidateArtist);
    });
    if (!match) return seed;
    return {
      ...seed,
      image: match.image || seed.image,
      artists: match.artists?.length ? match.artists : seed.artists,
      subtitle: match.subtitle || seed.subtitle,
    };
  });
}
