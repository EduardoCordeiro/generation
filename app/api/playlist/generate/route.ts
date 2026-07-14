import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { asSeed, spotify, SpotifyApiError, type SpotifyItem } from "@/lib/spotify";
import { asYouTubeTrack, youtube, YouTubeApiError, type YouTubeVideoMatch } from "@/lib/youtube";
import { collectArtistNames, excludeCandidatesByArtist, normalizeDiscoveryArtist, normalizeDiscoveryTrack, parsePlaylistSize, selectDiverseTracks, toPlaylistTracks, uniqueCandidates, uniquePrimaryArtistCount, uniqueResolvedTracks } from "@/lib/playlist";
import { isMusicProvider, type MusicProvider as Provider } from "@/lib/providers";

type Seed = ReturnType<typeof asSeed>;
type LastFmTrack = { name: string; artist: { name: string }; image?: Array<{ "#text"?: string; size?: string }> };

class LastFmApiError extends Error {
  constructor(message: string, public readonly method: string, public readonly status?: number, public readonly code?: number) {
    super(message);
    this.name = "LastFmApiError";
  }
}

class GenerationStageError extends Error {
  constructor(public readonly stage: string, public readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : "Unknown generation error");
    this.name = "GenerationStageError";
  }
}

function log(requestId: string, event: string, details: Record<string, unknown> = {}) {
  console.info(`[playlist.generate:${requestId}] ${event}`, details);
}

async function runStage<T>(requestId: string, stage: string, task: () => Promise<T>) {
  const startedAt = Date.now();
  log(requestId, `${stage}.start`);
  try {
    const result = await task();
    log(requestId, `${stage}.complete`, { durationMs: Date.now() - startedAt });
    return result;
  } catch (cause) {
    throw new GenerationStageError(stage, cause);
  }
}

function publicError(error: unknown) {
  const stage = error instanceof GenerationStageError ? error.stage : "validation";
  const cause = error instanceof GenerationStageError ? error.cause : error;

  if (cause instanceof SpotifyApiError) {
    if (cause.status === 401) return { stage, message: cause.message, status: 401 };
    if (cause.status === 403 && stage === "spotify-library") {
      return { stage, message: "Spotify did not allow access to your Liked Songs. Reconnect Spotify and approve library access.", status: 502 };
    }
    if (cause.status === 429) {
      const wait = cause.retryAfter ? ` Try again in ${cause.retryAfter} seconds.` : " Try again shortly.";
      return { stage, message: `Spotify rate-limited playlist generation.${wait}`, status: 429 };
    }
    return { stage, message: `Spotify failed during ${stage} (HTTP ${cause.status}): ${cause.message}`, status: 502 };
  }

  if (cause instanceof LastFmApiError) {
    return { stage, message: `Last.fm failed during ${stage}${cause.status ? ` (HTTP ${cause.status})` : ""}: ${cause.message}`, status: 502 };
  }

  if (cause instanceof YouTubeApiError) {
    return { stage, message: `YouTube failed during ${stage} (HTTP ${cause.status}): ${cause.message}`, status: cause.status === 401 ? 401 : 502 };
  }

  return { stage, message: cause instanceof Error ? cause.message : "Couldn’t generate your mix.", status: 400 };
}

function loggedError(error: unknown) {
  const stage = error instanceof GenerationStageError ? error.stage : "validation";
  const cause = error instanceof GenerationStageError ? error.cause : error;
  if (cause instanceof SpotifyApiError) {
    return { stage, type: cause.name, message: cause.message, upstreamStatus: cause.status, upstreamPath: cause.path, retryAfter: cause.retryAfter };
  }
  if (cause instanceof LastFmApiError) {
    return { stage, type: cause.name, message: cause.message, upstreamStatus: cause.status, method: cause.method, upstreamCode: cause.code };
  }
  if (cause instanceof YouTubeApiError) {
    return { stage, type: cause.name, message: cause.message, upstreamStatus: cause.status, upstreamPath: cause.path };
  }
  return { stage, type: cause instanceof Error ? cause.name : typeof cause, message: cause instanceof Error ? cause.message : String(cause) };
}

const lastFm = async <T,>(params: Record<string, string>) => {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("Add LASTFM_API_KEY to .env.local to generate discovery playlists.");
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({ ...params, api_key: key, format: "json", autocorrect: "1" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "MoodMix/0.1" }, cache: "no-store" });
  if (!response.ok) throw new LastFmApiError("The service is unavailable.", params.method, response.status);
  const data = await response.json();
  if (data.error) throw new LastFmApiError(data.message || "Last.fm couldn’t find a match.", params.method, undefined, data.error);
  return data as T;
};

async function similarTracks(artist: string, track: string, limit: number) {
  const data = await lastFm<{ similartracks?: { track?: LastFmTrack[] } }>({ method: "track.getsimilar", artist, track, limit: String(limit) });
  return (data.similartracks?.track || []).map((item) => ({ name: item.name, artist: item.artist.name, image: lastFmImage(item) }));
}

