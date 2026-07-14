# Mood Mix

Create a discovery playlist from a handful of songs, albums, or artists, then save it to Spotify or YouTube.

Mood Mix uses the connected provider for seed search, saved/liked-library filtering, and final catalog resolution. Last.fm listening data supplies related artists and tracks.

## What it does

1. Choose and connect Spotify or YouTube.
2. Search the selected provider and add tracks, albums, or artists as seeds where that provider supports them.
3. Discover related music through Last.fm.
4. Exclude seed artists, duplicate candidates, and artists found in the selected provider's music library or liked collection.
5. Preview the resulting mix and remove unwanted tracks.
6. Create the playlist in the connected provider.

Playlist length is configurable from 10 to 50 tracks. At least two thirds of each generated mix must come from distinct artists that were not used as seeds.

## Tech stack

- [Next.js](https://nextjs.org/) with the App Router
- React and TypeScript
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [Last.fm API](https://www.last.fm/api)
- [Vitest](https://vitest.dev/) for unit tests

## Prerequisites

- Node.js 20 or newer
- A Spotify developer application
- A Last.fm API key
- A Spotify Premium account if required by Spotify's current Development Mode rules
- Optional Google OAuth credentials for YouTube export

## Local setup

Install the dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

Populate `.env.local`:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback
LASTFM_API_KEY=your_lastfm_api_key

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/auth/youtube/callback
```

### Configure Spotify

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add this exact Redirect URI to the app settings:

   ```text
   http://127.0.0.1:3000/api/auth/spotify/callback
   ```

3. Copy the client ID and client secret into `.env.local`.

Spotify does not allow `localhost` as a redirect URI for newly created applications. Use the explicit loopback address `127.0.0.1` in both the dashboard and `.env.local`.

### Configure Last.fm

Create an API account on the [Last.fm API account page](https://www.last.fm/api/account/create), then add its API key to `.env.local`. The current discovery endpoints do not require users to authenticate with Last.fm.

### Configure YouTube

To enable YouTube:

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable YouTube Data API v3.
3. Configure the OAuth consent screen and create a Web application OAuth client.
4. Add this exact authorized redirect URI:

   ```text
   http://127.0.0.1:3000/api/auth/youtube/callback
   ```

5. Add the OAuth client ID and client secret to `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

An API key is not a substitute for these OAuth credentials: it can identify the Google Cloud project for public-data requests, but it cannot authorize playlist creation in a user's account. The current application uses the signed-in user's OAuth access token for all YouTube requests and does not read a YouTube API key.

If the OAuth app is in testing mode, add each intended account as a test user. YouTube catalog searches consume API quota, so larger playlists cost more quota to export.

### Run the app

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use `127.0.0.1` throughout the local OAuth flow rather than switching between it and `localhost`.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run unit tests, then start the development server |
| `npm test` | Run the unit test suite once |
| `npm run test:watch` | Rerun unit tests as files change |
| `npm run check` | Run tests and create a production build |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |

## How discovery works

```text
Selected provider seeds
    ↓
Last.fm similar tracks and artists
    ↓
Provider library/liked-artist filtering
    ↓
Editable playlist preview
    ↓
Spotify or YouTube playlist
```

Track seeds use Last.fm's similar-track data. Artist and album seeds currently use similar artists and their top tracks. Discovery remains provider-neutral until playlist creation, when each track is resolved against the selected provider's catalog.

Before selecting the final candidates, Mood Mix reads the selected provider's saved or liked music and builds an artist exclusion set. Spotify uses Liked Songs, and YouTube uses the account's liked-videos collection. The final selector rejects those artists, groups the remaining tracks by primary artist, chooses one track from every available artist before repeating one, and then fills remaining positions round-robin. A mix is rejected if it cannot satisfy both the requested length and the two-thirds artist-diversity requirement.

The normalization behavior is isolated in [`lib/playlist.ts`](lib/playlist.ts) and covered by unit tests in [`lib/playlist.test.ts`](lib/playlist.test.ts).

## Project structure

```text
app/
  api/
    auth/spotify/       Spotify OAuth and connection status
    auth/youtube/       Google OAuth for YouTube
    playlist/generate/  Last.fm discovery and Spotify resolution
    spotify/            Catalog search and playlist creation
    youtube/            YouTube playlist export
  playlist-builder.tsx  Main interactive interface
  styles.css            Application styles
lib/
  playlist.ts           Playlist normalization utilities
  playlist.test.ts      Unit tests
  spotify.ts            Spotify API client and data mapping
  youtube.ts            YouTube API client
```

## Current limitations

- “New to you” means the artist was not used as a seed and does not appear in the selected provider's accessible saved/liked collection. Providers do not expose a complete lifetime listening history, so the app cannot guarantee that a user has never heard an artist or track.
- YouTube exposes videos and channel metadata rather than normalized music artists, albums, and tracks. Its seed and liked-artist matching is therefore less precise than Spotify.
- Albums currently contribute their primary artist as the discovery seed rather than analyzing every track on the album.
- Spotify access tokens are stored in an HTTP-only cookie and are not refreshed. Users must reconnect after the token expires.
- YouTube matches tracks by artist and title. It may not find every discovery track; the app reports unmatched tracks after export.
- YouTube OAuth tokens are not refreshed yet. A generated draft is preserved in session storage during the YouTube connection redirect.
- Spotify Development Mode accounts and user quotas are governed by Spotify's current platform rules.

## Production notes

Before deploying publicly:

- Use HTTPS callback URLs and register the exact URLs in Spotify and Google dashboards.
- Add refresh-token handling and durable session storage.
- Add a privacy policy explaining how Spotify user data is processed.
- Review the [Spotify Developer Policy](https://developer.spotify.com/policy), [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service), and [Last.fm API Terms](https://www.last.fm/api/tos).
- Never commit `.env.local` or API credentials.

## Testing

The unit suite protects the playlist invariants that should not depend on external APIs:

- candidate deduplication is case-insensitive;
- artists from Liked Songs are collected and excluded case-insensitively;
- duplicate Spotify URIs are removed;
- input seed tracks are excluded;
- saved tracks are filtered safely;
- recommendation ordering remains stable; and
- playlist sizes outside the supported 10–50 range are rejected; and
- at least two thirds of a generated playlist comes from distinct non-seed artists.

Run the complete local verification:

```bash
npm run check
```

## License

Licensed under the [MIT License](LICENSE).
