import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ connected: Boolean((await cookies()).get("spotify_access_token")?.value) });
}
