import { cookies } from "next/headers";
import type { SpotifyItem } from "./spotify";
import { remainingSessionSeconds, sealToken, sessionCookie, unsealToken } from "./session";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

export type YouTubeVideoMatch = {
  id?: { videoId?: string };
  snippet?: { thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } } };
};

export function asYouTubeTrack(match: YouTubeVideoMatch | undefined, fallback: SpotifyItem): SpotifyItem {
  const videoId = match?.id?.videoId;
  if (!videoId) return fallback;
  const image = match.snippet?.thumbnails?.high?.url || match.snippet?.thumbnails?.medium?.url || match.snippet?.thumbnails?.default?.url;
  return {
    ...fallback,
    id: videoId,
    uri: `youtube:video:${videoId}`,
    album: { name: "YouTube", images: image ? [{ url: image }] : fallback.album?.images },
  };
}

export class YouTubeApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly path: string) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export async function youtube<T>(path: string, init: RequestInit = {}): Promise<T> {
  const store = await cookies();
  let token = store.get("youtube_access_token")?.value;
  if (!token) {
    const refreshToken = unsealToken(store.get("youtube_refresh_token")?.value || "");
    const remaining = remainingSessionSeconds(store.get("youtube_session_deadline")?.value);
    if (!refreshToken || !remaining) throw new YouTubeApiError("Connect YouTube before creating a playlist.", 401, path);
    const refreshed = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CLIENT_SECRET || "", refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store" });
    if (!refreshed.ok) throw new YouTubeApiError("Your YouTube connection has expired. Please reconnect.", 401, path);
    const data = await refreshed.json() as { access_token: string; refresh_token?: string; expires_in: number };
    token = data.access_token;
    store.set("youtube_access_token", token, sessionCookie(Math.min(data.expires_in, remaining)));
    if (data.refresh_token) store.set("youtube_refresh_token", sealToken(data.refresh_token), sessionCookie(remaining));
  }
  const response = await fetch(`${YOUTUBE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new YouTubeApiError(data?.error?.message || "YouTube request failed.", response.status, path);
  }
  return response.json() as Promise<T>;
}
