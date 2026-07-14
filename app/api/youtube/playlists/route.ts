import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { youtube, YouTubeApiError } from "@/lib/youtube";

type Track = { uri?: string; name: string; artist: string };

export async function POST(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);
  try {
    const { name, tracks } = await request.json() as { name: string; tracks: Track[] };
    if (!name || !Array.isArray(tracks) || !tracks.length) throw new Error("Add some tracks first.");
    console.info(`[youtube.playlist:${requestId}] request.accepted`, { trackCount: tracks.length });

    const videoIds: string[] = tracks.flatMap((track) => track.uri?.startsWith("youtube:video:") ? [track.uri.slice("youtube:video:".length)] : []);
    for (const track of tracks) {
      if (track.uri?.startsWith("youtube:video:")) continue;
      const params = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", maxResults: "1", q: `${track.artist} ${track.name} official audio` });
      const result = await youtube<{ items?: Array<{ id?: { videoId?: string } }> }>(`/search?${params}`);
      const videoId = result.items?.[0]?.id?.videoId;
      if (videoId && !videoIds.includes(videoId)) videoIds.push(videoId);
    }
    if (!videoIds.length) throw new Error("YouTube could not match any tracks in this mix.");

    const playlist = await youtube<{ id: string }>("/playlists?part=snippet,status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { title: name, description: "Made with Mood Mix" }, status: { privacyStatus: "private" } }),
    });
    for (const videoId of videoIds) {
      await youtube("/playlistItems?part=snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: { playlistId: playlist.id, resourceId: { kind: "youtube#video", videoId } } }),
      });
    }
    console.info(`[youtube.playlist:${requestId}] request.complete`, { requestedCount: tracks.length, matchedCount: videoIds.length });
    return NextResponse.json({ url: `https://www.youtube.com/playlist?list=${playlist.id}`, matchedCount: videoIds.length, skippedCount: tracks.length - videoIds.length, requestId });
  } catch (error) {
    const details = error instanceof YouTubeApiError ? { status: error.status, path: error.path, message: error.message } : { message: error instanceof Error ? error.message : String(error) };
    console.error(`[youtube.playlist:${requestId}] request.failed`, details);
    const message = error instanceof YouTubeApiError
      ? `YouTube failed (HTTP ${error.status}): ${error.message}`
      : error instanceof Error ? error.message : "Couldn’t create the YouTube playlist.";
    return NextResponse.json({ error: message, requestId }, { status: error instanceof YouTubeApiError ? error.status : 400 });
  }
}
