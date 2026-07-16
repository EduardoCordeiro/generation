import type { Candidate } from "./playlist";

export type WeightedTag = { tag: string; weight: number };

type MoodConcept = { tag: string; phrases: string[]; adjacent?: string[] };

const CONCEPTS: MoodConcept[] = [
  { tag: "happy", phrases: ["happy", "joyful", "cheerful", "feel good", "uplifting"], adjacent: ["pop"] },
  { tag: "sad", phrases: ["sad", "heartbroken", "heartbreak", "crying"], adjacent: ["melancholy"] },
  { tag: "melancholy", phrases: ["melancholic", "melancholy", "wistful", "bittersweet"], adjacent: ["sad"] },
  { tag: "calm", phrases: ["calm", "peaceful", "quiet", "serene"], adjacent: ["ambient", "chill"] },
  { tag: "chill", phrases: ["chill", "relaxed", "laid back", "laid-back"], adjacent: ["downtempo"] },
  { tag: "dreamy", phrases: ["dreamy", "ethereal", "floating", "otherworldly"], adjacent: ["dream pop"] },
  { tag: "romantic", phrases: ["romantic", "romance", "date night", "in love"], adjacent: ["soul"] },
  { tag: "dark", phrases: ["dark", "brooding", "sinister", "ominous"], adjacent: ["gothic"] },
  { tag: "angry", phrases: ["angry", "rage", "furious", "aggressive"], adjacent: ["hardcore"] },
  { tag: "euphoric", phrases: ["euphoric", "ecstatic", "triumphant", "anthemic"], adjacent: ["dance"] },
  { tag: "nostalgic", phrases: ["nostalgic", "nostalgia", "reminiscent", "throwback"] },
  { tag: "confident", phrases: ["confident", "powerful", "bold", "boss energy"], adjacent: ["hip-hop"] },
  { tag: "moody", phrases: ["moody", "introspective", "pensive"], adjacent: ["alternative"] },
  { tag: "energetic", phrases: ["energetic", "high energy", "hype", "adrenaline"], adjacent: ["dance", "rock"] },
  { tag: "focus", phrases: ["focus", "focused", "study", "studying", "work", "working"], adjacent: ["instrumental", "ambient"] },
  { tag: "workout", phrases: ["workout", "gym", "running", "exercise", "training"], adjacent: ["energetic", "electronic"] },
  { tag: "party", phrases: ["party", "night out", "celebration", "dancefloor"], adjacent: ["dance", "electronic"] },
  { tag: "sleep", phrases: ["sleep", "sleeping", "bedtime", "drifting off"], adjacent: ["ambient", "calm"] },
  { tag: "driving", phrases: ["driving", "road trip", "open road", "night drive"], adjacent: ["indie"] },
  { tag: "rainy day", phrases: ["rainy", "rain", "stormy"], adjacent: ["melancholy", "acoustic"] },
  { tag: "morning", phrases: ["morning", "sunrise", "waking up"], adjacent: ["acoustic", "happy"] },
  { tag: "night", phrases: ["night", "midnight", "late night", "after dark"], adjacent: ["downtempo"] },
  { tag: "acoustic", phrases: ["acoustic", "unplugged"] },
  { tag: "instrumental", phrases: ["instrumental", "no vocals", "wordless"] },
  { tag: "ambient", phrases: ["ambient", "atmospheric"] },
  { tag: "pop", phrases: ["pop"] },
  { tag: "rock", phrases: ["rock"] },
  { tag: "indie", phrases: ["indie"] },
  { tag: "alternative", phrases: ["alternative", "alt music"] },
  { tag: "electronic", phrases: ["electronic", "electronica", "edm"] },
  { tag: "dance", phrases: ["dance", "club"] },
  { tag: "hip-hop", phrases: ["hip hop", "hip-hop", "rap"] },
  { tag: "rnb", phrases: ["r&b", "rnb", "rhythm and blues"] },
  { tag: "soul", phrases: ["soul", "soulful"] },
  { tag: "jazz", phrases: ["jazz", "jazzy"] },
  { tag: "classical", phrases: ["classical", "orchestral", "symphonic"] },
  { tag: "metal", phrases: ["metal", "heavy metal"] },
  { tag: "punk", phrases: ["punk"] },
  { tag: "folk", phrases: ["folk", "singer songwriter", "singer-songwriter"] },
  { tag: "country", phrases: ["country", "americana"] },
  { tag: "reggae", phrases: ["reggae", "dub"] },
  { tag: "latin", phrases: ["latin", "reggaeton"] },
  { tag: "funk", phrases: ["funk", "funky"] },
  { tag: "disco", phrases: ["disco"] },
  { tag: "house", phrases: ["house music", "house"] },
  { tag: "techno", phrases: ["techno"] },
  { tag: "trip-hop", phrases: ["trip hop", "trip-hop"] },
  { tag: "shoegaze", phrases: ["shoegaze"] },
  { tag: "dream pop", phrases: ["dream pop", "dream-pop"] },
  { tag: "lo-fi", phrases: ["lofi", "lo-fi", "lo fi"] },
];

function includesPhrase(text: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

export function inferMoodTags(description: string): WeightedTag[] {
  const text = description.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const weights = new Map<string, number>();
  for (const concept of CONCEPTS) {
    if (!concept.phrases.some((phrase) => includesPhrase(text, phrase))) continue;
    weights.set(concept.tag, Math.max(weights.get(concept.tag) || 0, 1));
    for (const adjacent of concept.adjacent || []) {
      weights.set(adjacent, Math.max(weights.get(adjacent) || 0, 0.45));
    }
  }
  const decade = text.match(/(?:19|20)?(50|60|70|80|90|00|10|20)s\b/);
  if (decade) weights.set(`${decade[1]}s`, 0.9);
  return [...weights].map(([tag, weight]) => ({ tag, weight })).sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag));
}

function candidateKey(candidate: Candidate) {
  return `${candidate.artist.trim().toLocaleLowerCase()}\u0000${candidate.name.trim().toLocaleLowerCase()}`;
}

export function rankWeightedCandidates(pools: Array<{ tag: WeightedTag; candidates: Candidate[] }>) {
  const ranked = new Map<string, { candidate: Candidate; score: number; matches: number; order: number }>();
  let order = 0;
  for (const pool of pools) {
    pool.candidates.forEach((candidate, index) => {
      const key = candidateKey(candidate);
      const previous = ranked.get(key);
      const rankScore = pool.tag.weight * (1 + 1 / (index + 1));
      if (previous) {
        previous.score += rankScore;
        previous.matches += 1;
      } else {
        ranked.set(key, { candidate, score: rankScore, matches: 1, order: order++ });
      }
    });
  }
  return [...ranked.values()]
    .sort((a, b) => b.matches - a.matches || b.score - a.score || a.order - b.order)
    .map(({ candidate }) => candidate);
}
