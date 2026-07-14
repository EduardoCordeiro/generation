import { NextRequest, NextResponse } from "next/server";
import { spotify } from "@/lib/spotify";

export async function POST(request: NextRequest) {
  try {
    const { name, uris } = await request.json() as { name: string; uris: string[] };
    if (!name || !Array.isArray(uris) || !uris.length) throw new Error("Add some tracks first.");
    const playlist = await spotify<{ id: string; external_urls: { spotify: string } }>("/me/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, public: false, description: "Made with Mood Mix" }) });
    await spotify(`/playlists/${playlist.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uris }) });
    return NextResponse.json({ url: playlist.external_urls.spotify });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn’t create playlist." }, { status: 400 }); }
}
