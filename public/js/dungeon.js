// dungeon.js — "Deep Dive" — Three Goblets-style UI layout
// Two-panel: top panel (switches), bottom panel (persistent HP + equip + inventory)
// Nav buttons: [M]ap [I]nv/Stats [F]orge [S]kills
(function(){
const W=800,H=600,MID=300,CELL=48,PAD=5;

// ══════ DATA ══════
const MONSTER_DB={
  slime:{name:"Slime",emoji:"🟢",mhp:15,dmg:4,arm:1,spd:70,xp:3,rw:1},
  bat:{name:"Bat",emoji:"🦇",mhp:10,dmg:5,arm:0,spd:50,xp:3,rw:1},
  rat:{name:"Rat",emoji:"🐀",mhp:12,dmg:3,arm:2,spd:55,xp:2,rw:1},
  mushroom:{name:"Mushroom",emoji:"🍄",mhp:18,dmg:4,arm:3,spd:65,xp:4,rw:1},
  ogre:{name:"Ogre",emoji:"👹",mhp:45,dmg:8,arm:5,spd:80,xp:12,rw:2,boss:1},
  ice_slime:{name:"Ice Slime",emoji:"🔵",mhp:22,dmg:6,arm:3,spd:65,xp:5,rw:1},
  frost_bat:{name:"Frost Bat",emoji:"🧊",mhp:18,dmg:7,arm:2,spd:48,xp:5,rw:1},
  snowfox:{name:"Snow Fox",emoji:"🦊",mhp:20,dmg:6,arm:4,spd:42,xp:6,rw:1},
  golem:{name:"Ice Golem",emoji:"🗿",mhp:70,dmg:10,arm:12,spd:90,xp:20,rw:3,boss:1},
  imp:{name:"Fire Imp",emoji:"😈",mhp:28,dmg:9,arm:4,spd:50,xp:8,rw:1},
  lava_snake:{name:"Lava Snake",emoji:"🐍",mhp:25,dmg:10,arm:3,spd:45,xp:8,rw:1},
  ember:{name:"Ember Skull",emoji:"💀",mhp:30,dmg:8,arm:6,spd:55,xp:9,rw:1},
  drake:{name:"Inferno Drake",emoji:"🐉",mhp:100,dmg:14,arm:10,spd:70,xp:30,rw:4,boss:1},
  phantom:{name:"Phantom",emoji:"👻",mhp:35,dmg:11,arm:5,spd:40,xp:10,rw:2},
  dark_mage:{name:"Dark Mage",emoji:"🧙",mhp:30,dmg:14,arm:3,spd:50,xp:11,rw:2},
  wolf:{name:"Shadow Wolf",emoji:"🐺",mhp:38,dmg:12,arm:7,spd:35,xp:10,rw:2},
  void_lord:{name:"Void Lord",emoji:"👁️",mhp:140,dmg:18,arm:14,spd:60,xp:45,rw:5,boss:1},
  demon:{name:"Demon",emoji:"👹",mhp:50,dmg:16,arm:8,spd:45,xp:14,rw:2},
  bone_dragon:{name:"Bone Dragon",emoji:"🐲",mhp:55,dmg:14,arm:10,spd:50,xp:16,rw:2},
  lich:{name:"Lich",emoji:"☠️",mhp:42,dmg:18,arm:6,spd:42,xp:15,rw:2},
  ancient:{name:"The Ancient",emoji:"⚫",mhp:220,dmg:22,arm:18,spd:55,xp:80,rw:8,boss:1},
  dummy:{name:"Dummy",emoji:"🎯",mhp:8,dmg:1,arm:0,spd:200,xp:2,rw:1},
  dummy_boss:{name:"Tough Dummy",emoji:"🥊",mhp:20,dmg:2,arm:1,spd:160,xp:5,rw:2,boss:1},
  // ── Area 6-10 monsters ──
  crystal_bug:{name:"Crystal Bug",emoji:"🪲",mhp:55,dmg:17,arm:9,spd:42,xp:16,rw:2},
  gem_golem:{name:"Gem Golem",emoji:"💎",mhp:80,dmg:15,arm:16,spd:60,xp:18,rw:2},
  prism_lord:{name:"Prism Lord",emoji:"🌈",mhp:180,dmg:20,arm:15,spd:55,xp:50,rw:6,boss:1},
  merfolk:{name:"Merfolk",emoji:"🧜",mhp:58,dmg:18,arm:8,spd:40,xp:17,rw:2},
  kraken_eye:{name:"Kraken Eye",emoji:"🦑",mhp:65,dmg:20,arm:7,spd:45,xp:18,rw:2},
  leviathan:{name:"Leviathan",emoji:"🐋",mhp:200,dmg:22,arm:16,spd:58,xp:55,rw:7,boss:1},
  bog_witch:{name:"Bog Witch",emoji:"🧙‍♀️",mhp:50,dmg:22,arm:6,spd:48,xp:18,rw:2},
  toxic_toad:{name:"Toxic Toad",emoji:"🐸",mhp:60,dmg:16,arm:10,spd:50,xp:16,rw:2},
  swamp_hydra:{name:"Swamp Hydra",emoji:"🐲",mhp:220,dmg:24,arm:14,spd:52,xp:60,rw:7,boss:1},
  iron_knight:{name:"Iron Knight",emoji:"🤖",mhp:75,dmg:18,arm:20,spd:55,xp:20,rw:2},
  siege_tank:{name:"Siege Cannon",emoji:"💣",mhp:60,dmg:28,arm:12,spd:70,xp:22,rw:2},
  mech_titan:{name:"Mech Titan",emoji:"⚙️",mhp:250,dmg:26,arm:22,spd:50,xp:65,rw:8,boss:1},
  storm_hawk:{name:"Storm Hawk",emoji:"🦅",mhp:55,dmg:24,arm:8,spd:32,xp:22,rw:2},
  thunder_ele:{name:"Thunder Elemental",emoji:"⛈️",mhp:70,dmg:22,arm:10,spd:38,xp:24,rw:3},
  storm_king:{name:"Storm King",emoji:"👑",mhp:260,dmg:28,arm:18,spd:45,xp:70,rw:8,boss:1},
  // ── Area 11-15 monsters ──
  bone_archer:{name:"Bone Archer",emoji:"🏹",mhp:65,dmg:28,arm:8,spd:35,xp:26,rw:3},
  crypt_wraith:{name:"Crypt Wraith",emoji:"👤",mhp:72,dmg:25,arm:12,spd:42,xp:28,rw:3},
  death_knight:{name:"Death Knight",emoji:"⚰️",mhp:300,dmg:30,arm:24,spd:48,xp:80,rw:9,boss:1},
  treant:{name:"Treant",emoji:"🌳",mhp:90,dmg:22,arm:18,spd:55,xp:28,rw:3},
  fae_sprite:{name:"Fae Sprite",emoji:"🧚",mhp:50,dmg:30,arm:6,spd:28,xp:30,rw:3},
  forest_god:{name:"Forest God",emoji:"🦌",mhp:320,dmg:32,arm:20,spd:42,xp:85,rw:10,boss:1},
  magma_worm:{name:"Magma Worm",emoji:"🪱",mhp:80,dmg:30,arm:14,spd:45,xp:32,rw:3},
  lava_titan:{name:"Lava Titan",emoji:"🌋",mhp:350,dmg:35,arm:25,spd:55,xp:90,rw:10,boss:1},
  wisp:{name:"Wisp",emoji:"✨",mhp:60,dmg:35,arm:5,spd:25,xp:34,rw:3},
  void_stalker:{name:"Void Stalker",emoji:"🕳️",mhp:85,dmg:32,arm:15,spd:38,xp:36,rw:3},
  planar_warden:{name:"Planar Warden",emoji:"🌀",mhp:380,dmg:38,arm:22,spd:45,xp:100,rw:11,boss:1},
  wyrm:{name:"Elder Wyrm",emoji:"🐲",mhp:100,dmg:35,arm:20,spd:42,xp:40,rw:4},
  dragon_lord:{name:"Dragon Lord",emoji:"🐉",mhp:450,dmg:42,arm:28,spd:48,xp:120,rw:12,boss:1},
  // ── Area 16-20 monsters ──
  corrupt_priest:{name:"Corrupt Priest",emoji:"⛪",mhp:90,dmg:38,arm:14,spd:40,xp:42,rw:4},
  shadow_beast:{name:"Shadow Beast",emoji:"👾",mhp:100,dmg:36,arm:18,spd:35,xp:44,rw:4},
  fallen_angel:{name:"Fallen Angel",emoji:"😇",mhp:500,dmg:45,arm:30,spd:42,xp:140,rw:13,boss:1},
  deep_one:{name:"Deep One",emoji:"🐙",mhp:110,dmg:40,arm:16,spd:38,xp:48,rw:4},
  abyssal_maw:{name:"Abyssal Maw",emoji:"🦷",mhp:550,dmg:48,arm:32,spd:45,xp:150,rw:14,boss:1},
  star_knight:{name:"Star Knight",emoji:"⭐",mhp:120,dmg:42,arm:22,spd:35,xp:52,rw:4},
  nova_spirit:{name:"Nova Spirit",emoji:"☀️",mhp:105,dmg:45,arm:18,spd:30,xp:54,rw:4},
  astral_titan:{name:"Astral Titan",emoji:"🪐",mhp:600,dmg:52,arm:35,spd:40,xp:160,rw:15,boss:1},
  chaos_imp:{name:"Chaos Imp",emoji:"🃏",mhp:100,dmg:48,arm:15,spd:28,xp:56,rw:5},
  entropy_lord:{name:"Entropy Lord",emoji:"🌪️",mhp:650,dmg:55,arm:35,spd:38,xp:180,rw:16,boss:1},
  // ── Area 21-25 monsters ──
  elder_thing:{name:"Elder Thing",emoji:"🦠",mhp:130,dmg:50,arm:25,spd:35,xp:60,rw:5},
  cosmic_horror:{name:"Cosmic Horror",emoji:"🌌",mhp:700,dmg:58,arm:38,spd:42,xp:200,rw:18,boss:1},
  forge_golem:{name:"Forge Golem",emoji:"🔨",mhp:150,dmg:48,arm:35,spd:50,xp:64,rw:5},
  titan_smith:{name:"Titan Smith",emoji:"⚒️",mhp:750,dmg:60,arm:42,spd:45,xp:220,rw:20,boss:1},
  nightmare:{name:"Nightmare",emoji:"😱",mhp:140,dmg:55,arm:22,spd:30,xp:68,rw:5},
  dream_eater:{name:"Dream Eater",emoji:"🌙",mhp:800,dmg:62,arm:40,spd:38,xp:240,rw:22,boss:1},
  star_corpse:{name:"Star Corpse",emoji:"💫",mhp:160,dmg:58,arm:28,spd:32,xp:72,rw:5},
  nebula_king:{name:"Nebula King",emoji:"🔭",mhp:850,dmg:65,arm:42,spd:40,xp:260,rw:24,boss:1},
  infinity_eye:{name:"Infinity Eye",emoji:"♾️",mhp:180,dmg:62,arm:30,spd:28,xp:80,rw:6},
  the_end:{name:"THE END",emoji:"🕳️",mhp:1000,dmg:70,arm:50,spd:35,xp:500,rw:30,boss:1},
};

const AREAS=[
  {name:"Training Grounds",color:"#2a3a2a",tutorial:true,floors:[
    [{m:"dummy",n:1}],[{m:"dummy",n:2}],[{m:"dummy_boss",n:1,boss:1}]
  ]},
  {name:"Mossy Caverns",color:"#2d5a1e",floors:[
    [{m:"slime",n:2}],[{m:"rat",n:3}],[{m:"mushroom",n:2}],[{m:"slime",n:2},{m:"mushroom",n:1}],[{m:"ogre",n:1,boss:1}]
  ]},
  {name:"Frozen Depths",color:"#1e4a6a",floors:[
    [{m:"ice_slime",n:2}],[{m:"frost_bat",n:3}],[{m:"snowfox",n:2}],[{m:"ice_slime",n:2,mod:"powerful"}],[{m:"frost_bat",n:1},{m:"snowfox",n:2}],[{m:"golem",n:1,boss:1}]
  ]},
  {name:"Scorched Halls",color:"#6a2a1a",floors:[
    [{m:"imp",n:2}],[{m:"lava_snake",n:3}],[{m:"ember",n:2,mod:"poison"}],[{m:"imp",n:2},{m:"ember",n:1}],[{m:"lava_snake",n:3,mod:"powerful"}],[{m:"imp",n:1,mod:"shielding"},{m:"ember",n:2}],[{m:"drake",n:1,boss:1}]
  ]},
  {name:"Shadow Ruins",color:"#2a1a3a",floors:[
    [{m:"phantom",n:2}],[{m:"dark_mage",n:2,mod:"poison"}],[{m:"wolf",n:3}],[{m:"phantom",n:1,mod:"shielding"},{m:"dark_mage",n:2}],
    [{m:"wolf",n:2,mod:"powerful"}],[{m:"dark_mage",n:3,mod:"poison"}],[{m:"phantom",n:2},{m:"wolf",n:1,mod:"shielding"}],[{m:"void_lord",n:1,boss:1}]
  ]},
  {name:"The Abyss",color:"#1a0a1a",floors:[
    [{m:"demon",n:2}],[{m:"bone_dragon",n:2}],[{m:"lich",n:2,mod:"poison"}],[{m:"demon",n:2,mod:"powerful"}],
    [{m:"lich",n:1,mod:"shielding"},{m:"bone_dragon",n:2}],[{m:"demon",n:3,mod:"powerful"}],[{m:"bone_dragon",n:2,mod:"shielding"},{m:"lich",n:1}],
    [{m:"demon",n:2,mod:"poison"},{m:"lich",n:2}],[{m:"bone_dragon",n:3,mod:"powerful"}],[{m:"ancient",n:1,boss:1}]
  ]},
  {name:"Crystal Caves",color:"#2a4a5a",floors:[
    [{m:"crystal_bug",n:2}],[{m:"gem_golem",n:2}],[{m:"crystal_bug",n:3,mod:"shielding"}],[{m:"gem_golem",n:2,mod:"powerful"}],[{m:"crystal_bug",n:2},{m:"gem_golem",n:1}],[{m:"prism_lord",n:1,boss:1}]
  ]},
  {name:"Sunken Temple",color:"#1a3a4a",floors:[
    [{m:"merfolk",n:2}],[{m:"kraken_eye",n:2}],[{m:"merfolk",n:3,mod:"poison"}],[{m:"kraken_eye",n:2,mod:"powerful"}],[{m:"merfolk",n:2},{m:"kraken_eye",n:2}],[{m:"kraken_eye",n:3,mod:"shielding"}],[{m:"leviathan",n:1,boss:1}]
  ]},
  {name:"Poison Marsh",color:"#2a3a1a",floors:[
    [{m:"toxic_toad",n:2}],[{m:"bog_witch",n:2,mod:"poison"}],[{m:"toxic_toad",n:3}],[{m:"bog_witch",n:2,mod:"powerful"}],[{m:"toxic_toad",n:2,mod:"poison"},{m:"bog_witch",n:1}],[{m:"swamp_hydra",n:1,boss:1}]
  ]},
  {name:"Iron Fortress",color:"#3a3a3a",floors:[
    [{m:"iron_knight",n:2}],[{m:"siege_tank",n:2}],[{m:"iron_knight",n:3,mod:"shielding"}],[{m:"siege_tank",n:2,mod:"powerful"}],[{m:"iron_knight",n:2},{m:"siege_tank",n:2}],[{m:"iron_knight",n:3,mod:"powerful"}],[{m:"mech_titan",n:1,boss:1}]
  ]},
  {name:"Storm Peaks",color:"#2a3a5a",floors:[
    [{m:"storm_hawk",n:3}],[{m:"thunder_ele",n:2}],[{m:"storm_hawk",n:2,mod:"powerful"}],[{m:"thunder_ele",n:3,mod:"poison"}],[{m:"storm_hawk",n:2},{m:"thunder_ele",n:2}],[{m:"storm_king",n:1,boss:1}]
  ]},
  {name:"Bone Catacombs",color:"#3a2a1a",floors:[
    [{m:"bone_archer",n:2}],[{m:"crypt_wraith",n:2}],[{m:"bone_archer",n:3,mod:"poison"}],[{m:"crypt_wraith",n:2,mod:"shielding"}],[{m:"bone_archer",n:2},{m:"crypt_wraith",n:2,mod:"powerful"}],[{m:"crypt_wraith",n:3,mod:"poison"}],[{m:"death_knight",n:1,boss:1}]
  ]},
  {name:"Enchanted Forest",color:"#1a4a2a",floors:[
    [{m:"treant",n:2}],[{m:"fae_sprite",n:3}],[{m:"treant",n:2,mod:"shielding"}],[{m:"fae_sprite",n:2,mod:"powerful"}],[{m:"treant",n:2},{m:"fae_sprite",n:2}],[{m:"forest_god",n:1,boss:1}]
  ]},
  {name:"Volcanic Core",color:"#5a1a0a",floors:[
    [{m:"magma_worm",n:2}],[{m:"imp",n:3,mod:"powerful"}],[{m:"magma_worm",n:3,mod:"poison"}],[{m:"magma_worm",n:2},{m:"imp",n:2,mod:"powerful"}],[{m:"magma_worm",n:3,mod:"shielding"}],[{m:"lava_titan",n:1,boss:1}]
  ]},
  {name:"Ethereal Plane",color:"#3a2a5a",floors:[
    [{m:"wisp",n:3}],[{m:"void_stalker",n:2}],[{m:"wisp",n:2,mod:"powerful"},{m:"void_stalker",n:1}],[{m:"void_stalker",n:3,mod:"poison"}],[{m:"wisp",n:3,mod:"shielding"}],[{m:"void_stalker",n:2,mod:"powerful"}],[{m:"planar_warden",n:1,boss:1}]
  ]},
  {name:"Dragon's Lair",color:"#4a2a0a",floors:[
    [{m:"wyrm",n:2}],[{m:"wyrm",n:2,mod:"powerful"}],[{m:"wyrm",n:3,mod:"poison"}],[{m:"wyrm",n:2,mod:"shielding"},{m:"wyrm",n:1}],[{m:"wyrm",n:3,mod:"powerful"}],[{m:"dragon_lord",n:1,boss:1}]
  ]},
  {name:"Corrupted Shrine",color:"#4a1a2a",floors:[
    [{m:"corrupt_priest",n:2}],[{m:"shadow_beast",n:2}],[{m:"corrupt_priest",n:2,mod:"poison"},{m:"shadow_beast",n:1}],[{m:"shadow_beast",n:3,mod:"powerful"}],[{m:"corrupt_priest",n:2,mod:"shielding"},{m:"shadow_beast",n:2}],[{m:"shadow_beast",n:3,mod:"poison"}],[{m:"fallen_angel",n:1,boss:1}]
  ]},
  {name:"Abyssal Trench",color:"#0a1a2a",floors:[
    [{m:"deep_one",n:2}],[{m:"deep_one",n:3,mod:"poison"}],[{m:"deep_one",n:2,mod:"powerful"},{m:"deep_one",n:1,mod:"shielding"}],[{m:"deep_one",n:3,mod:"powerful"}],[{m:"abyssal_maw",n:1,boss:1}]
  ]},
  {name:"Celestial Tower",color:"#2a2a5a",floors:[
    [{m:"star_knight",n:2}],[{m:"nova_spirit",n:2}],[{m:"star_knight",n:2,mod:"powerful"}],[{m:"nova_spirit",n:3,mod:"shielding"}],[{m:"star_knight",n:2},{m:"nova_spirit",n:2,mod:"powerful"}],[{m:"nova_spirit",n:3,mod:"poison"}],[{m:"star_knight",n:3,mod:"powerful"}],[{m:"astral_titan",n:1,boss:1}]
  ]},
  {name:"Chaos Realm",color:"#3a0a2a",floors:[
    [{m:"chaos_imp",n:3}],[{m:"chaos_imp",n:3,mod:"powerful"}],[{m:"chaos_imp",n:3,mod:"poison"}],[{m:"chaos_imp",n:3,mod:"shielding"}],[{m:"chaos_imp",n:3,mod:"powerful"},{m:"chaos_imp",n:1,mod:"poison"}],[{m:"entropy_lord",n:1,boss:1}]
  ]},
  {name:"Eldritch Void",color:"#1a0a2a",floors:[
    [{m:"elder_thing",n:2}],[{m:"elder_thing",n:3,mod:"poison"}],[{m:"elder_thing",n:2,mod:"powerful"},{m:"elder_thing",n:1,mod:"shielding"}],[{m:"elder_thing",n:3,mod:"powerful"}],[{m:"cosmic_horror",n:1,boss:1}]
  ]},
  {name:"Titan's Forge",color:"#4a3a1a",floors:[
    [{m:"forge_golem",n:2}],[{m:"forge_golem",n:2,mod:"shielding"}],[{m:"forge_golem",n:3,mod:"powerful"}],[{m:"forge_golem",n:2,mod:"poison"},{m:"forge_golem",n:1,mod:"shielding"}],[{m:"forge_golem",n:3,mod:"powerful"}],[{m:"titan_smith",n:1,boss:1}]
  ]},
  {name:"Nightmare Realm",color:"#2a0a1a",floors:[
    [{m:"nightmare",n:2}],[{m:"nightmare",n:3,mod:"poison"}],[{m:"nightmare",n:2,mod:"powerful"},{m:"nightmare",n:1}],[{m:"nightmare",n:3,mod:"shielding"}],[{m:"nightmare",n:3,mod:"powerful"}],[{m:"dream_eater",n:1,boss:1}]
  ]},
  {name:"Star Graveyard",color:"#0a0a2a",floors:[
    [{m:"star_corpse",n:2}],[{m:"star_corpse",n:3,mod:"poison"}],[{m:"star_corpse",n:2,mod:"powerful"},{m:"star_corpse",n:1,mod:"shielding"}],[{m:"star_corpse",n:3,mod:"powerful"}],[{m:"star_corpse",n:3,mod:"shielding"}],[{m:"nebula_king",n:1,boss:1}]
  ]},
  {name:"Infinity Gate",color:"#1a1a3a",floors:[
    [{m:"infinity_eye",n:2}],[{m:"infinity_eye",n:3,mod:"powerful"}],[{m:"infinity_eye",n:2,mod:"poison"},{m:"infinity_eye",n:1,mod:"shielding"}],[{m:"infinity_eye",n:3,mod:"powerful"}],[{m:"infinity_eye",n:3,mod:"shielding"},{m:"infinity_eye",n:1,mod:"powerful"}],[{m:"infinity_eye",n:3,mod:"powerful"}],[{m:"the_end",n:1,boss:1}]
  ]},
];

const ITEM_TYPES=[
  {name:"Sword",icon:"⚔️",slot:0,base:{dmg:1.3}},
  {name:"Shield",icon:"🛡️",slot:1,base:{arm:1.2}},
  {name:"Armor",icon:"🧥",slot:2,base:{mhp:3.0}},
  {name:"Gloves",icon:"🧤",slot:3,base:{spd:1.0,isSpd:1}},
  {name:"Ring",icon:"💍",slot:4,base:{}},
  {name:"Amulet",icon:"📿",slot:5,base:{}},
];
const RARITIES=[
  {name:"Common",color:"#ccc",affixes:0,multi:1.0},
  {name:"Uncommon",color:"#4caf50",affixes:1,multi:1.15},
  {name:"Rare",color:"#2196f3",affixes:2,multi:1.3},
  {name:"Legendary",color:"#ff9800",affixes:3,multi:1.5},
  {name:"Ancient",color:"#e040fb",affixes:3,multi:1.8},
];
const UNIQUE_ITEMS=[
  {name:"Flame Blade",icon:"🔥",slot:0,rarity:4,rarName:"Unique",rarCol:"#ff4444",stats:{dmg:15,lfl:4},aNames:["DMG+15","Leech+4"],desc:"Burns with eternal fire",lvl:5},
  {name:"Frost Edge",icon:"❄️",slot:0,rarity:4,rarName:"Unique",rarCol:"#44aaff",stats:{dmg:12,spd:8},aNames:["DMG+12","Speed+8"],desc:"Slows enemies with cold",lvl:7},
  {name:"Shadow Dagger",icon:"🗡️",slot:0,rarity:4,rarName:"Unique",rarCol:"#aa44ff",stats:{dmg:18,cri:2},aNames:["DMG+18","Crit every 2"],desc:"Strikes from the shadows",lvl:10},
  {name:"Titan Shield",icon:"🛡️",slot:1,rarity:4,rarName:"Unique",rarCol:"#ff8800",stats:{arm:25,mhp:40},aNames:["Armor+25","HP+40"],desc:"Forged by titans",lvl:12},
  {name:"Void Armor",icon:"🧥",slot:2,rarity:4,rarName:"Unique",rarCol:"#8844ff",stats:{mhp:80,arm:15,hpr:2},aNames:["HP+80","Armor+15","Regen+2"],desc:"Absorbs damage into nothing",lvl:15},
  {name:"Storm Gauntlets",icon:"🧤",slot:3,rarity:4,rarName:"Unique",rarCol:"#44ddff",stats:{spd:15,dmg:8},aNames:["Speed+15","DMG+8"],desc:"Lightning-fast strikes",lvl:13},
  {name:"Infinity Ring",icon:"💍",slot:4,rarity:4,rarName:"Unique",rarCol:"#ffffff",stats:{dmg:10,arm:10,mhp:30,lfl:3},aNames:["All+10","HP+30","Leech+3"],desc:"Contains infinite power",lvl:20},
  {name:"Godslayer",icon:"⚔️",slot:0,rarity:4,rarName:"Mythic",rarCol:"#ff0000",stats:{dmg:35,cri:2,lfl:5},aNames:["DMG+35","Crit/2","Leech+5"],desc:"The weapon that killed a god",lvl:25},
];

const AFFIX_POOL=[
  {stat:"dmg",label:"DMG",base:0.15},{stat:"arm",label:"Armor",base:0.22},
  {stat:"mhp",label:"HP",base:0.20},{stat:"spd",label:"SPD",base:0.12,isSpd:1},
  {stat:"hpr",label:"Regen",base:0.02,flat:1},{stat:"cri",label:"Crit",base:5,flat:1},
  {stat:"lfl",label:"Leech",base:2,flat:1},
];
// Skill tree: 3 branches (HP, ATK, DEF), 5 tiers each. Must unlock in order.
const PASSIVES=[
  // ── VITALITY branch (green) ── idx 0-4
  {name:"Toughness",desc:"+30% Max HP",icon:"❤️",e:{mhpMul:1.3},branch:"hp",tier:0,req:-1},
  {name:"Regen",desc:"3% HP/sec regen",icon:"💚",e:{hprPct:0.03},branch:"hp",tier:1,req:0},
  {name:"Last Stand",desc:"Heal 30% at <40% HP",icon:"🔥",e:{res:30},branch:"hp",tier:2,req:1},
  {name:"Revive",desc:"Revive once at 15% HP",icon:"💀",e:{rev:15},branch:"hp",tier:3,req:2},
  {name:"E. Shield",desc:"30% HP as shield layer",icon:"🔮",e:{mes:30},branch:"hp",tier:4,req:3},
  // ── POWER branch (red) ── idx 5-9
  {name:"Fury",desc:"+25% Damage",icon:"⚔️",e:{dmgMul:1.25},branch:"atk",tier:0,req:-1},
  {name:"Critical",desc:"Every 3rd hit = 2x dmg",icon:"💥",e:{cri:3},branch:"atk",tier:1,req:5},
  {name:"Splash",desc:"25% dmg to neighbors",icon:"💫",e:{spl:25},branch:"atk",tier:2,req:6},
  {name:"Sweep",desc:"Every 5th hit = all",icon:"🌀",e:{swp:5},branch:"atk",tier:3,req:7},
  {name:"Berserker",desc:"+50% dmg, -20% armor",icon:"😤",e:{dmgMul:1.5,armMul:0.8},branch:"atk",tier:4,req:8},
  // ── DEFENSE branch (blue) ── idx 10-14
  {name:"Iron Skin",desc:"+35% Armor",icon:"🛡️",e:{armMul:1.35},branch:"def",tier:0,req:-1},
  {name:"Swiftness",desc:"+15% Atk Speed",icon:"⚡",e:{spdMul:0.85},branch:"def",tier:1,req:10},
  {name:"Leech",desc:"3% lifesteal",icon:"🩸",e:{lfl:3},branch:"def",tier:2,req:11},
  {name:"Fortify",desc:"+50% armor vs 1 enemy",icon:"🏰",e:{irn:50},branch:"def",tier:3,req:12},
  {name:"Vs Odds",desc:"+30% dmg vs 3+ enemies",icon:"⚡",e:{ods:30},branch:"def",tier:4,req:13},
  // ── LUCK branch (gold) ── idx 15-19
  {name:"Scavenger",desc:"+20% drop chance",icon:"🍀",e:{dropBonus:20},branch:"lck",tier:0,req:-1},
  {name:"Fortune",desc:"+1 rarity tier chance",icon:"🎲",e:{rarBonus:1},branch:"lck",tier:1,req:15},
  {name:"Jackpot",desc:"10% chance double XP",icon:"💰",e:{dblXp:10},branch:"lck",tier:2,req:16},
  {name:"Treasure",desc:"+50% forge progress",icon:"⛏️",e:{forgeBonus:50},branch:"lck",tier:3,req:17},
  {name:"Golden Touch",desc:"10% chance bonus item",icon:"👑",e:{bonusItem:10},branch:"lck",tier:4,req:18},
];
const FORGE_MS=[
  {at:3,r:"stat",n:1,d:"1 Stat Point"},{at:8,r:"stat",n:1,d:"1 Stat Point"},
  {at:15,r:"slot",s:4,d:"Ring Slot"},{at:25,r:"passive",n:1,d:"1 Skill Point"},
  {at:35,r:"stat",n:2,d:"2 Stat Points"},{at:50,r:"slot",s:5,d:"Amulet Slot"},
  {at:70,r:"stat",n:2,d:"2 Stat Points"},{at:100,r:"passive",n:1,d:"1 Skill Point"},
  {at:140,r:"stat",n:3,d:"3 Stat Points"},{at:200,r:"passive",n:1,d:"1 Skill Pt"},
];

// ══════ GAME STATE ══════
let g=null,_raf=null,_particles=[],_tooltip=null;
const TAB={MAP:0,STATS:1,FORGE:2,SKILLS:3,SETTINGS:7,BATTLE:4,VICTORY:5,DEFEAT:6};

function newGame(){
  return{
    tab:TAB.MAP,
    player:{hp:30,mhp:30,dmg:6,arm:2,spd:80,hpr:0,cri:0,lfl:0,spl:0,swp:0,res:0,rev:0,irn:0,ods:0,mes:0,
      es:0,atkTimer:80,atkCount:0,target:0,resUsed:false,revUsed:false},
    baseStats:{mhp:30,dmg:6,arm:2,spd:80},
    statPts:0,passivePts:0,spentStats:{mhp:0,dmg:0,arm:0,spd:0},
    activePassives:new Set(),
    slots:[true,true,true,true,false,false],
    equips:[null,null,null,null,null,null],
    inv:[],// max 20
    forgeProg:0,
    lvl:1,xp:0,areaIdx:0,floor:0,areasCleared:0,_mapViewArea:0,
    enemies:[],totalKills:0,totalCoins:0,log:[],tutPaused:false,autoAtk:true,manualReady:false,autoEquipOn:false,autoLevelOn:false,
  };
}
function xpNeed(l){return Math.round(10*l+3*l*l);}

// ══════ STATS ══════
function recalc(){
  const p=g.player,b=g.baseStats;
  let mhp=b.mhp+g.spentStats.mhp*5,dmg=b.dmg+g.spentStats.dmg*2,arm=b.arm+g.spentStats.arm*2,spd=b.spd-g.spentStats.spd*3;
  let hpr=0,cri=0,lfl=0,spl=0,swp=0,res=0,rev=0,irn=0,ods=0,mes=0;
  let dropBonus=0,rarBonus=0,dblXp=0,forgeBonus=0,bonusItem=0;
  let dm=1,am=1,hm=1,sm=1;
  for(let i=0;i<6;i++){const it=g.equips[i];if(!it)continue;for(const[s,v]of Object.entries(it.stats||{})){
    if(s==="dmg")dmg+=v;else if(s==="arm")arm+=v;else if(s==="mhp")mhp+=v;else if(s==="spd")spd-=v;
    else if(s==="hpr")hpr+=v;else if(s==="cri")cri+=v;else if(s==="lfl")lfl+=v;}}
  for(const i of g.activePassives){const e=PASSIVES[i]?.e;if(!e)continue;
    if(e.dmgMul)dm*=e.dmgMul;if(e.armMul)am*=e.armMul;if(e.mhpMul)hm*=e.mhpMul;if(e.spdMul)sm*=e.spdMul;
    if(e.hprPct)hpr+=mhp*e.hprPct;if(e.cri)cri=e.cri;if(e.lfl)lfl+=e.lfl;if(e.spl)spl=e.spl;
    if(e.swp)swp=e.swp;if(e.res)res=e.res;if(e.rev)rev=e.rev;if(e.irn)irn=e.irn;if(e.ods)ods=e.ods;if(e.mes)mes=e.mes;
    if(e.dropBonus)dropBonus+=e.dropBonus;if(e.rarBonus)rarBonus+=e.rarBonus;if(e.dblXp)dblXp+=e.dblXp;
    if(e.forgeBonus)forgeBonus+=e.forgeBonus;if(e.bonusItem)bonusItem+=e.bonusItem;}
  p.mhp=Math.round(mhp*hm);p.dmg=Math.round(dmg*dm);p.arm=Math.round(arm*am);p.spd=Math.max(15,Math.round(spd*sm));
  p.hpr=hpr;p.cri=cri;p.lfl=lfl;p.spl=spl;p.swp=swp;p.res=res;p.rev=rev;p.irn=irn;p.ods=ods;p.mes=mes;
  p.dropBonus=dropBonus;p.rarBonus=rarBonus;p.dblXp=dblXp;p.forgeBonus=forgeBonus;p.bonusItem=bonusItem;
  p.hp=Math.min(p.hp,p.mhp);p.es=Math.round(p.mhp*p.mes/100);
}

// ══════ ITEMS ══════
function genItem(aLvl,fType,fRar){
  const ti=fType??Math.floor(Math.random()*ITEM_TYPES.length);
  const t=ITEM_TYPES[ti];let ri=fRar??0;
  if(fRar===undefined){const r=Math.random();if(r<.03)ri=4;else if(r<.10)ri=3;else if(r<.30)ri=2;else if(r<.60)ri=1;
    // Luck: rarBonus bumps rarity up
    if(g&&g.player&&g.player.rarBonus>0){for(let b=0;b<g.player.rarBonus;b++){if(Math.random()<0.35&&ri<4)ri++;}}
  }
  const rar=RARITIES[ri],stats={},aNames=[];
  // Base stat scales with area level + random variance (±20%)
  const variance=()=>0.8+Math.random()*0.4;
  for(const[s,base]of Object.entries(t.base)){if(s==="isSpd")continue;
    const baseVal=base*aLvl*rar.multi*variance();
    const v=t.base.isSpd?Math.round(1+aLvl*0.4*rar.multi*variance()):Math.round(Math.max(1,baseVal));
    if(v>0)stats[s]=v;}
  // Random affixes — scale with level, rarity adds more lines
  const pool=[...AFFIX_POOL].sort(()=>Math.random()-.5);
  for(let i=0;i<rar.affixes&&i<pool.length;i++){const a=pool[i];
    let v;
    if(a.flat){v=Math.round((a.base+aLvl*0.3)*rar.multi*variance()*10)/10;}
    else{v=Math.round(a.base*aLvl*rar.multi*variance());}
    v=Math.max(1,v);
    stats[a.stat]=(stats[a.stat]||0)+v;aNames.push(`${a.label}+${v}`);}
  return{name:t.name,icon:t.icon,typeIdx:ti,slot:t.slot,rarity:ri,rarName:rar.name,rarCol:rar.color,stats,aNames,lvl:aLvl};
}

// ══════ ENCOUNTERS ══════
function startArea(idx){
  g.areaIdx=idx;g.floor=0;g.player.resUsed=false;g.player.revUsed=false;
  recalc();g.player.hp=g.player.mhp;g.player.es=Math.round(g.player.mhp*g.player.mes/100);
  startFloor();
}
function startFloor(){
  const area=AREAS[g.areaIdx],fd=area.floors[g.floor];g.enemies=[];
  for(const gr of fd){const t=MONSTER_DB[gr.m];if(!t)continue;const sc=1+g.areaIdx*.5+g.floor*.12;
    for(let i=0;i<(gr.n||1);i++){const m={...t};m.mhp=Math.ceil(m.mhp*sc);m.hp=m.mhp;
      m.dmg=Math.ceil(m.dmg*sc);m.arm=Math.ceil(m.arm*sc);m.atkTimer=m.spd+Math.random()*20;
      m.dmgFlash=0;m.deathTimer=0;m.mod=gr.mod||null;m.boss=!!gr.boss;
      if(m.mod==="powerful"){m.dmg=Math.ceil(m.dmg*1.5);m.mhp=Math.ceil(m.mhp*1.3);m.hp=m.mhp;}
      if(m.mod==="poison")m.poisonDmg=Math.ceil(m.dmg*.15);
      if(m.mod==="shielding")m.shielding=true;
      g.enemies.push(m);}}
  g.player.atkTimer=AREAS[g.areaIdx]?.tutorial?120:g.player.spd;g.player.target=0;g.player.atkCount=0;
  g.player.resUsed=false;g.player.revUsed=false;
  log(`Floor ${g.floor+1}/${area.floors.length}`);
  // Tutorial messages
  if(area.tutorial){
    g.tutPaused=true;g.player.atkTimer=999;
    if(g.floor===0){log("📖 Click the enemy to start fighting!");log("📖 Welcome! Combat is automatic, but YOU choose which enemy to target.");}
    if(g.floor===1){log("📖 Click an enemy to begin!");log("📖 Tip: After battle, press [≡] to see your stats and equip items you find.");}
    if(g.floor===2){log("📖 Click to start the boss!");log("📖 Tip: Hold SHIFT and hover items to compare with equipped gear!");log("📖 Tip: Use [⚒] Forge to dismantle unwanted items for rewards and new equip slots!");}
  }
  g.tab=TAB.BATTLE;
}

// ══════ COMBAT ══════
function calcDmg(a,d){return Math.max(1,a-Math.floor(a/Math.pow(2,a/Math.max(d,1))));}
function updateBattle(dt){
  if(g.tab!==TAB.BATTLE)return;if(g.tutPaused)return;const p=g.player;
  const alive=g.enemies.filter(e=>e.hp>0);if(!alive.length){floorCleared();return;}
  const eArm=p.arm+(alive.length===1&&p.irn>0?Math.round(p.arm*p.irn/100):0);
  const eDmg=p.dmg+(alive.length>=3&&p.ods>0?Math.round(p.dmg*p.ods/100):0);
  if(p.hpr>0&&p.hp>0)p.hp=Math.min(p.mhp,p.hp+p.hpr/60*dt);
  p.atkTimer-=dt;
  if(p.atkTimer<=0){
    if(!g.autoAtk){g.manualReady=true;p.atkTimer=0;}
    else{p.atkTimer=p.spd;p.atkCount++;
      let mul=1,hitAll=false;
      if(p.cri>0&&p.atkCount%p.cri===0)mul=2;
      if(p.swp>0&&p.atkCount%p.swp===0)hitAll=true;
      const tgt=alive[Math.min(p.target,alive.length-1)];
      const targets=hitAll?alive:[tgt];
      for(const t of targets){const raw=Math.round(eDmg*mul);const d=calcDmg(raw,t.shielding&&alive.length>1?t.arm*2:t.arm);
        t.hp=Math.max(0,t.hp-d);t.dmgFlash=15;addP(t,`-${d}`,mul>1?"#ffd700":"#ff6b6b");
        if(p.lfl>0)p.hp=Math.min(p.mhp,p.hp+d*p.lfl/100);
        if(p.spl>0&&!hitAll){for(const nb of alive.filter(x=>x!==t)){const sd=Math.max(1,Math.round(d*p.spl/100));nb.hp=Math.max(0,nb.hp-sd);nb.dmgFlash=8;}}}
    }
  }
  // Process deaths (always runs, not just on attack)
  for(const m of alive){if(m.hp<=0&&m.deathTimer===0){m.deathTimer=20;g.totalKills++;g.statPts++;
      let xpGain=(m.xp||5)*2;
      if(p.dblXp>0&&Math.random()*100<p.dblXp){xpGain*=2;log("💰 Double XP!");}
      g.player.xp=(g.player.xp||0)+xpGain;
      while(g.player.xp>=xpNeed(g.lvl)){g.player.xp-=xpNeed(g.lvl);g.lvl++;g.statPts+=2;if(g.lvl%2===0)g.passivePts++;
        log(`⬆ Level ${g.lvl}! +2 stat, ${g.lvl%2===0?'+1 skill':''}`);recalc();g.player.hp=g.player.mhp;
        if(g.autoLevelOn)autoLevelStats();}
      const dropChance=(m.boss?.98:AREAS[g.areaIdx]?.tutorial?.80:.55)+(p.dropBonus||0)/100;
      if(Math.random()<dropChance&&g.inv.length<20){
        // Chance for unique item from bosses in area 4+
        let it;
        if(m.boss&&g.areaIdx>=4&&Math.random()<0.25){
          const eligible=UNIQUE_ITEMS.filter(u=>u.lvl<=g.areaIdx+1);
          if(eligible.length>0){it={...eligible[Math.floor(Math.random()*eligible.length)]};it.typeIdx=it.slot;}
          else it=genItem(g.areaIdx+1);
        }else it=genItem(g.areaIdx+1);g.inv.push(it);log(`${it.icon} ${it.rarName} ${it.name}!`);
        // Luck: bonus item chance
        if(p.bonusItem>0&&Math.random()*100<p.bonusItem&&g.inv.length<20){
          const bonus=genItem(g.areaIdx+1);g.inv.push(bonus);log(`🍀 ${bonus.icon} Bonus ${bonus.rarName} ${bonus.name}!`);}
        if(g.autoEquipOn)autoEquipBest();}
      const na=g.enemies.filter(e=>e.hp>0);if(na.length>0)g.player.target=Math.min(g.player.target,na.length-1);}}
  for(const e of alive){if(e.hp<=0)continue;e.atkTimer-=dt;e.dmgFlash=Math.max(0,e.dmgFlash-dt*.8);
    if(e.atkTimer<=0){e.atkTimer=e.spd;const d=calcDmg(e.dmg,eArm);
      if(p.es>0)p.es=Math.max(0,p.es-d);else p.hp=Math.max(0,p.hp-d);
      addP({_px:W/2,_py:MID-40},`-${d}`,"#ffd700");
      if(e.poisonDmg&&p.es<=0){p.hp=Math.max(0,p.hp-e.poisonDmg);addP({_px:W/2+20,_py:MID-50},`☠${e.poisonDmg}`,"#9c27b0");}
      if(p.hp>0&&p.hp<p.mhp*.4&&p.res>0&&!p.resUsed){p.resUsed=true;p.hp+=p.mhp*p.res/100;log("🔥 Last Stand!");}
      if(p.hp<=0){if(p.rev>0&&!p.revUsed){p.revUsed=true;p.hp=p.mhp*p.rev/100;log("💀 Revived!");
        for(const en of alive)en.atkTimer=Math.max(en.atkTimer,120);}
        else{g.tab=TAB.DEFEAT;log("💀 Defeated!");}}}}
  g.enemies.forEach(e=>{if(e.hp<=0&&e.deathTimer>0)e.deathTimer-=dt;});
}
function floorCleared(){
  const a=AREAS[g.areaIdx];g.floor++;
  g.player.hp=Math.min(g.player.mhp,Math.ceil(g.player.hp+g.player.mhp*.15));
  g.player.es=Math.round(g.player.mhp*g.player.mes/100);
  if(g.floor>=a.floors.length){const isNewClear=g.areaIdx+1>g.areasCleared;g.areasCleared=Math.max(g.areasCleared,g.areaIdx+1);g._mapViewArea=g.areasCleared;g.totalCoins+=(g.areaIdx+1)*15;
    if(isNewClear){g.passivePts++;log("✦ +1 skill point for clearing a new world!");}
    g.tab=TAB.VICTORY;log(`🏆 ${a.name} cleared!`);
    if(a.tutorial){
      log("📖 Tutorial complete! You now know the basics:");
      log("📖 • Click enemies to target them");
      log("📖 • [≡] Stats: Spend points & equip items");
      log("📖 • [⚒] Forge: Dismantle items for rewards");
      log("📖 • [✦] Skills: Unlock passive abilities");
    }}
  else startFloor();
}

// ══════ FORGE ══════
function forgeItem(idx){
  if(idx<0||idx>=g.inv.length)return;const it=g.inv[idx];g.inv.splice(idx,1);
  let pts=(it.rarity||0)+1;
  if(g.player.forgeBonus>0)pts=Math.ceil(pts*(1+g.player.forgeBonus/100));
  g.forgeProg+=pts;log(`🔨 +${pts} forge`);
  for(const ms of FORGE_MS){if(g.forgeProg>=ms.at&&g.forgeProg-pts<ms.at){
    if(ms.r==="stat"){g.statPts+=ms.n;log(`🔨 +${ms.n} stat pts!`);}
    if(ms.r==="passive"){g.passivePts+=ms.n;log(`🔨 +${ms.n} skill pts!`);}
    if(ms.r==="slot"&&ms.s<g.slots.length){g.slots[ms.s]=true;log(`🔨 Unlocked ${ITEM_TYPES[ms.s].name}!`);}}}
}

// ══════ PARTICLES ══════
function addP(e,text,col){_particles.push({x:(e._px||320)+(Math.random()-.5)*24,y:(e._py||120)-10,text,col,born:Date.now(),life:700});}
function log(m){g.log.unshift(m);if(g.log.length>8)g.log.pop();}

// ══════ RENDERING ══════
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
function cell(c,x,y,s,filled,borderCol){c.fillStyle=filled?"#1a1a2a":"#0a0a14";c.strokeStyle=borderCol||"#2a2a3a";c.lineWidth=1;
  rr(c,x,y,s,s,3);c.fill();rr(c,x,y,s,s,3);c.stroke();}
function bar(c,x,y,w,h,pct,col){c.fillStyle="#111";rr(c,x,y,w,h,2);c.fill();
  if(pct>0){c.fillStyle=col;rr(c,x,y,Math.max(2,w*Math.min(1,pct)),h,2);c.fill();}}

function render(ctx){
  // Background
  ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
  // Top panel border
  ctx.strokeStyle="#bbb";ctx.lineWidth=2;ctx.strokeRect(4,4,W-8,MID-8);
  // Bottom panel border
  ctx.strokeRect(4,MID+4,W-8,H-MID-8);

  // ─── TOP PANEL ───
  renderTopPanel(ctx);

  // ─── NAV BUTTONS (bottom-right of top panel) ───
  renderNav(ctx);

  // ─── BOTTOM PANEL (persistent) ───
  renderBottomPanel(ctx);

  // ─── PARTICLES ───
  const now=Date.now();
  _particles=_particles.filter(p=>{const a=now-p.born;if(a>p.life)return false;const pr=a/p.life;
    ctx.globalAlpha=1-pr;ctx.fillStyle=p.col;ctx.font=`bold ${14+(1-pr)*6}px Nunito,sans-serif`;ctx.textAlign="center";
    ctx.fillText(p.text,p.x,p.y-pr*30);ctx.globalAlpha=1;return true;});

  // ─── TOOLTIP ───
  if(_tooltip){ctx.fillStyle="rgba(0,0,0,0.92)";ctx.strokeStyle="#aaa";ctx.lineWidth=1;
    const tw=_tooltip.wide?220:180,th=_tooltip.lines.length*15+12;const tx=Math.min(_tooltip.x,W-tw-8),ty=Math.max(_tooltip.y-th,8);
    rr(ctx,tx,ty,tw,th,4);ctx.fill();rr(ctx,tx,ty,tw,th,4);ctx.stroke();
    ctx.font="11px Nunito,sans-serif";ctx.textAlign="left";
    _tooltip.lines.forEach((l,i)=>{
      if(i===0)ctx.fillStyle=_tooltip.col||"#fff";
      else if(l.includes("▲"))ctx.fillStyle="#4caf50";
      else if(l.includes("▼"))ctx.fillStyle="#e04858";
      else if(l.startsWith("───"))ctx.fillStyle="#666";
      else ctx.fillStyle="#aaa";
      ctx.fillText(l,tx+6,ty+14+i*15);});}
}

function renderNav(ctx){
  const labels=["M","≡","⚒","✦","⚙"];const tabs=[TAB.MAP,TAB.STATS,TAB.FORGE,TAB.SKILLS,TAB.SETTINGS];
  g._nav=[];
  for(let i=0;i<5;i++){const x=W-220+i*42,y=MID-36;const active=g.tab===tabs[i];
    ctx.fillStyle=active?"#2a3a2a":"#111";ctx.strokeStyle=active?"#4caf50":"#bbb";ctx.lineWidth=active?2:1;
    rr(ctx,x,y,34,28,3);ctx.fill();rr(ctx,x,y,34,28,3);ctx.stroke();
    ctx.fillStyle=active?"#4caf50":"#ccc";ctx.font="bold 15px Nunito,sans-serif";ctx.textAlign="center";
    ctx.fillText(labels[i],x+17,y+19);
    g._nav.push({x,y,w:34,h:28,tab:tabs[i]});}
}

function renderTopPanel(ctx){
  const t=g.tab;
  if(t===TAB.MAP)renderMap(ctx);
  else if(t===TAB.STATS)renderStats(ctx);
  else if(t===TAB.FORGE)renderForge(ctx);
  else if(t===TAB.SKILLS)renderSkills(ctx);
  else if(t===TAB.SETTINGS)renderSettings(ctx);
  else if(t===TAB.BATTLE)renderBattle(ctx);
  else if(t===TAB.VICTORY)renderEnd(ctx,"🏆 Area Cleared!","#4caf50");
  else if(t===TAB.DEFEAT)renderEnd(ctx,"💀 Defeated!","#e04858");
}

// ─── MAP ───
function renderMap(ctx){
  const AREA_BG=[
    ["📖","✏️","🎯","⭐","📖","✏️","🎯","⭐","📖","✏️","🎯","⭐","📖","✏️","🎯"],
    ["🪨","🌿","🍃","🌱","🪵","🍀","🌿","🪨","🍃","🌱","🪵","🍀","🌿","🪨","🍃"],
    ["🧊","❄️","💎","🔷","❄️","🧊","💎","❄️","🔷","🧊","❄️","💎","🔷","❄️","🧊"],
    ["🔥","🌋","💥","🟠","🔥","🌋","💥","🔥","🟠","🌋","🔥","💥","🟠","🔥","🌋"],
    ["👁️","🌑","💜","🟣","🌑","👁️","💜","🌑","🟣","👁️","🌑","💜","🟣","🌑","👁️"],
    ["💀","☠️","⚫","🖤","💀","☠️","⚫","💀","🖤","☠️","💀","⚫","🖤","💀","☠️"],
    ["💎","🔮","💠","🪨","💎","🔮","💠","💎","🪨","🔮","💎","💠","🪨","💎","🔮"],
    ["🌊","🐚","🪸","🫧","🌊","🐚","🪸","🌊","🫧","🐚","🌊","🪸","🫧","🌊","🐚"],
    ["🐸","🌿","☠️","🧪","🐸","🌿","☠️","🐸","🧪","🌿","🐸","☠️","🧪","🐸","🌿"],
    ["⚙️","🔩","🔧","🛠️","⚙️","🔩","🔧","⚙️","🛠️","🔩","⚙️","🔧","🛠️","⚙️","🔩"],
    ["⛈️","⚡","🌪️","🌩️","⛈️","⚡","🌪️","⛈️","🌩️","⚡","⛈️","🌪️","🌩️","⛈️","⚡"],
    ["💀","🦴","⚰️","🪦","💀","🦴","⚰️","💀","🪦","🦴","💀","⚰️","🪦","💀","🦴"],
    ["🌳","🍃","🌸","🍄","🌳","🍃","🌸","🌳","🍄","🍃","🌳","🌸","🍄","🌳","🍃"],
    ["🌋","🔥","🟠","🟥","🌋","🔥","🟠","🌋","🟥","🔥","🌋","🟠","🟥","🌋","🔥"],
    ["✨","💜","🌀","💫","✨","💜","🌀","✨","💫","💜","✨","🌀","💫","✨","💜"],
    ["🐉","🔥","💰","🏔️","🐉","🔥","💰","🐉","🏔️","🔥","🐉","💰","🏔️","🐉","🔥"],
    ["⛪","💜","😈","🕯️","⛪","💜","😈","⛪","🕯️","💜","⛪","😈","🕯️","⛪","💜"],
    ["🌊","🐙","🌀","🫧","🌊","🐙","🌀","🌊","🫧","🐙","🌊","🌀","🫧","🌊","🐙"],
    ["⭐","🌟","✨","☀️","⭐","🌟","✨","⭐","☀️","🌟","⭐","✨","☀️","⭐","🌟"],
    ["🃏","🎲","🎰","🎪","🃏","🎲","🎰","🃏","🎪","🎲","🃏","🎰","🎪","🃏","🎲"],
    ["🦠","👁️","🧬","🔬","🦠","👁️","🧬","🦠","🔬","👁️","🦠","🧬","🔬","🦠","👁️"],
    ["🔨","⚒️","🛠️","⚙️","🔨","⚒️","🛠️","🔨","⚙️","⚒️","🔨","🛠️","⚙️","🔨","⚒️"],
    ["😱","👻","🌑","🕷️","😱","👻","🌑","😱","🕷️","👻","😱","🌑","🕷️","😱","👻"],
    ["💫","⭐","🌠","☄️","💫","⭐","🌠","💫","☄️","⭐","💫","🌠","☄️","💫","⭐"],
    ["♾️","🌀","🔮","⚫","♾️","🌀","🔮","♾️","⚫","🌀","♾️","🔮","⚫","♾️","🌀"],
    ["🕳️","⬛","💀","☠️","🕳️","⬛","💀","🕳️","☠️","⬛","🕳️","💀","☠️","🕳️","⬛"],
  ];
  const AREA_EMOJI=["📚","🌿","❄️","🔥","👁️","💀","💎","🌊","🐸","⚙️","⛈️","💀","🌳","🌋","✨","🐉","⛪","🌊","⭐","🃏","🦠","🔨","😱","💫","♾️","🕳️"];
  const currentArea=Math.max(0,Math.min(g._mapViewArea||0,g.areasCleared,AREAS.length-1));
  const a=AREAS[currentArea];
  // Themed emoji background (scattered, faded)
  const bgEmojis=AREA_BG[currentArea]||AREA_BG[0];
  ctx.globalAlpha=0.14;ctx.font="26px serif";ctx.textAlign="center";
  const tileH=50,cols=11;
  const totalScroll=Date.now()/30;
  const scrollOff=totalScroll%tileH;
  const rowShift=Math.floor(totalScroll/tileH);
  for(let row=-1;row<8;row++){
    const y=row*tileH-scrollOff;
    if(y<-40||y>MID+10)continue;
    for(let col=0;col<cols;col++){
      const ri=((row+rowShift)%50+50)%50;
      const ei=(ri*cols+col)%bgEmojis.length;
      const x=30+col*70+(ri%2)*35;
      ctx.fillText(bgEmojis[ei],x,y);}}
  ctx.globalAlpha=1;
  // Area number / total
  ctx.fillStyle="#8ec8e8";ctx.font="bold 14px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`⚔️ World Map — Area ${currentArea+1} of ${AREAS.length}`,W/2,24);
  // Main area card (large, centered)
  const cx=W/2,cy=120,cw=340,ch=130;
  ctx.fillStyle=a.color;rr(ctx,cx-cw/2,cy-ch/2,cw,ch,14);ctx.fill();
  ctx.strokeStyle="#8ec8e8";ctx.lineWidth=3;rr(ctx,cx-cw/2,cy-ch/2,cw,ch,14);ctx.stroke();
  // Area emoji (big)
  ctx.font="48px serif";ctx.fillText(AREA_EMOJI[currentArea]||"⚔️",cx,cy-10);
  // Area name
  ctx.fillStyle="#fff";ctx.font="bold 22px Nunito,sans-serif";ctx.fillText(a.name,cx,cy+28);
  // Floor count
  ctx.fillStyle="#ccc";ctx.font="14px Nunito,sans-serif";
  const cleared=currentArea<g.areasCleared;
  ctx.fillText(cleared?"✓ Cleared — Click to replay":`${a.floors.length} floors — Click to enter`,cx,cy+48);
  g._areas=[{x:cx-cw/2,y:cy-ch/2,w:cw,h:ch,idx:currentArea,unlocked:true}];
  // ── Sliding carousel: show max 7 dots, centered on currentArea ──
  const dotY=MID-50,DOT_R=10,DOT_GAP=36,MAX_VISIBLE=7;
  const halfVis=Math.floor(MAX_VISIBLE/2);
  // Determine visible range
  let dotStart=Math.max(0,currentArea-halfVis);
  let dotEnd=dotStart+MAX_VISIBLE-1;
  if(dotEnd>=AREAS.length){dotEnd=AREAS.length-1;dotStart=Math.max(0,dotEnd-MAX_VISIBLE+1);}
  const visCount=dotEnd-dotStart+1;
  const totalDotsW=visCount*DOT_GAP;
  const dotBaseX=W/2-(totalDotsW-DOT_GAP)/2;
  g._dotBtns=[];
  for(let i=dotStart;i<=dotEnd;i++){
    const dx=dotBaseX+(i-dotStart)*DOT_GAP;
    const isCurrent=i===currentArea;
    const isCleared=i<g.areasCleared;
    const isLocked=i>g.areasCleared;
    // Draw dot
    ctx.beginPath();ctx.arc(dx,dotY,isCurrent?DOT_R+2:DOT_R,0,Math.PI*2);
    ctx.fillStyle=isCleared?"#4caf50":isCurrent?"#8ec8e8":isLocked?"#222":"#555";ctx.fill();
    if(isCurrent){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();}
    // Dot number
    ctx.fillStyle=isLocked?"#444":"#fff";ctx.font=`${isCurrent?"bold 10":"8"}px Nunito,sans-serif`;ctx.textAlign="center";
    ctx.fillText(i+1,dx,dotY+3);
    // Clickable area for unlocked dots
    if(!isLocked)g._dotBtns.push({x:dx-DOT_R,y:dotY-DOT_R,w:DOT_R*2,h:DOT_R*2,idx:i});
  }
  // Scroll arrows for carousel (fade-in indicators that more areas exist)
  if(dotStart>0){
    ctx.fillStyle="rgba(255,255,255,0.4)";ctx.font="bold 16px sans-serif";ctx.textAlign="center";
    ctx.fillText("‹",dotBaseX-24,dotY+5);
    ctx.fillStyle="#666";ctx.font="9px Nunito,sans-serif";
    ctx.fillText(`+${dotStart}`,dotBaseX-24,dotY+18);
  }
  if(dotEnd<AREAS.length-1){
    const lastX=dotBaseX+(visCount-1)*DOT_GAP;
    ctx.fillStyle="rgba(255,255,255,0.4)";ctx.font="bold 16px sans-serif";ctx.textAlign="center";
    ctx.fillText("›",lastX+24,dotY+5);
    ctx.fillStyle="#666";ctx.font="9px Nunito,sans-serif";
    ctx.fillText(`+${AREAS.length-1-dotEnd}`,lastX+24,dotY+18);
  }
  // Stats
  ctx.fillStyle="#ccc";ctx.font="12px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`Lv.${g.lvl} | Kills:${g.totalKills} | Coins:${g.totalCoins}`,W/2,MID-28);
  // XP bar
  const xpPct=g.player.xp/xpNeed(g.lvl);
  bar(ctx,W/2-100,MID-22,200,8,xpPct,"#8ec8e8");
  ctx.fillStyle="#aaa";ctx.font="8px Nunito,sans-serif";
  ctx.fillText(`XP ${g.player.xp}/${xpNeed(g.lvl)}`,W/2,MID-11);
  // Nav arrows (big, for main card)
  g._mapNav=[];
  if(currentArea>0){
    ctx.fillStyle="rgba(255,255,255,0.15)";rr(ctx,20,cy-20,40,40,8);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="bold 20px sans-serif";ctx.textAlign="center";ctx.fillText("◀",40,cy+6);
    g._mapNav.push({x:20,y:cy-20,w:40,h:40,dir:-1});
  }
  if(currentArea<g.areasCleared&&currentArea<AREAS.length-1){
    ctx.fillStyle="rgba(255,255,255,0.15)";rr(ctx,W-60,cy-20,40,40,8);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="bold 20px sans-serif";ctx.textAlign="center";ctx.fillText("▶",W-40,cy+6);
    g._mapNav.push({x:W-60,y:cy-20,w:40,h:40,dir:1});
  }
}

// ─── STATS ───
function renderStats(ctx){
  const rows=[
    {key:"mhp",label:"Max Life",val:g.player.mhp,per:"+5 HP"},
    {key:"dmg",label:"Damage",val:g.player.dmg,per:"+2 Damage"},
    {key:"arm",label:"Armor",val:g.player.arm,per:"+2 Armor"},
    {key:"spd",label:"Atk Speed",val:g.player.spd,per:"-3 (faster)"},
  ];
  g._statBtns=[];
  rows.forEach((r,i)=>{
    const y=20+i*46;
    ctx.fillStyle="#ddd";ctx.font="bold 16px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(r.label,24,y+20);
    ctx.textAlign="right";ctx.fillText(r.val,W-80,y+20);
    if(g.statPts>0){
      const bx=W-60,by=y+4;
      ctx.fillStyle="#1a3a1a";ctx.strokeStyle="#4caf50";ctx.lineWidth=2;
      rr(ctx,bx,by,28,28,4);ctx.fill();rr(ctx,bx,by,28,28,4);ctx.stroke();
      ctx.fillStyle="#4caf50";ctx.font="bold 18px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText("+",bx+14,by+21);
      g._statBtns.push({x:bx,y:by,w:28,h:28,key:r.key});
    }
  });
  ctx.fillStyle="#aaa";ctx.font="13px Nunito,sans-serif";ctx.textAlign="left";
  ctx.fillText(`${g.statPts} point${g.statPts!==1?"s":""}`,24,MID-44);
}

// ─── FORGE ───
function renderForge(ctx){
  ctx.fillStyle="#ff9800";ctx.font="bold 16px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("The Forge",W/2,30);
  // Progress bar
  const nextMs=FORGE_MS.find(m=>m.at>g.forgeProg);
  const prevAt=FORGE_MS.filter(m=>m.at<=g.forgeProg).pop()?.at||0;
  const nextAt=nextMs?.at||g.forgeProg+10;
  // Milestone icon (left)
  ctx.fillStyle="#222";rr(ctx,20,44,40,40,4);ctx.fill();ctx.strokeStyle="#999";rr(ctx,20,44,40,40,4);ctx.stroke();
  ctx.fillStyle="#ff9800";ctx.font="16px serif";ctx.textAlign="center";ctx.fillText("🔨",40,70);
  // Progress bar
  bar(ctx,70,54,W-160,20,(g.forgeProg-prevAt)/(nextAt-prevAt),"#2196f3");
  ctx.fillStyle="#fff";ctx.font="10px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`${g.forgeProg}/${nextAt}`,70+(W-160)/2,69);
  // Reward icon (right)
  ctx.fillStyle="#222";rr(ctx,W-60,44,40,40,4);ctx.fill();ctx.strokeStyle="#999";rr(ctx,W-60,44,40,40,4);ctx.stroke();
  ctx.fillStyle="#4caf50";ctx.font="14px serif";ctx.textAlign="center";ctx.fillText("✦",W-40,70);
  // Next reward
  ctx.fillStyle="#ddd";ctx.font="13px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(nextMs?`Next: ${nextMs.d}`:"All rewards claimed!",W/2,100);
  // Instructions
  ctx.fillStyle="#aaa";ctx.font="11px Nunito,sans-serif";
  ctx.fillText("Click items in inventory below to dismantle them.",W/2,125);
  ctx.fillText("Dismantle enough to claim rewards!",W/2,140);
  // Show milestones
  ctx.font="9px Nunito,sans-serif";ctx.textAlign="left";
  FORGE_MS.forEach((ms,i)=>{const x=20+(i%5)*124,y=155+Math.floor(i/5)*16;
    ctx.fillStyle=g.forgeProg>=ms.at?"#4caf50":"#bbb";
    ctx.fillText(`${g.forgeProg>=ms.at?"✓":"○"} ${ms.at}: ${ms.d}`,x,y+10);});
}

// ─── SKILLS ───
function renderSkills(ctx){
  ctx.fillStyle="#e040fb";ctx.font="bold 16px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`✦ Skill Tree (${g.passivePts} points)`,W/2,24);
  // Branch tab definitions
  const branches=[
    {key:"hp",label:"❤️ Vitality",color:"#4caf50",hoverCol:"#2a4a2a",startIdx:0},
    {key:"atk",label:"⚔️ Power",color:"#e04858",hoverCol:"#4a2a2a",startIdx:5},
    {key:"def",label:"🛡️ Defense",color:"#2196f3",hoverCol:"#2a2a4a",startIdx:10},
    {key:"lck",label:"🍀 Luck",color:"#ffd700",hoverCol:"#3a3a1a",startIdx:15},
  ];
  if(!g._skillBranch)g._skillBranch="hp";
  // Draw tab buttons
  g._skillTabs=[];
  const tabW=Math.floor((W-20)/branches.length),tabH=28,tabY=34;
  branches.forEach((br,i)=>{
    const tx=10+i*tabW;
    const selected=g._skillBranch===br.key;
    ctx.fillStyle=selected?br.hoverCol:"#0a0a14";
    ctx.strokeStyle=selected?br.color:"#2a2a3a";
    ctx.lineWidth=selected?2:1;
    rr(ctx,tx,tabY,tabW-4,tabH,6);ctx.fill();rr(ctx,tx,tabY,tabW-4,tabH,6);ctx.stroke();
    ctx.fillStyle=selected?br.color:"#888";ctx.font=`${selected?"bold ":""}12px Nunito,sans-serif`;ctx.textAlign="center";
    ctx.fillText(br.label,tx+(tabW-4)/2,tabY+19);
    // Count active skills in branch
    let active=0;for(let t=0;t<5;t++)if(g.activePassives.has(br.startIdx+t))active++;
    if(active>0){ctx.fillStyle=br.color;ctx.font="bold 9px Nunito,sans-serif";ctx.fillText(`${active}/5`,tx+tabW-16,tabY+12);}
    g._skillTabs.push({x:tx,y:tabY,w:tabW-4,h:tabH,branch:br.key});
  });
  // Draw selected branch skills
  const br=branches.find(b=>b.key===g._skillBranch)||branches[0];
  g._skillBtns=[];
  const nodeW=W-40,nodeH=42,nodeX=20,startY=72,gap=6;
  // Draw connecting line
  ctx.strokeStyle="#333";ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(W/2,startY+nodeH/2);ctx.lineTo(W/2,startY+4*(nodeH+gap)+nodeH/2);ctx.stroke();
  for(let t=0;t<5;t++){
    const idx=br.startIdx+t;const ps=PASSIVES[idx];if(!ps)continue;
    const sy=startY+t*(nodeH+gap);
    const active=g.activePassives.has(idx);
    const reqMet=ps.req===-1||g.activePassives.has(ps.req);
    const canLearn=reqMet&&g.passivePts>0&&!active;
    const locked=!reqMet&&!active;
    // Node background
    ctx.fillStyle=active?br.hoverCol:locked?"#0a0a10":"#111";
    ctx.strokeStyle=active?br.color:locked?"#1a1a2a":"#2a2a3a";
    ctx.lineWidth=active?2:1;
    rr(ctx,nodeX,sy,nodeW,nodeH,8);ctx.fill();rr(ctx,nodeX,sy,nodeW,nodeH,8);ctx.stroke();
    if(locked){ctx.globalAlpha=0.5;}
    // Tier indicator
    ctx.fillStyle=active?br.color:locked?"#333":"#666";ctx.font="bold 9px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(`T${t+1}`,nodeX+8,sy+14);
    // Icon
    ctx.font="22px serif";ctx.textAlign="center";ctx.fillText(ps.icon,nodeX+46,sy+30);
    // Name
    ctx.fillStyle=active?"#fff":locked?"#555":"#ddd";ctx.font="bold 14px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(ps.name,nodeX+68,sy+18);
    // Desc
    ctx.fillStyle=active?"#aaa":locked?"#444":"#999";ctx.font="12px Nunito,sans-serif";
    ctx.fillText(ps.desc,nodeX+68,sy+34);
    // Active indicator
    if(active){ctx.fillStyle=br.color;ctx.beginPath();ctx.arc(nodeX+nodeW-16,sy+nodeH/2,6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#000";ctx.font="bold 9px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText("✓",nodeX+nodeW-16,sy+nodeH/2+3);}
    // LEARN indicator
    if(canLearn&&!active){ctx.fillStyle="#ffd700";ctx.font="bold 10px Nunito,sans-serif";ctx.textAlign="right";ctx.fillText("⬆ LEARN",nodeX+nodeW-8,sy+16);}
    // Locked icon
    if(locked){ctx.fillStyle="#666";ctx.font="14px serif";ctx.textAlign="right";ctx.fillText("🔒",nodeX+nodeW-10,sy+28);}
    ctx.globalAlpha=1;
    g._skillBtns.push({x:nodeX,y:sy,w:nodeW,h:nodeH,idx});
  }
}

// ─── SETTINGS ───
function renderSettings(ctx){
  ctx.fillStyle="#aaa";ctx.font="bold 16px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("⚙ Settings",W/2,28);
  g._setBtns=[];
  const toggles=[
    {label:"Auto-Attack",key:"autoAtk",val:g.autoAtk,y:48,desc:"Attacks automatically when timer fills",offDesc:"Click enemies to trigger each attack"},
    {label:"Auto-Equip",key:"autoEquipOn",val:g.autoEquipOn,y:100,desc:"Automatically equips best items when found",offDesc:"Manually equip items from inventory"},
    {label:"Auto-Level",key:"autoLevelOn",val:g.autoLevelOn,y:152,desc:"Auto-spends stat points (Life>Dmg>Armor>Spd)",offDesc:"Manually allocate stat points"},
  ];
  toggles.forEach(t=>{
    const bx=40,bw=W-80,bh=42;
    ctx.fillStyle="#1a1a2a";ctx.strokeStyle="#3a3a4a";ctx.lineWidth=1;
    rr(ctx,bx,t.y,bw,bh,6);ctx.fill();rr(ctx,bx,t.y,bw,bh,6);ctx.stroke();
    // Toggle switch
    const sx=bx+bw-60,sy=t.y+8,sw=48,sh=24;
    ctx.fillStyle=t.val?"#4caf50":"#333";rr(ctx,sx,sy,sw,sh,12);ctx.fill();
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(t.val?sx+sw-12:sx+12,sy+12,9,0,Math.PI*2);ctx.fill();
    // Label
    ctx.fillStyle="#fff";ctx.font="bold 13px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(t.label,bx+14,t.y+18);
    ctx.fillStyle=t.val?"#8c8":"#888";ctx.font="10px Nunito,sans-serif";
    ctx.fillText(t.val?t.desc:t.offDesc,bx+14,t.y+34);
    g._setBtns.push({x:bx,y:t.y,w:bw,h:bh,key:t.key,isToggle:true});
  });
  // Reset button (not a toggle)
  const ry=220;
  ctx.fillStyle="#2a1010";ctx.strokeStyle="#e04858";ctx.lineWidth=1;
  rr(ctx,W/2-100,ry,200,40,6);ctx.fill();rr(ctx,W/2-100,ry,200,40,6);ctx.stroke();
  ctx.fillStyle="#f88";ctx.font="bold 13px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("⚠ Reset Progress",W/2,ry+18);
  ctx.fillStyle="#a66";ctx.font="10px Nunito,sans-serif";
  ctx.fillText("Wipes all dungeon progress",W/2,ry+34);
  g._setBtns.push({x:W/2-100,y:ry,w:200,h:40,key:"reset"});
}

// ─── BATTLE ───
function renderBattle(ctx){
  const a=AREAS[g.areaIdx],p=g.player;
  // Background gradient
  const gr=ctx.createLinearGradient(0,8,0,MID-4);gr.addColorStop(0,a.color);gr.addColorStop(1,"#080810");
  ctx.fillStyle=gr;ctx.fillRect(8,8,W-16,MID-16);
  // Floor info
  ctx.fillStyle="#fff";ctx.font="bold 12px Nunito,sans-serif";ctx.textAlign="left";
  ctx.fillText(`${a.name} — Floor ${g.floor+1}/${a.floors.length}`,16,24);
  // Enemies
  const alive=g.enemies.filter(e=>e.hp>0);
  g._eBtns=[];
  alive.forEach((e,i)=>{
    const ex=W/2+(i-(alive.length-1)/2)*120;const ey=e.boss?70:90;const sz=e.boss?50:36;
    e._px=ex;e._py=ey;
    ctx.fillStyle="rgba(0,0,0,.3)";ctx.beginPath();ctx.ellipse(ex,ey+sz/2+4,sz/2,5,0,0,Math.PI*2);ctx.fill();
    ctx.font=`${sz}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(e.emoji,ex,ey);
    if(e.dmgFlash>0){ctx.globalAlpha=e.dmgFlash/15*.5;ctx.fillStyle="#fff";ctx.fillRect(ex-sz/2,ey-sz/2,sz,sz);ctx.globalAlpha=1;}
    ctx.textBaseline="alphabetic";
    bar(ctx,ex-30,ey+sz/2+2,60,5,e.hp/e.mhp,e.hp/e.mhp>.5?"#4caf50":e.hp/e.mhp>.25?"#f5a623":"#e04858");
    bar(ctx,ex-30,ey+sz/2+9,60,3,1-e.atkTimer/e.spd,"#ff5555");
    ctx.fillStyle="#bbb";ctx.font="9px Nunito,sans-serif";ctx.textAlign="center";
    let lbl=e.name;if(e.mod)lbl=`[${e.mod}]${e.name}`;
    ctx.fillText(`${lbl} ${Math.round(e.hp)}`,ex,ey+sz/2+22);
    if(i===Math.min(p.target,alive.length-1)){ctx.fillStyle="#ffd700";ctx.font="10px sans-serif";ctx.fillText("▼",ex,ey-sz/2-6);}
    g._eBtns.push({x:ex-sz/2-8,y:ey-sz/2-8,w:sz+16,h:sz+36,idx:i});
  });
  // Player
  ctx.font="28px serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("😎",W/2,MID-50);ctx.textBaseline="alphabetic";
  // Attack timer
  bar(ctx,W/2-40,MID-30,80,6,1-p.atkTimer/p.spd,g.manualReady?"#ffd700":"#8ec8e8");
  if(!g.autoAtk&&g.manualReady){ctx.fillStyle="#ffd700";ctx.font="bold 10px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText("CLICK TO ATTACK!",W/2,MID-36);}
  // Log (top right)
  ctx.textAlign="right";ctx.font="9px Nunito,sans-serif";
  g.log.slice(0,4).forEach((m,i)=>{ctx.globalAlpha=1-i*.22;ctx.fillStyle="#ddd";ctx.fillText(m,W-16,22+i*12);});
  ctx.globalAlpha=1;
  // Flee button
  g._fleeBt=null;
  ctx.fillStyle="rgba(180,50,50,.4)";rr(ctx,W-64,MID-30,52,22,4);ctx.fill();
  ctx.fillStyle="#f88";ctx.font="bold 10px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText("Flee",W-38,MID-15);
  g._fleeBt={x:W-64,y:MID-30,w:52,h:22};
}

// ─── END SCREENS ───
function renderEnd(ctx,title,col){
  ctx.fillStyle=col;ctx.font="bold 22px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(title,W/2,60);
  ctx.fillStyle="#aac8d8";ctx.font="14px Nunito,sans-serif";
  ctx.fillText(`Level ${g.lvl} | Kills: ${g.totalKills} | Coins: ${g.totalCoins}`,W/2,90);
  g._endBtns=[];
  // Continue
  ctx.fillStyle="#1a3a2a";rr(ctx,W/2-120,110,100,30,6);ctx.fill();
  ctx.fillStyle="#8f8";ctx.font="bold 12px Nunito,sans-serif";ctx.fillText("Continue",W/2-70,130);
  g._endBtns.push({x:W/2-120,y:110,w:100,h:30,action:"continue"});
  // Cash Out
  ctx.fillStyle="#3a1a1a";rr(ctx,W/2+20,110,100,30,6);ctx.fill();
  ctx.fillStyle="#f88";ctx.fillText("Cash Out",W/2+70,130);
  g._endBtns.push({x:W/2+20,y:110,w:100,h:30,action:"cashout"});
}

// ─── BOTTOM PANEL ───
function renderBottomPanel(ctx){
  // Exit button (bottom-left, always visible)
  g._exitBtn={x:14,y:H-42,w:50,h:28};
  ctx.fillStyle="#1a1a2a";rr(ctx,14,H-42,50,28,4);ctx.fill();
  ctx.strokeStyle="#444";ctx.lineWidth=1;rr(ctx,14,H-42,50,28,4);ctx.stroke();
  ctx.fillStyle="#f88";ctx.font="bold 10px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("← Exit",39,H-24);
  const p=g.player;
  // HP bar
  const hpW=240;
  bar(ctx,14,MID+12,hpW,16,p.hp/p.mhp,p.hp/p.mhp>.5?"#c0392b":"#e04858");
  ctx.fillStyle="#fff";ctx.font="bold 10px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`${Math.round(p.hp)}/${p.mhp}`,14+hpW/2,MID+24);
  // ES bar
  if(p.mes>0){const esMax=Math.round(p.mhp*p.mes/100);
    bar(ctx,14+hpW+6,MID+12,100,16,esMax>0?p.es/esMax:0,"#aaa");
    ctx.fillStyle="#fff";ctx.font="9px Nunito,sans-serif";ctx.fillText(`${Math.round(p.es)}`,14+hpW+56,MID+24);}
  // XP bar (tiny)
  bar(ctx,14,MID+32,hpW,4,(g.player.xp||0)/xpNeed(g.lvl),"#a78bfa");
  ctx.fillStyle="#bbb";ctx.font="8px Nunito,sans-serif";ctx.textAlign="left";
  ctx.fillText(`Lv.${g.lvl} XP:${g.player.xp||0}/${xpNeed(g.lvl)}`,14,MID+46);

  // Equipment slots (right side, column)
  g._eqSlots=[];
  const eqX=W-58;
  for(let i=0;i<6;i++){
    if(!g.slots[i]){
      // Show locked slot as dark with lock
      const ey=MID+12+i*40;
      cell(ctx,eqX,ey,36,false,"#1a1a1a");
      ctx.fillStyle="#333";ctx.font="14px serif";ctx.textAlign="center";ctx.fillText("🔒",eqX+18,ey+24);
      continue;
    }
    const ey=MID+12+i*40;const it=g.equips[i];
    cell(ctx,eqX,ey,36,!!it,it?"#2244aa":"#2a2a3a");
    if(it){ctx.font="20px serif";ctx.textAlign="center";ctx.fillText(it.icon,eqX+18,ey+26);}
    else{ctx.fillStyle="#667";ctx.font="16px serif";ctx.textAlign="center";ctx.fillText(ITEM_TYPES[i].icon,eqX+18,ey+26);}
    g._eqSlots.push({x:eqX,y:ey,w:36,h:36,slot:i});
  }

  // Inventory grid
  g._invSlots=[];
  const invCols=7,invX=14,invY=MID+54;
  for(let i=0;i<21;i++){
    const cx=invX+(i%invCols)*(CELL+PAD),cy=invY+Math.floor(i/invCols)*(CELL+PAD);
    const it=g.inv[i]||null;
    // Check if this item is equipped
    const isEquipped=it&&g.equips.some(e=>e===it);
    cell(ctx,cx,cy,CELL,!!it,isEquipped?"#2244aa":"#2a2a3a");
    if(it){
      ctx.font="22px serif";ctx.textAlign="center";ctx.fillText(it.icon,cx+CELL/2,cy+CELL/2+6);
      // Rarity dot
      ctx.fillStyle=it.rarCol;ctx.beginPath();ctx.arc(cx+CELL-6,cy+6,3,0,Math.PI*2);ctx.fill();
    }
    g._invSlots.push({x:cx,y:cy,w:CELL,h:CELL,idx:i});
  }
}

// ══════ INPUT ══════
function hit(mx,my,r){return r&&mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}

function autoEquipBest(){
  for(let slot=0;slot<6;slot++){
    if(!g.slots[slot])continue;
    const candidates=g.inv.filter(it=>it.slot===slot);
    if(!candidates.length)continue;
    // Score each item by total stats
    const score=it=>{let s=0;for(const v of Object.values(it.stats||{}))s+=Math.abs(v);return s;};
    candidates.sort((a,b)=>score(b)-score(a));
    const best=candidates[0];
    const current=g.equips[slot];
    if(!current||score(best)>score(current)){
      const old=g.equips[slot];g.equips[slot]=best;
      const idx=g.inv.indexOf(best);if(idx>=0)g.inv.splice(idx,1);
      if(old)g.inv.push(old);
    }
  }
  recalc();log("✅ Auto-equipped best items!");
}

function autoLevelStats(){
  if(g.statPts<=0){log("No stat points to spend!");return;}
  const priority=["mhp","dmg","arm","spd"];
  while(g.statPts>0){
    // Find least-spent stat (priority order for ties)
    let minKey=priority[0],minVal=g.spentStats[priority[0]];
    for(const k of priority){if(g.spentStats[k]<minVal){minVal=g.spentStats[k];minKey=k;}}
    g.spentStats[minKey]++;g.statPts--;
  }
  recalc();log("✅ Auto-leveled stats!");
}

function handleClick(mx,my,onFinish){
  _tooltip=null;
  // Exit button (always active)
  if(hit(mx,my,g._exitBtn)){
    saveGame();
    document.getElementById('dg-play-area').hidden=true;
    document.getElementById('dg-menu').hidden=false;
    return;
  }
  // Nav buttons
  for(const n of(g._nav||[])){if(hit(mx,my,n)){// Allow nav to settings/stats during battle
      if(g.tab===TAB.BATTLE&&n.tab!==TAB.BATTLE&&n.tab!==TAB.SETTINGS&&n.tab!==TAB.STATS)return;
    if(g.tab===TAB.VICTORY||g.tab===TAB.DEFEAT)return;g.tab=n.tab;return;}}
  // Top panel clicks
  if(g.tab===TAB.MAP){
    // Nav arrows
    for(const n of(g._mapNav||[])){if(hit(mx,my,n)){g._mapViewArea=(g._mapViewArea||0)+n.dir;return;}}
    // Dot carousel clicks
    for(const d of(g._dotBtns||[])){if(hit(mx,my,d)){g._mapViewArea=d.idx;return;}}
    for(const a of(g._areas||[])){if(hit(mx,my,a)&&a.unlocked)startArea(a.idx);}}
  if(g.tab===TAB.STATS){for(const b of(g._statBtns||[])){if(hit(mx,my,b)&&g.statPts>0){g.spentStats[b.key]++;g.statPts--;recalc();}}}
  if(g.tab===TAB.SKILLS){
    // Tab switching
    for(const tb of(g._skillTabs||[])){if(hit(mx,my,tb)){g._skillBranch=tb.branch;return;}}
    for(const b of(g._skillBtns||[])){if(hit(mx,my,b)){
    const ps=PASSIVES[b.idx];
    if(g.activePassives.has(b.idx)){
      // Can't unlearn if a later skill depends on this one
      const dependent=PASSIVES.findIndex((p,i)=>p.req===b.idx&&g.activePassives.has(i));
      if(dependent>=0)return;
      g.activePassives.delete(b.idx);g.passivePts++;recalc();
    } else if(g.passivePts>0){
      const reqMet=ps.req===-1||g.activePassives.has(ps.req);
      if(!reqMet)return;
      g.activePassives.add(b.idx);g.passivePts--;recalc();
    }return;}}}
  if(g.tab===TAB.SETTINGS){
    for(const b of(g._setBtns||[])){if(hit(mx,my,b)){
      if(b.key==="autoAtk"){g.autoAtk=!g.autoAtk;}
      if(b.key==="autoEquipOn"){g.autoEquipOn=!g.autoEquipOn;if(g.autoEquipOn)autoEquipBest();}
      if(b.key==="autoLevelOn"){g.autoLevelOn=!g.autoLevelOn;if(g.autoLevelOn)autoLevelStats();}
      if(b.key==="reset"){if(confirm("Reset ALL dungeon progress?")){
        localStorage.removeItem("dd_save");g=newGame();recalc();g.player.hp=g.player.mhp;g.tab=TAB.MAP;log("Progress reset!");}}
      return;}}}
  if(g.tab===TAB.BATTLE){
    for(const b of(g._eBtns||[])){if(hit(mx,my,b)){g.player.target=b.idx;
      if(!g.autoAtk&&g.manualReady){g.manualReady=false;g.player.atkTimer=g.player.spd;g.player.atkCount++;
        /* manual attack triggers immediately on next frame */}
      if(g.tutPaused){g.tutPaused=false;g.player.atkTimer=g.player.spd;log("⚔️ Battle started! Watch the blue timer bar — you attack when it fills up.");}}}
    if(hit(mx,my,g._fleeBt)){g.tab=TAB.MAP;log("Fled!");}}
  if(g.tab===TAB.VICTORY||g.tab===TAB.DEFEAT){
    for(const b of(g._endBtns||[])){if(hit(mx,my,b)){
      if(b.action==="continue"){g.player.hp=g.player.mhp;g.player.es=Math.round(g.player.mhp*g.player.mes/100);g.tab=TAB.MAP;}
      if(b.action==="cashout"){onFinish(g.totalCoins,g.areasCleared,g.totalKills);g.player.hp=g.player.mhp;g.tab=TAB.MAP;}}}}
  // Bottom panel — inventory clicks
  for(const s of(g._invSlots||[])){if(hit(mx,my,s)){
    const it=g.inv[s.idx];if(!it)return;
    if(g.tab===TAB.FORGE){forgeItem(s.idx);return;}
    // Equip: click item in inventory to equip it
    if(it.slot!==undefined){
      if(!g.slots[it.slot]){log(`🔒 ${ITEM_TYPES[it.slot].name} slot locked! Forge more items.`);return;}
      const old=g.equips[it.slot];g.equips[it.slot]=it;g.inv.splice(s.idx,1);
      if(old)g.inv.push(old);recalc();log(`✅ Equipped ${it.icon} ${it.name}`);return;}}}
  // Equipment slot clicks — unequip
  for(const s of(g._eqSlots||[])){if(hit(mx,my,s)){
    const it=g.equips[s.slot];if(!it)return;
    if(g.inv.length<20){g.equips[s.slot]=null;g.inv.push(it);recalc();log(`Unequipped ${it.icon}`);}}}
}

function handleRightClick(mx,my){
  // Right-click inventory item to dismantle
  for(const s of(g._invSlots||[])){if(hit(mx,my,s)&&g.inv[s.idx]){forgeItem(s.idx);return;}}
}

let _shiftHeld=false;
document.addEventListener("keydown",e=>{if(e.key==="Shift")_shiftHeld=true;});
document.addEventListener("keyup",e=>{if(e.key==="Shift")_shiftHeld=false;});

function handleHover(mx,my){
  _tooltip=null;
  if(!g)return;
  // Inventory tooltips
  for(const s of(g._invSlots||[])){if(hit(mx,my,s)&&g.inv[s.idx]){
    const it=g.inv[s.idx];const lines=[`${it.rarName} ${it.name}`];
    for(const[k,v]of Object.entries(it.stats||{}))lines.push(`${k.toUpperCase()}: +${Math.round(v)}`);
    // Shift+hover: compare with equipped item in same slot
    if(_shiftHeld){
      const equipped=g.equips[it.slot];
      if(equipped){
        lines.push("─── vs equipped ───");
        lines.push(`${equipped.rarName} ${equipped.name}`);
        const allKeys=new Set([...Object.keys(it.stats||{}),...Object.keys(equipped.stats||{})]);
        for(const k of allKeys){
          const nv=Math.round((it.stats||{})[k]||0);
          const ov=Math.round((equipped.stats||{})[k]||0);
          const diff=nv-ov;
          const sign=diff>0?"+":"";
          const col=diff>0?"▲":"▼";
          if(diff!==0)lines.push(`  ${k.toUpperCase()}: ${nv} (${col}${sign}${diff})`);
        }
      } else {
        lines.push("─── no item equipped ───");
      }
    } else {
      lines.push("Click=equip · Shift+hover=compare");
    }
    _tooltip={x:mx+12,y:my,lines,col:it.rarCol,wide:_shiftHeld};return;}}
  // Equipment tooltips
  for(const s of(g._eqSlots||[])){if(hit(mx,my,s)&&g.equips[s.slot]){
    const it=g.equips[s.slot];const lines=[`${it.rarName} ${it.name} (equipped)`];
    for(const[k,v]of Object.entries(it.stats||{}))lines.push(`${k.toUpperCase()}: +${Math.round(v)}`);
    lines.push("Click to unequip");
    _tooltip={x:mx+12,y:my,lines,col:it.rarCol};return;}}
  // Skill tooltips (only on skills tab)
  if(g.tab===TAB.SKILLS) for(const b of(g._skillBtns||[])){if(hit(mx,my,b)){
    const ps=PASSIVES[b.idx];_tooltip={x:mx+12,y:my,lines:[ps.name,ps.desc,g.activePassives.has(b.idx)?"Click to unlearn":"Click to learn"],col:g.activePassives.has(b.idx)?"#4caf50":"#e040fb"};return;}}
}

// ══════ PUBLIC API ══════
// ══════ SAVE/LOAD ══════
function saveGame(){
  if(!g)return;try{
    const save={player:{...g.player},baseStats:g.baseStats,statPts:g.statPts,passivePts:g.passivePts,
      spentStats:g.spentStats,activePassives:[...g.activePassives],slots:g.slots,
      equips:g.equips,inv:g.inv,forgeProg:g.forgeProg,lvl:g.lvl,xp:g.xp,
      areasCleared:g.areasCleared,totalKills:g.totalKills,totalCoins:g.totalCoins,
      autoAtk:g.autoAtk,autoEquipOn:g.autoEquipOn,autoLevelOn:g.autoLevelOn};
    localStorage.setItem("dd_save",JSON.stringify(save));
  }catch(e){console.warn("Save failed",e);}
}
function loadGame(){
  try{
    const raw=localStorage.getItem("dd_save");if(!raw)return false;
    const s=JSON.parse(raw);if(!s||!s.player)return false;
    g.player={...g.player,...s.player};g.baseStats=s.baseStats||g.baseStats;
    g.statPts=s.statPts||0;g.passivePts=s.passivePts||0;
    g.spentStats=s.spentStats||g.spentStats;g.activePassives=new Set(s.activePassives||[]);
    g.slots=s.slots||g.slots;g.equips=s.equips||g.equips;g.inv=s.inv||g.inv;
    g.forgeProg=s.forgeProg||0;g.lvl=s.lvl||1;g.xp=s.xp||0;
    g.areasCleared=s.areasCleared||0;g.totalKills=s.totalKills||0;g.totalCoins=s.totalCoins||0;
    g.autoAtk=s.autoAtk!==undefined?s.autoAtk:true;g.autoEquipOn=!!s.autoEquipOn;g.autoLevelOn=!!s.autoLevelOn;
    g._mapViewArea=g.areasCleared>0?Math.min(g.areasCleared,AREAS.length-1):0;
    recalc();return true;
  }catch(e){console.warn("Load failed",e);return false;}
}

window.DungeonGame={
  init(container,onFinish){
    g=newGame();_particles=[];_tooltip=null;
    const loaded=loadGame();
    if(!loaded){recalc();g.player.hp=g.player.mhp;}
    container.innerHTML=`<canvas id="dg-canvas" width="${W}" height="${H}" style="display:block;margin:0 auto;border-radius:8px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:100%;height:auto"></canvas>`;
    const cv=document.getElementById("dg-canvas"),ctx=cv.getContext("2d");
    const xy=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*(W/r.width),(e.clientY-r.top)*(H/r.height)];};
    const onClick=e=>{const[mx,my]=xy(e);handleClick(mx,my,onFinish);};
    const onCtx=e=>{e.preventDefault();const[mx,my]=xy(e);handleRightClick(mx,my);};
    const onMove=e=>{const[mx,my]=xy(e);handleHover(mx,my);};
    cv.addEventListener("click",onClick);cv.addEventListener("contextmenu",onCtx);cv.addEventListener("mousemove",onMove);
    // Touch support for mobile
    cv.addEventListener("touchstart",e=>{e.preventDefault();const t=e.touches[0];const[mx,my]=xy(t);handleHover(mx,my);},{passive:false});
    cv.addEventListener("touchend",e=>{e.preventDefault();if(e.changedTouches.length){const t=e.changedTouches[0];const[mx,my]=xy(t);handleClick(mx,my,onFinish);}},{passive:false});
    let last=Date.now();
    const loop=()=>{const now=Date.now();const dt=Math.min((now-last)/16.67,3);last=now;
      updateBattle(dt);render(ctx);_raf=requestAnimationFrame(loop);};
    _raf=requestAnimationFrame(loop);
    // Auto-save: on page leave, every 30s, and on tab switch
    const doSave=()=>saveGame();
    window.addEventListener("beforeunload",doSave);
    setInterval(doSave,30000);
    this.cleanup=()=>{doSave();if(_raf)cancelAnimationFrame(_raf);cv.removeEventListener("click",onClick);cv.removeEventListener("contextmenu",onCtx);cv.removeEventListener("mousemove",onMove);};
  },
  cleanup(){if(_raf)cancelAnimationFrame(_raf);}
};
})();
