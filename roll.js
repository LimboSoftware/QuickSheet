(() => {
'use strict';

const $=s=>document.querySelector(s);
const dlg=$('#rollDialog');
if(!dlg)return;

const els={
  title:$('#rollTitle'),sub:$('#rollSubtitle'),phase:$('#rollPhase'),enemyT:$('#enemyT'),
  enemySv:$('#enemySv'),enemyInv:$('#enemyInv'),targetModels:$('#targetModels'),
  targetKeyword:$('#targetKeyword'),half:$('#halfRange'),cover:$('#targetCover'),
  stationary:$('#remainedStationary'),charged:$('#madeCharge'),hitMod:$('#hitMod'),
  woundMod:$('#woundMod'),rerollHits:$('#rerollHits'),rerollWounds:$('#rerollWounds'),
  lethal:$('#buffLethal'),sustained:$('#buffSustained'),dev:$('#buffDevastating'),
  ignoreRules:$('#ignoreWeaponRules'),weapons:$('#rollWeapons'),notice:$('#rollNotice'),
  roll:$('#rollNowBtn'),results:$('#rollResults')
};

let unit=null;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9+\-]+/g,' ').replace(/\s+/g,' ').trim();
const d6=()=>1+Math.floor(Math.random()*6);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function numPlus(v,fallback=7){
  const m=String(v??'').match(/(\d+)\+/);
  return m?Number(m[1]):fallback;
}
function num(v,fallback=0){
  const n=Number(String(v??'').replace(/[^0-9+\-.]/g,''));
  return Number.isFinite(n)?n:fallback;
}
function rollExpr(expr){
  const s=String(expr??'1').toUpperCase().replace(/\s+/g,'');
  if(/^\d+$/.test(s))return Number(s);
  const m=s.match(/^(\d*)D(3|6)([+-]\d+)?$/);
  if(!m)return Math.max(1,num(s,1));
  const count=Number(m[1]||1),sides=Number(m[2]),mod=Number(m[3]||0);
  let total=mod;
  for(let i=0;i<count;i++)total+=1+Math.floor(Math.random()*sides);
  return Math.max(0,total);
}
function woundTarget(s,t){
  if(s>=t*2)return 2;
  if(s>t)return 3;
  if(s===t)return 4;
  if(s*2<=t)return 6;
  return 5;
}
function weaponAbilities(p){
  const k=norm(p?.chars?.Keywords||'');
  const out={
    blast:/\bblast\b/.test(k),
    torrent:/\btorrent\b/.test(k),
    twin:/\btwin linked\b/.test(k),
    lethal:/\blethal hits\b/.test(k),
    dev:/\bdevastating wounds\b/.test(k),
    heavy:/\bheavy\b/.test(k),
    ignoresCover:/\bignores cover\b/.test(k),
    lance:/\blance\b/.test(k),
    rapid:null,melta:null,sustained:null,anti:[]
  };
  let m=k.match(/rapid fire\s+([0-9d+\-]+)/); if(m)out.rapid=m[1];
  m=k.match(/melta\s+([0-9d+\-]+)/); if(m)out.melta=m[1];
  m=k.match(/sustained hits\s+([0-9d+\-]+)/); if(m)out.sustained=m[1];
  const re=/anti\s+([a-z]+)\s+(\d+)\+/g;
  while((m=re.exec(k)))out.anti.push({keyword:m[1].toUpperCase(),threshold:Number(m[2])});
  return out;
}
function weaponKey(p,i){return (p.selectionName||p.name||'weapon')+'::'+i}
function weaponsForPhase(){
  if(!unit)return[];
  const melee=els.phase.value==='melee';
  return (unit.profiles||[]).filter(p=>p.kind==='weapons'&&((String(p.chars?.Range||'').toLowerCase()==='melee')===melee));
}
function renderWeapons(){
  const list=weaponsForPhase();
  const oldCounts=list.some(p=>!Number.isFinite(Number(p.equipped)));
  els.notice.textContent=oldCounts?'This saved import predates weapon counts. Remove and re-import the list once for exact quantities.':'Weapon quantities detected from the imported list.';
  if(!list.length){
    els.weapons.innerHTML='<div class="roll-empty">No '+(els.phase.value==='melee'?'melee':'ranged')+' weapons found in this imported unit.</div>';
    els.roll.disabled=true; return;
  }
  els.roll.disabled=false;
  const groups={};
  list.forEach((p,i)=>{const g=p.selectionName||p.name||('weapon'+i);(groups[g]??=[]).push(i)});
  els.weapons.innerHTML=list.map((p,i)=>{
    const c=p.chars||{},ab=weaponAbilities(p),group=p.selectionName||p.name||('weapon'+i);
    const alt=groups[group].length>1;
    const control=alt
      ? '<input type="radio" name="weapon-group-'+esc(group)+'" data-roll-weapon="'+i+'" '+(groups[group][0]===i?'checked':'')+'>'
      : '<input type="checkbox" data-roll-weapon="'+i+'" checked>';
    const tags=String(c.Keywords||'').trim();
    return '<div class="roll-weapon-row">'+
      '<div class="roll-weapon-check">'+control+'</div>'+
      '<div class="roll-weapon-main"><strong>'+esc(p.name||'Weapon')+'</strong>'+
      (alt?'<span class="roll-alt">choose profile</span>':'')+
      (tags?'<span class="roll-tags">'+esc(tags)+'</span>':'')+'</div>'+
      '<label class="roll-qty">Qty <input type="number" min="0" max="50" value="'+Math.max(1,Number(p.equipped)||1)+'" data-roll-qty="'+i+'"></label>'+
      '<div class="roll-statline">'+
      '<span>A <b>'+esc(c.A||'—')+'</b></span><span>'+(els.phase.value==='melee'?'WS':'BS')+' <b>'+esc(c.WS||c.BS||'—')+'</b></span>'+
      '<span>S <b>'+esc(c.S||'—')+'</b></span><span>AP <b>'+esc(c.AP||'—')+'</b></span><span>D <b>'+esc(c.D||'—')+'</b></span>'+
      '</div></div>';
  }).join('');
}
function rerollMode(roll,target,mode){
  if(mode==='ones'&&roll===1)return true;
  if(mode==='failed'&&roll<target)return true;
  return false;
}
function rollHit(target,mod,reroll){
  let r=d6();
  if(rerollMode(r,target,reroll))r=d6();
  if(r===1)return {hit:false,crit:false,roll:r};
  if(r===6)return {hit:true,crit:true,roll:r};
  return {hit:r+mod>=target,crit:false,roll:r};
}
function rollWound(target,mod,reroll,antiThreshold){
  let r=d6();
  const antiCrit=antiThreshold&&r>=antiThreshold;
  const failed=!(r===6||antiCrit||(r!==1&&r+mod>=target));
  if((reroll==='ones'&&r===1)||(reroll==='failed'&&failed)){
    r=d6();
  }
  if(r===1)return {wound:false,crit:false,roll:r};
  if(r===6)return {wound:true,crit:true,roll:r};
  if(antiThreshold&&r>=antiThreshold)return {wound:true,crit:true,roll:r};
  return {wound:r+mod>=target,crit:false,roll:r};
}
function damageRoll(expr,melta){
  return Math.max(0,rollExpr(expr)+(melta||0));
}
function rollOneWeapon(p,qty,settings){
  const c=p.chars||{},ab=settings.ignore?{
    blast:false,torrent:false,twin:false,lethal:false,dev:false,heavy:false,ignoresCover:false,lance:false,rapid:null,melta:null,sustained:null,anti:[]
  }:weaponAbilities(p);

  let attacks=0;
  const attackBreak=[];
  for(let i=0;i<qty;i++){
    let a=rollExpr(c.A||1);
    if(ab.blast)a+=Math.floor(settings.models/5);
    if(ab.rapid&&settings.half)a+=rollExpr(ab.rapid);
    attacks+=a;attackBreak.push(a);
  }

  let skill=numPlus(c.WS||c.BS,7);
  // In current 11th edition Benefit of Cover worsens BS by 1 rather than modifying the save.
  if(settings.phase==='ranged'&&settings.cover&&!ab.ignoresCover)skill=Math.min(7,skill+1);
  let hitMod=settings.hitMod;
  if(ab.heavy&&settings.phase==='ranged'&&settings.stationary)hitMod+=1;
  hitMod=clamp(hitMod,-1,1);

  const lethal=ab.lethal||settings.lethal;
  const dev=ab.dev||settings.dev;
  const weaponSustained=ab.sustained||'0';
  const buffSustained=String(settings.sustained||0);

  let hitCount=0,critHits=0,lethalAuto=0,extraHits=0;
  if(ab.torrent){
    hitCount=attacks;
  }else{
    for(let i=0;i<attacks;i++){
      const h=rollHit(skill,hitMod,settings.rerollHits);
      if(h.hit){
        hitCount++;
        if(h.crit){
          critHits++;
          if(lethal)lethalAuto++;
          const wVal=rollExpr(weaponSustained);
          const bVal=rollExpr(buffSustained);
          const add=Math.max(wVal,bVal);
          extraHits+=add;
        }
      }
    }
  }

  const normalHits=hitCount-lethalAuto+extraHits;
  const strength=Math.max(1,num(c.S,1));
  const target=woundTarget(strength,settings.t);
  const woundMod=clamp(settings.woundMod+(ab.lance&&settings.charged?1:0),-1,1);
  const targetKey=settings.keyword;
  let antiThreshold=null;
  for(const a of ab.anti)if(a.keyword===targetKey)antiThreshold=antiThreshold?Math.min(antiThreshold,a.threshold):a.threshold;
  const rrWounds=ab.twin?'failed':settings.rerollWounds;

  let normalWounds=lethalAuto,critWounds=0;
  for(let i=0;i<normalHits;i++){
    const w=rollWound(target,woundMod,rrWounds,antiThreshold);
    if(w.wound){
      if(w.crit)critWounds++;
      else normalWounds++;
    }
  }

  let mortalDamage=0;
  let saveable=normalWounds;
  if(dev){
    for(let i=0;i<critWounds;i++)mortalDamage+=damageRoll(c.D||1,ab.melta&&settings.half?rollExpr(ab.melta):0);
  }else{
    saveable+=critWounds;
  }

  const sv=numPlus(settings.sv,7), inv=settings.inv?numPlus(settings.inv,99):99;
  const ap=num(c.AP,0);
  let failedSaves=0;
  for(let i=0;i<saveable;i++){
    const r=d6();
    const invSaved=r>=inv;
    const armourSaved=(r+ap)>=sv;
    if(!(invSaved||armourSaved))failedSaves++;
  }

  let normalDamage=0;
  for(let i=0;i<failedSaves;i++){
    const melta=ab.melta&&settings.half?rollExpr(ab.melta):0;
    normalDamage+=damageRoll(c.D||1,melta);
  }

  return {
    name:p.name||'Weapon',qty,attacks,attackBreak,skill,hitMod,hitCount,critHits,extraHits,
    lethalAuto,woundTarget:target,woundMod,normalWounds,critWounds,saveable,failedSaves,
    mortalDamage,normalDamage,totalDamage:normalDamage+mortalDamage,abilities:ab
  };
}
function settings(){
  return {
    phase:els.phase.value,t:clamp(Number(els.enemyT.value)||1,1,30),
    sv:els.enemySv.value,inv:els.enemyInv.value,models:clamp(Number(els.targetModels.value)||1,1,50),
    keyword:els.targetKeyword.value.toUpperCase(),half:els.half.checked,cover:els.cover.checked,
    stationary:els.stationary.checked,charged:els.charged.checked,
    hitMod:Number(els.hitMod.value)||0,woundMod:Number(els.woundMod.value)||0,
    rerollHits:els.rerollHits.value,rerollWounds:els.rerollWounds.value,
    lethal:els.lethal.checked,sustained:Number(els.sustained.value)||0,dev:els.dev.checked,
    ignore:els.ignoreRules.checked
  };
}
function resultCard(r){
  const notes=[];
  if(r.extraHits)notes.push('+'+r.extraHits+' sustained hit'+(r.extraHits===1?'':'s'));
  if(r.lethalAuto)notes.push(r.lethalAuto+' lethal auto-wound'+(r.lethalAuto===1?'':'s'));
  if(r.mortalDamage)notes.push(r.mortalDamage+' devastating mortal damage');
  return '<div class="roll-result-card">'+
    '<div class="roll-result-head"><strong>'+esc(r.name)+'</strong><span>'+r.qty+' equipped · '+r.attacks+' attacks</span></div>'+
    '<div class="roll-result-grid">'+
      '<div><span>HITS</span><b>'+r.hitCount+(r.extraHits?' + '+r.extraHits:'')+'</b></div>'+
      '<div><span>WOUNDS</span><b>'+(r.normalWounds+r.critWounds)+'</b></div>'+
      '<div><span>FAILED SAVES</span><b>'+r.failedSaves+'</b></div>'+
      '<div><span>DAMAGE</span><b>'+r.totalDamage+'</b></div>'+
    '</div>'+
    '<div class="roll-result-meta">Hit '+r.skill+'+'+(r.hitMod?' ('+(r.hitMod>0?'+':'')+r.hitMod+' roll)':'')+
      ' · Wound '+r.woundTarget+'+'+(r.woundMod?' ('+(r.woundMod>0?'+':'')+r.woundMod+')':'')+
      (notes.length?' · '+esc(notes.join(' · ')):'')+'</div>'+
  '</div>';
}
function doRoll(){
  const list=weaponsForPhase(),s=settings(),chosen=[];
  els.weapons.querySelectorAll('[data-roll-weapon]').forEach(input=>{
    if(!input.checked)return;
    const i=Number(input.dataset.rollWeapon);
    const q=els.weapons.querySelector('[data-roll-qty="'+i+'"]');
    const qty=clamp(Number(q?.value)||0,0,50);
    if(qty>0&&list[i])chosen.push({p:list[i],qty});
  });
  if(!chosen.length){
    els.results.innerHTML='<div class="roll-empty">Select at least one weapon.</div>';return;
  }
  const results=chosen.map(x=>rollOneWeapon(x.p,x.qty,s));
  const total=results.reduce((n,r)=>n+r.totalDamage,0);
  const mortal=results.reduce((n,r)=>n+r.mortalDamage,0);
  els.results.innerHTML='<div class="roll-total"><span>ESTIMATED DAMAGE ROLLED</span><strong>'+total+'</strong>'+
    (mortal?'<small>'+mortal+' mortal from Devastating Wounds</small>':'')+
    '</div>'+results.map(resultCard).join('');
}
function openRoller(){
  unit=window.QS_CURRENT_UNIT;
  if(!unit)return;
  els.title.textContent='ROLL · '+unit.name;
  els.sub.textContent=(unit.modelCount?unit.modelCount+' models · ':'')+'selected wargear from imported list';
  els.results.innerHTML='';
  els.phase.value='ranged';
  renderWeapons();
  dlg.showModal();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('#rollUnitBtn');
  if(b){e.preventDefault();openRoller()}
});
els.phase.addEventListener('change',()=>{els.results.innerHTML='';renderWeapons()});
els.roll.addEventListener('click',doRoll);
})();
