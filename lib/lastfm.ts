import type { Candidate } from "./playlist";

export type LastFmImage = { "#text"?: string; size?: string };
export type LastFmTrack = { name: string; artist: { name: string } | string; image?: LastFmImage[] };

export class LastFmApiError extends Error {
  constructor(message: string, public readonly method: string, public readonly status?: number, public readonly code?: number) {
    super(message);
    this.name = "LastFmApiError";
  }
}

export async function lastFm<T>(params: Record<string, string>) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("Add LASTFM_API_KEY to .env.local to generate discovery playlists.");
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({ ...params, api_key: key, format: "json", autocorrect: "1" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "MoodMix/0.1" }, cache: "no-store" });
  if (!response.ok) throw new LastFmApiError("The service is unavailable.", params.method, response.status);
  const data = await response.json();
  if (data.error) throw new LastFmApiError(data.message || "Last.fm couldn’t find a match.", params.method, undefined, data.error);
  return data as T;
}

export function lastFmImage(item: { image?: LastFmImage[] }) {
  return [...(item.image || [])].reverse().find((image) => image["#text"])?.["#text"];
}

export function asCandidate(item: LastFmTrack): Candidate {
  return {
    name: item.name,
    artist: typeof item.artist === "string" ? item.artist : item.artist.name,
    image: lastFmImage(item),
  };
}
