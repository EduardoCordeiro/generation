import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { artistIdentity, creditedArtists, uniqueArtistNames } from "@/lib/artists";
import type { DiscoverySeed, GenerationRequest } from "@/lib/discovery";
import { asCandidate, lastFm, LastFmApiError, type LastFmTrack } from "@/lib/lastfm";
import { inferMoodTags, rankWeightedCandidates, type WeightedTag } from "@/lib/mood";
import {
  collectArtistNames,
  collectSeedArtistNames,
  excludeCandidatesByArtist,
  normalizeDiscoveryArtist,
  normalizeDiscoveryTrack,
  parsePlaylistSize,
  selectDiverseTracks,
  toPlaylistTracks,
  uniqueCandidates,
  uniquePrimaryArtistCount,
  uniqueResolvedTracks,
  type Candidate,
} from "@/lib/playlist";
import { isMusicProvider, type MusicProvider as Provider } from "@/lib/providers";
import { spotify, SpotifyApiError, type SpotifyItem } from "@/lib/spotify";
import { asYouTubeTrack, youtube, YouTubeApiError, type YouTubeVideoMatch } from "@/lib/youtube";

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
    if (cause.status === 429) return { stage, message: `Spotify rate-limited playlist generation.${cause.retryAfter ? ` Try again in ${cause.retryAfter} seconds.` : " Try again shortly."}`, status: 429 };
    return { stage, message: `Spotify failed during ${stage} (HTTP ${cause.status}): ${cause.message}`, status: 502 };
  }
  if (cause instanceof LastFmApiError) return { stage, message: `Last.fm failed during ${stage}${cause.status ? ` (HTTP ${cause.status})` : ""}: ${cause.message}`, status: 502 };
  if (cause instanceof YouTubeApiError) return { stage, message: `YouTube failed during ${stage} (HTTP ${cause.status}): ${cause.message}`, status: cause.status === 401 ? 401 : 502 };
  return { stage, message: cause instanceof Error ? cause.message : "Couldn’t generate your mix.", status: 400 };
}

function loggedError(error: unknown) {
  const stage = error instanceof GenerationStageError ? error.stage : "validation";
  const cause = error instanceof GenerationStageError ? error.cause : error;
  if (cause instanceof SpotifyApiError) return { stage, type: cause.name, message: cause.message, upstreamStatus: cause.status, upstreamPath: cause.path, retryAfter: cause.retryAfter };
  if (cause instanceof LastFmApiError) return { stage, type: cause.name, message: cause.message, upstreamStatus: cause.status, method: cause.method, upstreamCode: cause.code };
  if (cause instanceof YouTubeApiError) return { stage, type: cause.name, message: cause.message, upstreamStatus: cause.status, upstreamPath: cause.path };
  return { stage, type: cause instanceof Error ? cause.name : typeof cause, message: cause instanceof Error ? cause.message : String(cause) };
}

async function mapInBatches<T, R>(items: T[], batchSize: number, map: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) results.push(...await Promise.all(items.slice(index, index + batchSize).map(map)));
  return results;
}

type SavedTracksPage = { items: Array<{ track?: SpotifyItem | null; item?: SpotifyItem | null }>; total: number };

async function getSpotifyLikedArtistNames() {
  const limit = 50;
  const first = await spotify<SavedTracksPage>(`/me/tracks?limit=${limit}&offset=0`);
  const offsets = Array.from({ length: Math.max(0, Math.ceil(first.total / limit) - 1) }, (_, index) => (index + 1) * limit);
  const remaining = await mapInBatches(offsets, 5, (offset) => spotify<SavedTracksPage>(`/me/tracks?limit=${limit}&offset=${offset}`));
  const tracks = [first, ...remaining].flatMap((page) => page.items.map((entry) => entry.track || entry.item).filter((item): item is SpotifyItem => Boolean(item)));
  return { artists: collectArtistNames(tracks), trackCount: tracks.length, pageCount: 1 + remaining.length };
}

async function getYouTubeLikedArtistNames() {
  const channels = await youtube<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { likes?: string } } }> }>("/channels?part=contentDetails&mine=true");
  const playlistId = channels.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  if (!playlistId) return { artists: [] as string[], trackCount: 0, pageCount: 0 };
  const artists: string[] = [];
  let trackCount = 0;
  let pageCount = 0;
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ part: "snippet", playlistId, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await youtube<{ nextPageToken?: string; items?: Array<{ snippet?: { title?: string; videoOwnerChannelTitle?: string; channelTitle?: string } }> }>(`/playlistItems?${params}`);
    pageCount += 1;
    for (const item of page.items || []) {
      trackCount += 1;
      const channel = item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle;
      if (channel) artists.push(normalizeDiscoveryArtist(channel));
      const titleArtist = item.snippet?.title?.split(/\s+[-–—]\s+/)[0];
      if (titleArtist && titleArtist !== item.snippet?.title) artists.push(...creditedArtists(titleArtist));
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { artists: uniqueArtistNames(artists), trackCount, pageCount };
}

function getLibraryArtistNames(provider: Provider) {
  return provider === "spotify" ? getSpotifyLikedArtistNames() : getYouTubeLikedArtistNames();
}

