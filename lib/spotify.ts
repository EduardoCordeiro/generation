import { cookies } from "next/headers";

const SPOTIFY_API = "https://api.spotify.com/v1";

export type SpotifyItem = { id: string; uri: string; name: string; type: "artist" | "album" | "track"; artists?: { name: string }[]; album?: { name: string; images?: { url: string }[] }; images?: { url: string }[] };

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export async function accessToken() {
  const token = (await cookies()).get("spotify_access_token")?.value;
  if (!token) throw new Error("Connect Spotify before continuing.");
  return token;
}

export async function spotify<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${SPOTIFY_API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = response.status === 401
      ? "Your Spotify connection has expired. Please reconnect."
      : data?.error?.message || "Spotify request failed.";
    throw new SpotifyApiError(message, response.status, path, response.headers.get("retry-after") || undefined);
  }
  return response.json() as Promise<T>;
}

export function asSeed(item: SpotifyItem) {
  const image = item.type === "artist" ? item.images?.[0]?.url : item.type === "album" ? item.images?.[0]?.url : item.album?.images?.[0]?.url;
  const artist = item.artists?.map((artist) => artist.name).join(", ");
  return { id: item.id, uri: item.uri, name: item.name, type: item.type, image, subtitle: item.type === "artist" ? "Artist" : item.type === "album" ? `${artist} · Album` : `${artist} · ${item.album?.name || "Track"}` };
}
