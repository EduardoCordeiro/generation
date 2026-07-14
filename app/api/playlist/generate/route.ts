import { NextRequest, NextResponse } from "next/server";
import { asSeed, spotify, type SpotifyItem } from "@/lib/spotify";
import { excludeSavedTracks, toPlaylistTracks, uniqueCandidates, uniqueResolvedTracks, type Candidate } from "@/lib/playlist";

type Seed = ReturnType<typeof asSeed>;
type LastFmTrack = { name: string; artist: { name: string } };

const lastFm = async <T,>(params: Record<string, string>) => {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("Add LASTFM_API_KEY to .env.local to generate discovery playlists.");
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({ ...params, api_key: key, format: "json", autocorrect: "1" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "MoodMix/0.1" }, cache: "no-store" });
  if (!response.ok) throw new Error("Last.fm is unavailable. Please try again.");
  const data = await response.json();
  if (data.error) throw new Error(data.message || "Last.fm couldn’t find a match.");
  return data as T;
};

async function similarTracks(artist: string, track: string) {
  const data = await lastFm<{ similartracks?: { track?: LastFmTrack[] } }>({ method: "track.getsimilar", artist, track, limit: "12" });
  return (data.similartracks?.track || []).map((item) => ({ name: item.name, artist: item.artist.name }));
}

async function artistDiscovery(artist: string) {
  const data = await lastFm<{ similarartists?: { artist?: { name: string }[] } }>({ method: "artist.getsimilar", artist, limit: "6" });
  const names = (data.similarartists?.artist || []).slice(0, 4).map((item) => item.name);
  const tracks = await Promise.all(names.map(async (name) => {
    const top = await lastFm<{ toptracks?: { track?: LastFmTrack[] } }>({ method: "artist.gettoptracks", artist: name, limit: "4" });
    return (top.toptracks?.track || []).map((item) => ({ name: item.name, artist: item.artist.name || name }));
  }));
  return tracks.flat();
}

function artistFromSeed(seed: Seed) {
  if (seed.type === "artist") return seed.name;
  return seed.subtitle.split(" · ")[0];
}

export async function POST(request: NextRequest) {
  try {
    const { seeds } = await request.json() as { seeds: Seed[]; brief?: string; energy?: number; warmth?: number };
    if (!Array.isArray(seeds) || !seeds.length) throw new Error("Add at least one Spotify seed.");
    const candidates = (await Promise.all(seeds.map(async (seed) => seed.type === "track" ? similarTracks(artistFromSeed(seed), seed.name) : artistDiscovery(artistFromSeed(seed))))).flat();
    const unique = uniqueCandidates(candidates);
    const resolved = await Promise.all(unique.map(async (candidate) => {
      const params = new URLSearchParams({ q: `track:${candidate.name} artist:${candidate.artist}`, type: "track", limit: "1" });
      const result = await spotify<{ tracks: { items: SpotifyItem[] } }>(`/search?${params}`);
      return result.tracks.items[0];
    }));
    const items = uniqueResolvedTracks(resolved, seeds.map((seed) => seed.uri));
    // Spotify's development API can check the user's library; this filters out saved tracks.
    const uris = items.map((item) => item.uri).join(",");
    let unseen = items;
    if (uris) {
      try {
        const library = await spotify<{ contains: boolean[] }>(`/me/library/contains?uris=${encodeURIComponent(uris)}`);
        unseen = excludeSavedTracks(items, library.contains);
      } catch { /* A connection without library access can still produce a playlist. */ }
    }
    const tracks = toPlaylistTracks(unseen);
    if (tracks.length < 8) throw new Error("We couldn’t find enough fresh tracks from those seeds. Try adding another artist or track.");
    return NextResponse.json({ tracks });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn’t generate your mix." }, { status: 400 }); }
}
