// filter.js — Advanced profanity & slur filter
// Handles: leetspeak, Unicode homoglyphs, character repetition,
// spaced-out evasion (F A G, FAAA GG), embedded slurs, creative spelling

// ═══════════════════════════════════════════════════
//  1. UNICODE HOMOGLYPH MAP (Cyrillic/Greek/etc → Latin)
// ═══════════════════════════════════════════════════
const HOMOGLYPHS = {
  'а':'a','с':'c','е':'e','о':'o','р':'p','х':'x','у':'y',
  'А':'a','С':'c','Е':'e','О':'o','Р':'p','Х':'x','У':'y',
  'і':'i','ј':'j','ѕ':'s','ω':'w','ν':'v','α':'a','β':'b',
  'ε':'e','η':'n','ι':'i','κ':'k','μ':'m','ο':'o','ρ':'p',
  'τ':'t','υ':'u','ℓ':'l','ⅰ':'i','ⅱ':'i','０':'0','１':'1',
  '２':'2','３':'3','４':'4','５':'5','ａ':'a','ｂ':'b','ｃ':'c',
  'ｄ':'d','ｅ':'e','ｆ':'f','ｇ':'g','ｈ':'h','ｉ':'i','ｊ':'j',
  'ｋ':'k','ｌ':'l','ｍ':'m','ｎ':'n','ｏ':'o','ｐ':'p','ｑ':'q',
  'ｒ':'r','ｓ':'s','ｔ':'t','ｕ':'u','ｖ':'v','ｗ':'w','ｘ':'x',
  'ｙ':'y','ｚ':'z',
};

// ═══════════════════════════════════════════════════
//  2. LEETSPEAK MAP
// ═══════════════════════════════════════════════════
const LEET = {
  '@':'a','4':'a','^':'a',
  '8':'b',
  '(':'c','<':'c','{':'c',
  '3':'e',
  '6':'g','9':'g',
  '#':'h',
  '!':'i','1':'i','|':'i',
  '0':'o',
  '5':'s','$':'s',
  '7':'t','+':'t',
  '2':'z',
};

// ═══════════════════════════════════════════════════
//  3. NORMALIZE
// ═══════════════════════════════════════════════════
function normalize(text) {
  let out = '';
  for (const ch of text) { out += HOMOGLYPHS[ch] || ch; }
  out = out.toLowerCase();
  let deLeeted = '';
  for (const ch of out) { deLeeted += LEET[ch] || ch; }
  return deLeeted;
}

function stripNonAlpha(s) { return s.replace(/[^a-z]/g, ''); }

function collapseRepeats(s) { return s.replace(/(.)\1{1,}/g, '$1'); }

// ═══════════════════════════════════════════════════
//  4. WORD LISTS
// ═══════════════════════════════════════════════════

// Tier 1: SEVERE — slurs, hate speech, self-harm directives
// Checked with embedded/substring detection after full normalization
const SEVERE_SLURS = [
  "nigger","nigga","nigg","n1gg","niqq",
  "faggot","fagg","fagot","phag",
  "kike","chink","spic","wetback","gook","raghead","towelhead",
  "tranny","shemale",
  "kys","killyo",
];

// Tier 2: STANDARD — profanity, insults (whole-word match)
const PROFANITY = [
  "fuck","shit","bitch","cunt","cock","dick","pussy","ass",
  "bastard","slut","whore","piss","tits","twat",
  "stfu","gtfo",
  "retard","retarded",
  "nazi","rape","rapist","molest","pedo","pedophile",
];

const PROFANITY_VARIANTS = new Set();
for (const w of PROFANITY) {
  PROFANITY_VARIANTS.add(w);
  for (const suf of ['s','ed','ing','er','ers','est','iest','y','ies','in','n','a','ah','o','ot','head','face','wad','hole','tard']) {
    PROFANITY_VARIANTS.add(w + suf);
  }
}

