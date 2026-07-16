import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const store = await cookies();
  return NextResponse.json({ connected: Boolean(store.get("spotify_access_token")?.value || store.get("spotify_refresh_token")?.value), configured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) });
}
