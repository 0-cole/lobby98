// words.js — Word Spy word bank
// Each category has a name and a list of words.
// Normal players see the word. The Spy sees: "You are the Spy! Category: <name>"
// Words within a category should be related enough that clues overlap,
// but distinct enough that specific clues would narrow it down.

const CATEGORIES = [
  {
    name: "Animals",
    words: [
      "penguin", "giraffe", "octopus", "parrot", "dolphin",
      "chameleon", "hamster", "flamingo", "porcupine", "jellyfish",
      "sloth", "peacock", "koala", "lobster", "hedgehog",
      "seahorse", "raccoon", "armadillo", "platypus", "cheetah",
      "pelican", "iguana", "starfish", "wolverine", "mantis",
      "axolotl", "capybara", "pangolin", "narwhal", "toucan"
    ]
  },
  {
    name: "Food & Drinks",
    words: [
      "sushi", "waffle", "burrito", "croissant", "smoothie",
      "popcorn", "pretzel", "lasagna", "milkshake", "dumpling",
      "pancake", "guacamole", "mozzarella", "espresso", "brownie",
      "ramen", "sourdough", "churro", "fondue", "kombucha",
      "tiramisu", "nachos", "boba tea", "granola", "mango",
      "pho", "ceviche", "baklava", "empanada", "gnocchi"
    ]
  },
  {
    name: "Places",
    words: [
      "library", "airport", "aquarium", "bowling alley", "lighthouse",
      "laundromat", "dentist office", "rooftop", "subway station", "treehouse",
      "museum", "campsite", "arcade", "greenhouse", "ferry",
      "ski lodge", "parking garage", "food court", "zoo", "planetarium",
      "drive-in theater", "water park", "barbershop", "flea market", "casino",
      "escape room", "observatory", "junkyard", "ice rink", "thrift store"
    ]
  },
  {
    name: "Jobs & Professions",
    words: [
      "astronaut", "lifeguard", "florist", "detective", "pilot",
      "chef", "veterinarian", "archaeologist", "DJ", "beekeeper",
      "magician", "firefighter", "therapist", "tattoo artist", "plumber",
      "librarian", "meteorologist", "stunt double", "locksmith", "sommelier",
      "cartographer", "midwife", "auctioneer", "taxidermist", "blacksmith",
      "park ranger", "voice actor", "food critic", "zookeeper", "ghostwriter"
    ]
  },
  {
    name: "Things in a House",
    words: [
      "toaster", "chandelier", "doorbell", "bathtub", "fireplace",
      "blender", "bookshelf", "ceiling fan", "welcome mat", "smoke detector",
      "ironing board", "shower curtain", "vacuum cleaner", "dishwasher", "garage door",
      "mailbox", "thermostat", "laundry basket", "nightstand", "coffee table",
      "staircase", "window blinds", "extension cord", "trash can", "coat hanger",
      "air fryer", "bean bag", "shoe rack", "doorstop", "medicine cabinet"
    ]
  },
  {
    name: "Sports & Activities",
    words: [
      "surfing", "bowling", "fencing", "rock climbing", "archery",
      "skateboarding", "yoga", "karaoke", "paintball", "snorkeling",
      "trampolining", "dodgeball", "figure skating", "arm wrestling", "parkour",
      "ping pong", "horseback riding", "bungee jumping", "juggling", "water polo",
      "kickboxing", "disc golf", "rowing", "chess", "roller derby",
      "curling", "geocaching", "darts", "bobsled", "sumo wrestling"
    ]
  },
  {
    name: "Movies & TV Tropes",
    words: [
      "plot twist", "training montage", "evil twin", "love triangle", "car chase",
      "slow motion walk", "comic relief sidekick", "final boss", "flashback",
      "awkward elevator scene", "dramatic rain scene", "undercover disguise",
      "surprise birthday party", "heist plan", "courtroom drama",
      "dance battle", "food fight", "talent show", "road trip", "prom night",
      "haunted house", "time loop", "prison break", "treasure map", "makeover"
    ]
  },
  {
    name: "Emotions & Feelings",
    words: [
      "nostalgia", "jealousy", "deja vu", "butterflies", "homesick",
      "stage fright", "road rage", "secondhand embarrassment", "FOMO",
      "hangry", "boredom", "relief", "suspense", "awkwardness", "wanderlust",
      "guilt trip", "adrenaline rush", "brain freeze", "comfort", "impatience",
      "anticipation", "regret", "satisfaction", "confusion", "serenity"
    ]
  },
  {
    name: "Technology",
    words: [
      "bluetooth", "screenshot", "firewall", "algorithm", "bandwidth",
      "hard drive", "ethernet", "hotspot", "dark mode", "autofill",
      "pop-up ad", "incognito mode", "two factor auth", "cloud storage", "cache",
      "trackpad", "webcam", "dongle", "pixel", "encryption",
      "deepfake", "chatbot", "VPN", "emulator", "smartwatch",
      "touchscreen", "stylus", "flash drive", "processor", "motherboard"
    ]
  },
  {
    name: "School & Education",
    words: [
      "detention", "pop quiz", "yearbook", "report card", "substitute teacher",
      "homecoming", "science fair", "valedictorian", "study hall", "field trip",
      "cafeteria", "locker room", "principal", "honor roll", "pep rally",
      "graduation cap", "hall pass", "textbook", "chalkboard", "backpack",
      "group project", "homework", "recess", "syllabus", "spelling bee",
      "school bus", "assembly", "counselor", "midterm", "class clown"
    ]
  },
  {
    name: "Nature & Weather",
    words: [
      "avalanche", "rainbow", "quicksand", "geyser", "coral reef",
      "tornado", "eclipse", "fog", "tidal wave", "northern lights",
      "volcano", "waterfall", "sandstorm", "glacier", "thunderstorm",
      "drought", "monsoon", "earthquake", "stalactite", "hot spring",
      "whirlpool", "blizzard", "hailstorm", "tide pool", "wildfire",
      "meteor shower", "delta", "canyon", "lagoon", "tundra"
    ]
  },
  {
    name: "Music",
    words: [
      "karaoke", "autotune", "mosh pit", "encore", "acoustic",
      "remix", "playlist", "beatbox", "headphones", "backstage",
      "vinyl record", "synthesizer", "bass drop", "metronome", "roadie",
      "soundcheck", "lullaby", "ringtone", "jukebox", "earworm",
      "mixtape", "falsetto", "breakbeat", "setlist", "unplugged",
      "concert", "turntable", "kazoo", "harmonica", "cowbell"
    ]
  },
  {
    name: "Clothing & Fashion",
    words: [
      "tuxedo", "overalls", "flip flops", "beanie", "suspenders",
      "bathrobe", "fanny pack", "cargo pants", "scrunchie", "monocle",
      "raincoat", "lederhosen", "beret", "kimono", "crocs",
      "hoodie", "snapback", "jumpsuit", "poncho", "stilettos",
      "bow tie", "corset", "high tops", "leggings", "tube socks",
      "parka", "tank top", "toga", "sombrero", "wetsuit"
    ]
  },
  {
    name: "Internet & Memes",
    words: [
      "rickroll", "meme template", "copypasta", "rage quit", "doomscroll",
      "clickbait", "ratio", "stan", "cancel culture", "main character",
      "touch grass", "slay", "no cap", "based", "cringe",
      "simp", "flex", "ghosting", "gaslighting", "viral video",
      "influencer", "parasocial", "unhinged", "delulu", "slay queen",
      "vibe check", "ick", "situationship", "side quest", "lore drop"
    ]
  },
  {
    name: "Holidays & Celebrations",
    words: [
      "fireworks", "mistletoe", "jack-o-lantern", "confetti", "pinata",
      "gingerbread house", "champagne toast", "trick or treat", "easter egg hunt", "countdown",
      "party hat", "ugly sweater", "candy cane", "four leaf clover", "valentines card",
      "turkey dinner", "sparkler", "stocking stuffer", "birthday candles", "costume party",
      "gift wrapping", "secret santa", "egg nog", "april fools prank", "new years resolution"
    ]
  }
];

// Pick a random category and word. Returns { category, word }.
export function pickWord() {
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const word = cat.words[Math.floor(Math.random() * cat.words.length)];
  return { category: cat.name, word };
}

// Pick N unique category+word combos (for multi-round games).
export function pickWords(count) {
  // Flatten all options, shuffle, take N
  const all = [];
  for (const cat of CATEGORIES) {
    for (const word of cat.words) {
      all.push({ category: cat.name, word });
    }
  }
  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(count, all.length));
}

export default CATEGORIES;
