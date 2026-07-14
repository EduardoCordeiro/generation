import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/spotify/callback";
  if (!clientId || !process.env.SPOTIFY_CLIENT_SECRET) return NextResponse.json({ error: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env.local." }, { status: 500 });
  const state = randomUUID();
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: "user-read-private playlist-modify-private playlist-modify-public user-library-read" }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("spotify_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return response;
}
