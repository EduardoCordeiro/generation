import { cookies } from "next/headers";
import { remainingSessionSeconds, sealToken, sessionCookie, unsealToken } from "./session";

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
  const store = await cookies();
  const token = store.get("spotify_access_token")?.value;
  if (token) return token;
  const refreshToken = unsealToken(store.get("spotify_refresh_token")?.value || "");
  const remaining = remainingSessionSeconds(store.get("spotify_session_deadline")?.value);
  if (!refreshToken || !remaining) throw new Error("Connect Spotify before continuing.");
  const credentials = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), cache: "no-store" });
  if (!response.ok) throw new Error("Your Spotify connection has expired. Please reconnect.");
  const refreshed = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  store.set("spotify_access_token", refreshed.access_token, sessionCookie(Math.min(refreshed.expires_in, remaining)));
  if (refreshed.refresh_token) store.set("spotify_refresh_token", sealToken(refreshed.refresh_token), sessionCookie(remaining));
  return refreshed.access_token;
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
  const artists = item.type === "artist" ? [item.name] : item.artists?.map((artist) => artist.name) || [];
  const artist = artists.join(", ") || "Unknown artist";
  return { id: item.id, uri: item.uri, name: item.name, type: item.type, image, artists, subtitle: item.type === "artist" ? "Artist" : item.type === "album" ? `${artist} · Album` : `${artist} · ${item.album?.name || "Track"}` };
}
