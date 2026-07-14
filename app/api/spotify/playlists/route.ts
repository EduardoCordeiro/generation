import { NextRequest, NextResponse } from "next/server";
import { spotify, type SpotifyItem } from "@/lib/spotify";

type Track = { uri?: string; name: string; artist: string };

export async function POST(request: NextRequest) {
  try {
    const { name, uris: suppliedUris, tracks } = await request.json() as { name: string; uris?: string[]; tracks?: Track[] };
    if (!name || (!suppliedUris?.length && !tracks?.length)) throw new Error("Add some tracks first.");
    const uris = suppliedUris || [];
    for (const track of tracks || []) {
      if (track.uri?.startsWith("spotify:track:")) {
        if (!uris.includes(track.uri)) uris.push(track.uri);
        continue;
      }
      const params = new URLSearchParams({ q: `track:${track.name} artist:${track.artist}`, type: "track", limit: "1" });
      const result = await spotify<{ tracks: { items: SpotifyItem[] } }>(`/search?${params}`);
      const uri = result.tracks.items[0]?.uri;
      if (uri && !uris.includes(uri)) uris.push(uri);
    }
    if (!uris.length) throw new Error("Spotify could not match any tracks in this mix.");
    const playlist = await spotify<{ id: string; external_urls: { spotify: string } }>("/me/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, public: false, description: "Made with Mood Mix" }) });
    await spotify(`/playlists/${playlist.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uris }) });
    return NextResponse.json({ url: playlist.external_urls.spotify, matchedCount: uris.length, skippedCount: Math.max(0, (tracks?.length || uris.length) - uris.length) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn’t create playlist." }, { status: 400 }); }
}
