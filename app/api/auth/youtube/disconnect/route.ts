import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const store = await cookies();
  store.delete("youtube_access_token");
  store.delete("youtube_refresh_token");
  store.delete("youtube_session_deadline");
  store.delete("youtube_oauth_state");
  return NextResponse.json({ connected: false });
}