// FALSE POSITIVE WHITELIST
const WHITELIST = new Set([
  "class","classic","classify","classified","glass","grass","bass","mass","pass","passed",
  "passing","passion","passive","assess","assessed","assessment","assist","assistant",
  "assume","assumed","assumption","assemble","assembled","assembly","assert","assertion",
  "asset","assign","assigned","assignment","associate","associated","association",
  "assure","assured","assurance","embarrass","embarrassed","harass","harassed",
  "compass","trespass","cassette","cassock","hassle",
  "scunthorpe","cockatoo","cocktail","hancock","peacock","cockpit","cockroach",
  "document","documenting","documented",
  "butter","button","butt","butler","butterscotch","buttercup",
  "therapist","therapists","analyst","analysts","title","titled",
  "grape","drape","scrape","grapes","grapefruit",
  "skilled","skill","skills","reskill","upskill",
  "skit","skip","skin","skiing","skinny",
  "bigger","biggest","digger","digging","trigger","triggered",
  "snicker","snickers","flicker","kicker","sticker","ticker","wicker",
  "knickers","nickel","pickle","sickle","tickle","fickle","prickle",
  "thicken","chicken","quicken","sicken","stricken","cricket",
  "shiitake","shitake",
  "country","counties","counting","counter","countless",
  "execute","executed","execution",
  "dickens","addicted","prediction","diction","dictionary",
  "pushy","pussycat","octopus","campus","platypus",
  "analytics","analyze","analysis",
  "assassin","assassinate",
  "cocked","docked","flocked","knocked","locked","mocked","rocked","socked","stocked",
  "assume","assumption","assumed",
]);

// ═══════════════════════════════════════════════════
//  5. DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════

function checkSevereSlurs(normalized) {
  const stripped = collapseRepeats(stripNonAlpha(normalized));
  for (const slur of SEVERE_SLURS) {
    const target = collapseRepeats(slur);
    if (stripped.includes(target)) return { blocked: true, reason: 'slur', severity: 'severe' };
  }
  return null;
}

function checkProfanity(normalized) {
  const words = normalized.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (WHITELIST.has(w)) continue;
    const collapsed = collapseRepeats(w);
    if (PROFANITY_VARIANTS.has(collapsed)) return { blocked: true, reason: 'profanity', severity: 'standard' };
    const cleaned = collapsed.replace(/[^a-z]/g, '');
    if (cleaned && PROFANITY_VARIANTS.has(cleaned)) return { blocked: true, reason: 'profanity', severity: 'standard' };
  }
  return null;
}

function checkSpacedEvasion(original) {
  const normalized = normalize(original);
  const stripped = collapseRepeats(stripNonAlpha(normalized));
  // Embedded severe slur check on fully-stripped text
  for (const slur of SEVERE_SLURS) {
    const target = collapseRepeats(slur);
    if (target.length >= 3 && stripped.includes(target)) return { blocked: true, reason: 'evasion', severity: 'severe' };
  }
  // Spaced-out letters pattern: "f u c k" or "f.u.c.k"
  const spacedPattern = original.replace(/[^a-zA-Z]/g, ' ').trim();
  const parts = spacedPattern.split(/\s+/);
  if (parts.length >= 3 && parts.every(p => p.length <= 2)) {
    const joined = collapseRepeats(parts.join('').toLowerCase());
    for (const w of PROFANITY) {
      if (joined === collapseRepeats(w) || joined.startsWith(collapseRepeats(w))) {
        return { blocked: true, reason: 'evasion', severity: 'standard' };
      }
    }
    for (const slur of SEVERE_SLURS) {
      if (joined === collapseRepeats(slur) || joined.startsWith(collapseRepeats(slur))) {
        return { blocked: true, reason: 'evasion', severity: 'severe' };
      }
    }
  }
  return null;
}

function checkCharSpam(text) {
  if (text.length < 5) return null;
  const freq = {};
  let maxCount = 0;
  for (const c of text.toLowerCase().replace(/\s/g, '')) {
    freq[c] = (freq[c] || 0) + 1;
    if (freq[c] > maxCount) maxCount = freq[c];
  }
  const nonSpace = text.replace(/\s/g, '').length;
  if (nonSpace > 0 && maxCount / nonSpace >= 0.8) {
    return { blocked: true, reason: 'spam', severity: 'spam' };
  }
  return null;
}

// ═══════════════════════════════════════════════════
//  6. MAIN EXPORTS
// ═══════════════════════════════════════════════════

/** Returns { blocked, reason, severity } or null */
export function checkMessage(text) {
  if (!text || typeof text !== 'string') return null;
  const normalized = normalize(text);
  const severe = checkSevereSlurs(normalized);
  if (severe) return severe;
  const spaced = checkSpacedEvasion(text);
  if (spaced) return spaced;
  const prof = checkProfanity(normalized);
  if (prof) return prof;
  const spam = checkCharSpam(text);
  if (spam) return spam;
  return null;
}

export function containsProfanity(text) { return !!checkMessage(text); }

export function cleanText(text, maxLen = 20) {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text.replace(/[^\w\s\-!?.,:;']/g, '').trim().slice(0, maxLen);
  if (containsProfanity(cleaned)) return null;
  return cleaned;
}
