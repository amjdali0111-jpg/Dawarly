import { colorSimilarity, itemNameSimilarity, textSimilarity, tokenize } from "./text";
import { cosineSimilarity, haversineMeters } from "./geo";

export interface MatchableReport {
  id: string;
  type: "lost" | "found";
  item_name: string;
  description: string;
  distinguishing_features: string;
  category_id: string;
  color: string;
  location_text: string;
  approx_lat: number | null;
  approx_lng: number | null;
  event_date: string;
  embedding?: number[] | null;
  imageEmbeddings?: number[][];
}

export interface MatchResult {
  score: number;
  method: "ai" | "heuristic";
  reasons: string[];
  components: {
    text: number;
    image: number | null;
    category: number;
    color: number;
    date: number;
    location: number;
    distance_m: number | null;
    day_gap: number;
  };
}

export const MATCH_THRESHOLD = 0.45;

/**
 * Embedding cosine similarities of unrelated texts are rarely near zero, so
 * map the useful band [0.25, 0.85] onto [0, 1].
 */
export const rescaleCosine = (c: number) => Math.max(0, Math.min(1, (c - 0.25) / 0.6));

const days = (d: string) => Math.floor(new Date(d + "T00:00:00Z").getTime() / 86400000);

export function dateScore(lostDate: string, foundDate: string) {
  const gap = days(foundDate) - days(lostDate); // found should be on/after lost
  const abs = Math.abs(gap);
  let s = abs <= 1 ? 1 : Math.max(0, 1 - (abs - 1) / 29);
  if (gap < -2) s *= 0.3; // found before it was lost: unlikely
  return { score: s, gap: abs };
}

export function locationScore(a: MatchableReport, b: MatchableReport) {
  if (a.approx_lat != null && a.approx_lng != null && b.approx_lat != null && b.approx_lng != null) {
    const d = haversineMeters(a.approx_lat, a.approx_lng, b.approx_lat, b.approx_lng);
    const s = d <= 200 ? 1 : d <= 500 ? 0.75 : d <= 1500 ? 0.45 : d <= 5000 ? 0.15 : 0;
    return { score: s, distance: Math.round(d) };
  }
  const ta = new Set(tokenize(a.location_text));
  const tb = tokenize(b.location_text);
  const overlap = tb.filter((t) => ta.has(t)).length;
  return { score: overlap ? Math.min(1, 0.4 + overlap * 0.3) : 0.2, distance: null };
}

const fullText = (r: MatchableReport) => `${r.item_name} ${r.description} ${r.distinguishing_features} ${r.color}`;

/**
 * Scores a lost/found pair. When embeddings exist on both sides they drive the
 * text (and photo) similarity; otherwise a bilingual lexical similarity is used
 * and the method is reported as "heuristic". The score is a similarity, not a
 * probability that the item will be recovered.
 */
export function scorePair(a: MatchableReport, b: MatchableReport): MatchResult {
  const lost = a.type === "lost" ? a : b;
  const found = a.type === "lost" ? b : a;

  const useAi = Boolean(a.embedding?.length && b.embedding?.length && a.embedding!.length === b.embedding!.length);
  const lexical = 0.6 * textSimilarity(fullText(a), fullText(b)) + 0.4 * itemNameSimilarity(a.item_name, b.item_name);
  const text = useAi ? 0.75 * rescaleCosine(cosineSimilarity(a.embedding!, b.embedding!)) + 0.25 * lexical : lexical;

  let image: number | null = null;
  if (a.imageEmbeddings?.length && b.imageEmbeddings?.length) {
    let best = 0;
    for (const x of a.imageEmbeddings) for (const y of b.imageEmbeddings) if (x.length === y.length) best = Math.max(best, cosineSimilarity(x, y));
    image = rescaleCosine(best);
  }

  const category = a.category_id === b.category_id ? 1 : 0;
  const color = colorSimilarity(a.color, b.color);
  const date = dateScore(lost.event_date, found.event_date);
  const loc = locationScore(a, b);
  const attributes = 0.3 * category + 0.25 * color + 0.25 * date.score + 0.2 * loc.score;

  let score = image != null ? 0.4 * text + 0.2 * image + 0.4 * attributes : 0.5 * text + 0.5 * attributes;
  // Different category and weak text: almost certainly not the same item.
  if (!category && text < 0.35) score *= 0.5;
  score = Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;

  const reasons: string[] = [];
  if (text >= 0.55) reasons.push("similar_description");
  if (image != null && image >= 0.6) reasons.push("similar_photos");
  if (category) reasons.push("same_category");
  if (color >= 0.5) reasons.push("color_match");
  if (loc.distance != null && loc.distance <= 500) reasons.push("close_location");
  else if (loc.distance == null && loc.score >= 0.7) reasons.push("same_area");
  if (date.gap === 0) reasons.push("same_day");
  else if (date.gap <= 3) reasons.push("close_dates");

  return {
    score,
    method: useAi ? "ai" : "heuristic",
    reasons,
    components: {
      text: round(text), image: image == null ? null : round(image), category, color,
      date: round(date.score), location: round(loc.score), distance_m: loc.distance, day_gap: date.gap,
    },
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Text sent to the embedding model. Never includes private verification notes. */
export function embeddingText(r: Pick<MatchableReport, "item_name" | "description" | "distinguishing_features" | "color" | "location_text">, categoryName?: string) {
  return [r.item_name, categoryName, `color: ${r.color}`, r.description, r.distinguishing_features, `place: ${r.location_text}`]
    .filter(Boolean)
    .join("\n");
}
