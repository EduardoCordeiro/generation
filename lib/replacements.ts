import { artistIdentity } from "./artists";
import type { DiscoveryTrack } from "./discovery";

export function isValidReplacement(candidate: DiscoveryTrack, removed: DiscoveryTrack, tracks: DiscoveryTrack[], index: number) {
  if (artistIdentity(candidate.primaryArtist) === artistIdentity(removed.primaryArtist)) return false;
  if (tracks.some((track, trackIndex) => trackIndex !== index && track.uri === candidate.uri)) return false;
  const next = tracks.map((track, trackIndex) => trackIndex === index ? candidate : track);
  const artistCount = new Set(next.map((track) => artistIdentity(track.primaryArtist))).size;
  return artistCount >= Math.ceil(next.length * 2 / 3);
}
