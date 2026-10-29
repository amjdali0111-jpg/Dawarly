// Bilingual (Arabic/English) text normalisation used by search and by the
// non-AI matcher. Arabic letter variants and diacritics are unified, common
// item and colour words are mapped to language-independent concepts so that
// "حقيبة سوداء" and "black bag" can match without an AI provider.

const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalizeArabic(s: string) {
  return s
    .replace(AR_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "with", "for", "to", "near", "my", "it", "is", "was", "has", "have", "from", "by", "this", "that",
  "في", "من", "علي", "على", "الي", "إلى", "عند", "مع", "عن", "و", "او", "هذا", "هذه", "التي", "الذي", "به", "بها", "لون", "يوجد", "فيه", "فيها", "كان", "كانت",
]);

/** Concept lexicon: every token maps to a shared concept id when known. */
const LEXICON: Record<string, string[]> = {
  bag: ["bag", "backpack", "rucksack", "handbag", "purse", "tote", "حقيبه", "شنطه", "شنطة", "حقيبة", "جنطه"],
  phone: ["phone", "mobile", "smartphone", "iphone", "samsung", "galaxy", "android", "جوال", "هاتف", "موبايل", "تلفون", "ايفون", "سامسونج"],
  wallet: ["wallet", "محفظه", "بوك"],
  key: ["key", "keys", "keychain", "مفتاح", "مفاتيح", "ميداليه"],
  laptop: ["laptop", "macbook", "notebook", "computer", "لابتوب", "حاسوب", "حاسب", "كمبيوتر", "ماك"],
  tablet: ["tablet", "ipad", "تابلت", "ايباد"],
  watch: ["watch", "smartwatch", "ساعه"],
  glasses: ["glasses", "sunglasses", "spectacles", "نظاره", "نظارات"],
  card: ["card", "id", "badge", "بطاقه", "هويه", "كرت", "بطاقات"],
  book: ["book", "notebook", "textbook", "كتاب", "دفتر", "كراسه"],
  umbrella: ["umbrella", "مظله", "شمسيه"],
  headphones: ["headphones", "earbuds", "airpods", "earphones", "headset", "سماعه", "سماعات", "ايربودز"],
  charger: ["charger", "cable", "adapter", "شاحن", "كيبل", "سلك"],
  bottle: ["bottle", "flask", "thermos", "قاروره", "مطاره", "زجاجه", "ترمس"],
  jacket: ["jacket", "coat", "hoodie", "sweater", "جاكيت", "معطف", "جاكت", "هودي", "كنزه"],
  ring: ["ring", "خاتم"],
  necklace: ["necklace", "chain", "pendant", "عقد", "قلاده", "سلسله"],
  calculator: ["calculator", "حاسبه", "اله"],
  pen: ["pen", "pencil", "قلم", "اقلام"],
  shoes: ["shoes", "sneakers", "shoe", "حذاء", "جزمه"],
  cap: ["cap", "hat", "قبعه", "كاب"],
  scarf: ["scarf", "shawl", "وشاح", "شال", "شماغ", "غتره"],
  usb: ["usb", "flash", "flashdrive", "فلاش", "ذاكره"],
};

const COLORS: Record<string, string[]> = {
  black: ["black", "اسود", "سوداء", "سودا"],
  white: ["white", "ابيض", "بيضاء", "بيضا"],
  red: ["red", "احمر", "حمراء", "حمرا"],
  blue: ["blue", "ازرق", "زرقاء", "زرقا"],
  navy: ["navy", "كحلي", "كحليه"],
  green: ["green", "اخضر", "خضراء", "خضرا"],
  yellow: ["yellow", "اصفر", "صفراء", "صفرا"],
  brown: ["brown", "بني", "بنيه"],
  gray: ["gray", "grey", "رمادي", "رماديه", "رصاصي"],
  pink: ["pink", "وردي", "ورديه", "زهري", "زهريه"],
  purple: ["purple", "violet", "بنفسجي", "بنفسجيه", "موف"],
  orange: ["orange", "برتقالي", "برتقاليه"],
  gold: ["gold", "golden", "ذهبي", "ذهبيه"],
  silver: ["silver", "فضي", "فضيه"],
  beige: ["beige", "بيج", "بيجي"],
};