function lastFmImage(track: LastFmTrack) {
  return [...(track.image || [])].reverse().find((image) => image["#text"])?.["#text"];
}

async function artistDiscovery(artist: string, artistLimit: number) {
  const data = await lastFm<{ similarartists?: { artist?: { name: string }[] } }>({ method: "artist.getsimilar", artist, limit: String(artistLimit) });
  const names = (data.similarartists?.artist || []).slice(0, artistLimit).map((item) => item.name);
  const tracks = await Promise.all(names.map(async (name) => {
    const top = await lastFm<{ toptracks?: { track?: LastFmTrack[] } }>({ method: "artist.gettoptracks", artist: name, limit: "2" });
    return (top.toptracks?.track || []).map((item) => ({ name: item.name, artist: item.artist.name || name, image: lastFmImage(item) }));
  }));
  return tracks.flat();
}

async function mapInBatches<T, R>(items: T[], batchSize: number, map: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...await Promise.all(items.slice(index, index + batchSize).map(map)));
  }
  return results;
}

type SavedTracksPage = {
  items: Array<{ track?: SpotifyItem | null; item?: SpotifyItem | null }>;
  total: number;
};

async function getSpotifyLikedArtistNames() {
  const limit = 50;
  const first = await spotify<SavedTracksPage>(`/me/tracks?limit=${limit}&offset=0`);
  const offsets = Array.from(
    { length: Math.max(0, Math.ceil(first.total / limit) - 1) },
    (_, index) => (index + 1) * limit,
  );
  const remaining = await mapInBatches(offsets, 5, (offset) =>
    spotify<SavedTracksPage>(`/me/tracks?limit=${limit}&offset=${offset}`),
  );
  const tracks = [first, ...remaining].flatMap((page) =>
    page.items.map((entry) => entry.track || entry.item).filter((item): item is SpotifyItem => Boolean(item)),
  );
  return { artists: collectArtistNames(tracks), trackCount: tracks.length, pageCount: 1 + remaining.length };
}

async function getYouTubeLikedArtistNames() {
  const channels = await youtube<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { likes?: string } } }> }>("/channels?part=contentDetails&mine=true");
  const playlistId = channels.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  if (!playlistId) return { artists: [] as string[], trackCount: 0, pageCount: 0 };

  const artists = new Set<string>();
  let trackCount = 0;
  let pageCount = 0;
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ part: "snippet", playlistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await youtube<{ nextPageToken?: string; items?: Array<{ snippet?: { videoOwnerChannelTitle?: string; channelTitle?: string } }> }>(`/playlistItems?${params}`);
    pageCount += 1;
    for (const item of page.items || []) {
      trackCount += 1;
      const artist = item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle;
      if (artist) artists.add(normalizeDiscoveryArtist(artist));
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { artists: [...artists], trackCount, pageCount };
}

function getLibraryArtistNames(provider: Provider) {
  return provider === "spotify" ? getSpotifyLikedArtistNames() : getYouTubeLikedArtistNames();
}

function candidateItem(candidate: { artist: string; name: string; image?: string }, index: number): SpotifyItem {
  return {
    id: `candidate-${index}`,
    uri: `discovery:track:${index}`,
    name: candidate.name,
    type: "track",
    artists: [{ name: candidate.artist }],
    album: { name: "Discovery", images: candidate.image ? [{ url: candidate.image }] : undefined },
  };
}

function artistFromSeed(seed: Seed) {
  return normalizeDiscoveryArtist(seed.type === "artist" ? seed.name : seed.subtitle.split(" · ")[0]);
}

async function discoverFromSeed(seed: Seed, trackLimit: number, artistLimit: number) {
  const artist = artistFromSeed(seed);
  if (seed.type !== "track") return artistDiscovery(artist, artistLimit);

  const track = normalizeDiscoveryTrack(seed.name, artist);
  const attempts = await Promise.allSettled([
    similarTracks(artist, track, trackLimit),
    artistDiscovery(artist, artistLimit),
  ]);
  const discoveries = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? attempt.value : []);
  if (!discoveries.length) {
    const failed = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    if (failed) throw failed.reason;
  }
  return discoveries;
}

