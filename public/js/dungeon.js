// dungeon.js — "Deep Dive" — Full auto-battler RPG (Three Goblets style)
// Timer combat, stat points, item affixes, forge, passives, area progression
(function(){
const W=720,H=440;

// ══════════════════════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════════════════════
const MONSTER_DB={
  slime:{name:"Slime",emoji:"🟢",mhp:15,dmg:4,arm:1,spd:70,xp:3,reward:1},
  bat:{name:"Bat",emoji:"🦇",mhp:10,dmg:5,arm:0,spd:50,xp:3,reward:1},
  rat:{name:"Rat",emoji:"🐀",mhp:12,dmg:3,arm:2,spd:55,xp:2,reward:1},
  mushroom:{name:"Mushroom",emoji:"🍄",mhp:18,dmg:4,arm:3,spd:65,xp:4,reward:1},
  ogre:{name:"Ogre",emoji:"👹",mhp:45,dmg:8,arm:5,spd:80,xp:12,reward:2,boss:true},
  ice_slime:{name:"Ice Slime",emoji:"🔵",mhp:22,dmg:6,arm:3,spd:65,xp:5,reward:1},
  frost_bat:{name:"Frost Bat",emoji:"🧊",mhp:18,dmg:7,arm:2,spd:48,xp:5,reward:1},
  snowfox:{name:"Snow Fox",emoji:"🦊",mhp:20,dmg:6,arm:4,spd:42,xp:6,reward:1},
  golem:{name:"Ice Golem",emoji:"🗿",mhp:70,dmg:10,arm:12,spd:90,xp:20,reward:3,boss:true},
  imp:{name:"Fire Imp",emoji:"😈",mhp:28,dmg:9,arm:4,spd:50,xp:8,reward:1},
  lava_snake:{name:"Lava Snake",emoji:"🐍",mhp:25,dmg:10,arm:3,spd:45,xp:8,reward:1},
  ember:{name:"Ember Skull",emoji:"💀",mhp:30,dmg:8,arm:6,spd:55,xp:9,reward:1},
  drake:{name:"Inferno Drake",emoji:"🐉",mhp:100,dmg:14,arm:10,spd:70,xp:30,reward:4,boss:true},
  phantom:{name:"Phantom",emoji:"👻",mhp:35,dmg:11,arm:5,spd:40,xp:10,reward:2},
  dark_mage:{name:"Dark Mage",emoji:"🧙",mhp:30,dmg:14,arm:3,spd:50,xp:11,reward:2},
  wolf:{name:"Shadow Wolf",emoji:"🐺",mhp:38,dmg:12,arm:7,spd:35,xp:10,reward:2},
  void_lord:{name:"Void Lord",emoji:"👁️",mhp:140,dmg:18,arm:14,spd:60,xp:45,reward:5,boss:true},
  demon:{name:"Demon",emoji:"👹",mhp:50,dmg:16,arm:8,spd:45,xp:14,reward:2},
  bone_dragon:{name:"Bone Dragon",emoji:"🐲",mhp:55,dmg:14,arm:10,spd:50,xp:16,reward:2},
  lich:{name:"Lich",emoji:"☠️",mhp:42,dmg:18,arm:6,spd:42,xp:15,reward:2},
  ancient:{name:"The Ancient",emoji:"⚫",mhp:220,dmg:22,arm:18,spd:55,xp:80,reward:8,boss:true},
};

const AREAS=[
  {name:"Mossy Caverns",color:"#2d5a1e",floors:[
    [{m:"slime",n:2}],[{m:"rat",n:3}],[{m:"mushroom",n:2}],[{m:"slime",n:2},{m:"mushroom",n:1}],[{m:"ogre",n:1,boss:true}]
  ]},
  {name:"Frozen Depths",color:"#1e4a6a",floors:[
    [{m:"ice_slime",n:2}],[{m:"frost_bat",n:3}],[{m:"snowfox",n:2}],[{m:"ice_slime",n:2,mod:"powerful"}],[{m:"frost_bat",n:1},{m:"snowfox",n:2}],[{m:"golem",n:1,boss:true}]
  ]},
  {name:"Scorched Halls",color:"#6a2a1a",floors:[
    [{m:"imp",n:2}],[{m:"lava_snake",n:3}],[{m:"ember",n:2,mod:"poison"}],[{m:"imp",n:2},{m:"ember",n:1}],[{m:"lava_snake",n:3,mod:"powerful"}],[{m:"imp",n:1,mod:"shielding"},{m:"ember",n:2}],[{m:"drake",n:1,boss:true}]
  ]},
  {name:"Shadow Ruins",color:"#2a1a3a",floors:[
    [{m:"phantom",n:2}],[{m:"dark_mage",n:2,mod:"poison"}],[{m:"wolf",n:3}],[{m:"phantom",n:1,mod:"shielding"},{m:"dark_mage",n:2}],
    [{m:"wolf",n:2,mod:"powerful"}],[{m:"dark_mage",n:3,mod:"poison"}],[{m:"phantom",n:2},{m:"wolf",n:1,mod:"shielding"}],[{m:"void_lord",n:1,boss:true}]
  ]},
  {name:"The Abyss",color:"#1a0a1a",floors:[
    [{m:"demon",n:2}],[{m:"bone_dragon",n:2}],[{m:"lich",n:2,mod:"poison"}],[{m:"demon",n:2,mod:"powerful"}],
    [{m:"lich",n:1,mod:"shielding"},{m:"bone_dragon",n:2}],[{m:"demon",n:3,mod:"powerful"}],[{m:"bone_dragon",n:2,mod:"shielding"},{m:"lich",n:1}],
    [{m:"demon",n:2,mod:"poison"},{m:"lich",n:2}],[{m:"bone_dragon",n:3,mod:"powerful"}],[{m:"ancient",n:1,boss:true}]
  ]},
];

const ITEM_TYPES=[
  {name:"Sword",icon:"⚔️",slot:0,base:{dmg:1.3}},
  {name:"Shield",icon:"🛡️",slot:1,base:{arm:1.2}},
  {name:"Armor",icon:"🧥",slot:2,base:{mhp:3.0}},
  {name:"Gloves",icon:"🧤",slot:3,base:{spd:1.0,isSpd:true}},
  {name:"Ring",icon:"💍",slot:4,base:{}},
  {name:"Amulet",icon:"📿",slot:5,base:{}},
];
const RARITIES=[
  {name:"Common",color:"#aaa",affixes:0,multi:1.0},
  {name:"Uncommon",color:"#4caf50",affixes:1,multi:1.15},
  {name:"Rare",color:"#2196f3",affixes:2,multi:1.3},
  {name:"Legendary",color:"#ff9800",affixes:3,multi:1.5},
  {name:"Ancient",color:"#e040fb",affixes:3,multi:1.8},
];
const AFFIX_POOL=[
  {stat:"dmg",label:"Damage",base:0.15},{stat:"arm",label:"Armor",base:0.22},
  {stat:"mhp",label:"Max HP",base:0.20},{stat:"spd",label:"Atk Speed",base:0.12,isSpd:true},
  {stat:"hpr",label:"HP Regen",base:0.02,flat:true},{stat:"cri",label:"Crit%",base:5,flat:true},
  {stat:"lfl",label:"Lifesteal%",base:2,flat:true},
];

const PASSIVES=[
  {name:"Toughness",desc:"+30% Max HP",icon:"❤️",effect:{mhpMul:1.3}},
  {name:"Fury",desc:"+25% Damage",icon:"⚔️",effect:{dmgMul:1.25}},
  {name:"Iron Skin",desc:"+35% Armor",icon:"🛡️",effect:{armMul:1.35}},
  {name:"Swiftness",desc:"+15% Atk Speed",icon:"⚡",effect:{spdMul:0.85}},
  {name:"Regeneration",desc:"Restore 3% HP/sec",icon:"💚",effect:{hprPct:0.03}},
  {name:"Critical Strike",desc:"Every 3rd hit = 2x dmg",icon:"💥",effect:{cri:3}},
  {name:"Splash",desc:"25% dmg to neighbors",icon:"💫",effect:{spl:25}},
  {name:"Life Leech",desc:"Leech 3% dmg as HP",icon:"🩸",effect:{lfl:3}},
  {name:"Last Stand",desc:"At <40% HP: restore 30% once",icon:"🔥",effect:{res:30}},
  {name:"Revive",desc:"On death: revive at 15% HP once",icon:"💀",effect:{rev:15}},
  {name:"Sweep",desc:"Every 5th hit = hit all enemies",icon:"🌀",effect:{swp:5}},
  {name:"Berserker",desc:"+50% dmg, -20% armor",icon:"😤",effect:{dmgMul:1.5,armMul:0.8}},
  {name:"Fortify",desc:"+50% armor vs 1 enemy",icon:"🏰",effect:{irn:50}},
  {name:"Vs Odds",desc:"+30% dmg vs 3+ enemies",icon:"⚡",effect:{ods:30}},
  {name:"Energy Shield",desc:"30% HP as shield (absorbs first)",icon:"🔮",effect:{mes:30}},
];

const FORGE_MILESTONES=[
  {at:3,reward:"stat",amount:1,desc:"1 Stat Point"},
  {at:8,reward:"stat",amount:1,desc:"1 Stat Point"},
  {at:15,reward:"slot",slot:4,desc:"Unlock Ring Slot"},
  {at:25,reward:"passive",amount:1,desc:"1 Skill Point"},
  {at:35,reward:"stat",amount:2,desc:"2 Stat Points"},
  {at:50,reward:"slot",slot:5,desc:"Unlock Amulet Slot"},
  {at:70,reward:"stat",amount:2,desc:"2 Stat Points"},
  {at:100,reward:"passive",amount:1,desc:"1 Skill Point"},
  {at:140,reward:"stat",amount:3,desc:"3 Stat Points"},
  {at:200,reward:"passive",amount:1,desc:"1 Skill Point"},
];

// ══════════════════════════════════════════════════════════════
//  GAME STATE
// ══════════════════════════════════════════════════════════════
let g=null,_raf=null,_particles=[];

function newGame(){
  return {
    screen:"world", // world,battle,inventory,passives,forge,victory,defeat
    player:{
      hp:30,mhp:30,dmg:6,arm:2,spd:80,// spd = frames between attacks (lower=faster)
      hpr:0,cri:0,lfl:0,spl:0,swp:0,res:0,rev:0,irn:0,ods:0,mes:0,
      es:0, // energy shield
      atkTimer:80,atkCount:0,target:0,
      resUsed:false,revUsed:false,
    },
    baseStats:{mhp:30,dmg:6,arm:2,spd:80},
    statPoints:0,passivePoints:0,
    spentStats:{mhp:0,dmg:0,arm:0,spd:0},
    activePassives:new Set(),
    equipSlots:[true,true,true,true,false,false], // sword,shield,armor,gloves,ring,amulet
    equips:[null,null,null,null,null,null],
    inventory:[], // max 16
    forgeProgress:0,
    lvl:1,xp:0,
    areaIdx:0,floor:0,areasCleared:0,
    enemies:[],
    totalKills:0,totalCoins:0,
    log:[],
  };
}

function xpNeeded(lvl){return Math.round(20*lvl+5*lvl*lvl);}
function xpTotal(lvl){let t=0;for(let i=1;i<lvl;i++)t+=xpNeeded(i);return t;}

// ══════════════════════════════════════════════════════════════
//  STAT CALCULATION
// ══════════════════════════════════════════════════════════════
function recalcStats(){
  const p=g.player,b=g.baseStats;
  // Base + spent
  let mhp=b.mhp+g.spentStats.mhp*5;
  let dmg=b.dmg+g.spentStats.dmg*2;
  let arm=b.arm+g.spentStats.arm*2;
  let spd=b.spd-g.spentStats.spd*3; // lower = faster
  let hpr=0,cri=0,lfl=0,spl=0,swp=0,res=0,rev=0,irn=0,ods=0,mes=0;
  let dmgMul=1,armMul=1,mhpMul=1,spdMul=1;
  // Equips
  for(let i=0;i<6;i++){
    const item=g.equips[i]; if(!item)continue;
    for(const[stat,val]of Object.entries(item.stats||{})){
      if(stat==="dmg")dmg+=val;else if(stat==="arm")arm+=val;
      else if(stat==="mhp")mhp+=val;else if(stat==="spd")spd-=val; // positive spd stat = faster
      else if(stat==="hpr")hpr+=val;else if(stat==="cri")cri+=val;
      else if(stat==="lfl")lfl+=val;
    }
  }
  // Passives
  for(const idx of g.activePassives){
    const ps=PASSIVES[idx]?.effect;if(!ps)continue;
    if(ps.dmgMul)dmgMul*=ps.dmgMul;if(ps.armMul)armMul*=ps.armMul;
    if(ps.mhpMul)mhpMul*=ps.mhpMul;if(ps.spdMul)spdMul*=ps.spdMul;
    if(ps.hprPct)hpr+=mhp*ps.hprPct;if(ps.cri)cri=ps.cri;
    if(ps.lfl)lfl+=ps.lfl;if(ps.spl)spl=ps.spl;if(ps.swp)swp=ps.swp;
    if(ps.res)res=ps.res;if(ps.rev)rev=ps.rev;
    if(ps.irn)irn=ps.irn;if(ps.ods)ods=ps.ods;if(ps.mes)mes=ps.mes;
  }
  p.mhp=Math.round(mhp*mhpMul);p.dmg=Math.round(dmg*dmgMul);
  p.arm=Math.round(arm*armMul);p.spd=Math.max(15,Math.round(spd*spdMul));
  p.hpr=hpr;p.cri=cri;p.lfl=lfl;p.spl=spl;p.swp=swp;
  p.res=res;p.rev=rev;p.irn=irn;p.ods=ods;p.mes=mes;
  p.hp=Math.min(p.hp,p.mhp);
  p.es=Math.round(p.mhp*p.mes/100);
}

// ══════════════════════════════════════════════════════════════
//  ITEM GENERATION
// ══════════════════════════════════════════════════════════════
function generateItem(areaLevel,forcedType,forcedRarity){
  const typeIdx=forcedType??Math.floor(Math.random()*ITEM_TYPES.length);
  const type=ITEM_TYPES[typeIdx];
  // Rarity roll
  let rarIdx=forcedRarity??0;
  if(forcedRarity===undefined){
    const r=Math.random();
    if(r<0.02)rarIdx=4;else if(r<0.08)rarIdx=3;else if(r<0.22)rarIdx=2;else if(r<0.50)rarIdx=1;
  }
  const rar=RARITIES[rarIdx];
  const stats={};const affixNames=[];
  // Base stat from type
  for(const[stat,base]of Object.entries(type.base)){
    if(stat==="isSpd")continue;
    const val=type.base.isSpd?Math.round(base*(1+areaLevel*0.3)):Math.round(base*areaLevel*rar.multi);
    if(val>0)stats[stat]=val;
  }
  // Random affixes
  const pool=[...AFFIX_POOL].sort(()=>Math.random()-0.5);
  for(let i=0;i<rar.affixes&&i<pool.length;i++){
    const af=pool[i];
    const val=af.flat?Math.round(af.base*(1+areaLevel*0.1)*10)/10:Math.round(af.base*areaLevel*rar.multi);
    if(val>0){stats[af.stat]=(stats[af.stat]||0)+val;affixNames.push(`${af.label}+${val}`);}
  }
  return {
    name:type.name,icon:type.icon,typeIdx,slot:type.slot,
    rarity:rarIdx,rarName:rar.name,rarColor:rar.color,
    stats,affixNames,level:areaLevel,
  };
}

// ══════════════════════════════════════════════════════════════
//  ENCOUNTERS
// ══════════════════════════════════════════════════════════════
function startArea(idx){
  g.areaIdx=idx;g.floor=0;
  g.player.resUsed=false;g.player.revUsed=false;
  recalcStats();
  g.player.hp=g.player.mhp;g.player.es=Math.round(g.player.mhp*g.player.mes/100);
  startFloor();
}

function startFloor(){
  const area=AREAS[g.areaIdx];
  const floorData=area.floors[g.floor];
  g.enemies=[];
  for(const group of floorData){
    const template=MONSTER_DB[group.m];if(!template)continue;
    const scale=1+(g.areaIdx*0.5)+(g.floor*0.12);
    for(let i=0;i<(group.n||1);i++){
      const m={...template};
      m.mhp=Math.ceil(m.mhp*scale);m.hp=m.mhp;
      m.dmg=Math.ceil(m.dmg*scale);m.arm=Math.ceil(m.arm*scale);
      m.spd=m.spd;m.atkTimer=m.spd+Math.random()*20;
      m.dmgFlash=0;m.deathTimer=0;m.mod=group.mod||null;
      m.boss=!!group.boss||!!template.boss;
      // Mod effects
      if(m.mod==="powerful"){m.dmg=Math.ceil(m.dmg*1.5);m.mhp=Math.ceil(m.mhp*1.3);m.hp=m.mhp;}
      if(m.mod==="poison"){m.poisonDmg=Math.ceil(m.dmg*0.15);}
      if(m.mod==="shielding"){m.shielding=true;}
      g.enemies.push(m);
    }
  }
  g.player.atkTimer=g.player.spd;g.player.target=0;g.player.atkCount=0;
  g.player.resUsed=false;g.player.revUsed=false;
  log(`Floor ${g.floor+1}/${area.floors.length}`);
  g.screen="battle";
}

// ══════════════════════════════════════════════════════════════
//  COMBAT ENGINE
// ══════════════════════════════════════════════════════════════
function calcDamage(atk,arm){
  return Math.max(1,atk-Math.floor(atk/(Math.pow(2,atk/Math.max(arm,1)))));
}

function updateBattle(dt){
  if(g.screen!=="battle")return;
  const p=g.player;
  const alive=g.enemies.filter(e=>e.hp>0);
  if(alive.length===0){floorCleared();return;}

  // Apply iron skin (bonus armor vs 1 enemy)
  const effectiveArm=p.arm+(alive.length===1&&p.irn>0?Math.round(p.arm*p.irn/100):0);
  // Apply vs odds (bonus dmg vs 3+)
  const effectiveDmg=p.dmg+(alive.length>=3&&p.ods>0?Math.round(p.dmg*p.ods/100):0);

  // HP Regen
  if(p.hpr>0&&p.hp>0)p.hp=Math.min(p.mhp,p.hp+p.hpr/60*dt);

  // Player attack
  p.atkTimer-=dt;
  if(p.atkTimer<=0){
    p.atkTimer=p.spd;p.atkCount++;
    const tgt=alive[Math.min(p.target,alive.length-1)];
    // Check special attacks
    let dmgMul=1;let hitAll=false;
    if(p.cri>0&&p.atkCount%p.cri===0)dmgMul=2;
    if(p.swp>0&&p.atkCount%p.swp===0)hitAll=true;

    const targets=hitAll?alive:[tgt];
    for(const t of targets){
      let raw=Math.round(effectiveDmg*dmgMul);
      const dmg=calcDamage(raw,t.mod==="shielding"&&alive.length>1?t.arm*2:t.arm);
      t.hp=Math.max(0,t.hp-dmg);t.dmgFlash=15;
      addP(t,`-${dmg}`,dmgMul>1?"#ffd700":"#ff6b6b");
      // Life leech
      if(p.lfl>0)p.hp=Math.min(p.mhp,p.hp+dmg*p.lfl/100);
      // Splash
      if(p.spl>0&&!hitAll){
        const neighbors=alive.filter(x=>x!==t);
        for(const nb of neighbors){
          const splDmg=Math.max(1,Math.round(dmg*p.spl/100));
          nb.hp=Math.max(0,nb.hp-splDmg);nb.dmgFlash=8;
          addP(nb,`-${splDmg}`,"#ffaa66");
        }
      }
    }
    // Process deaths
    processDeaths(alive);
  }

  // Enemy attacks
  for(const e of alive){
    if(e.hp<=0)continue;
    e.atkTimer-=dt;e.dmgFlash=Math.max(0,e.dmgFlash-dt*0.8);
    if(e.atkTimer<=0){
      e.atkTimer=e.spd;
      const raw=e.dmg;const dmg=calcDamage(raw,effectiveArm);
      // Hit energy shield first
      if(p.es>0){p.es=Math.max(0,p.es-dmg);}
      else{p.hp=Math.max(0,p.hp-dmg);}
      addP({_px:W/2,_py:H-90},`-${dmg}`,"#ffd700");
      // Poison
      if(e.poisonDmg&&p.es<=0){
        p.hp=Math.max(0,p.hp-e.poisonDmg);
        addP({_px:W/2+20,_py:H-80},`-${e.poisonDmg}☠`,"#9c27b0");
      }
      // Check last stand
      if(p.hp>0&&p.hp<p.mhp*0.4&&p.res>0&&!p.resUsed){
        p.resUsed=true;p.hp+=p.mhp*p.res/100;
        log("🔥 Last Stand!");addP({_px:W/2,_py:H-100},"+HP!","#4caf50");
      }
      // Check death + revive
      if(p.hp<=0){
        if(p.rev>0&&!p.revUsed){
          p.revUsed=true;p.hp=p.mhp*p.rev/100;
          log("💀 Revived!");addP({_px:W/2,_py:H-100},"REVIVE!","#e040fb");
          for(const en of alive)en.atkTimer=Math.max(en.atkTimer,120);
        }else{g.screen="defeat";log("💀 Defeated!");}
      }
    }
  }
  // Update death timers
  g.enemies.forEach(e=>{if(e.hp<=0&&e.deathTimer>0)e.deathTimer-=dt;});
}

function processDeaths(alive){
  for(const m of alive){
    if(m.hp<=0&&m.deathTimer===0){
      m.deathTimer=20;g.totalKills++;
      // XP + loot
      g.player.xp=g.player.xp||0;
      const xpGain=m.xp||5;
      g.player.xp+=xpGain;
      // Level up
      while(g.player.xp>=xpNeeded(g.lvl)){
        g.player.xp-=xpNeeded(g.lvl);g.lvl++;
        g.statPoints++;
        if(g.lvl%3===0)g.passivePoints++;
        log(`⬆️ Level ${g.lvl}!`);
        recalcStats();g.player.hp=g.player.mhp;
      }
      // Loot drop
      const dropChance=m.boss?1:0.30+(m.reward||0)*0.05;
      if(Math.random()<dropChance&&g.inventory.length<16){
        const item=generateItem(g.areaIdx+1);
        g.inventory.push(item);
        log(`${item.icon} ${item.rarName} ${item.name}!`);
      }
      // Retarget
      const newAlive=g.enemies.filter(e=>e.hp>0);
      if(newAlive.length>0)g.player.target=Math.min(g.player.target,newAlive.length-1);
    }
  }
}

function floorCleared(){
  const area=AREAS[g.areaIdx];g.floor++;
  g.player.hp=Math.min(g.player.mhp,Math.ceil(g.player.hp+g.player.mhp*0.15));
  g.player.es=Math.round(g.player.mhp*g.player.mes/100);
  if(g.floor>=area.floors.length){
    g.areasCleared=Math.max(g.areasCleared,g.areaIdx+1);
    g.totalCoins+=(g.areaIdx+1)*15;g.screen="victory";
    log(`🏆 ${area.name} cleared!`);
  }else{startFloor();}
}

// ══════════════════════════════════════════════════════════════
//  FORGE
// ══════════════════════════════════════════════════════════════
function forgeDismantle(idx){
  if(idx<0||idx>=g.inventory.length)return;
  const item=g.inventory[idx];
  g.inventory.splice(idx,1);
  g.forgeProgress+=(item.rarity||0)+1;
  log(`Dismantled ${item.icon} ${item.name} (+${(item.rarity||0)+1} forge)`);
  // Check milestones
  for(const ms of FORGE_MILESTONES){
    if(g.forgeProgress>=ms.at&&g.forgeProgress-(item.rarity||0)-1<ms.at){
      if(ms.reward==="stat"){g.statPoints+=ms.amount;log(`🔨 Forge: +${ms.amount} stat points!`);}
      if(ms.reward==="passive"){g.passivePoints+=ms.amount;log(`🔨 Forge: +${ms.amount} skill points!`);}
      if(ms.reward==="slot"&&ms.slot<g.equipSlots.length){g.equipSlots[ms.slot]=true;log(`🔨 Forge: Unlocked ${ITEM_TYPES[ms.slot].name} slot!`);}
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  PARTICLES + LOG
// ══════════════════════════════════════════════════════════════
function addP(entity,text,color){
  _particles.push({x:(entity._px||360)+(Math.random()-.5)*24,y:(entity._py||200)-10,text,color,born:Date.now(),life:700});
}
function log(msg){g.log.unshift(msg);if(g.log.length>8)g.log.pop();}

// ══════════════════════════════════════════════════════════════
//  RENDERING
// ══════════════════════════════════════════════════════════════
function render(ctx){
  ctx.clearRect(0,0,W,H);
  if(g.screen==="world")renderWorld(ctx);
  else if(g.screen==="battle")renderBattle(ctx);
  else if(g.screen==="inventory")renderInv(ctx);
  else if(g.screen==="passives")renderPassives(ctx);
  else if(g.screen==="forge")renderForge(ctx);
  else if(g.screen==="victory")renderEnd(ctx,"🏆 Area Cleared!","#4caf50");
  else if(g.screen==="defeat")renderEnd(ctx,"💀 Defeated!","#e04858");
  // Particles
  const now=Date.now();
  _particles=_particles.filter(p=>{const age=now-p.born;if(age>p.life)return false;const pr=age/p.life;
    ctx.globalAlpha=1-pr;ctx.fillStyle=p.color;ctx.font=`bold ${14+(1-pr)*6}px Nunito,sans-serif`;ctx.textAlign="center";
    ctx.fillText(p.text,p.x,p.y-pr*30);ctx.globalAlpha=1;return true;});
}

function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function bar(ctx,x,y,w,h,pct,col,r){ctx.fillStyle="rgba(0,0,0,0.5)";rr(ctx,x,y,w,h,r||3);ctx.fill();ctx.fillStyle=col;rr(ctx,x,y,w*Math.max(0,Math.min(1,pct)),h,r||3);ctx.fill();}
function btn(ctx,x,y,w,h,text,bg,fg){ctx.fillStyle=bg;rr(ctx,x,y,w,h,6);ctx.fill();ctx.fillStyle=fg;ctx.font="bold 12px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText(text,x+w/2,y+h/2+4);return{x,y,w,h};}

// --- World Map ---
function renderWorld(ctx){
  ctx.fillStyle="#0e1a24";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#8ec8e8";ctx.font="bold 20px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("⚔️ Deep Dive",W/2,28);
  ctx.font="13px Nunito,sans-serif";ctx.fillStyle="#7a9ab0";
  ctx.fillText(`Lv.${g.lvl} | HP:${Math.round(g.player.hp)}/${g.player.mhp} | Kills:${g.totalKills} | Coins:${g.totalCoins}`,W/2,48);
  // Stat/Skill points indicator
  if(g.statPoints>0){ctx.fillStyle="#ffd700";ctx.fillText(`⬆ ${g.statPoints} stat points available!`,W/2,66);}
  if(g.passivePoints>0){ctx.fillStyle="#e040fb";ctx.fillText(`⬆ ${g.passivePoints} skill points available!`,W/2,g.statPoints>0?80:66);}
  // Areas
  AREAS.forEach((a,i)=>{
    const x=30+(i%3)*230,y=90+Math.floor(i/3)*148;
    const unlocked=i<=g.areasCleared,cleared=i<g.areasCleared;
    ctx.globalAlpha=unlocked?1:0.35;ctx.fillStyle=unlocked?a.color:"#1a1a2a";
    rr(ctx,x,y,210,120,12);ctx.fill();
    if(unlocked&&!cleared){ctx.strokeStyle="#8ec8e8";ctx.lineWidth=2;rr(ctx,x,y,210,120,12);ctx.stroke();}
    ctx.fillStyle="#fff";ctx.font="24px serif";ctx.textAlign="center";ctx.fillText(["🌿","❄️","🔥","👁️","💀"][i],x+105,y+42);
    ctx.font="bold 14px Nunito,sans-serif";ctx.fillText(a.name,x+105,y+66);
    ctx.font="12px Nunito,sans-serif";ctx.fillStyle=cleared?"#4caf50":"#aaa";
    ctx.fillText(cleared?"✓ Cleared":`${a.floors.length} floors`,x+105,y+84);
    ctx.fillStyle="#556";ctx.font="10px Nunito,sans-serif";
    ctx.fillText(`Lv.${i*8+1}+`,x+105,y+100);
    ctx.globalAlpha=1;a._r={x,y,w:210,h:120};
  });
  // Bottom nav buttons
  g._wb=[];
  g._wb.push(btn(ctx,20,H-44,90,32,"🎒 Inventory","#1a2a3a","#8ec8e8"));
  g._wb.push(btn(ctx,120,H-44,90,32,"⭐ Skills","#1a2a3a","#e040fb"));
  g._wb.push(btn(ctx,220,H-44,90,32,"🔨 Forge","#1a2a3a","#ff9800"));
  if(g.statPoints>0)g._wb.push(btn(ctx,320,H-44,100,32,`⬆ Stats (${g.statPoints})`,"#2a3a1a","#8f8"));
}

// --- Battle ---
function renderBattle(ctx){
  const a=AREAS[g.areaIdx],p=g.player;
  const gr=ctx.createLinearGradient(0,0,0,H);gr.addColorStop(0,a.color);gr.addColorStop(1,"#0a0a14");
  ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#fff";ctx.font="bold 13px Nunito,sans-serif";ctx.textAlign="left";
  ctx.fillText(`${a.name} — Floor ${g.floor+1}/${a.floors.length}`,14,22);
  // Player HUD (bottom)
  const stats=p;
  bar(ctx,18,H-58,220,18,stats.hp/stats.mhp,stats.hp/stats.mhp>.5?"#4caf50":stats.hp/stats.mhp>.25?"#f5a623":"#e04858",4);
  if(stats.mes>0)bar(ctx,18,H-58,220,18,stats.es/(stats.mhp*stats.mes/100),"rgba(100,150,255,0.5)",4);
  ctx.fillStyle="#fff";ctx.font="bold 11px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`HP: ${Math.round(stats.hp)}/${stats.mhp}${stats.es>0?" [ES:"+Math.round(stats.es)+"]":""}`,128,H-45);
  bar(ctx,18,H-36,220,6,1-p.atkTimer/p.spd,"#8ec8e8",3);
  ctx.textAlign="left";ctx.font="11px Nunito,sans-serif";ctx.fillStyle="#aac8d8";
  ctx.fillText(`Lv.${g.lvl} ATK:${stats.dmg} DEF:${stats.arm} SPD:${stats.spd}`,18,H-16);
  bar(ctx,18,H-8,120,5,(g.player.xp||0)/xpNeeded(g.lvl),"#a78bfa",2);
  ctx.font="9px Nunito,sans-serif";ctx.fillStyle="#a78bfa";ctx.fillText(`XP:${g.player.xp||0}/${xpNeeded(g.lvl)}`,145,H-4);
  // Player character
  ctx.font="32px serif";ctx.textAlign="center";ctx.fillText("😎",W/2,H-80);
  // Enemies
  const alive=g.enemies.filter(e=>e.hp>0);
  alive.forEach((e,i)=>{
    const ex=W/2+(i-(alive.length-1)/2)*130;
    const ey=e.boss?90:110;const sz=e.boss?56:40;
    e._px=ex;e._py=ey;
    // Shadow
    ctx.fillStyle="rgba(0,0,0,0.3)";ctx.beginPath();ctx.ellipse(ex,ey+sz/2+6,sz/2,6,0,0,Math.PI*2);ctx.fill();
    // Body
    ctx.font=`${sz}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(e.emoji,ex,ey);
    // Damage flash
    if(e.dmgFlash>0){ctx.globalAlpha=e.dmgFlash/15*0.5;ctx.fillStyle="#fff";ctx.fillRect(ex-sz/2,ey-sz/2,sz,sz);ctx.globalAlpha=1;}
    ctx.textBaseline="alphabetic";
    // HP bar
    bar(ctx,ex-32,ey+sz/2+2,64,5,e.hp/e.mhp,e.hp/e.mhp>.5?"#4caf50":e.hp/e.mhp>.25?"#f5a623":"#e04858");
    // Atk timer
    bar(ctx,ex-32,ey+sz/2+10,64,3,1-e.atkTimer/e.spd,"#ff5555",2);
    // Name
    ctx.fillStyle="#ddd";ctx.font="10px Nunito,sans-serif";ctx.textAlign="center";
    let label=e.name;if(e.mod)label=`[${e.mod}] `+label;
    ctx.fillText(`${label} ${Math.round(e.hp)}/${e.mhp}`,ex,ey+sz/2+24);
    // Target arrow
    if(i===(Math.min(p.target,alive.length-1))){
      ctx.fillStyle="#ffd700";ctx.font="12px sans-serif";ctx.fillText("▼",ex,ey-sz/2-8);
    }
    e._cr={x:ex-sz/2-8,y:ey-sz/2-8,w:sz+16,h:sz+40};
  });
  // Log
  ctx.textAlign="right";ctx.font="10px Nunito,sans-serif";
  g.log.slice(0,5).forEach((m,i)=>{ctx.globalAlpha=1-i*0.18;ctx.fillStyle="rgba(255,255,255,0.6)";ctx.fillText(m,W-12,22+i*14);});
  ctx.globalAlpha=1;
  // Flee + Potion buttons
  g._bb=[];
  g._bb.push(btn(ctx,W-72,H-42,58,26,"Flee","rgba(200,50,50,0.4)","#f88"));
  const pots=g.inventory.filter(it=>it.name==="Potion");
  if(pots.length>0)g._bb.push(btn(ctx,W-140,H-42,62,26,`❤️ (${pots.length})`,"rgba(50,150,50,0.4)","#8f8"));
}

// --- Inventory ---
function renderInv(ctx){
  ctx.fillStyle="#0e1a24";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#8ec8e8";ctx.font="bold 18px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("🎒 Equipment & Inventory",W/2,28);
  // Equipment slots
  g._es=[];
  for(let i=0;i<6;i++){
    if(!g.equipSlots[i])continue;
    const x=20,y=48+i*60;const item=g.equips[i];
    ctx.fillStyle="#1a2a3a";rr(ctx,x,y,230,52,8);ctx.fill();
    ctx.strokeStyle=item?"#4caf50":"#2a3a4a";ctx.lineWidth=1;rr(ctx,x,y,230,52,8);ctx.stroke();
    ctx.fillStyle="#556";ctx.font="10px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(ITEM_TYPES[i].name,x+8,y+14);
    if(item){
      ctx.fillStyle=item.rarColor||"#fff";ctx.font="bold 13px Nunito,sans-serif";
      ctx.fillText(`${item.icon} ${item.rarName} ${item.name}`,x+8,y+30);
      ctx.fillStyle="#aaa";ctx.font="10px Nunito,sans-serif";
      const sStr=Object.entries(item.stats||{}).map(([k,v])=>`${k.toUpperCase()}+${Math.round(v)}`).join(" ");
      ctx.fillText(sStr,x+8,y+44);
    }else{ctx.fillStyle="#3a4a5a";ctx.font="12px Nunito,sans-serif";ctx.fillText("(empty)",x+8,y+34);}
    g._es.push({x,y,w:230,h:52,slot:i});
  }
  // Inventory grid
  g._ii=[];
  ctx.fillStyle="#8ec8e8";ctx.font="bold 13px Nunito,sans-serif";ctx.textAlign="left";
  ctx.fillText(`Items (${g.inventory.length}/16) — Click=equip, Right-click=dismantle`,270,46);
  g.inventory.forEach((item,i)=>{
    const ix=270+(i%4)*108,iy=56+Math.floor(i/4)*72;
    ctx.fillStyle="#1a2a3a";rr(ctx,ix,iy,100,64,6);ctx.fill();
    ctx.strokeStyle=item.rarColor||"#555";ctx.lineWidth=1;rr(ctx,ix,iy,100,64,6);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="18px serif";ctx.textAlign="center";ctx.fillText(item.icon,ix+50,iy+24);
    ctx.fillStyle=item.rarColor||"#ccc";ctx.font="9px Nunito,sans-serif";
    ctx.fillText(item.rarName,ix+50,iy+38);
    ctx.fillStyle="#bbb";ctx.fillText(item.name,ix+50,iy+50);
    const sStr=Object.entries(item.stats||{}).slice(0,2).map(([k,v])=>`${k[0].toUpperCase()}+${Math.round(v)}`).join(" ");
    ctx.fillStyle="#777";ctx.font="8px Nunito,sans-serif";ctx.fillText(sStr,ix+50,iy+60);
    g._ii.push({x:ix,y:iy,w:100,h:64,idx:i});
  });
  // Stats display
  ctx.fillStyle="#aac8d8";ctx.font="12px Nunito,sans-serif";ctx.textAlign="left";
  const p=g.player;
  ctx.fillText(`Lv.${g.lvl} | HP:${Math.round(p.hp)}/${p.mhp} | ATK:${p.dmg} | DEF:${p.arm} | SPD:${p.spd}`,270,H-14);
  if(p.hpr>0)ctx.fillText(`Regen:${p.hpr.toFixed(1)}/s`,270,H-28);
  if(p.cri>0)ctx.fillText(`Crit:every ${p.cri}`,370,H-28);
  if(p.lfl>0)ctx.fillText(`Leech:${p.lfl}%`,450,H-28);
  g._ib=btn(ctx,20,H-44,80,32,"← Back","#2a3a4a","#8ec8e8");
}

// --- Passives ---
function renderPassives(ctx){
  ctx.fillStyle="#0e1a24";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#e040fb";ctx.font="bold 18px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`⭐ Skills (${g.passivePoints} points)`,W/2,28);
  g._pi=[];
  PASSIVES.forEach((ps,i)=>{
    const x=20+(i%5)*140,y=44+Math.floor(i/5)*80;
    const active=g.activePassives.has(i);
    ctx.fillStyle=active?"#1a3a2a":"#1a1a2a";rr(ctx,x,y,132,70,8);ctx.fill();
    ctx.strokeStyle=active?"#4caf50":"#333";ctx.lineWidth=active?2:1;rr(ctx,x,y,132,70,8);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="20px serif";ctx.textAlign="center";ctx.fillText(ps.icon,x+20,y+28);
    ctx.fillStyle=active?"#8f8":"#aaa";ctx.font="bold 11px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(ps.name,x+38,y+22);
    ctx.fillStyle=active?"#6a8":"#666";ctx.font="9px Nunito,sans-serif";
    // Word wrap desc
    const words=ps.desc.split(" ");let line="",ly=y+36;
    for(const w of words){if((line+w).length>18){ctx.fillText(line,x+8,ly);ly+=11;line="";}line+=w+" ";}
    ctx.fillText(line,x+8,ly);
    g._pi.push({x,y,w:132,h:70,idx:i});
  });
  g._pb=btn(ctx,20,H-44,80,32,"← Back","#2a3a4a","#8ec8e8");
}

// --- Forge ---
function renderForge(ctx){
  ctx.fillStyle="#0e1a24";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#ff9800";ctx.font="bold 18px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText("🔨 Forge — Dismantle items for rewards",W/2,28);
  // Progress bar
  const nextMs=FORGE_MILESTONES.find(m=>m.at>g.forgeProgress);
  const prevAt=FORGE_MILESTONES.filter(m=>m.at<=g.forgeProgress).pop()?.at||0;
  const nextAt=nextMs?.at||g.forgeProgress+10;
  bar(ctx,40,40,W-80,16,((g.forgeProgress-prevAt)/(nextAt-prevAt)),"#ff9800",4);
  ctx.fillStyle="#fff";ctx.font="11px Nunito,sans-serif";
  ctx.fillText(`${g.forgeProgress} / ${nextAt} ${nextMs?`→ ${nextMs.desc}`:"(all claimed)"}`,W/2,72);
  // Milestones
  ctx.font="10px Nunito,sans-serif";ctx.textAlign="left";
  FORGE_MILESTONES.forEach((ms,i)=>{
    const x=40+(i%5)*132,y=84+Math.floor(i/5)*28;
    const done=g.forgeProgress>=ms.at;
    ctx.fillStyle=done?"#4caf50":"#555";
    ctx.fillText(`${done?"✓":"○"} ${ms.at}: ${ms.desc}`,x,y+12);
  });
  // Items to dismantle
  ctx.fillStyle="#8ec8e8";ctx.font="bold 12px Nunito,sans-serif";ctx.textAlign="left";
  ctx.fillText("Click an item to dismantle it:",40,160);
  g._fi=[];
  g.inventory.forEach((item,i)=>{
    const ix=40+(i%5)*132,iy=172+Math.floor(i/5)*68;
    ctx.fillStyle="#1a2a3a";rr(ctx,ix,iy,124,60,6);ctx.fill();
    ctx.strokeStyle=item.rarColor||"#555";ctx.lineWidth=1;rr(ctx,ix,iy,124,60,6);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="16px serif";ctx.textAlign="center";ctx.fillText(item.icon,ix+20,iy+28);
    ctx.fillStyle=item.rarColor||"#ccc";ctx.font="10px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(`${item.rarName} ${item.name}`,ix+36,iy+24);
    ctx.fillStyle="#888";ctx.font="9px Nunito,sans-serif";
    ctx.fillText(`+${(item.rarity||0)+1} forge pts`,ix+36,iy+38);
    g._fi.push({x:ix,y:iy,w:124,h:60,idx:i});
  });
  g._fb=btn(ctx,20,H-44,80,32,"← Back","#2a3a4a","#8ec8e8");
}

// --- Stat Allocation (overlay on world) ---
function renderStatAlloc(ctx){
  ctx.fillStyle="rgba(0,0,0,0.85)";ctx.fillRect(W/2-180,60,360,260);
  ctx.strokeStyle="#8ec8e8";ctx.lineWidth=2;rr(ctx,W/2-180,60,360,260,12);ctx.stroke();
  ctx.fillStyle="#8ec8e8";ctx.font="bold 16px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(`⬆ Allocate Stats (${g.statPoints} points)`,W/2,90);
  const stats=[
    {key:"mhp",label:"Max HP",val:g.player.mhp,spent:g.spentStats.mhp,per:"+5 HP"},
    {key:"dmg",label:"Damage",val:g.player.dmg,spent:g.spentStats.dmg,per:"+2 DMG"},
    {key:"arm",label:"Armor",val:g.player.arm,spent:g.spentStats.arm,per:"+2 ARM"},
    {key:"spd",label:"Atk Speed",val:g.player.spd,spent:g.spentStats.spd,per:"-3 SPD (faster)"},
  ];
  g._sa=[];
  stats.forEach((s,i)=>{
    const y=110+i*48;
    ctx.fillStyle="#aac8d8";ctx.font="13px Nunito,sans-serif";ctx.textAlign="left";
    ctx.fillText(`${s.label}: ${s.val} (${s.spent} pts)`,W/2-160,y+14);
    ctx.fillStyle="#666";ctx.font="10px Nunito,sans-serif";ctx.fillText(s.per,W/2-160,y+28);
    if(g.statPoints>0)g._sa.push(btn(ctx,W/2+80,y,60,26,"+1","#2a4a2a","#8f8"));
    else g._sa.push({x:0,y:0,w:0,h:0});
    g._sa[g._sa.length-1].key=s.key;
  });
  g._sab=btn(ctx,W/2-40,310,80,28,"Done","#2a3a4a","#8ec8e8");
}

// --- End screens ---
function renderEnd(ctx,title,color){
  ctx.fillStyle="#0e1a24";ctx.fillRect(0,0,W,H);
  ctx.fillStyle=color;ctx.font="bold 26px Nunito,sans-serif";ctx.textAlign="center";
  ctx.fillText(title,W/2,H/2-50);
  ctx.fillStyle="#aac8d8";ctx.font="15px Nunito,sans-serif";
  ctx.fillText(`Level ${g.lvl} | Kills: ${g.totalKills} | Coins: ${g.totalCoins}`,W/2,H/2-15);
  g._eb=[];
  g._eb.push(btn(ctx,W/2-110,H/2+20,100,34,"Continue","#2a4a3a","#8f8"));
  g._eb.push(btn(ctx,W/2+10,H/2+20,100,34,"Cash Out","#4a2a2a","#f88"));
}

// ══════════════════════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════════════════════
function hitTest(mx,my,r){return r&&mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}
let showStatAlloc=false;

function handleClick(mx,my,onFinish){
  if(showStatAlloc){
    for(const b of(g._sa||[])){if(hitTest(mx,my,b)&&g.statPoints>0){g.spentStats[b.key]++;g.statPoints--;recalcStats();return;}}
    if(hitTest(mx,my,g._sab)){showStatAlloc=false;}
    return;
  }
  if(g.screen==="world"){
    AREAS.forEach((a,i)=>{if(i<=g.areasCleared&&hitTest(mx,my,a._r)){startArea(i);}});
    const wb=g._wb||[];
    if(hitTest(mx,my,wb[0]))g.screen="inventory";
    if(hitTest(mx,my,wb[1]))g.screen="passives";
    if(hitTest(mx,my,wb[2]))g.screen="forge";
    if(hitTest(mx,my,wb[3])&&g.statPoints>0)showStatAlloc=true;
  }else if(g.screen==="battle"){
    const alive=g.enemies.filter(e=>e.hp>0);
    alive.forEach((e,i)=>{if(hitTest(mx,my,e._cr))g.player.target=i;});
    const bb=g._bb||[];
    if(hitTest(mx,my,bb[0])){g.screen="world";log("Fled!");}
    if(hitTest(mx,my,bb[1])){// Use potion
      const pi=g.inventory.findIndex(it=>it.name==="Potion");
      if(pi>=0){g.player.hp=Math.min(g.player.mhp,g.player.hp+g.player.mhp*0.3);g.inventory.splice(pi,1);log("❤️ Used potion!");}
    }
  }else if(g.screen==="inventory"){
    if(hitTest(mx,my,g._ib)){g.screen="world";return;}
    for(const r of(g._ii||[])){
      if(hitTest(mx,my,r)){
        const item=g.inventory[r.idx];if(!item)return;
        if(item.slot!==undefined&&g.equipSlots[item.slot]){
          const old=g.equips[item.slot];
          g.equips[item.slot]=item;g.inventory.splice(r.idx,1);
          if(old)g.inventory.push(old);
          recalcStats();log(`Equipped ${item.icon} ${item.name}`);
        }
        return;
      }
    }
  }else if(g.screen==="passives"){
    if(hitTest(mx,my,g._pb)){g.screen="world";return;}
    for(const r of(g._pi||[])){
      if(hitTest(mx,my,r)){
        const idx=r.idx;
        if(g.activePassives.has(idx)){g.activePassives.delete(idx);g.passivePoints++;recalcStats();}
        else if(g.passivePoints>0){g.activePassives.add(idx);g.passivePoints--;recalcStats();}
        return;
      }
    }
  }else if(g.screen==="forge"){
    if(hitTest(mx,my,g._fb)){g.screen="world";return;}
    for(const r of(g._fi||[])){if(hitTest(mx,my,r)){forgeDismantle(r.idx);return;}}
  }else if(g.screen==="victory"||g.screen==="defeat"){
    const eb=g._eb||[];
    if(hitTest(mx,my,eb[0])){g.player.hp=g.player.mhp;g.player.es=Math.round(g.player.mhp*g.player.mes/100);g.screen="world";}
    if(hitTest(mx,my,eb[1])){onFinish(g.totalCoins,g.areasCleared,g.totalKills);g.player.hp=g.player.mhp;g.screen="world";}
  }
}

function handleRightClick(mx,my){
  if(g.screen==="inventory"){
    for(const r of(g._ii||[])){if(hitTest(mx,my,r)){forgeDismantle(r.idx);return;}}
  }
}

// ══════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════
window.DungeonGame={
  init(container,onFinish){
    g=newGame();_particles=[];recalcStats();g.player.hp=g.player.mhp;showStatAlloc=false;
    container.innerHTML=`<canvas id="dg-canvas" width="${W}" height="${H}" style="display:block;margin:0 auto;border-radius:14px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)"></canvas>`;
    const canvas=document.getElementById("dg-canvas");const ctx=canvas.getContext("2d");

    const getXY=(e)=>{const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)*(W/r.width),(e.clientY-r.top)*(H/r.height)];};
    const onClick=(e)=>{const[mx,my]=getXY(e);handleClick(mx,my,onFinish);};
    const onCtx=(e)=>{e.preventDefault();const[mx,my]=getXY(e);handleRightClick(mx,my);};
    canvas.addEventListener("click",onClick);canvas.addEventListener("contextmenu",onCtx);

    let last=Date.now();
    const loop=()=>{const now=Date.now();const dt=Math.min((now-last)/16.67,3);last=now;
      updateBattle(dt);render(ctx);if(showStatAlloc)renderStatAlloc(ctx);
      _raf=requestAnimationFrame(loop);};
    _raf=requestAnimationFrame(loop);
    this.cleanup=()=>{if(_raf)cancelAnimationFrame(_raf);canvas.removeEventListener("click",onClick);canvas.removeEventListener("contextmenu",onCtx);};
  },
  cleanup(){if(_raf)cancelAnimationFrame(_raf);}
};
})();