const RELATED_COLORS: Array<[string, string]> = [["blue", "navy"], ["gray", "silver"], ["yellow", "gold"], ["brown", "beige"], ["white", "beige"]];

function invert(map: Record<string, string[]>) {
  const out = new Map<string, string>();
  for (const [concept, words] of Object.entries(map)) for (const w of words) out.set(normalizeArabic(w.toLowerCase()), concept);
  return out;
}
const WORD_TO_CONCEPT = invert(LEXICON);
const WORD_TO_COLOR = invert(COLORS);

/** Strips the Arabic definite article and common attached prefixes. */
function stripArabicPrefix(tok: string) {
  if (/^[؀-ۿ]/.test(tok)) {
    for (const p of ["وال", "بال", "كال", "فال", "لل", "ال"]) {
      if (tok.startsWith(p) && tok.length - p.length >= 2) return tok.slice(p.length);
    }
  }
  return tok;
}

export function tokenize(s: string): string[] {
  return normalizeArabic(s.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .map(stripArabicPrefix)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Tokens mapped to concepts/colours where known (language independent). */
export function conceptTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokenize(s)) {
    const singular = t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t;
    const concept = WORD_TO_CONCEPT.get(t) ?? WORD_TO_CONCEPT.get(singular);
    const color = WORD_TO_COLOR.get(t);
    out.add(concept ? `c:${concept}` : color ? `col:${color}` : singular);
  }
  return out;
}

export function colorConcepts(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokenize(s)) {
    const c = WORD_TO_COLOR.get(t);
    if (c) out.add(c);
  }
  return out;
}

/** 1 = same colour, 0.5 = related colour, 0 = different/unknown. */
export function colorSimilarity(a: string, b: string): number {
  const ca = colorConcepts(a), cb = colorConcepts(b);
  if (!ca.size || !cb.size) {
    const na = normalizeArabic(a.trim().toLowerCase()), nb = normalizeArabic(b.trim().toLowerCase());
    return na && na === nb ? 1 : 0;
  }
  for (const c of ca) if (cb.has(c)) return 1;
  for (const [x, y] of RELATED_COLORS) if ((ca.has(x) && cb.has(y)) || (ca.has(y) && cb.has(x))) return 0.5;
  return 0;
}

/** Dice coefficient over concept tokens. */
export function textSimilarity(a: string, b: string): number {
  const ta = conceptTokens(a), tb = conceptTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/** Concept overlap on the item names only (strong signal). */
export function itemNameSimilarity(a: string, b: string): number {
  const ta = [...conceptTokens(a)].filter((t) => t.startsWith("c:"));
  const tb = new Set([...conceptTokens(b)].filter((t) => t.startsWith("c:")));
  if (!ta.length || !tb.size) return textSimilarity(a, b);
  return ta.some((t) => tb.has(t)) ? 1 : 0;
}

/** All lexicon words sharing a concept with the token (cross-language search). */
export function expandSearchToken(token: string): string[] {
  const norm = normalizeArabic(stripArabicPrefix(token.toLowerCase()));
  const concept = WORD_TO_CONCEPT.get(norm) ?? WORD_TO_CONCEPT.get(norm.replace(/s$/, ""));
  const color = WORD_TO_COLOR.get(norm);
  const words = concept ? LEXICON[concept] : color ? COLORS[color] : [];
  return [...new Set([token, ...words])].slice(0, 12);
}

/**
 * Turns a search word into a SQL ILIKE pattern tolerant to Arabic letter
 * variants (أ/إ/آ/ا, ة/ه, ى/ي) by using single-character wildcards.
 * Characters with meaning in PostgREST filters are removed.
 */
export function toIlikePattern(word: string): string {
  const cleaned = word.replace(/[%_*,()\\"'.:]/g, "").trim();
  return cleaned.replace(/[أإآا]/g, "_").replace(/[ةه]/g, "_").replace(/[ىي]/g, "_");
}

export function searchWords(q: string): string[] {
  return q.split(/\s+/).map((w) => w.trim()).filter((w) => w.replace(/[%_*,()\\"'.:]/g, "").length >= 2).slice(0, 5);
}
