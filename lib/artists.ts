const PROVIDER_SUFFIXES = /(?:vevo|official(?:music)?|music|topic)+$/i;

export function displayArtistName(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .trim()
    .replace(/\s+-\s+Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
}

export function artistIdentity(value: string) {
  return displayArtistName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(PROVIDER_SUFFIXES, "");
}

export function artistNamesMatch(left: string, right: string) {
  const a = artistIdentity(left);
  const b = artistIdentity(right);
  return Boolean(a && b && a === b);
}

export function isExcludedArtist(candidate: string, excludedArtists: Iterable<string>) {
  const credits = creditedArtists(candidate);
  return credits.some((credit) => [...excludedArtists].some((artist) => artistNamesMatch(credit, artist)));
}

export function uniqueArtistNames(artists: Iterable<string>) {
  const unique = new Map<string, string>();
  for (const artist of artists) {
    const display = displayArtistName(artist);
    const identity = artistIdentity(display);
    if (identity && !unique.has(identity)) unique.set(identity, display);
  }
  return [...unique.values()];
}

export function creditedArtists(name: string) {
  return uniqueArtistNames(name.split(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+/i));
}
