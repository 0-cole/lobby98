// echoprompts.js — Echo game prompt pairs
// Normal players see the regular prompt, the Echo sees the twisted version.
// Answers should be short text (40 chars max).

const ECHO_PAIRS = [
  { normal: "Name a reason to cancel plans", echo: "Name a reason to cancel plans, but make it unhinged" },
  { normal: "What do you bring to a potluck?", echo: "What do you bring to a potluck at a funeral?" },
  { normal: "What's a good name for a pet?", echo: "What's a good name for a pet alligator?" },
  { normal: "Name something you'd find in a teacher's desk", echo: "Name something suspicious you'd find in a teacher's desk" },
  { normal: "What's a good excuse for being late?", echo: "What's a good excuse for being late to your own wedding?" },
  { normal: "Name a fun weekend activity", echo: "Name a fun weekend activity for a supervillain" },
  { normal: "What should you never say on a first date?", echo: "What should you definitely say on a first date?" },
  { normal: "What's in your fridge right now?", echo: "What's in your fridge that probably shouldn't be?" },
  { normal: "Name a skill that impresses people", echo: "Name a skill that impresses people but is completely useless" },
  { normal: "What do you think about before falling asleep?", echo: "What do you think about at 3 AM when you can't sleep?" },
  { normal: "Describe your morning routine in 3 words", echo: "Describe a chaotic morning routine in 3 words" },
  { normal: "What's a good gift for a coworker?", echo: "What's a passive-aggressive gift for a coworker you dislike?" },
  { normal: "Name something every house should have", echo: "Name something weird that every house should have" },
  { normal: "What's the best pizza topping?", echo: "What's the worst pizza topping that you'd still eat?" },
  { normal: "Name a song everyone knows", echo: "Name a song that gets stuck in everyone's head annoyingly" },
  { normal: "What's a good conversation starter?", echo: "What's a conversation starter that would clear a room?" },
  { normal: "Name something you'd find at a beach", echo: "Name something cursed you'd find at a beach" },
  { normal: "What's a useful life hack?", echo: "What's a life hack that technically works but is terrible?" },
  { normal: "Describe the perfect vacation", echo: "Describe the worst vacation that someone would still post about" },
  { normal: "What would you do with a million dollars?", echo: "What would you do with a million dollars but you have to spend it today?" },
  { normal: "Name a food that's overrated", echo: "Name a food that's overrated but you eat anyway" },
  { normal: "What's in your backpack right now?", echo: "What's in a suspicious backpack?" },
  { normal: "Name something that makes you happy", echo: "Name something that makes you suspiciously happy" },
  { normal: "What's a good movie to watch alone?", echo: "What movie should you never watch alone?" },
  { normal: "Describe your dream house", echo: "Describe your dream house but it has one terrible feature" },
  { normal: "Name a celebrity you'd want as a neighbor", echo: "Name a celebrity who'd be the worst neighbor" },
  { normal: "What's a simple pleasure in life?", echo: "What's a guilty pleasure nobody admits to?" },
  { normal: "Name an animal you'd want as a sidekick", echo: "Name an animal that would be a terrible sidekick" },
  { normal: "What's the best thing about weekends?", echo: "What's the worst thing about Mondays?" },
  { normal: "Describe your ideal breakfast", echo: "Describe a breakfast that would concern your doctor" },
];

export function pickEchoPrompts(count) {
  const shuffled = [...ECHO_PAIRS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export default ECHO_PAIRS;
