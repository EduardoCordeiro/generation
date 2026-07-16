import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const store = await cookies();
  return NextResponse.json({ connected: Boolean(store.get("youtube_access_token")?.value || store.get("youtube_refresh_token")?.value), configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
}
