// yohoho.js — "Pirate Royale" battle royale game for Lobby 98
// YoHoHo.io-inspired: top-down, grow by looting, shrinking zone, dash attack, last pirate standing.
// Fully client-side with bot AI. No multiplayer — this is a solo "Special Game" like Deep Dive.
(function(){
"use strict";

// ── Constants ──
const CW=800,CH=600; // canvas viewport
const MW=2400,MH=2400; // map size
const BASE_R=14,MAX_R=60,GROW_PER_COIN=0.12;
const BASE_HP=100,HP_PER_SIZE=8,BASE_DMG=12,DMG_PER_SIZE=1.5;
const MOVE_SPEED=3.5,DASH_SPEED=12,DASH_DUR=12,DASH_CHARGE_TIME=30;
const SWING_ARC=Math.PI*0.8,SWING_DUR=8,SWING_COOLDOWN=18;
const COIN_R=6,CHEST_R=14,COIN_VALUE=1,CHEST_VALUE=5;
const NUM_BOTS=14,NUM_COINS=120,NUM_CHESTS=18;
const ZONE_START_R=1100,ZONE_END_R=80,ZONE_SHRINK_START=180,ZONE_TOTAL_DUR=5400; // ~90s at 60fps
const ZONE_DMG=0.4; // per frame outside zone
const RESPAWN_COINS_DROP=0.7; // drop 70% of coins on death

// ── Maps ──
const MAPS=[
  {name:"Tortuga",ground:"#d4b87a",water:"#2a8eaa",obstacleCol:"#3a7a3a",palmCol:"#2d6a2d",
   obstacles:[{x:400,y:400,w:60,h:120},{x:1000,y:800,w:80,h:40},{x:1600,y:500,w:40,h:160},{x:800,y:1600,w:120,h:50},{x:1900,y:1400,w:50,h:100},{x:500,y:1200,w:100,h:40},{x:1400,y:300,w:40,h:140},{x:1100,y:1800,w:80,h:60},{x:300,y:1900,w:60,h:80},{x:2000,y:800,w:50,h:120}]},
  {name:"Arctic",ground:"#c8dce8",water:"#4a7a9a",obstacleCol:"#7a8a9a",palmCol:"#5a6a7a",
   obstacles:[{x:600,y:300,w:80,h:80},{x:1200,y:600,w:60,h:140},{x:1800,y:400,w:100,h:50},{x:400,y:1400,w:50,h:120},{x:1500,y:1200,w:70,h:70},{x:900,y:900,w:40,h:160},{x:2000,y:1600,w:80,h:40},{x:700,y:2000,w:60,h:100},{x:1600,y:1800,w:120,h:40},{x:300,y:700,w:40,h:80}]},
  {name:"Volcano",ground:"#5a3a2a",water:"#c84020",obstacleCol:"#3a2a1a",palmCol:"#6a4a2a",
   obstacles:[{x:500,y:500,w:100,h:60},{x:1300,y:400,w:50,h:150},{x:1900,y:700,w:60,h:80},{x:700,y:1300,w:80,h:40},{x:1600,y:1500,w:40,h:120},{x:1000,y:1000,w:120,h:120},{x:400,y:1800,w:70,h:70},{x:2100,y:1200,w:50,h:100},{x:800,y:600,w:40,h:80},{x:1800,y:2000,w:80,h:60}]}
];

// ── Characters (unlockable with Lobby 98 coins) ──
const CHARACTERS=[
  {id:"swab",name:"Deck Swab",level:1,cost:0,color:"#27b5d5",emoji:"🏴‍☠️",hpMul:1,dmgMul:1,spdMul:1},
  {id:"buccaneer",name:"Buccaneer",level:2,cost:200,color:"#e04858",emoji:"⚔️",hpMul:1.1,dmgMul:1.15,spdMul:1},
  {id:"corsair",name:"Corsair",level:3,cost:500,color:"#4caf50",emoji:"🗡️",hpMul:1.15,dmgMul:1.1,spdMul:1.08},
  {id:"captain",name:"Captain",level:4,cost:1200,color:"#f5a623",emoji:"👑",hpMul:1.25,dmgMul:1.25,spdMul:1.05},
  {id:"pirate_king",name:"Pirate King",level:5,cost:3000,color:"#9b59b6",emoji:"☠️",hpMul:1.4,dmgMul:1.35,spdMul:1.1},
];

const BOT_NAMES=["Blackbeard","Redbeard","Anne Bonny","Calico Jack","Long John","Hook","Davy Jones","Barbossa","Sparrow","Silver","Flint","Morgan","Drake","Kidd","Teach","Bones","Scurvy","Plank","Barnacle","Jolly Roger"];
const BOT_COLORS=["#e04858","#4caf50","#f5a623","#7c3aed","#f472b6","#15803d","#c89020","#38bdf8","#dc2626","#6366f1","#d97706","#0891b2","#be185d","#65a30d"];

// ── Game State ──
let g=null,canvas,ctx,animId;
let mouseX=CW/2,mouseY=CH/2,mouseDown=false,keys={};

// ── Helpers ──
function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}
function angle(a,b){return Math.atan2(b.y-a.y,b.x-a.x);}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function rng(lo,hi){return lo+Math.random()*(hi-lo);}
function collideRect(x,y,r,obs){
  for(const o of obs){const cx=clamp(x,o.x,o.x+o.w),cy=clamp(y,o.y,o.y+o.h);if(dist({x,y},{x:cx,y:cy})<r)return true;}
  return false;
}
function spawnPos(obs,r){
  let x,y,tries=0;
  do{x=r+Math.random()*(MW-2*r);y=r+Math.random()*(MH-2*r);tries++;}
  while(collideRect(x,y,r+4,obs)&&tries<80);
  return{x,y};
}
function playerR(p){return BASE_R+p.coins*GROW_PER_COIN;}
function playerHP(p){const r=playerR(p);return(BASE_HP+(r-BASE_R)*HP_PER_SIZE)*p.char.hpMul;}
function playerDMG(p){const r=playerR(p);return(BASE_DMG+(r-BASE_R)*DMG_PER_SIZE)*p.char.dmgMul;}
function playerSpeed(p){const r=playerR(p);return(MOVE_SPEED-Math.min(r*0.008,1.2))*p.char.spdMul;}
function weaponReach(p){return playerR(p)*1.8+10;}

// ── Init ──
function initGame(container,mapIdx,charId,onEnd){
  container.innerHTML=`<canvas id="yh-canvas" width="${CW}" height="${CH}" style="display:block;margin:0 auto;border-radius:14px;cursor:crosshair;background:#1a2a3a;box-shadow:0 6px 20px rgba(0,0,0,0.3);max-width:100%;touch-action:none"></canvas>
    <div id="yh-hud" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:14px;font-weight:700;max-width:800px;margin-left:auto;margin-right:auto">
      <span style="color:var(--success)" id="yh-kills">☠ 0 kills</span>
      <span style="color:#ffd700" id="yh-coins">🪙 0</span>
      <span style="color:var(--ink2)" id="yh-alive">🏴‍☠️ ${NUM_BOTS+1} alive</span>
    </div>`;
  canvas=document.getElementById("yh-canvas");
  ctx=canvas.getContext("2d");
  const map=MAPS[mapIdx%MAPS.length];
  const char=CHARACTERS.find(c=>c.id===charId)||CHARACTERS[0];
  const sp=spawnPos(map.obstacles,BASE_R);
  g={
    state:"playing",frame:0,map,onEnd,
    player:{x:sp.x,y:sp.y,angle:0,coins:0,hp:100,maxHp:100,char,
      swinging:0,swingCd:0,dashCharge:0,dashing:0,dashAngle:0,
      kills:0,alive:true,name:"You"},
    bots:[],coins:[],chests:[],particles:[],
    zone:{cx:MW/2,cy:MH/2,r:ZONE_START_R,targetR:ZONE_START_R},
    camera:{x:0,y:0},
    result:null
  };
  // Spawn bots
  for(let i=0;i<NUM_BOTS;i++){
    const bsp=spawnPos(map.obstacles,BASE_R);
    const botChar=CHARACTERS[Math.floor(Math.random()*3)]; // bots use levels 1-3
    g.bots.push({
      x:bsp.x,y:bsp.y,angle:Math.random()*Math.PI*2,coins:Math.floor(rng(0,8)),
      hp:100,maxHp:100,char:botChar,
      swinging:0,swingCd:0,dashCharge:0,dashing:0,dashAngle:0,
      kills:0,alive:true,
      name:BOT_NAMES[i%BOT_NAMES.length],
      color:BOT_COLORS[i%BOT_COLORS.length],
      // AI state
      ai:{mode:"loot",target:null,fleeTimer:0,dashTimer:0,wanderAngle:Math.random()*Math.PI*2,wanderTimer:0,
          aggroRange:200+Math.random()*150,caution:0.3+Math.random()*0.5}
    });
  }
  // Spawn coins & chests
  for(let i=0;i<NUM_COINS;i++){const p=spawnPos(map.obstacles,COIN_R);g.coins.push({x:p.x,y:p.y});}
  for(let i=0;i<NUM_CHESTS;i++){const p=spawnPos(map.obstacles,CHEST_R);g.chests.push({x:p.x,y:p.y,open:false});}
  // Update player maxHp
  g.player.maxHp=playerHP(g.player);g.player.hp=g.player.maxHp;
  for(const b of g.bots){b.maxHp=playerHP(b);b.hp=b.maxHp;}
  // Input
  const onMouseMove=e=>{const r=canvas.getBoundingClientRect();mouseX=e.clientX-r.left;mouseY=e.clientY-r.top;};
  const onMouseDown=()=>{mouseDown=true;};
  const onMouseUp=()=>{mouseDown=false;};
  const onKey=e=>{if("wasd".includes(e.key.toLowerCase()))keys[e.key.toLowerCase()]=e.type==="keydown";};
  const onTouch=e=>{e.preventDefault();const t=e.touches[0];if(t){const r=canvas.getBoundingClientRect();mouseX=t.clientX-r.left;mouseY=t.clientY-r.top;}if(e.touches.length>=2)mouseDown=true;else if(e.type==="touchend")mouseDown=false;};
  canvas.addEventListener("mousemove",onMouseMove);
  canvas.addEventListener("mousedown",onMouseDown);
  canvas.addEventListener("mouseup",onMouseUp);
  canvas.addEventListener("touchstart",onTouch,{passive:false});
  canvas.addEventListener("touchmove",onTouch,{passive:false});
  canvas.addEventListener("touchend",onTouch,{passive:false});
  document.addEventListener("keydown",onKey);document.addEventListener("keyup",onKey);
  g._cleanup=()=>{
    canvas.removeEventListener("mousemove",onMouseMove);canvas.removeEventListener("mousedown",onMouseDown);
    canvas.removeEventListener("mouseup",onMouseUp);canvas.removeEventListener("touchstart",onTouch);
    canvas.removeEventListener("touchmove",onTouch);canvas.removeEventListener("touchend",onTouch);
    document.removeEventListener("keydown",onKey);document.removeEventListener("keyup",onKey);
    if(animId)cancelAnimationFrame(animId);
  };
  animId=requestAnimationFrame(tick);
}

// ── Main Loop ──
function tick(){
  if(!g||g.state==="ended"){return;}
  g.frame++;
  updateZone();
  if(g.player.alive)updatePlayer();
  for(const b of g.bots)if(b.alive)updateBot(b);
  updateCombat();
  collectCoins();
  updateParticles();
  checkWin();
  render();
  animId=requestAnimationFrame(tick);
}

// ── Zone ──
function updateZone(){
  if(g.frame>ZONE_SHRINK_START){
    const prog=Math.min((g.frame-ZONE_SHRINK_START)/(ZONE_TOTAL_DUR-ZONE_SHRINK_START),1);
    g.zone.targetR=ZONE_START_R-(ZONE_START_R-ZONE_END_R)*prog;
  }
  g.zone.r+=(g.zone.targetR-g.zone.r)*0.01;
  // Damage anyone outside
  const allP=getAllAlive();
  for(const p of allP){
    const d=dist(p,{x:g.zone.cx,y:g.zone.cy});
    if(d>g.zone.r){p.hp-=ZONE_DMG*(1+(d-g.zone.r)*0.002);if(p.hp<=0)killEntity(p,null);}
  }
}

// ── Player Update ──
function updatePlayer(){
  const p=g.player;if(!p.alive)return;
  // World-space mouse position
  const wmx=mouseX+g.camera.x,wmy=mouseY+g.camera.y;
  p.angle=Math.atan2(wmy-p.y,wmx-p.x);
  // Dash
  if(p.dashing>0){
    p.dashing--;
    const spd=DASH_SPEED;
    const nx=p.x+Math.cos(p.dashAngle)*spd,ny=p.y+Math.sin(p.dashAngle)*spd;
    if(!collideRect(nx,p.y,playerR(p),g.map.obstacles))p.x=nx;
    if(!collideRect(p.x,ny,playerR(p),g.map.obstacles))p.y=ny;
    p.x=clamp(p.x,playerR(p),MW-playerR(p));p.y=clamp(p.y,playerR(p),MH-playerR(p));
    return;
  }
  // Movement
  let dx=0,dy=0;
  if(keys.w)dy-=1;if(keys.s)dy+=1;if(keys.a)dx-=1;if(keys.d)dx+=1;
  // Also move toward mouse if no keys pressed
  if(!dx&&!dy){const md=dist(p,{x:wmx,y:wmy});if(md>playerR(p)+8){dx=wmx-p.x;dy=wmy-p.y;const len=Math.sqrt(dx*dx+dy*dy);dx/=len;dy/=len;}}
  else if(dx&&dy){const len=Math.sqrt(dx*dx+dy*dy);dx/=len;dy/=len;}
  const spd=playerSpeed(p);
  const nx=p.x+dx*spd,ny=p.y+dy*spd;
  if(!collideRect(nx,p.y,playerR(p),g.map.obstacles))p.x=nx;
  if(!collideRect(p.x,ny,playerR(p),g.map.obstacles))p.y=ny;
  p.x=clamp(p.x,playerR(p),MW-playerR(p));p.y=clamp(p.y,playerR(p),MH-playerR(p));
  // Attack/Dash charge
  if(p.swingCd>0)p.swingCd--;
  if(p.swinging>0)p.swinging--;
  if(mouseDown){
    p.dashCharge++;
    if(p.dashCharge>=DASH_CHARGE_TIME&&p.swingCd<=0){
      // Will dash on release
    }
  }else{
    if(p.dashCharge>=DASH_CHARGE_TIME){
      // Release dash
      p.dashing=DASH_DUR;p.dashAngle=p.angle;p.swinging=SWING_DUR;p.swingCd=SWING_COOLDOWN;
      p.dashCharge=0;
    }else if(p.dashCharge>0){
      // Quick attack
      if(p.swingCd<=0){p.swinging=SWING_DUR;p.swingCd=SWING_COOLDOWN;}
      p.dashCharge=0;
    }
  }
  // Update stats
  p.maxHp=playerHP(p);
  // Camera
  g.camera.x=p.x-CW/2;g.camera.y=p.y-CH/2;
}

// ── Bot AI ──
function updateBot(b){
  if(!b.alive)return;
  const ai=b.ai;
  b.maxHp=playerHP(b);
  const r=playerR(b);
  // Dash update
  if(b.dashing>0){
    b.dashing--;
    const nx=b.x+Math.cos(b.dashAngle)*DASH_SPEED,ny=b.y+Math.sin(b.dashAngle)*DASH_SPEED;
    if(!collideRect(nx,b.y,r,g.map.obstacles))b.x=nx;
    if(!collideRect(b.x,ny,r,g.map.obstacles))b.y=ny;
    b.x=clamp(b.x,r,MW-r);b.y=clamp(b.y,r,MH-r);
    return;
  }
  if(b.swingCd>0)b.swingCd--;
  if(b.swinging>0)b.swinging--;
  ai.dashTimer=Math.max(0,ai.dashTimer-1);
  // Find nearest enemy and nearest coin
  const allAlive=getAllAlive().filter(e=>e!==b);
  let nearEnemy=null,nearDist=Infinity;
  for(const e of allAlive){const d=dist(b,e);if(d<nearDist){nearDist=d;nearEnemy=e;}}
  let nearCoin=null,coinDist=Infinity;
  for(const c of g.coins){const d=dist(b,c);if(d<coinDist){coinDist=d;nearCoin=c;}}
  for(const c of g.chests){if(c.open)continue;const d=dist(b,c);if(d<coinDist){coinDist=d;nearCoin=c;}}
  // Zone pressure — move toward center if near edge
  const zoneDist=dist(b,{x:g.zone.cx,y:g.zone.cy});
  const inDanger=zoneDist>g.zone.r*0.85;
  // Decide mode
  const mySize=r,enemySize=nearEnemy?playerR(nearEnemy):0;
  const sizeAdvantage=mySize/(enemySize||1);
  if(inDanger){
    ai.mode="flee_zone";
  }else if(nearEnemy&&nearDist<ai.aggroRange&&sizeAdvantage>ai.caution){
    ai.mode="attack";ai.target=nearEnemy;
  }else if(nearEnemy&&nearDist<ai.aggroRange*0.6&&sizeAdvantage<0.7){
    ai.mode="flee";ai.target=nearEnemy;
  }else{
    ai.mode="loot";
  }
  let tx,ty;
  switch(ai.mode){
    case"flee_zone":
      tx=g.zone.cx;ty=g.zone.cy;break;
    case"attack":{
      const t=ai.target;tx=t.x;ty=t.y;
      // Dash attack when close enough and charged
      if(nearDist<weaponReach(b)*1.5&&b.swingCd<=0){
        b.swinging=SWING_DUR;b.swingCd=SWING_COOLDOWN;
      }
      if(nearDist<250&&nearDist>80&&ai.dashTimer<=0&&b.swingCd<=0){
        b.angle=angle(b,t);b.dashAngle=b.angle;
        b.dashing=DASH_DUR;b.swinging=SWING_DUR;b.swingCd=SWING_COOLDOWN;
        ai.dashTimer=60+Math.floor(Math.random()*60);
      }
      break;}
    case"flee":{
      const t=ai.target;
      tx=b.x-(t.x-b.x);ty=b.y-(t.y-b.y);
      // Dash away
      if(nearDist<100&&ai.dashTimer<=0){
        b.angle=angle(t,b);b.dashAngle=b.angle;
        b.dashing=DASH_DUR;ai.dashTimer=90;
      }
      break;}
    default:// loot
      if(nearCoin){tx=nearCoin.x;ty=nearCoin.y;}
      else{ai.wanderTimer--;if(ai.wanderTimer<=0){ai.wanderAngle=Math.random()*Math.PI*2;ai.wanderTimer=60+Math.floor(Math.random()*120);}
        tx=b.x+Math.cos(ai.wanderAngle)*100;ty=b.y+Math.sin(ai.wanderAngle)*100;}
      break;
  }
  // Move toward target
  b.angle=angle(b,{x:tx,y:ty});
  const spd=playerSpeed(b);
  const nx=b.x+Math.cos(b.angle)*spd,ny=b.y+Math.sin(b.angle)*spd;
  if(!collideRect(nx,b.y,r,g.map.obstacles))b.x=nx;
  if(!collideRect(b.x,ny,r,g.map.obstacles))b.y=ny;
  b.x=clamp(b.x,r,MW-r);b.y=clamp(b.y,r,MH-r);
}

// ── Combat ──
function updateCombat(){
  const allAlive=getAllAlive();
  for(const attacker of allAlive){
    if(attacker.swinging!==SWING_DUR-1)continue; // only on first frame of swing
    const reach=weaponReach(attacker);
    const dmg=playerDMG(attacker);
    for(const victim of allAlive){
      if(victim===attacker)continue;
      const d=dist(attacker,victim);
      if(d>reach+playerR(victim))continue;
      // Check angle — must be within swing arc
      const a=angle(attacker,victim);
      let diff=a-attacker.angle;while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;
      if(Math.abs(diff)>SWING_ARC/2)continue;
      // Hit!
      victim.hp-=dmg;
      // Knockback
      const kb=3+playerR(attacker)*0.15;
      victim.x+=Math.cos(a)*kb;victim.y+=Math.sin(a)*kb;
      victim.x=clamp(victim.x,playerR(victim),MW-playerR(victim));
      victim.y=clamp(victim.y,playerR(victim),MH-playerR(victim));
      // Particles
      for(let i=0;i<5;i++)g.particles.push({x:victim.x,y:victim.y,vx:rng(-3,3),vy:rng(-3,3),life:15+Math.random()*10,color:"#ff4444"});
      if(victim.hp<=0)killEntity(victim,attacker);
    }
  }
}

function killEntity(victim,killer){
  victim.alive=false;
  // Drop coins
  const drop=Math.floor(victim.coins*RESPAWN_COINS_DROP);
  for(let i=0;i<Math.min(drop,30);i++){
    g.coins.push({x:victim.x+rng(-40,40),y:victim.y+rng(-40,40)});
  }
  if(killer){killer.kills++;killer.coins+=Math.floor(drop*0.3);}
  // Death particles
  for(let i=0;i<15;i++)g.particles.push({x:victim.x,y:victim.y,vx:rng(-4,4),vy:rng(-4,4),life:20+Math.random()*15,color:victim.color||victim.char?.color||"#888"});
  // Update HUD
  updateHUD();
}

// ── Coin Collection ──
function collectCoins(){
  const allAlive=getAllAlive();
  for(const p of allAlive){
    const r=playerR(p);
    // Coins
    for(let i=g.coins.length-1;i>=0;i--){
      if(dist(p,g.coins[i])<r+COIN_R){
        p.coins+=COIN_VALUE;g.coins.splice(i,1);
        g.particles.push({x:p.x,y:p.y-r,vx:0,vy:-2,life:12,color:"#ffd700",text:"+1"});
        p.maxHp=playerHP(p);p.hp=Math.min(p.hp+2,p.maxHp);
      }
    }
    // Chests
    for(const c of g.chests){
      if(c.open)continue;
      if(dist(p,c)<r+CHEST_R){
        c.open=true;p.coins+=CHEST_VALUE;
        for(let i=0;i<8;i++)g.particles.push({x:c.x,y:c.y,vx:rng(-3,3),vy:rng(-4,-1),life:15,color:"#ffd700"});
        g.particles.push({x:p.x,y:p.y-r,vx:0,vy:-2,life:18,color:"#ffd700",text:`+${CHEST_VALUE}`});
        p.maxHp=playerHP(p);p.hp=Math.min(p.hp+10,p.maxHp);
      }
    }
  }
}

// ── Particles ──
function updateParticles(){
  for(let i=g.particles.length-1;i>=0;i--){
    const p=g.particles[i];p.x+=p.vx;p.y+=p.vy;p.life--;
    if(p.life<=0)g.particles.splice(i,1);
  }
}

// ── Win Check ──
function checkWin(){
  if(g.state!=="playing")return;
  const alive=getAllAlive();
  if(!g.player.alive&&g.state==="playing"){
    const place=alive.length+1;
    endGame(place);return;
  }
  if(alive.length<=1&&g.player.alive){
    endGame(1);return;
  }
}
function endGame(place){
  g.state="ended";
  const coins=g.player.kills*5+Math.floor(g.player.coins/2)+(place===1?50:place<=3?20:5);
  g.result={place,kills:g.player.kills,coinsEarned:coins,totalCoins:g.player.coins};
  updateHUD();
  if(g.onEnd)g.onEnd(g.result);
}

function getAllAlive(){
  const list=[];
  if(g.player.alive)list.push(g.player);
  for(const b of g.bots)if(b.alive)list.push(b);
  return list;
}
function updateHUD(){
  const k=document.getElementById("yh-kills"),c=document.getElementById("yh-coins"),a=document.getElementById("yh-alive");
  if(k)k.textContent=`☠ ${g.player.kills} kills`;
  if(c)c.textContent=`🪙 ${g.player.coins}`;
  if(a)a.textContent=`🏴‍☠️ ${getAllAlive().length} alive`;
}

// ── Render ──
function render(){
  const cam=g.camera;
  ctx.clearRect(0,0,CW,CH);
  // Background
  ctx.fillStyle=g.map.ground;ctx.fillRect(0,0,CW,CH);
  // Grid
  ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.lineWidth=1;
  const gs=60;
  const offX=-(cam.x%gs),offY=-(cam.y%gs);
  for(let x=offX;x<CW;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke();}
  for(let y=offY;y<CH;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke();}
  // Zone (red fog)
  drawZone(cam);
  // Map boundary
  ctx.strokeStyle="rgba(0,0,0,0.3)";ctx.lineWidth=3;
  ctx.strokeRect(-cam.x,-cam.y,MW,MH);
  // Obstacles
  ctx.fillStyle=g.map.obstacleCol;
  for(const o of g.map.obstacles){ctx.fillRect(o.x-cam.x,o.y-cam.y,o.w,o.h);
    ctx.fillStyle="rgba(0,0,0,0.15)";ctx.fillRect(o.x-cam.x,o.y-cam.y+o.h-4,o.w,4);ctx.fillStyle=g.map.obstacleCol;}
  // Chests
  for(const c of g.chests){
    const sx=c.x-cam.x,sy=c.y-cam.y;
    if(sx<-30||sx>CW+30||sy<-30||sy>CH+30)continue;
    if(c.open){ctx.fillStyle="rgba(139,90,40,0.3)";ctx.fillRect(sx-10,sy-8,20,16);}
    else{ctx.fillStyle="#a0721a";ctx.fillRect(sx-12,sy-9,24,18);ctx.fillStyle="#d4a030";ctx.fillRect(sx-10,sy-7,20,14);
      ctx.fillStyle="#ffd700";ctx.fillRect(sx-2,sy-3,4,6);}
  }
  // Coins
  ctx.fillStyle="#ffd700";
  for(const c of g.coins){
    const sx=c.x-cam.x,sy=c.y-cam.y;
    if(sx<-10||sx>CW+10||sy<-10||sy>CH+10)continue;
    ctx.beginPath();ctx.arc(sx,sy,COIN_R,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(255,200,0,0.6)";ctx.beginPath();ctx.arc(sx-1,sy-1,COIN_R*0.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#ffd700";
  }
  // Draw entities (sorted by y for pseudo-depth)
  const allEnts=getAllAlive().sort((a,b)=>a.y-b.y);
  for(const e of allEnts)drawEntity(e,cam);
  // Particles
  for(const p of g.particles){
    const sx=p.x-cam.x,sy=p.y-cam.y;
    const alpha=p.life/25;
    if(p.text){ctx.fillStyle=p.color;ctx.globalAlpha=alpha;ctx.font="bold 14px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText(p.text,sx,sy);ctx.globalAlpha=1;}
    else{ctx.fillStyle=p.color;ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(sx,sy,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  }
  // Minimap
  drawMinimap();
  // Dash charge indicator
  if(g.player.alive&&g.player.dashCharge>0){
    const prog=Math.min(g.player.dashCharge/DASH_CHARGE_TIME,1);
    ctx.fillStyle="rgba(0,0,0,0.5)";ctx.fillRect(CW/2-40,CH-30,80,8);
    ctx.fillStyle=prog>=1?"#ffd700":"#fff";ctx.fillRect(CW/2-40,CH-30,80*prog,8);
    if(prog>=1){ctx.fillStyle="#ffd700";ctx.font="bold 12px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText("DASH READY!",CW/2,CH-36);}
  }
  // Game over overlay
  if(g.state==="ended"&&g.result){
    ctx.fillStyle="rgba(0,0,0,0.6)";ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle="#fff";ctx.font="bold 42px Nunito,sans-serif";ctx.textAlign="center";
    ctx.fillText(g.result.place===1?"🏆 VICTORY!":"💀 Defeated",CW/2,CH/2-60);
    ctx.font="bold 22px Nunito,sans-serif";
    ctx.fillText(`#${g.result.place} place · ${g.result.kills} kills`,CW/2,CH/2-20);
    ctx.fillStyle="#ffd700";
    ctx.fillText(`+${g.result.coinsEarned} coins earned`,CW/2,CH/2+20);
    ctx.fillStyle="rgba(255,255,255,0.6)";ctx.font="bold 16px Nunito,sans-serif";
    ctx.fillText("Click to return",CW/2,CH/2+60);
  }
}

function drawEntity(e,cam){
  const sx=e.x-cam.x,sy=e.y-cam.y;
  if(sx<-80||sx>CW+80||sy<-80||sy>CH+80)return;
  const r=playerR(e);const isPlayer=e===g.player;
  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.15)";ctx.beginPath();ctx.ellipse(sx,sy+r*0.3,r*0.8,r*0.3,0,0,Math.PI*2);ctx.fill();
  // Body
  ctx.fillStyle=isPlayer?(e.char.color):(e.color||e.char?.color||"#888");
  ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.3)";ctx.lineWidth=2;ctx.stroke();
  // Eyes direction
  const ex=sx+Math.cos(e.angle)*r*0.35,ey=sy+Math.sin(e.angle)*r*0.35;
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(ex-3,ey-2,r*0.18,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(ex+3,ey-2,r*0.18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#111";ctx.beginPath();ctx.arc(ex-2+Math.cos(e.angle)*2,ey-2+Math.sin(e.angle)*2,r*0.08,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(ex+4+Math.cos(e.angle)*2,ey-2+Math.sin(e.angle)*2,r*0.08,0,Math.PI*2);ctx.fill();
  // Weapon (cutlass)
  const wr=weaponReach(e);
  if(e.swinging>0){
    // Swing arc
    const swingProg=1-(e.swinging/SWING_DUR);
    const swingAngle=e.angle-SWING_ARC/2+SWING_ARC*swingProg;
    ctx.strokeStyle="#c0c0c0";ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(sx+Math.cos(swingAngle)*r,sy+Math.sin(swingAngle)*r);
    ctx.lineTo(sx+Math.cos(swingAngle)*wr,sy+Math.sin(swingAngle)*wr);ctx.stroke();
    // Arc trail
    ctx.strokeStyle="rgba(255,255,255,0.3)";ctx.lineWidth=2;ctx.beginPath();
    ctx.arc(sx,sy,wr,e.angle-SWING_ARC/2,e.angle-SWING_ARC/2+SWING_ARC*swingProg);ctx.stroke();
  }else{
    // Idle weapon
    ctx.strokeStyle="#a0a0a0";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(sx+Math.cos(e.angle)*r,sy+Math.sin(e.angle)*r);
    ctx.lineTo(sx+Math.cos(e.angle)*(r+wr*0.4),sy+Math.sin(e.angle)*(r+wr*0.4));ctx.stroke();
  }
  // Dash trail
  if(e.dashing>0){
    ctx.strokeStyle="rgba(255,255,255,0.4)";ctx.lineWidth=r;
    ctx.beginPath();ctx.moveTo(sx-Math.cos(e.dashAngle)*r*2,sy-Math.sin(e.dashAngle)*r*2);
    ctx.lineTo(sx,sy);ctx.stroke();
  }
  // HP bar
  const hpW=Math.max(30,r*2);
  ctx.fillStyle="rgba(0,0,0,0.5)";ctx.fillRect(sx-hpW/2,sy-r-12,hpW,5);
  const hpPct=Math.max(0,e.hp/e.maxHp);
  ctx.fillStyle=hpPct>0.5?"#4caf50":hpPct>0.25?"#f5a623":"#e04858";
  ctx.fillRect(sx-hpW/2,sy-r-12,hpW*hpPct,5);
  // Name
  ctx.fillStyle=isPlayer?"#fff":"rgba(255,255,255,0.8)";ctx.font=`bold ${Math.max(10,Math.min(14,r*0.6))}px Nunito,sans-serif`;ctx.textAlign="center";
  ctx.fillText(e.name,sx,sy-r-16);
  // Coin count
  if(e.coins>0){ctx.fillStyle="#ffd700";ctx.font="bold 10px Nunito,sans-serif";ctx.fillText(`${e.coins}`,sx,sy+r+12);}
}

function drawZone(cam){
  // Draw the red fog outside the safe zone
  ctx.save();
  ctx.beginPath();ctx.rect(0,0,CW,CH);
  ctx.beginPath();ctx.arc(g.zone.cx-cam.x,g.zone.cy-cam.y,g.zone.r,0,Math.PI*2);
  // Invert — fill everything OUTSIDE the circle
  ctx.rect(CW,0,-CW,CH);ctx.fillStyle="rgba(180,30,20,0.25)";ctx.fill();
  ctx.restore();
  // Zone border
  ctx.strokeStyle="rgba(200,40,30,0.6)";ctx.lineWidth=3;ctx.setLineDash([8,8]);
  ctx.beginPath();ctx.arc(g.zone.cx-cam.x,g.zone.cy-cam.y,g.zone.r,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);
}

function drawMinimap(){
  const mmW=120,mmH=120,mmX=CW-mmW-10,mmY=10;
  const scale=mmW/MW;
  ctx.fillStyle="rgba(0,0,0,0.4)";ctx.fillRect(mmX,mmY,mmW,mmH);
  // Zone
  ctx.strokeStyle="rgba(200,40,30,0.6)";ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(mmX+g.zone.cx*scale,mmY+g.zone.cy*scale,g.zone.r*scale,0,Math.PI*2);ctx.stroke();
  // Bots (small dots)
  for(const b of g.bots){if(!b.alive)continue;ctx.fillStyle="rgba(255,100,100,0.7)";ctx.fillRect(mmX+b.x*scale-1,mmY+b.y*scale-1,3,3);}
  // Player
  if(g.player.alive){ctx.fillStyle="#4caf50";ctx.fillRect(mmX+g.player.x*scale-2,mmY+g.player.y*scale-2,5,5);}
  // Border
  ctx.strokeStyle="rgba(255,255,255,0.3)";ctx.strokeRect(mmX,mmY,mmW,mmH);
}

// ── Expose ──
window.PirateRoyale={
  init:initGame,
  cleanup(){if(g&&g._cleanup)g._cleanup();g=null;},
  CHARACTERS,MAPS
};
})();
