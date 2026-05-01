// yohoho.js — "Pirate Royale" battle royale for Lobby 98 (v2 rewrite)
(function(){"use strict";
const CW=800,CH=600,MW=3600,MH=3600;
const BASE_R=14,GROW=0.1,MAX_R=65,BASE_HP=100,HP_S=7,BASE_DMG=10,DMG_S=1.2;
const MSPD=3.8,DSPD=11,DDUR=14,DCHARGE=30,SARC=Math.PI*0.75,SDUR=8,SCD=20;
const CR=6,CHR=14,NCOINS=200,NCHESTS=25,NBOTS=25;
const ZSR=1700,ZER=90,ZSSTART=240,ZDUR=7200,ZDMG=0.35,DROPPCT=0.7;
const MAPS=[
{id:"tortuga",name:"Tortuga",ground:"#d4b87a",water:"#2a8eaa",obsCol:"#3a7a3a",deco:"tropical",obstacles:[],decos:[],
 chars:[{id:"t_swab",name:"Deck Swab",emoji:"🏴‍☠️",cost:0,color:"#27b5d5",hpM:1,dmgM:1,spdM:1},{id:"t_sailor",name:"Sailor",emoji:"⚓",cost:30,color:"#4a90d9",hpM:1.08,dmgM:1.1,spdM:1},{id:"t_buccaneer",name:"Buccaneer",emoji:"⚔️",cost:80,color:"#e04858",hpM:1.15,dmgM:1.2,spdM:1.02},{id:"t_corsair",name:"Corsair",emoji:"🗡️",cost:180,color:"#4caf50",hpM:1.25,dmgM:1.25,spdM:1.05},{id:"t_captain",name:"Captain",emoji:"👑",cost:400,color:"#f5a623",hpM:1.35,dmgM:1.35,spdM:1.08}]},
{id:"arctic",name:"Arctic",ground:"#c8dce8",water:"#4a7a9a",obsCol:"#7a8a9a",deco:"arctic",obstacles:[],decos:[],
 chars:[{id:"a_deckhand",name:"Deckhand",emoji:"❄️",cost:0,color:"#5bc0de",hpM:1,dmgM:1,spdM:1},{id:"a_harpooner",name:"Harpooner",emoji:"🔱",cost:40,color:"#3a7abf",hpM:1.1,dmgM:1.12,spdM:1},{id:"a_viking",name:"Viking",emoji:"🪓",cost:100,color:"#c04040",hpM:1.2,dmgM:1.22,spdM:1.03},{id:"a_berserker",name:"Berserker",emoji:"💀",cost:220,color:"#8b0000",hpM:1.3,dmgM:1.32,spdM:1.06},{id:"a_jarl",name:"Frost Jarl",emoji:"🧊",cost:500,color:"#1a4a7a",hpM:1.4,dmgM:1.4,spdM:1.1}]},
{id:"volcano",name:"Volcano",ground:"#5a3a2a",water:"#c84020",obsCol:"#3a2a1a",deco:"volcanic",obstacles:[],decos:[],
 chars:[{id:"v_castaway",name:"Castaway",emoji:"🌋",cost:0,color:"#d97706",hpM:1,dmgM:1,spdM:1},{id:"v_raider",name:"Raider",emoji:"🔥",cost:50,color:"#dc2626",hpM:1.12,dmgM:1.15,spdM:1},{id:"v_warlord",name:"Warlord",emoji:"⛏️",cost:120,color:"#7c2d12",hpM:1.22,dmgM:1.28,spdM:1.04},{id:"v_demon",name:"Demon",emoji:"😈",cost:260,color:"#4a0e0e",hpM:1.35,dmgM:1.38,spdM:1.07},{id:"v_inferno",name:"Inferno King",emoji:"☠️",cost:600,color:"#1a0505",hpM:1.5,dmgM:1.5,spdM:1.12}]}
];
const BNAMES=["Blackbeard","Redbeard","Anne Bonny","Calico Jack","Long John","Hook","Davy Jones","Barbossa","Sparrow","Silver","Flint","Morgan","Drake","Kidd","Teach","Bones","Scurvy","Plank","Barnacle","Jolly Roger","Rackham","Vane","Bellamy","Low","Roberts"];
let g=null,canvas,ctx,animId,mouseX=CW/2,mouseY=CH/2,mouseDown=false,keys={};
// Persistence
function loadSave(){try{return JSON.parse(localStorage.getItem('lobby98_yh_save'))||{};}catch{return{};}}
function writeSave(s){localStorage.setItem('lobby98_yh_save',JSON.stringify(s));}
function getSave(){const s=loadSave();if(!s.doubloons)s.doubloons=0;if(!s.maps)s.maps={tortuga:{unlocked:true,owned:["t_swab"],selected:"t_swab",wins:0},arctic:{unlocked:false,owned:["a_deckhand"],selected:"a_deckhand",wins:0},volcano:{unlocked:false,owned:["v_castaway"],selected:"v_castaway",wins:0}};return s;}
// Helpers
function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}
function ang(a,b){return Math.atan2(b.y-a.y,b.x-a.x);}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function rng(a,b){return a+Math.random()*(b-a);}
function collR(x,y,r,obs){for(const o of obs){const cx=clamp(x,o.x,o.x+o.w),cy=clamp(y,o.y,o.y+o.h);if(dist({x,y},{x:cx,y:cy})<r)return true;}return false;}
function spos(obs,r){let x,y,t=0;do{x=r+100+Math.random()*(MW-r*2-200);y=r+100+Math.random()*(MH-r*2-200);t++;}while(collR(x,y,r+8,obs)&&t<100);return{x,y};}
function pR(p){return Math.min(MAX_R,BASE_R+p.coins*GROW);}
function pHP(p){return(BASE_HP+(pR(p)-BASE_R)*HP_S)*p.ch.hpM;}
function pDMG(p){return(BASE_DMG+(pR(p)-BASE_R)*DMG_S)*p.ch.dmgM;}
function pSPD(p){return(MSPD-Math.min(pR(p)*0.006,1))*p.ch.spdM;}
function reach(p){return pR(p)*1.8+12;}
function genMap(m){m.obstacles=[];m.decos=[];const n=14+Math.floor(Math.random()*6);for(let i=0;i<n;i++){const w=30+Math.random()*80,h=30+Math.random()*80;const p=spos(m.obstacles,Math.max(w,h));m.obstacles.push({x:p.x-w/2,y:p.y-h/2,w,h});}
const nd=50+Math.floor(Math.random()*35);for(let i=0;i<nd;i++){const p=spos(m.obstacles,20);let t;if(m.deco==="tropical")t=Math.random()<0.6?"palm":"flower";else if(m.deco==="arctic")t=Math.random()<0.5?"snowmound":"ice";else t=Math.random()<0.5?"lavarock":"smoke";m.decos.push({x:p.x,y:p.y,type:t,sz:8+Math.random()*14,rot:Math.random()*Math.PI*2});}}
function getAllAlive(){const l=[];if(g.player.alive)l.push(g.player);for(const b of g.bots)if(b.alive)l.push(b);return l;}
function updateHUD(){const k=document.getElementById("yh-kills"),c=document.getElementById("yh-coins"),a=document.getElementById("yh-alive");if(k)k.textContent=`☠ ${g.player.kills} kills`;if(c)c.textContent=`🪙 ${g.player.coins}`;if(a)a.textContent=`🏴‍☠️ ${getAllAlive().length} alive`;}
// Init
function initGame(container,mapIdx,charId,onEnd){
const map=JSON.parse(JSON.stringify(MAPS[mapIdx%MAPS.length]));genMap(map);
const ch=map.chars.find(c=>c.id===charId)||map.chars[0];
container.innerHTML=`<canvas id="yh-canvas" width="${CW}" height="${CH}" style="display:block;margin:0 auto;border-radius:14px;cursor:crosshair;background:#1a2a3a;box-shadow:0 6px 20px rgba(0,0,0,0.3);max-width:100%;touch-action:none"></canvas><div id="yh-hud" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:14px;font-weight:700;max-width:800px;margin-left:auto;margin-right:auto"><span style="color:var(--success)" id="yh-kills">☠ 0 kills</span><span style="color:#ffd700" id="yh-coins">🪙 0</span><span style="color:var(--ink2)" id="yh-alive">🏴‍☠️ ${NBOTS+1} alive</span></div>`;
canvas=document.getElementById("yh-canvas");ctx=canvas.getContext("2d");
const sp=spos(map.obstacles,BASE_R);
g={state:"playing",frame:0,map,onEnd,mapIdx,player:{x:sp.x,y:sp.y,angle:0,coins:0,hp:100,maxHp:100,ch,swinging:0,swingCd:0,dashCharge:0,dashing:0,dashAngle:0,kills:0,alive:true,name:"You",color:ch.color,isPlayer:true},bots:[],coins:[],chests:[],particles:[],zone:{cx:MW/2,cy:MH/2,r:ZSR,targetR:ZSR},camera:{x:0,y:0},result:null};
for(let i=0;i<NBOTS;i++){const bsp=spos(map.obstacles,BASE_R);const bch=map.chars[Math.floor(Math.random()*map.chars.length)];const skill=0.25+Math.random()*0.75;
g.bots.push({x:bsp.x,y:bsp.y,angle:Math.random()*Math.PI*2,coins:Math.floor(rng(0,5)),hp:100,maxHp:100,ch:bch,color:bch.color,swinging:0,swingCd:0,dashCharge:0,dashing:0,dashAngle:0,kills:0,alive:true,name:BNAMES[i%BNAMES.length],
ai:{mode:"loot",skill,aimN:0.2+(1-skill)*0.6,reactT:10+Math.floor((1-skill)*25),reactCd:0,dashCd:0,sDir:1,sT:0,wA:Math.random()*Math.PI*2,wT:0}});}
for(let i=0;i<NCOINS;i++){const p=spos(map.obstacles,CR);g.coins.push({x:p.x,y:p.y});}
for(let i=0;i<NCHESTS;i++){const p=spos(map.obstacles,CHR);g.chests.push({x:p.x,y:p.y,open:false});}
g.player.maxHp=pHP(g.player);g.player.hp=g.player.maxHp;
for(const b of g.bots){b.maxHp=pHP(b);b.hp=b.maxHp;}
// Input
const kd=e=>{const k=e.key.toLowerCase();if("wasd".includes(k)){keys[k]=true;e.preventDefault();}};
const ku=e=>{const k=e.key.toLowerCase();if("wasd".includes(k))keys[k]=false;};
const mm=e=>{const r=canvas.getBoundingClientRect();mouseX=(e.clientX-r.left)*(CW/r.width);mouseY=(e.clientY-r.top)*(CH/r.height);};
const md=e=>{if(g.state==="ended"){doReturn();return;}mouseDown=true;};
const mu=()=>{mouseDown=false;};
const ts=e=>{e.preventDefault();const t=e.touches[0];if(t){const r=canvas.getBoundingClientRect();mouseX=(t.clientX-r.left)*(CW/r.width);mouseY=(t.clientY-r.top)*(CH/r.height);}if(e.touches.length>=2)mouseDown=true;};
const te=e=>{e.preventDefault();mouseDown=false;if(g.state==="ended")doReturn();};
canvas.addEventListener("mousemove",mm);canvas.addEventListener("mousedown",md);canvas.addEventListener("mouseup",mu);
canvas.addEventListener("touchstart",ts,{passive:false});canvas.addEventListener("touchmove",ts,{passive:false});canvas.addEventListener("touchend",te,{passive:false});
document.addEventListener("keydown",kd);document.addEventListener("keyup",ku);
let returned=false;
function doReturn(){if(returned)return;returned=true;cleanup();if(g.onEnd)g.onEnd(g.result);}
function cleanup(){canvas.removeEventListener("mousemove",mm);canvas.removeEventListener("mousedown",md);canvas.removeEventListener("mouseup",mu);canvas.removeEventListener("touchstart",ts);canvas.removeEventListener("touchmove",ts);canvas.removeEventListener("touchend",te);document.removeEventListener("keydown",kd);document.removeEventListener("keyup",ku);keys={};mouseDown=false;if(animId)cancelAnimationFrame(animId);}
g._cleanup=cleanup;g._doReturn=doReturn;
animId=requestAnimationFrame(tick);
}
// Loop
function tick(){if(!g)return;g.frame++;updateZone();if(g.player.alive)updatePlayer();for(const b of g.bots)if(b.alive)updateBot(b);updateCombat();collectCoins();updateParticles();checkWin();render();if(g.state!=="ended")animId=requestAnimationFrame(tick);}
// Zone
function updateZone(){if(g.frame>ZSSTART){const p=Math.min((g.frame-ZSSTART)/(ZDUR-ZSSTART),1);g.zone.targetR=ZSR-(ZSR-ZER)*p;}g.zone.r+=(g.zone.targetR-g.zone.r)*0.008;for(const e of getAllAlive()){const d=dist(e,{x:g.zone.cx,y:g.zone.cy});if(d>g.zone.r){e.hp-=ZDMG*(1+(d-g.zone.r)*0.001);if(e.hp<=0)killEntity(e,null);}}}
// Player — WASD only, no mouse-follow
function updatePlayer(){const p=g.player;if(!p.alive)return;const wmx=mouseX+g.camera.x,wmy=mouseY+g.camera.y;p.angle=Math.atan2(wmy-p.y,wmx-p.x);
if(p.dashing>0){p.dashing--;const nx=p.x+Math.cos(p.dashAngle)*DSPD,ny=p.y+Math.sin(p.dashAngle)*DSPD;if(!collR(nx,p.y,pR(p),g.map.obstacles))p.x=nx;if(!collR(p.x,ny,pR(p),g.map.obstacles))p.y=ny;p.x=clamp(p.x,pR(p),MW-pR(p));p.y=clamp(p.y,pR(p),MH-pR(p));return;}
let dx=0,dy=0;if(keys.w)dy-=1;if(keys.s)dy+=1;if(keys.a)dx-=1;if(keys.d)dx+=1;
if(dx&&dy){const l=Math.sqrt(dx*dx+dy*dy);dx/=l;dy/=l;}
if(dx||dy){const s=pSPD(p),nx=p.x+dx*s,ny=p.y+dy*s;if(!collR(nx,p.y,pR(p),g.map.obstacles))p.x=nx;if(!collR(p.x,ny,pR(p),g.map.obstacles))p.y=ny;p.x=clamp(p.x,pR(p),MW-pR(p));p.y=clamp(p.y,pR(p),MH-pR(p));}
if(p.swingCd>0)p.swingCd--;if(p.swinging>0)p.swinging--;
if(mouseDown){p.dashCharge++;}else{if(p.dashCharge>=DCHARGE){p.dashing=DDUR;p.dashAngle=p.angle;p.swinging=SDUR;p.swingCd=SCD;}else if(p.dashCharge>0&&p.swingCd<=0){p.swinging=SDUR;p.swingCd=SCD;}p.dashCharge=0;}
p.maxHp=pHP(p);g.camera.x=p.x-CW/2;g.camera.y=p.y-CH/2;}
// Bot AI
function updateBot(b){if(!b.alive)return;const ai=b.ai,r=pR(b);b.maxHp=pHP(b);
if(b.dashing>0){b.dashing--;const nx=b.x+Math.cos(b.dashAngle)*DSPD,ny=b.y+Math.sin(b.dashAngle)*DSPD;if(!collR(nx,b.y,r,g.map.obstacles))b.x=nx;if(!collR(b.x,ny,r,g.map.obstacles))b.y=ny;b.x=clamp(b.x,r,MW-r);b.y=clamp(b.y,r,MH-r);return;}
if(b.swingCd>0)b.swingCd--;if(b.swinging>0)b.swinging--;ai.dashCd=Math.max(0,ai.dashCd-1);ai.reactCd=Math.max(0,ai.reactCd-1);
const all=getAllAlive().filter(e=>e!==b);let nE=null,nD=Infinity;for(const e of all){const d=dist(b,e);if(d<nD){nD=d;nE=e;}}
let nC=null,cD=Infinity;for(const c of g.coins){const d=dist(b,c);if(d<cD){cD=d;nC=c;}}for(const c of g.chests){if(!c.open){const d=dist(b,c);if(d<cD){cD=d;nC=c;}}}
const zd=dist(b,{x:g.zone.cx,y:g.zone.cy}),inZ=zd>g.zone.r*0.78;
const sa=pR(b)/(nE?pR(nE):1);
if(inZ)ai.mode="zone";else if(nE&&nD<160+ai.skill*90&&sa>0.55&&ai.reactCd<=0)ai.mode="atk";else if(nE&&nD<90&&sa<0.6)ai.mode="flee";else ai.mode="loot";
let tx,ty;
if(ai.mode==="zone"){tx=g.zone.cx;ty=g.zone.cy;}
else if(ai.mode==="atk"){tx=nE.x;ty=nE.y;
if(nD<reach(b)+pR(nE)&&b.swingCd<=0){b.swinging=SDUR;b.swingCd=SCD;ai.reactCd=ai.reactT;}
if(nD<260&&nD>80&&ai.dashCd<=0&&b.swingCd<=0&&Math.random()<ai.skill*0.3){b.angle=ang(b,nE)+(Math.random()-0.5)*ai.aimN;b.dashAngle=b.angle;b.dashing=DDUR;b.swinging=SDUR;b.swingCd=SCD;ai.dashCd=60+Math.floor(Math.random()*90);}
ai.sT--;if(ai.sT<=0){ai.sDir*=-1;ai.sT=15+Math.floor(Math.random()*25);}
if(nD<140){const a=ang(b,nE)+ai.sDir*Math.PI/2.5;tx=b.x+Math.cos(a)*100;ty=b.y+Math.sin(a)*100;}}
else if(ai.mode==="flee"){tx=b.x-(nE.x-b.x);ty=b.y-(nE.y-b.y);if(nD<70&&ai.dashCd<=0){b.angle=ang(nE,b);b.dashAngle=b.angle;b.dashing=DDUR;ai.dashCd=80;}}
else{if(nC){tx=nC.x;ty=nC.y;}else{ai.wT--;if(ai.wT<=0){ai.wA=Math.random()*Math.PI*2;ai.wT=40+Math.floor(Math.random()*80);}tx=b.x+Math.cos(ai.wA)*120;ty=b.y+Math.sin(ai.wA)*120;}}
b.angle=ang(b,{x:tx,y:ty})+(Math.random()-0.5)*ai.aimN*0.4;
const s=pSPD(b),nx=b.x+Math.cos(b.angle)*s,ny=b.y+Math.sin(b.angle)*s;
if(!collR(nx,b.y,r,g.map.obstacles))b.x=nx;if(!collR(b.x,ny,r,g.map.obstacles))b.y=ny;b.x=clamp(b.x,r,MW-r);b.y=clamp(b.y,r,MH-r);}
// Combat
function updateCombat(){const all=getAllAlive();for(const a of all){if(a.swinging!==SDUR-1)continue;const wr=reach(a),dmg=pDMG(a);for(const v of all){if(v===a)continue;const d=dist(a,v);if(d>wr+pR(v))continue;const an=ang(a,v);let df=an-a.angle;while(df>Math.PI)df-=2*Math.PI;while(df<-Math.PI)df+=2*Math.PI;if(Math.abs(df)>SARC/2)continue;v.hp-=dmg;const kb=3+pR(a)*0.12;v.x+=Math.cos(an)*kb;v.y+=Math.sin(an)*kb;v.x=clamp(v.x,pR(v),MW-pR(v));v.y=clamp(v.y,pR(v),MH-pR(v));for(let i=0;i<4;i++)g.particles.push({x:v.x+rng(-8,8),y:v.y+rng(-8,8),vx:rng(-2,2),vy:rng(-2,2),life:12,color:"#ff4444"});if(v.hp<=0)killEntity(v,a);}}}
function killEntity(v,k){v.alive=false;const d=Math.floor(v.coins*DROPPCT);for(let i=0;i<Math.min(d,35);i++)g.coins.push({x:v.x+rng(-50,50),y:v.y+rng(-50,50)});if(k){k.kills++;k.coins+=Math.floor(d*0.25);}for(let i=0;i<10;i++)g.particles.push({x:v.x,y:v.y,vx:rng(-4,4),vy:rng(-4,4),life:16,color:v.color||"#888"});updateHUD();}
function collectCoins(){const all=getAllAlive();for(const p of all){const r=pR(p);for(let i=g.coins.length-1;i>=0;i--){if(dist(p,g.coins[i])<r+CR){p.coins++;g.coins.splice(i,1);p.maxHp=pHP(p);p.hp=Math.min(p.hp+1.5,p.maxHp);}}for(const c of g.chests){if(!c.open&&dist(p,c)<r+CHR){c.open=true;p.coins+=5;for(let i=0;i<5;i++)g.particles.push({x:c.x,y:c.y,vx:rng(-2,2),vy:rng(-3,-1),life:10,color:"#ffd700"});p.maxHp=pHP(p);p.hp=Math.min(p.hp+8,p.maxHp);}}}}
function updateParticles(){for(let i=g.particles.length-1;i>=0;i--){const p=g.particles[i];p.x+=p.vx;p.y+=p.vy;p.life--;if(p.life<=0)g.particles.splice(i,1);}}
function checkWin(){if(g.state!=="playing")return;const a=getAllAlive();if(!g.player.alive){endGame(a.length+1);return;}if(a.length<=1&&g.player.alive){endGame(1);return;}}
function endGame(place){g.state="ended";const dbl=g.player.kills*3+(place===1?30:place<=3?12:place<=5?5:2)+Math.floor(g.player.coins/4);
g.result={place,kills:g.player.kills,doubloons:dbl,totalCoins:g.player.coins,won:place===1};
const s=getSave();s.doubloons=(s.doubloons||0)+dbl;
if(place===1){const mid=MAPS[g.mapIdx%MAPS.length].id;if(s.maps[mid])s.maps[mid].wins=(s.maps[mid].wins||0)+1;
const mdat=MAPS[g.mapIdx%MAPS.length],maxCh=mdat.chars[mdat.chars.length-1];
if(g.player.ch.id===maxCh.id){const ni=(g.mapIdx+1)%MAPS.length,nid=MAPS[ni].id;if(s.maps[nid]&&!s.maps[nid].unlocked){s.maps[nid].unlocked=true;g.result.unlockedMap=MAPS[ni].name;}}}
writeSave(s);updateHUD();}
// Render
function render(){const cam=g.camera;ctx.clearRect(0,0,CW,CH);ctx.fillStyle=g.map.ground;ctx.fillRect(0,0,CW,CH);
ctx.strokeStyle="rgba(0,0,0,0.04)";ctx.lineWidth=1;const gs=80;const ox=-(cam.x%gs),oy=-(cam.y%gs);for(let x=ox;x<CW;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke();}for(let y=oy;y<CH;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke();}
for(const d of g.map.decos){const sx=d.x-cam.x,sy=d.y-cam.y;if(sx<-30||sx>CW+30||sy<-30||sy>CH+30)continue;drawDeco(sx,sy,d);}
drawZone(cam);
ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=3;ctx.strokeRect(-cam.x,-cam.y,MW,MH);
for(const o of g.map.obstacles){const ox2=o.x-cam.x,oy2=o.y-cam.y;if(ox2+o.w<-10||ox2>CW+10||oy2+o.h<-10||oy2>CH+10)continue;ctx.fillStyle=g.map.obsCol;ctx.fillRect(ox2,oy2,o.w,o.h);ctx.fillStyle="rgba(0,0,0,0.1)";ctx.fillRect(ox2,oy2+o.h-3,o.w,3);}
for(const c of g.chests){const sx=c.x-cam.x,sy=c.y-cam.y;if(sx<-20||sx>CW+20||sy<-20||sy>CH+20)continue;if(c.open){ctx.fillStyle="rgba(100,70,30,0.2)";ctx.fillRect(sx-10,sy-8,20,16);}else{ctx.fillStyle="#8a5a1a";ctx.fillRect(sx-12,sy-9,24,18);ctx.fillStyle="#c08a30";ctx.fillRect(sx-10,sy-7,20,14);ctx.fillStyle="#ffd700";ctx.fillRect(sx-2,sy-3,4,6);}}
ctx.fillStyle="#ffd700";for(const c of g.coins){const sx=c.x-cam.x,sy=c.y-cam.y;if(sx<-8||sx>CW+8||sy<-8||sy>CH+8)continue;ctx.beginPath();ctx.arc(sx,sy,CR,0,Math.PI*2);ctx.fill();}
getAllAlive().sort((a,b)=>a.y-b.y).forEach(e=>drawEntity(e,cam));
for(const p of g.particles){const sx=p.x-cam.x,sy=p.y-cam.y;ctx.globalAlpha=p.life/16;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(sx,sy,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
drawMinimap();
if(g.player.alive&&g.player.dashCharge>0){const pr=Math.min(g.player.dashCharge/DCHARGE,1);ctx.fillStyle="rgba(0,0,0,0.5)";ctx.fillRect(CW/2-40,CH-26,80,6);ctx.fillStyle=pr>=1?"#ffd700":"#fff";ctx.fillRect(CW/2-40,CH-26,80*pr,6);if(pr>=1){ctx.fillStyle="#ffd700";ctx.font="bold 11px Nunito,sans-serif";ctx.textAlign="center";ctx.fillText("DASH!",CW/2,CH-31);}}
if(g.state==="ended"&&g.result){ctx.fillStyle="rgba(0,0,0,0.6)";ctx.fillRect(0,0,CW,CH);ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="bold 42px Nunito,sans-serif";ctx.fillText(g.result.place===1?"🏆 VICTORY!":"💀 Defeated",CW/2,CH/2-65);ctx.font="bold 20px Nunito,sans-serif";ctx.fillText(`#${g.result.place} · ${g.result.kills} kills`,CW/2,CH/2-28);ctx.fillStyle="#ffd700";ctx.font="bold 18px Nunito,sans-serif";ctx.fillText(`+${g.result.doubloons} doubloons`,CW/2,CH/2+8);if(g.result.unlockedMap){ctx.fillStyle="#4caf50";ctx.font="bold 16px Nunito,sans-serif";ctx.fillText(`🗺️ ${g.result.unlockedMap} unlocked!`,CW/2,CH/2+35);}ctx.fillStyle="rgba(255,255,255,0.5)";ctx.font="bold 13px Nunito,sans-serif";ctx.fillText("Click to return",CW/2,CH/2+65);}}
function drawDeco(sx,sy,d){ctx.save();ctx.translate(sx,sy);if(d.type==="palm"){ctx.fillStyle="#6a4a2a";ctx.fillRect(-2,0,4,d.sz*1.2);ctx.fillStyle="#2d8a2d";ctx.beginPath();ctx.arc(0,-d.sz*0.3,d.sz*0.7,0,Math.PI*2);ctx.fill();ctx.fillStyle="#3aaa3a";ctx.beginPath();ctx.arc(2,-d.sz*0.5,d.sz*0.4,0,Math.PI*2);ctx.fill();}else if(d.type==="flower"){ctx.fillStyle="#e88090";ctx.beginPath();ctx.arc(0,0,d.sz*0.25,0,Math.PI*2);ctx.fill();}else if(d.type==="snowmound"){ctx.fillStyle="rgba(220,235,245,0.6)";ctx.beginPath();ctx.ellipse(0,0,d.sz,d.sz*0.45,0,0,Math.PI*2);ctx.fill();}else if(d.type==="ice"){ctx.fillStyle="rgba(150,200,240,0.5)";ctx.rotate(d.rot);ctx.fillRect(-1.5,-d.sz,3,d.sz*2);ctx.fillRect(-d.sz,-1.5,d.sz*2,3);}else if(d.type==="lavarock"){ctx.fillStyle="#2a1a0a";ctx.beginPath();ctx.arc(0,0,d.sz*0.45,0,Math.PI*2);ctx.fill();ctx.fillStyle="#c84020";ctx.beginPath();ctx.arc(1,-1,d.sz*0.15,0,Math.PI*2);ctx.fill();}else if(d.type==="smoke"){ctx.fillStyle="rgba(80,60,50,0.12)";ctx.beginPath();ctx.arc(0,0,d.sz,0,Math.PI*2);ctx.fill();}ctx.restore();}
function drawEntity(e,cam){const sx=e.x-cam.x,sy=e.y-cam.y;if(sx<-80||sx>CW+80||sy<-80||sy>CH+80)return;const r=pR(e),isP=e.isPlayer;ctx.fillStyle="rgba(0,0,0,0.1)";ctx.beginPath();ctx.ellipse(sx,sy+r*0.3,r*0.65,r*0.22,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=e.color||"#888";ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=1.5;ctx.stroke();
const ex=sx+Math.cos(e.angle)*r*0.3,ey=sy+Math.sin(e.angle)*r*0.3;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(ex-2,ey-1,r*0.15,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(ex+3,ey-1,r*0.15,0,Math.PI*2);ctx.fill();ctx.fillStyle="#111";ctx.beginPath();ctx.arc(ex-1.5+Math.cos(e.angle),ey-1+Math.sin(e.angle),r*0.06,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(ex+3.5+Math.cos(e.angle),ey-1+Math.sin(e.angle),r*0.06,0,Math.PI*2);ctx.fill();
const wr=reach(e);if(e.swinging>0){const sp=1-(e.swinging/SDUR);const sa=e.angle-SARC/2+SARC*sp;ctx.strokeStyle="#c8c8c8";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx+Math.cos(sa)*r,sy+Math.sin(sa)*r);ctx.lineTo(sx+Math.cos(sa)*wr,sy+Math.sin(sa)*wr);ctx.stroke();ctx.strokeStyle="rgba(255,255,255,0.15)";ctx.lineWidth=1;ctx.beginPath();ctx.arc(sx,sy,wr,e.angle-SARC/2,e.angle-SARC/2+SARC*sp);ctx.stroke();}else{ctx.strokeStyle="#999";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sx+Math.cos(e.angle)*r,sy+Math.sin(e.angle)*r);ctx.lineTo(sx+Math.cos(e.angle)*(r+wr*0.3),sy+Math.sin(e.angle)*(r+wr*0.3));ctx.stroke();}
if(e.dashing>0){ctx.strokeStyle="rgba(255,255,255,0.25)";ctx.lineWidth=r*0.7;ctx.beginPath();ctx.moveTo(sx-Math.cos(e.dashAngle)*r*1.3,sy-Math.sin(e.dashAngle)*r*1.3);ctx.lineTo(sx,sy);ctx.stroke();}
const hw=Math.max(26,r*2);ctx.fillStyle="rgba(0,0,0,0.35)";ctx.fillRect(sx-hw/2,sy-r-10,hw,4);const pct=Math.max(0,e.hp/e.maxHp);ctx.fillStyle=pct>0.5?"#4caf50":pct>0.25?"#f5a623":"#e04858";ctx.fillRect(sx-hw/2,sy-r-10,hw*pct,4);
ctx.fillStyle=isP?"#fff":"rgba(255,255,255,0.7)";ctx.font=`bold ${clamp(r*0.45,8,13)}px Nunito,sans-serif`;ctx.textAlign="center";ctx.fillText(`${e.ch?.emoji||""} ${e.name}`,sx,sy-r-14);}
function drawZone(cam){ctx.save();ctx.beginPath();ctx.rect(0,0,CW,CH);ctx.beginPath();ctx.arc(g.zone.cx-cam.x,g.zone.cy-cam.y,g.zone.r,0,Math.PI*2);ctx.rect(CW,0,-CW,CH);ctx.fillStyle="rgba(180,30,20,0.2)";ctx.fill();ctx.restore();ctx.strokeStyle="rgba(200,40,30,0.45)";ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.beginPath();ctx.arc(g.zone.cx-cam.x,g.zone.cy-cam.y,g.zone.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
function drawMinimap(){const mw=110,mh=110,mx=CW-mw-8,my=8,sc=mw/MW;ctx.fillStyle="rgba(0,0,0,0.3)";ctx.fillRect(mx,my,mw,mh);ctx.strokeStyle="rgba(200,40,30,0.4)";ctx.lineWidth=1;ctx.beginPath();ctx.arc(mx+g.zone.cx*sc,my+g.zone.cy*sc,g.zone.r*sc,0,Math.PI*2);ctx.stroke();for(const b of g.bots){if(!b.alive)continue;ctx.fillStyle="rgba(255,80,80,0.5)";ctx.fillRect(mx+b.x*sc-1,my+b.y*sc-1,2,2);}if(g.player.alive){ctx.fillStyle="#4caf50";ctx.fillRect(mx+g.player.x*sc-2,my+g.player.y*sc-2,4,4);}ctx.strokeStyle="rgba(255,255,255,0.15)";ctx.strokeRect(mx,my,mw,mh);}
window.PirateRoyale={init:initGame,cleanup(){if(g&&g._cleanup)g._cleanup();g=null;},MAPS,getSave,writeSave};
})();
