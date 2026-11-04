import { describe, expect, it } from "vitest";
import { colorSimilarity, conceptTokens, expandSearchToken, normalizeArabic, textSimilarity, toIlikePattern, tokenize } from "@/lib/matching/text";
import { MATCH_THRESHOLD, dateScore, embeddingText, rescaleCosine, scorePair, type MatchableReport } from "@/lib/matching/score";
import { cosineSimilarity, haversineMeters } from "@/lib/matching/geo";

const base = (o: Partial<MatchableReport>): MatchableReport => ({
  id: "x", type: "lost", item_name: "Black backpack", description: "A black backpack with a water bottle pocket",
  distinguishing_features: "Small tear near the zipper", category_id: "bags", color: "black",
  location_text: "Central library", approx_lat: 24.714, approx_lng: 46.675, event_date: "2026-10-20", ...o,
});

describe("Arabic/English normalisation", () => {
  it("unifies Arabic letter variants and diacritics", () => {
    expect(normalizeArabic("حقيبةٌ إلى أحمد")).toBe("حقيبه الي احمد");
    expect(normalizeArabic("٣٤")).toBe("34");
  });
  it("drops stopwords and the definite article", () => {
    expect(tokenize("الحقيبة في المكتبة")).toEqual(["حقيبه", "مكتبه"]);
  });
  it("maps Arabic and English item and colour words to shared concepts", () => {
    expect([...conceptTokens("حقيبة سوداء")]).toEqual(["c:bag", "col:black"]);
    expect([...conceptTokens("black backpack")]).toEqual(["col:black", "c:bag"]);
    expect(textSimilarity("حقيبة سوداء", "black backpack")).toBe(1);
  });
  it("scores colours, including related shades", () => {
    expect(colorSimilarity("أسود", "Black")).toBe(1);
    expect(colorSimilarity("navy", "أزرق")).toBe(0.5);
    expect(colorSimilarity("red", "green")).toBe(0);
  });
});

describe("pair scoring", () => {
  it("ranks a genuine cross-language match above threshold with explanations", () => {
    const lost = base({ id: "l" });
    const found = base({ id: "f", type: "found", item_name: "حقيبة ظهر سوداء", description: "وجدت حقيبة سوداء بجانب المكتبة", distinguishing_features: "تمزق صغير", color: "أسود", event_date: "2026-10-21", approx_lat: 24.7141, approx_lng: 46.6751 });
    const r = scorePair(lost, found);
    expect(r.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(r.method).toBe("heuristic");
    expect(r.reasons).toEqual(expect.arrayContaining(["same_category", "color_match", "close_location", "close_dates"]));
  });
  it("is symmetric", () => {
    const a = base({ id: "a" });
    const b = base({ id: "b", type: "found", color: "dark blue", event_date: "2026-10-25" });
    expect(scorePair(a, b).score).toBe(scorePair(b, a).score);
  });
  it("keeps unrelated items below threshold", () => {
    const lost = base({});
    const found = base({ type: "found", item_name: "Silver ring", description: "A small silver ring found in the gym", distinguishing_features: "engraved", category_id: "jewelry", color: "silver", location_text: "Sports hall", approx_lat: 24.73, approx_lng: 46.70, event_date: "2026-09-01" });
    expect(scorePair(lost, found).score).toBeLessThan(MATCH_THRESHOLD);
  });
  it("penalises a found date long before the loss", () => {
    expect(dateScore("2026-10-20", "2026-10-10").score).toBeLessThan(dateScore("2026-10-20", "2026-10-21").score);
  });
  it("uses embeddings when both sides have them and reports method 'ai'", () => {
    const v = [0.1, 0.9, 0.3];
    const r = scorePair(base({ embedding: v }), base({ type: "found", embedding: v, imageEmbeddings: [v] }));
    expect(r.method).toBe("ai");
    expect(r.components.image).toBeNull(); // only one side has photos analysed
  });
  it("never embeds private verification notes", () => {
    const text = embeddingText(base({}), "Bags");
    expect(text).not.toMatch(/verification/i);
    expect(text).toContain("Black backpack");
  });
  it("produces scores in [0,1] that are similarities, not probabilities", () => {
    const r = scorePair(base({}), base({ type: "found" }));
    expect(r.score).toBeGreaterThan(0.8);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("geo + vector helpers", () => {
  it("computes distances", () => {
    expect(Math.round(haversineMeters(24.714, 46.675, 24.715, 46.675))).toBe(111);
  });
  it("computes cosine similarity and rescales it", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(rescaleCosine(0.2)).toBe(0);
    expect(rescaleCosine(0.9)).toBe(1);
  });
});

describe("search helpers", () => {
  it("expands search words across languages", () => {
    expect(expandSearchToken("bag")).toEqual(expect.arrayContaining(["حقيبة", "backpack"]));
    expect(expandSearchToken("أسود")).toEqual(expect.arrayContaining(["black"]));
  });
  it("builds variant-tolerant ILIKE patterns and strips filter syntax", () => {
    expect(toIlikePattern("حقيبة")).toBe("حق_ب_"); // ي and ة are variant-tolerant
    expect(toIlikePattern("a,b(c)%_*")).toBe("abc");
  });
});
