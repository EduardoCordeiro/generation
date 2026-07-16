import { NextRequest, NextResponse } from "next/server";
import { creditedArtists } from "@/lib/artists";
import { enrichDiscoverySeeds, type DiscoverySeed } from "@/lib/discovery";
import { lastFm, lastFmImage, type LastFmImage } from "@/lib/lastfm";
import { asSeed, spotify, type SpotifyItem } from "@/lib/spotify";

type ArtistMatch = { name: string; mbid?: string; image?: LastFmImage[] };
type AlbumMatch = { name: string; artist: string; mbid?: string; image?: LastFmImage[] };
type TrackMatch = { name: string; artist: string; mbid?: string; image?: LastFmImage[] };

function seedId(type: DiscoverySeed["type"], item: { name: string; mbid?: string }, artist = "") {
  return item.mbid || `${type}:${artist}:${item.name}`.toLocaleLowerCase();
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const provider = request.nextUrl.searchParams.get("provider");
  if (!query || query.length < 2) return NextResponse.json({ items: [] });
  try {
    const [artists, albums, tracks, providerSeeds] = await Promise.all([
      lastFm<{ results?: { artistmatches?: { artist?: ArtistMatch[] } } }>({ method: "artist.search", artist: query, limit: "4" }),
      lastFm<{ results?: { albummatches?: { album?: AlbumMatch[] } } }>({ method: "album.search", album: query, limit: "4" }),
      lastFm<{ results?: { trackmatches?: { track?: TrackMatch[] } } }>({ method: "track.search", track: query, limit: "4" }),
      provider === "spotify"
        ? spotify<{ artists: { items: SpotifyItem[] }; albums: { items: SpotifyItem[] }; tracks: { items: SpotifyItem[] } }>(`/search?${new URLSearchParams({ q: query, type: "artist,album,track", limit: "10" })}`)
          .then((results) => [...results.tracks.items, ...results.albums.items, ...results.artists.items].map(asSeed))
          .catch(() => [] as DiscoverySeed[])
        : Promise.resolve([] as DiscoverySeed[]),
    ]);
    const items: DiscoverySeed[] = [
      ...(artists.results?.artistmatches?.artist || []).map((item) => ({
        id: seedId("artist", item), uri: `lastfm:artist:${encodeURIComponent(seedId("artist", item))}`,
        name: item.name, subtitle: "Artist", type: "artist" as const, artists: [item.name], image: lastFmImage(item),
      })),
      ...(albums.results?.albummatches?.album || []).map((item) => ({
        id: seedId("album", item, item.artist), uri: `lastfm:album:${encodeURIComponent(seedId("album", item, item.artist))}`,
        name: item.name, subtitle: `${item.artist} · Album`, type: "album" as const, artists: [item.artist], image: lastFmImage(item),
      })),
      ...(tracks.results?.trackmatches?.track || []).map((item) => ({
        id: seedId("track", item, item.artist), uri: `lastfm:track:${encodeURIComponent(seedId("track", item, item.artist))}`,
        name: item.name, subtitle: `${item.artist} · Track`, type: "track" as const, artists: creditedArtists(item.artist), image: lastFmImage(item),
      })),
    ];
    return NextResponse.json({ items: enrichDiscoverySeeds(items, providerSeeds) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Music search failed." }, { status: 502 });
  }
}