async function similarTracks(artist: string, track: string, limit: number) {
  const data = await lastFm<{ similartracks?: { track?: LastFmTrack[] } }>({ method: "track.getsimilar", artist, track, limit: String(limit) });
  return (data.similartracks?.track || []).map(asCandidate);
}

async function artistDiscovery(artist: string, artistLimit: number) {
  const data = await lastFm<{ similarartists?: { artist?: { name: string }[] } }>({ method: "artist.getsimilar", artist, limit: String(artistLimit) });
  const names = (data.similarartists?.artist || []).slice(0, artistLimit).map((item) => item.name);
  const tracks = await Promise.all(names.map(async (name) => {
    const top = await lastFm<{ toptracks?: { track?: LastFmTrack[] } }>({ method: "artist.gettoptracks", artist: name, limit: "2" });
    return (top.toptracks?.track || []).map(asCandidate);
  }));
  return tracks.flat();
}

function artistFromSeed(seed: DiscoverySeed) {
  return collectSeedArtistNames([seed])[0] || "";
}

async function discoverFromSeed(seed: DiscoverySeed, trackLimit: number, artistLimit: number) {
  const artist = artistFromSeed(seed);
  if (seed.type !== "track") return artistDiscovery(artist, artistLimit);
  const track = normalizeDiscoveryTrack(seed.name, artist);
  const attempts = await Promise.allSettled([similarTracks(artist, track, trackLimit), artistDiscovery(artist, artistLimit)]);
  const discoveries = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? attempt.value : []);
  if (!discoveries.length) {
    const failed = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    if (failed) throw failed.reason;
  }
  return discoveries;
}

async function musicCandidates(seeds: DiscoverySeed[], targetSize: number) {
  const trackLimit = Math.max(20, Math.ceil(targetSize * 3 / seeds.length));
  const artistLimit = Math.max(6, Math.ceil(targetSize * 2 / 3 / seeds.length) + 4);
  const groups = await Promise.all(seeds.map((seed) => discoverFromSeed(seed, trackLimit, artistLimit)));
  return rankWeightedCandidates(groups.map((candidates, index) => ({ tag: { tag: `seed-${index}`, weight: 1 }, candidates })));
}

async function moodCandidates(tags: WeightedTag[], targetSize: number) {
  const pools = await Promise.all(tags.slice(0, 8).map(async (tag) => {
    const data = await lastFm<{ tracks?: { track?: LastFmTrack[] } }>({ method: "tag.gettoptracks", tag: tag.tag, limit: String(Math.min(50, Math.max(30, targetSize * 2))) });
    return { tag, candidates: (data.tracks?.track || []).map(asCandidate) };
  }));
  return rankWeightedCandidates(pools);
}

function candidateItem(candidate: Candidate, index: number): SpotifyItem {
  return { id: `candidate-${index}`, uri: `discovery:track:${index}`, name: candidate.name, type: "track", artists: [{ name: candidate.artist }], album: { name: "Discovery", images: candidate.image ? [{ url: candidate.image }] : undefined } };
}

function transientProviderError(error: unknown) {
  return (error instanceof SpotifyApiError || error instanceof YouTubeApiError) && error.status >= 500 && error.status <= 599;
}

