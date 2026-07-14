import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export async function GET(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:3000/api/auth/youtube/callback";
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = (await cookies()).get("youtube_oauth_state")?.value;
  if (!code || !state || state !== storedState) {
    console.error(`[youtube.auth.callback:${requestId}] state.invalid`, { hasCode: Boolean(code), hasState: Boolean(state), hasStoredState: Boolean(storedState), stateMatches: Boolean(state && storedState && state === storedState) });
    return NextResponse.redirect(new URL(`/?youtube=failed&reference=${requestId}`, redirectUri));
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    const problem = await tokenResponse.json().catch(() => null) as { error?: string; error_description?: string } | null;
    console.error(`[youtube.auth.callback:${requestId}] token.exchange_failed`, { status: tokenResponse.status, error: problem?.error, description: problem?.error_description, redirectUri });
    return NextResponse.redirect(new URL(`/?youtube=failed&reference=${requestId}`, redirectUri));
  }
  const token = await tokenResponse.json() as { access_token: string; expires_in: number };
  const response = NextResponse.redirect(new URL("/?youtube=connected", redirectUri));
  response.cookies.set("youtube_access_token", token.access_token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: token.expires_in, path: "/" });
  response.cookies.delete("youtube_oauth_state");
  console.info(`[youtube.auth.callback:${requestId}] authorization.complete`, { expiresIn: token.expires_in, redirectUri });
  return response;
}
