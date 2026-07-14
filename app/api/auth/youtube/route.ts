import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const requestId = randomUUID().slice(0, 8);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/youtube/callback";
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(`[youtube.auth:${requestId}] configuration.missing`, {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      redirectUri,
    });
    return NextResponse.json({ error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.", requestId }, { status: 500 });
  }
  const state = randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube",
    access_type: "offline",
    prompt: "consent select_account",
    state,
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("youtube_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  console.info(`[youtube.auth:${requestId}] authorization.redirect`, { redirectUri, scope: "youtube" });
  return response;
}
