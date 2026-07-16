import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const store = await cookies();
  store.delete("spotify_access_token");
  store.delete("spotify_refresh_token");
  store.delete("spotify_session_deadline");
  store.delete("spotify_oauth_state");
  return NextResponse.json({ connected: false });
}
