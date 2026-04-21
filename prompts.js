// prompts.js — Frequency prompt pairs
// Each pair: { normal, offkey }
// The "normal" prompt goes to everyone except the Off-Key player.
// The "offkey" prompt goes to the Off-Key — it's similar enough that
// their answer *could* be the same, but will usually be slightly different.

const PROMPT_PAIRS = [
  {
    normal: "Rate how weird it would be to eat cereal for dinner",
    offkey: "Rate how weird it would be to eat cereal for breakfast"
  },
  {
    normal: "Rate how scary it would be to see a spider in your bedroom",
    offkey: "Rate how scary it would be to see a spider outside"
  },
  {
    normal: "Rate how impressive it is when someone speaks 3 languages",
    offkey: "Rate how impressive it is when someone speaks 2 languages"
  },
  {
    normal: "Rate how awkward it is to wave back at someone who wasn't waving at you",
    offkey: "Rate how awkward it is to wave at someone who doesn't see you"
  },
  {
    normal: "Rate how satisfying it is to pop bubble wrap",
    offkey: "Rate how satisfying it is to peel the plastic off a new screen"
  },
  {
    normal: "Rate how annoying it is when someone chews with their mouth open",
    offkey: "Rate how annoying it is when someone talks with their mouth full"
  },
  {
    normal: "Rate how cool it would be to own a pet tiger",
    offkey: "Rate how cool it would be to own a pet wolf"
  },
  {
    normal: "Rate how embarrassing it is to trip in public",
    offkey: "Rate how embarrassing it is to trip in front of your crush"
  },
  {
    normal: "Rate how good pineapple is on pizza",
    offkey: "Rate how good mushrooms are on pizza"
  },
  {
    normal: "Rate how stressful it is to take a final exam",
    offkey: "Rate how stressful it is to give a presentation"
  },
  {
    normal: "Rate how relaxing it is to sit by a campfire",
    offkey: "Rate how relaxing it is to sit by the ocean"
  },
  {
    normal: "Rate how scary a zombie apocalypse would be",
    offkey: "Rate how scary an alien invasion would be"
  },
  {
    normal: "Rate how rude it is to not hold the door for someone",
    offkey: "Rate how rude it is to not say thank you"
  },
  {
    normal: "Rate how fun it is to go to an amusement park",
    offkey: "Rate how fun it is to go to a water park"
  },
  {
    normal: "Rate how weird it would be if your teacher added you on Instagram",
    offkey: "Rate how weird it would be if your boss added you on Instagram"
  },
  {
    normal: "Rate how painful it is to step on a Lego",
    offkey: "Rate how painful it is to stub your toe"
  },
  {
    normal: "Rate how talented you'd have to be to juggle 5 balls",
    offkey: "Rate how talented you'd have to be to juggle 3 balls"
  },
  {
    normal: "Rate how boring a 3-hour lecture would be",
    offkey: "Rate how boring a 3-hour meeting would be"
  },
  {
    normal: "Rate how creepy it is to find a clown in your backyard",
    offkey: "Rate how creepy it is to find a clown at a birthday party"
  },
  {
    normal: "Rate how excited you'd be to find $100 on the ground",
    offkey: "Rate how excited you'd be to find $20 on the ground"
  },
  {
    normal: "Rate how brave you'd have to be to go skydiving",
    offkey: "Rate how brave you'd have to be to go bungee jumping"
  },
  {
    normal: "Rate how gross it would be to drink expired milk",
    offkey: "Rate how gross it would be to drink warm soda"
  },
  {
    normal: "Rate how cool it would be to meet a celebrity at the grocery store",
    offkey: "Rate how cool it would be to meet a celebrity at a concert"
  },
  {
    normal: "Rate how hard it is to wake up at 5 AM",
    offkey: "Rate how hard it is to wake up at 7 AM"
  },
  {
    normal: "Rate how risky it is to eat gas station sushi",
    offkey: "Rate how risky it is to eat street food in a foreign country"
  },
  {
    normal: "Rate how satisfying it is to finish a really long book",
    offkey: "Rate how satisfying it is to finish a really long TV series"
  },
  {
    normal: "Rate how uncomfortable a 12-hour road trip would be",
    offkey: "Rate how uncomfortable a 12-hour flight would be"
  },
  {
    normal: "Rate how weird it would be to see your dentist at a nightclub",
    offkey: "Rate how weird it would be to see your dentist at a restaurant"
  },
  {
    normal: "Rate how important it is to make your bed every morning",
    offkey: "Rate how important it is to do your dishes every night"
  },
  {
    normal: "Rate how much you'd trust a self-driving car",
    offkey: "Rate how much you'd trust a robot surgeon"
  },
  {
    normal: "Rate how awkward a 10-second silence in a conversation is",
    offkey: "Rate how awkward a 3-second silence in a conversation is"
  },
  {
    normal: "Rate how cold you'd have to be before you'd wear a coat in public",
    offkey: "Rate how cold you'd have to be before you'd turn on the heat"
  },
  {
    normal: "Rate how impressive a backflip is",
    offkey: "Rate how impressive a cartwheel is"
  },
  {
    normal: "Rate how suspicious it is when someone laughs at their own joke",
    offkey: "Rate how suspicious it is when someone doesn't laugh at anyone's jokes"
  },
  {
    normal: "Rate how addictive scrolling through TikTok is",
    offkey: "Rate how addictive scrolling through YouTube Shorts is"
  },
  {
    normal: "Rate how bad it would be to accidentally like a 2-year-old Instagram photo",
    offkey: "Rate how bad it would be to accidentally send a text to the wrong person"
  },
  {
    normal: "Rate how fancy a restaurant has to be before you feel underdressed in jeans",
    offkey: "Rate how fancy a restaurant has to be before you feel underdressed in sneakers"
  },
  {
    normal: "Rate how frustrating it is to lose your keys",
    offkey: "Rate how frustrating it is to lose your phone"
  },
  {
    normal: "Rate how suspicious it is when someone says 'trust me'",
    offkey: "Rate how suspicious it is when someone says 'no offense, but...'"
  },
  {
    normal: "Rate how chaotic a Walmart at midnight is",
    offkey: "Rate how chaotic a Black Friday sale is"
  },
  {
    normal: "Rate how sad it is when a dog looks at you through a car window",
    offkey: "Rate how sad it is when a dog watches you leave the house"
  },
  {
    normal: "Rate how powerful the feeling is when you correctly guess the plot twist",
    offkey: "Rate how powerful the feeling is when you win an argument"
  },
  {
    normal: "Rate how uncomfortable it is to make eye contact with a stranger for 5 seconds",
    offkey: "Rate how uncomfortable it is to make eye contact with a stranger for 2 seconds"
  },
  {
    normal: "Rate how brave you'd have to be to eat a ghost pepper",
    offkey: "Rate how brave you'd have to be to eat a jalapeño"
  },
  {
    normal: "Rate how judged you'd feel buying 10 frozen pizzas at once",
    offkey: "Rate how judged you'd feel buying 10 bags of candy at once"
  },
  {
    normal: "Rate how terrifying it would be to swim in the deep ocean at night",
    offkey: "Rate how terrifying it would be to swim in a lake at night"
  },
  {
    normal: "Rate how much you'd panic if your phone died at 1% with no charger",
    offkey: "Rate how much you'd panic if your phone died at 20% with no charger"
  },
  {
    normal: "Rate how weird it would be if animals could talk",
    offkey: "Rate how weird it would be if babies could talk"
  },
  {
    normal: "Rate how satisfying it is to cancel plans you didn't want to go to",
    offkey: "Rate how satisfying it is when plans you didn't want to go to get cancelled"
  },
  {
    normal: "Rate how iconic the 'to be continued' meme is",
    offkey: "Rate how iconic the 'we'll be right back' meme is"
  }
];

// Return a random subset of N pairs, shuffled, no repeats.
export function pickPrompts(count) {
  const shuffled = [...PROMPT_PAIRS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export default PROMPT_PAIRS;
