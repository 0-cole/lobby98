// filter.js — basic profanity filter
// Blocks common slurs and profanity. Not exhaustive but covers the obvious ones.
const BLOCKED = [
  "fuck","shit","bitch","ass","damn","dick","cock","pussy","cunt","fag",
  "nigger","nigga","retard","slut","whore","bastard","piss","tits",
  "stfu","wtf","lmfao","kys","nazi","rape","molest","pedo",
].flatMap(w => [w, w+"s", w+"ed", w+"ing", w+"er"]);

const BLOCKED_SET = new Set(BLOCKED);

export function containsProfanity(text) {
  if (!text) return false;
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  return words.some(w => BLOCKED_SET.has(w));
}

export function cleanText(text, maxLen = 20) {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text.replace(/[^\w\s\-!?.,:;']/g, '').trim().slice(0, maxLen);
  if (containsProfanity(cleaned)) return null;
  return cleaned;
}
