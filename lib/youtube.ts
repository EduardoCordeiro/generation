import { cookies } from "next/headers";
import type { SpotifyItem } from "./spotify";

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
  const token = (await cookies()).get("youtube_access_token")?.value;
  if (!token) throw new YouTubeApiError("Connect YouTube before creating a playlist.", 401, path);
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