export async function withTransientRetry<T>(task: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!transientProviderError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function resolveTrack(provider: Provider, item: SpotifyItem) {
  const artist = item.artists?.[0]?.name || "";
  if (provider === "spotify") {
    const params = new URLSearchParams({ q: `track:${item.name} artist:${artist}`, type: "track", limit: "1" });
    const result = await withTransientRetry(() => spotify<{ tracks: { items: SpotifyItem[] } }>(`/search?${params}`));
    return result.tracks.items[0] || item;
  }
  const params = new URLSearchParams({ part: "snippet", type: "video", videoCategoryId: "10", maxResults: "1", q: `${artist} ${item.name} official audio` });
  const result = await withTransientRetry(() => youtube<{ items?: YouTubeVideoMatch[] }>(`/search?${params}`));
  return asYouTubeTrack(result.items?.[0], item);
}

function validSeeds(seeds: unknown) {
  if (!Array.isArray(seeds)) return [];
  const unique = new Map<string, DiscoverySeed>();
  for (const seed of seeds.slice(0, 5)) {
    if (!seed || typeof seed !== "object") continue;
    const candidate = seed as DiscoverySeed;
    if (!candidate.uri || !candidate.name || !["artist", "album", "track"].includes(candidate.type)) continue;
    const artists = collectSeedArtistNames([candidate]);
    if (!artists.length || artists.every((artist) => artistIdentity(artist) === "unknownartist")) continue;
    if (!unique.has(candidate.uri)) unique.set(candidate.uri, candidate);
  }
  return [...unique.values()];
}

function trimToValidDiversity(items: SpotifyItem[], limit: number) {
  const selected = items.slice(0, limit);
  while (selected.length && uniquePrimaryArtistCount(selected) < Math.ceil(selected.length * 2 / 3)) selected.pop();
  return selected;
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  try {
    const body = await request.json() as GenerationRequest;
    const provider = body.provider || "spotify";
    if (!isMusicProvider(provider)) throw new Error("Choose a supported music provider.");
    const purpose = body.purpose || "playlist";
    const size = purpose === "replacement"
      ? Math.max(1, Math.min(5, Number(body.size) || 5))
      : parsePlaylistSize(body.size ?? 20);
    const reserveSize = purpose === "playlist" ? 5 : 0;
    const targetSize = size + reserveSize;
    const seeds = validSeeds(body.seeds);
    const tags = body.mode === "mood" ? inferMoodTags(body.mood || "") : [];
    if (body.mode === "music" && !seeds.length) throw new Error("Add at least one music seed with artist information.");
    if (body.mode === "mood" && !tags.length) throw new Error("We couldn’t understand that mood. Try something like “quiet focus,” “rainy jazz,” or “energetic workout.”");
    if (body.mode !== "music" && body.mode !== "mood") throw new Error("Choose a discovery mode.");
    const seedArtists = body.mode === "music" ? collectSeedArtistNames(seeds) : [];
    log(requestId, "request.accepted", { provider, mode: body.mode, purpose, seedCount: seeds.length, inferredTags: tags.map((tag) => tag.tag), requestedSize: size });

    const [candidates, libraryResult] = await Promise.all([
      runStage(requestId, "lastfm-discovery", () => body.mode === "mood" ? moodCandidates(tags, targetSize) : musicCandidates(seeds, targetSize)),
      Promise.resolve(getLibraryArtistNames(provider)).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason }),
      ),
    ]);
    const warnings: string[] = [];
    const likedArtists = libraryResult.status === "fulfilled" ? libraryResult.value.artists : [];
    if (libraryResult.status === "rejected") {
      warnings.push("We couldn’t check your liked music, so some familiar artists may appear.");
      log(requestId, "library.unavailable", { provider, errorType: libraryResult.reason instanceof Error ? libraryResult.reason.name : typeof libraryResult.reason });
    } else {
      log(requestId, "library.complete", { trackCount: libraryResult.value.trackCount, artistCount: likedArtists.length, pageCount: libraryResult.value.pageCount });
    }
    const excludedArtists = uniqueArtistNames([...seedArtists, ...likedArtists]);
    const eligible = uniqueCandidates(excludeCandidatesByArtist(candidates, excludedArtists), Math.min(targetSize * 6, 240));
    if (!eligible.length) throw new GenerationStageError("selection", new Error("We couldn’t find any eligible artists. Try broader input."));
    const ordered = selectDiverseTracks(eligible.map(candidateItem), eligible.length, excludedArtists);
    log(requestId, "selection.complete", { candidateCount: candidates.length, eligibleCount: eligible.length, artistCount: uniquePrimaryArtistCount(ordered) });

    const resolved = await runStage(requestId, `${provider}-catalog`, async () => {
      let attempted = 0;
      let uniqueResolved: SpotifyItem[] = [];
      let playlist: SpotifyItem[] = [];
      const excludedUris = [...(body.excludeUris || []), ...seeds.map((seed) => seed.uri)];
      const attemptLimit = Math.min(ordered.length, targetSize + 20);
      while (attempted < attemptLimit) {
        const batch = ordered.slice(attempted, Math.min(attempted + (attempted ? 5 : targetSize), attemptLimit));
        const matches = await mapInBatches(batch, 5, (item) => resolveTrack(provider, item));
        attempted += batch.length;
        uniqueResolved = uniqueResolvedTracks([...uniqueResolved, ...matches], excludedUris);
        playlist = selectDiverseTracks(uniqueResolved, targetSize, excludedArtists);
        log(requestId, "catalog.batch", { attemptedCount: attempted, uniqueMatchCount: uniqueResolved.length, selectedCount: playlist.length });
        if (playlist.length >= targetSize) break;
      }
      return playlist;
    });
    const main = trimToValidDiversity(resolved, size);
    if (!main.length) throw new GenerationStageError("selection", new Error("We couldn’t resolve a valid track on your provider. Try broader input."));
    if (purpose === "playlist" && main.length < size) warnings.push(`We found ${main.length} valid tracks instead of ${size} without weakening your discovery rules.`);
    const reserveItems = purpose === "playlist" ? resolved.slice(main.length, main.length + reserveSize) : [];
    const tracks = toPlaylistTracks(main, main.length);
    const reserve = toPlaylistTracks(reserveItems, reserveItems.length);
    const artistCount = uniquePrimaryArtistCount(main);
    log(requestId, "request.complete", { durationMs: Date.now() - startedAt, trackCount: tracks.length, reserveCount: reserve.length, artistCount });
    return NextResponse.json({ tracks, reserve, warnings, artistCount, inferredTags: tags.map((tag) => tag.tag), requestId });
  } catch (error) {
    const problem = publicError(error);
    console.error(`[playlist.generate:${requestId}] request.failed`, { durationMs: Date.now() - startedAt, ...loggedError(error) });
    return NextResponse.json({ error: problem.message, stage: problem.stage, requestId }, { status: problem.status });
  }
}
