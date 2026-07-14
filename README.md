# Mood Mix

Create a Spotify discovery playlist from a handful of songs, albums, or artists.

Mood Mix uses Spotify for authentication, catalog search, and playlist creation. It uses Last.fm listening data to find related artists and tracks, then resolves those recommendations back to playable Spotify tracks.

## What it does

1. Connect a Spotify account.
2. Search for and add Spotify tracks, albums, or artists as seeds.
3. Discover related music through Last.fm.
4. Exclude seed tracks, duplicate Spotify tracks, and saved-library tracks where Spotify permits the check.
5. Preview the resulting mix and remove unwanted tracks.
6. Create the playlist in Spotify.

Playlist length is configurable from 10 to 50 tracks. At least two thirds of each generated mix must come from distinct artists that were not used as seeds.

## Tech stack

- [Next.js](https://nextjs.org/) with the App Router
- React and TypeScript
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [Last.fm API](https://www.last.fm/api)
- [Vitest](https://vitest.dev/) for unit tests

## Prerequisites

- Node.js 20 or newer
- A Spotify developer application
- A Last.fm API key
- A Spotify Premium account if required by Spotify's current Development Mode rules

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
Spotify seeds
    ↓
Last.fm similar tracks and artists
    ↓
Spotify catalog resolution
    ↓
Deduplication and saved-library filtering
    ↓
Editable playlist preview
    ↓
Private Spotify playlist
```

Track seeds use Last.fm's similar-track data. Artist and album seeds currently use similar artists and their top tracks. Candidate names are searched in Spotify, and duplicate Spotify URIs are removed before the playlist reaches the interface.

The final selector groups tracks by primary artist. It chooses one track from every available non-seed artist before repeating an artist, then fills remaining positions round-robin. A mix is rejected if it cannot satisfy both the requested length and the two-thirds artist-diversity requirement.

The normalization behavior is isolated in [`lib/playlist.ts`](lib/playlist.ts) and covered by unit tests in [`lib/playlist.test.ts`](lib/playlist.test.ts).

## Project structure

```text
app/
  api/
    auth/spotify/       Spotify OAuth and connection status
    playlist/generate/  Last.fm discovery and Spotify resolution
    spotify/            Catalog search and playlist creation
  playlist-builder.tsx  Main interactive interface
  styles.css            Application styles
lib/
  playlist.ts           Playlist normalization utilities
  playlist.test.ts      Unit tests
  spotify.ts            Spotify API client and data mapping
```

## Current limitations

- “New to you” currently means the track is not a seed and is not in the user's saved Spotify library. Spotify does not expose a complete lifetime listening history, so the app cannot guarantee that a user has never heard a track.
- Mood text and sliders are present in the interface, but Last.fm similarity is still the primary recommendation signal. More explicit mood weighting is planned.
- Albums currently contribute their primary artist as the discovery seed rather than analyzing every track on the album.
- Spotify access tokens are stored in an HTTP-only cookie and are not refreshed. Users must reconnect after the token expires.
- Spotify Development Mode accounts and user quotas are governed by Spotify's current platform rules.

## Production notes

Before deploying publicly:

- Use an HTTPS callback URL and register the exact URL in Spotify's dashboard.
- Add refresh-token handling and durable session storage.
- Add a privacy policy explaining how Spotify user data is processed.
- Review the [Spotify Developer Policy](https://developer.spotify.com/policy) and [Last.fm API Terms](https://www.last.fm/api/tos).
- Never commit `.env.local` or API credentials.

## Testing

The unit suite protects the playlist invariants that should not depend on external APIs:

- candidate deduplication is case-insensitive;
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
