export const MUSIC_PROVIDERS = ["spotify", "youtube"] as const;
export type MusicProvider = typeof MUSIC_PROVIDERS[number];

const PROVIDERS: Record<MusicProvider, { name: string; search: string; playlists: string }> = {
  spotify: { name: "Spotify", search: "/api/spotify/search", playlists: "/api/spotify/playlists" },
  youtube: { name: "YouTube", search: "/api/youtube/search", playlists: "/api/youtube/playlists" },
};

export function isMusicProvider(value: unknown): value is MusicProvider {
  return typeof value === "string" && MUSIC_PROVIDERS.includes(value as MusicProvider);
}

export function providerName(provider: MusicProvider) {
  return PROVIDERS[provider].name;
}

export function providerSearchEndpoint(provider: MusicProvider) {
  return PROVIDERS[provider].search;
}

export function providerPlaylistEndpoint(provider: MusicProvider) {
  return PROVIDERS[provider].playlists;
}
