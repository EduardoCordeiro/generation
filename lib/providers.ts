export const MUSIC_PROVIDERS = ["spotify", "youtube"] as const;
export type MusicProvider = typeof MUSIC_PROVIDERS[number];

const PROVIDERS: Record<MusicProvider, { name: string; playlists: string }> = {
  spotify: { name: "Spotify", playlists: "/api/spotify/playlists" },
  youtube: { name: "YouTube", playlists: "/api/youtube/playlists" },
};

export function isMusicProvider(value: unknown): value is MusicProvider {
  return typeof value === "string" && MUSIC_PROVIDERS.includes(value as MusicProvider);
}

export function providerName(provider: MusicProvider) {
  return PROVIDERS[provider].name;
}

export function providerSearchEndpoint(provider: MusicProvider) {
  void provider;
  return "/api/music/search";
}

export function providerPlaylistEndpoint(provider: MusicProvider) {
  return PROVIDERS[provider].playlists;
}
