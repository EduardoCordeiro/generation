import { NextRequest, NextResponse } from "next/server";
import { asSeed, spotify, type SpotifyItem } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ items: [] });
  try {
    const results = await spotify<{ artists: { items: SpotifyItem[] }; albums: { items: SpotifyItem[] }; tracks: { items: SpotifyItem[] } }>(`/search?${new URLSearchParams({ q: query, type: "artist,album,track", limit: "3" })}`);
    return NextResponse.json({ items: [...results.tracks.items, ...results.albums.items, ...results.artists.items].map(asSeed) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed." }, { status: 400 }); }
}
