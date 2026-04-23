// chains.js — Chain game content
// Starting phrases kick off the collaborative sentence.
// Target words are what the Saboteur must sneak into the sentence.
// Target words should be concrete nouns — mildly unusual but pluggable.

const STARTERS = [
  "Once upon a time,",
  "The doctor looked up and said",
  "Nobody expected the",
  "My grandma always told me",
  "Last summer I accidentally",
  "The president announced that",
  "Deep in the ocean there lives a",
  "If you open that door you will find",
  "The recipe calls for a generous amount of",
  "According to ancient legend the",
  "My neighbor keeps a secret collection of",
  "The astronaut looked out the window and saw",
  "Every Tuesday at midnight the",
  "The detective discovered that the murder weapon was a",
  "In the year 3000 humans will finally",
  "The school principal banned all",
  "Behind the painting there was a hidden",
  "The pizza delivery guy was actually a",
  "Scientists recently discovered that",
  "My dog ate my entire",
  "The wedding was ruined by a",
  "During the blackout everyone started",
  "The treasure map led to a pile of",
  "Nobody knows why the mayor keeps",
  "The alien said its favorite thing about Earth is",
];

const TARGET_WORDS = [
  "pineapple", "submarine", "grandma", "betrayal", "Wisconsin",
  "saxophone", "trampoline", "volcano", "penguin", "bankruptcy",
  "helicopter", "spaghetti", "dinosaur", "umbrella", "mustache",
  "earthquake", "kangaroo", "microwave", "tornado", "jellyfish",
  "skateboard", "explosion", "avocado", "pirate", "flamingo",
  "refrigerator", "unicorn", "cardboard", "telescope", "coconut",
  "werewolf", "broccoli", "hammock", "accordion", "catapult",
  "waffle", "autopsy", "lobster", "parachute", "cinnamon",
  "landlord", "trombone", "asteroid", "pancake", "dungeon",
  "narwhal", "briefcase", "quicksand", "toothbrush", "origami"
];

export function pickChainContent(count) {
  const starters = [...STARTERS].sort(() => Math.random() - 0.5);
  const words = [...TARGET_WORDS].sort(() => Math.random() - 0.5);
  const results = [];
  for (let i = 0; i < Math.min(count, starters.length, words.length); i++) {
    results.push({ starter: starters[i], targetWord: words[i] });
  }
  return results;
}

export default { STARTERS, TARGET_WORDS };
