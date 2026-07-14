import { NextRequest, NextResponse } from "next/server";
import { youtube } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ items: [] });
  try {
    const params = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", maxResults: "8", q: query });
    const results = await youtube<{ items?: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } } }> }>(`/search?${params}`);
    return NextResponse.json({ items: (results.items || []).map((item) => ({
      id: item.id.videoId,
      uri: `youtube:video:${item.id.videoId}`,
      name: item.snippet.title,
      subtitle: `${item.snippet.channelTitle} · YouTube`,
      type: "track" as const,
      image: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube search failed." }, { status: 400 });
  }
}
