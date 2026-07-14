import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = (await cookies()).get("spotify_oauth_state")?.value;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/spotify/callback";
  if (!code || !state || state !== storedState) return NextResponse.redirect(new URL("/?spotify=failed", redirectUri));
  const credentials = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
  if (!tokenResponse.ok) return NextResponse.redirect(new URL("/?spotify=failed", redirectUri));
  const token = await tokenResponse.json() as { access_token: string; expires_in: number };
  const response = NextResponse.redirect(new URL("/?spotify=connected", redirectUri));
  response.cookies.set("spotify_access_token", token.access_token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: token.expires_in, path: "/" });
  response.cookies.delete("spotify_oauth_state");
  return response;
}