async function resolveTrack(provider: Provider, item: SpotifyItem) {
  const artist = item.artists?.[0]?.name || "";
  if (provider === "spotify") {
    const params = new URLSearchParams({ q: `track:${item.name} artist:${artist}`, type: "track", limit: "1" });
    const result = await spotify<{ tracks: { items: SpotifyItem[] } }>(`/search?${params}`);
    return result.tracks.items[0] || item;
  }

  const params = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", maxResults: "1", q: `${artist} ${item.name} official audio` });
  const result = await youtube<{ items?: YouTubeVideoMatch[] }>(`/search?${params}`);
  return asYouTubeTrack(result.items?.[0], item);
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  try {
    const { seeds, size: requestedSize = 20, provider = "spotify" } = await request.json() as { seeds: Seed[]; size?: number; provider?: Provider };
    if (!Array.isArray(seeds) || !seeds.length) throw new Error("Add at least one music seed.");
    if (!isMusicProvider(provider)) throw new Error("Choose a supported music provider.");
    const size = parsePlaylistSize(requestedSize);
    const requiredArtists = Math.ceil(size * 2 / 3);
    const trackLimitPerSeed = Math.max(20, Math.ceil(size * 3 / seeds.length));
    const artistLimitPerSeed = Math.max(6, Math.ceil(requiredArtists / seeds.length) + 4);
    const seedArtists = seeds.flatMap((seed) => artistFromSeed(seed).split(", "));
    log(requestId, "request.accepted", { provider, seedCount: seeds.length, requestedSize: size, requiredArtists });

    const [candidates, likedLibrary] = await Promise.all([
      runStage(requestId, "lastfm-discovery", () => Promise.all(
        seeds.map((seed) => discoverFromSeed(seed, trackLimitPerSeed, artistLimitPerSeed)),
      ).then((groups) => groups.flat())),
      runStage(requestId, `${provider}-library`, () => getLibraryArtistNames(provider)),
    ]);
    log(requestId, "sources.loaded", { candidateCount: candidates.length, likedTrackCount: likedLibrary.trackCount, likedArtistCount: likedLibrary.artists.length, likedSongPages: likedLibrary.pageCount });
    const excludedArtists = [...seedArtists, ...likedLibrary.artists];
    const eligibleCandidates = excludeCandidatesByArtist(candidates, excludedArtists);
    const unique = uniqueCandidates(eligibleCandidates, Math.min(size * 4, 160));
    log(requestId, "candidates.filtered", { eligibleCount: eligibleCandidates.length, uniqueCount: unique.length, excludedArtistCount: excludedArtists.length });
    const candidateItems = unique.map(candidateItem);
    const orderedCandidates = selectDiverseTracks(candidateItems, candidateItems.length, excludedArtists);
    const candidateArtistCount = uniquePrimaryArtistCount(orderedCandidates);
    log(requestId, "selection.complete", { candidateCount: candidateItems.length, selectedCount: orderedCandidates.length, artistCount: candidateArtistCount });
    if (orderedCandidates.length < size || candidateArtistCount < requiredArtists) {
      throw new GenerationStageError(
        "selection",
        new Error(`We found ${orderedCandidates.length} eligible tracks from ${candidateArtistCount} new artists, but this mix needs ${size} tracks from at least ${requiredArtists} artists. Try adding another seed or choosing a shorter playlist.`),
      );
    }
    const resolved = await runStage(requestId, `${provider}-catalog`, async () => {
      let attempted = 0;
      let uniqueResolved: SpotifyItem[] = [];
      let playlist: SpotifyItem[] = [];
      const attemptLimit = Math.min(orderedCandidates.length, size + 10);
      while (attempted < attemptLimit) {
        const batchSize = attempted === 0 ? size : 5;
        const batch = orderedCandidates.slice(attempted, Math.min(attempted + batchSize, attemptLimit));
        const matches = await mapInBatches(batch, 5, (item) => resolveTrack(provider, item));
        attempted += batch.length;
        uniqueResolved = uniqueResolvedTracks([...uniqueResolved, ...matches], seeds.map((seed) => seed.uri));
        playlist = selectDiverseTracks(uniqueResolved, size, excludedArtists);
        const resolvedArtistCount = uniquePrimaryArtistCount(playlist);
        log(requestId, "catalog.batch", { attemptedCount: attempted, uniqueMatchCount: uniqueResolved.length, selectedCount: playlist.length, artistCount: resolvedArtistCount });
        if (playlist.length === size && resolvedArtistCount >= requiredArtists) return playlist;
      }
      return playlist;
    });
    const artistCount = uniquePrimaryArtistCount(resolved);
    if (resolved.length < size || artistCount < requiredArtists) {
      throw new GenerationStageError(
        "selection",
        new Error(`After removing duplicate catalog matches, we found ${resolved.length} tracks from ${artistCount} new artists. This mix needs ${size} tracks from at least ${requiredArtists} artists.`),
      );
    }
    const tracks = toPlaylistTracks(resolved, size);
    log(requestId, "request.complete", { durationMs: Date.now() - startedAt, trackCount: tracks.length, artistCount });
    return NextResponse.json({ tracks, artistCount, requestId });
  } catch (error) {
    const problem = publicError(error);
    console.error(`[playlist.generate:${requestId}] request.failed`, { durationMs: Date.now() - startedAt, ...loggedError(error) });
    return NextResponse.json({ error: problem.message, stage: problem.stage, requestId }, { status: problem.status });
  }
}
