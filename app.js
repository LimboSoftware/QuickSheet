(() => {
'use strict';
const GROUPS=['EPIC CHARACTERS','CHARACTERS','INFANTRY','MOUNTED','VEHICLES','MONSTERS','AIRCRAFT','BEASTS','SWARMS','FORTIFICATIONS','OTHER'];
const $=s=>document.querySelector(s);
const els={tabs:$('#tabs'),browser:$('#browser'),card:$('#cardPane'),search:$('#searchInput'),wake:$('#wakeWord'),status:$('#voiceStatus'),mic:$('#micToggle'),file:$('#fileInput'),dialog:$('#armyDialog'),checklist:$('#armyChecklist'),toast:$('#toast')};
const state={units:[],reference:{factions:{}},selectedArmies:[],tabs:[],activeTab:null,rosters:[],micOn:true,wakeArmed:false,recognition:null};
const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const toast=m=>{els.toast.textContent=m;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),1800)};
const aliases={windriders:['wind riders','win riders','wind writers'],rangers:['ranges','ranger'],wraithlord:['wraith lord','wraith lot'],wraithguard:['wraith guard']};
function score(q,name){q=norm(q);name=norm(name);if(!q||!name)return 0;if(q===name)return 100;if(name.includes(q)||q.includes(name))return 92;for(const a of aliases[name]||[])if(norm(a)===q)return 99;let same=0;for(let i=0;i<Math.min(q.length,name.length);i++){if(q[i]!==name[i])break;same++}return same>=4?70+Math.min(20,same):0}
function matches(q,units){return units.map(u=>({u,s:score(q,u.name)})).filter(x=>x.s>35).sort((a,b)=>b.s-a.s).slice(0,20)}
function group(u){const k=new Set((u.keywords||[]).map(norm));if(k.has('epic hero'))return'EPIC CHARACTERS';if(k.has('character'))return'CHARACTERS';if(k.has('infantry'))return'INFANTRY';if(k.has('mounted'))return'MOUNTED';if(k.has('vehicle'))return'VEHICLES';if(k.has('monster'))return'MONSTERS';if(k.has('aircraft'))return'AIRCRAFT';if(k.has('beast'))return'BEASTS';if(k.has('swarm'))return'SWARMS';if(k.has('fortification'))return'FORTIFICATIONS';return'OTHER'}
function save(){localStorage.setItem('qs.web',JSON.stringify({selectedArmies:state.selectedArmies,wake:els.wake.value,micOn:state.micOn,rosters:state.rosters,activeTab:state.activeTab}))}
function loadSaved(){try{const p=JSON.parse(localStorage.getItem('qs.web')||'{}');state.selectedArmies=p.selectedArmies||[];state.rosters=p.rosters||[];state.micOn=p.micOn!==false;state.activeTab=p.activeTab||null;els.wake.value=p.wake||'check'}catch{}}
async function load(){const [u,r]=await Promise.all([fetch('data/units.json',{cache:'no-store'}).then(x=>x.json()),fetch('data/reference.json',{cache:'no-store'}).then(x=>x.json())]);state.units=Array.isArray(u)?u:(u.units||[]);state.reference=r||{factions:{}};const armies=[...new Set(state.units.map(x=>x.army).filter(Boolean))].sort();if(!state.selectedArmies.length)state.selectedArmies=armies.slice(0,1);state.selectedArmies=state.selectedArmies.filter(a=>armies.includes(a));buildTabs();renderAll();populateArmyDialog();setupVoice()}
function buildTabs(){const t=[];if(state.selectedArmies.length<=3)state.selectedArmies.forEach(a=>t.push({id:'army:'+a,label:a.replace(/^(Imperium|Chaos|Xenos) - /,''),kind:'army',army:a}));else if(state.selectedArmies.length)t.push({id:'combined',label:state.selectedArmies.length+' ARMIES',kind:'combined',armies:[...state.selectedArmies]});for(const r of state.rosters)t.push({id:'roster:'+r.id,label:r.label,kind:'roster',roster:r});state.tabs=t;if(!t.some(x=>x.id===state.activeTab))state.activeTab=t[0]?.id||null}
function current(){return state.tabs.find(x=>x.id===state.activeTab)}
function unitsFor(tab=current()){if(!tab)return[];if(tab.kind==='army')return state.units.filter(u=>u.army===tab.army);if(tab.kind==='combined')return state.units.filter(u=>tab.armies.includes(u.army));if(tab.kind==='roster')return tab.roster.units||[];return[]}
function renderTabs(){els.tabs.innerHTML='';for(const t of state.tabs){const b=document.createElement('button');b.className='tab'+(t.id===state.activeTab?' active':'');b.innerHTML='<span>'+esc(t.label)+'</span>'+(t.kind==='roster'?'<span class="tab-x">×</span>':'');b.onclick=e=>{if(e.target.classList.contains('tab-x')){state.rosters=state.rosters.filter(r=>r.id!==t.roster.id);buildTabs();save();renderAll();return}state.activeTab=t.id;els.search.value='';save();renderAll()};els.tabs.appendChild(b)}}
function footer(){return '<div class="reference-block"><div class="browser-heading">ARMY REFERENCE</div><button class="row reference" data-ref="army"><span>◆ ARMY RULES</span></button><button class="row reference" data-ref="detach"><span>◆ DETACHMENTS</span></button><button class="row reference" data-ref="strats"><span>◆ STRATAGEMS</span></button></div>'}
function renderBrowser(){const units=unitsFor(),q=els.search.value.trim(),m=q?matches(q,units):[],picked=new Set(m.map(x=>x.u.bs_id||x.u.name));let h='';if(m.length)h+='<div class="browser-heading matches">MATCHES</div>'+m.map(x=>row(x.u)).join('');const g=Object.fromEntries(GROUPS.map(x=>[x,[]]));for(const u of units){if(picked.has(u.bs_id||u.name))continue;(g[group(u)]||g.OTHER).push(u)}for(const k of GROUPS){if(!g[k].length)continue;h+='<div class="browser-heading">'+k+'</div>'+g[k].sort((a,b)=>a.name.localeCompare(b.name)).map(row).join('')}h+=footer();els.browser.innerHTML=h;els.browser.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{const u=units.find(x=>(x.bs_id||x.name)===b.dataset.unit);if(u)renderUnit(u)});els.browser.querySelectorAll('[data-ref]').forEach(b=>b.onclick=()=>renderRef(b.dataset.ref))}
function row(u){return '<button class="row" data-unit="'+esc(u.bs_id||u.name)+'"><span>'+esc(u.roster_entry_label||u.name)+'</span><span class="pts">'+(u.points!=null?esc(u.points)+' pts':'')+'</span></button>'}
function renderAll(){buildTabs();renderTabs();renderBrowser();updateVoice()}
function stat(u,k){const p=(u.profiles||[]).find(x=>x.kind==='stats');return p?.chars?.[k]??'—'}
function weaponTable(title,items){if(!items.length)return'';const rows=items.map(p=>{const c=p.chars||{};const skill=c.BS||c.WS||'—';return '<tr><td><span class="weapon-name">'+esc(p.name||'')+'</span>'+(c.Keywords?'<span class="weapon-keywords">'+esc(c.Keywords)+'</span>':'')+'</td><td>'+esc(c.Range||'—')+'</td><td>'+esc(c.A||'—')+'</td><td>'+esc(skill)+'</td><td>'+esc(c.S||'—')+'</td><td>'+esc(c.AP||'—')+'</td><td>'+esc(c.D||'—')+'</td></tr>'}).join('');return section(title,'<table class="weapon-table"><thead><tr><th>Name</th><th>Range</th><th>A</th><th>BS/WS</th><th>S</th><th>AP</th><th>D</th></tr></thead><tbody>'+rows+'</tbody></table>')}
function rulesHtml(items){return items.map(r=>'<div class="rule"><div class="rule-name">'+esc(r.name||'')+'</div><div class="rule-desc">'+esc(r.description||'')+'</div></div>').join('')}
function renderUnit(u){
  const stats=['M','T','Sv','W','LD','OC','InSv'];
  const profiles=u.profiles||[];
  const ranged=profiles.filter(p=>p.kind==='weapons' && String(p.chars?.Range||'').toLowerCase()!=='melee' && p.loadout!=='option');
  const melee=profiles.filter(p=>p.kind==='weapons' && String(p.chars?.Range||'').toLowerCase()==='melee' && p.loadout!=='option');
  const optRanged=profiles.filter(p=>p.kind==='weapons' && String(p.chars?.Range||'').toLowerCase()!=='melee' && p.loadout==='option');
  const optMelee=profiles.filter(p=>p.kind==='weapons' && String(p.chars?.Range||'').toLowerCase()==='melee' && p.loadout==='option');
  const abilities=profiles.filter(p=>p.kind==='abilities').map(p=>({name:p.name,description:p.chars?.Description||Object.values(p.chars||{}).join(' ')}));
  let left=weaponTable('RANGED WEAPONS',ranged)+weaponTable('MELEE WEAPONS',melee)+weaponTable('OTHER RANGED OPTIONS',optRanged)+weaponTable('OTHER MELEE OPTIONS',optMelee);
  if(u.options?.length)left+=section('LOADOUT OPTIONS','<ul class="options">'+u.options.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>');
  let right='';
  if(abilities.length)right+=section('ABILITIES',rulesHtml(abilities));
  if(u.rules?.length)right+=section('CORE / UNIT RULES',rulesHtml(u.rules));
  const body='<div class="columns"><div>'+left+'</div><div>'+right+'</div></div>';
  els.card.innerHTML='<article class="datasheet"><header class="sheet-head"><div class="sheet-title">'+esc(u.name)+'</div><div class="sheet-subtitle">'+esc(u.army||'')+(u.points!=null?' • '+esc(u.points)+' pts':'')+'</div></header><div class="stats">'+stats.map(k=>'<div class="stat"><div class="stat-k">'+(k==='Sv'?'SV':k==='InSv'?'INV':k)+'</div><div class="stat-v">'+esc(stat(u,k))+'</div></div>').join('')+'</div><div class="sheet-body">'+body+'</div><footer class="sheet-foot">KEYWORDS: '+esc((u.keywords||[]).join(', '))+'</footer></article>'
}
function section(t,b){return '<section class="section"><div class="section-title">'+esc(t)+'</div><div class="section-body">'+b+'</div></section>'}
function armyName(){const t=current();if(!t)return'';if(t.kind==='army')return t.army;if(t.kind==='combined')return t.armies[0]||'';if(t.kind==='roster')return t.roster.army||'';return''}
function factionDoc(){const a=norm(armyName().split(' - ').pop());const vals=Object.values(state.reference.factions||{});return vals.find(d=>[d.name,d.parent_name,d.source_alias].map(norm).includes(a))||vals.find(d=>a==='aeldari'&&['aeldari','asuryani','craftworlds'].includes(norm(d.name)))||null}
function renderRef(kind){
  const d=factionDoc()||{},title=kind==='strats'?'STRATAGEMS':kind==='detach'?'DETACHMENTS':'ARMY RULES';
  const tab=current();
  let entries=kind==='strats'?(d.stratagems||[]):kind==='detach'?(d.detachment_rules||[]):(d.army_rules||[]);
  if(kind==='strats'&&tab?.kind==='roster'&&tab.roster.detachments?.length){
    const wanted=new Set(tab.roster.detachments.map(norm));
    entries=entries.filter(x=>x.detachment&&wanted.has(norm(x.detachment)));
  }
  let html='';
  if(kind==='strats'){
    html+=section('ARMY STRATAGEMS',entries.length?entries.map(x=>'<div class="strat"><div class="strat-name">'+esc(x.name||'')+'</div><div class="strat-desc">'+esc(x.description||'')+'</div></div>').join(''):'<div class="rule-desc">No matching army/detachment stratagems were found.</div>');
    const core=state.reference.core_stratagems||[];
    html+=section('CORE STRATAGEMS',core.map(x=>'<div class="strat"><div class="strat-name">'+esc(x.name||'')+'</div><div class="strat-desc">'+esc(x.description||'')+'</div></div>').join(''));
  } else {
    if(kind==='detach'&&tab?.kind==='roster'&&tab.roster.detachments?.length){
      const wanted=new Set(tab.roster.detachments.map(norm));
      entries=entries.filter(x=>x.detachment&&wanted.has(norm(x.detachment)));
    }
    html+=section(title,entries.length?entries.map(x=>'<div class="strat"><div class="strat-name">'+esc(x.name||'')+'</div><div class="strat-desc">'+esc(x.description||'')+'</div></div>').join(''):'<div class="rule-desc">No matching detachment rules were found.</div>');
  }
  els.card.innerHTML='<article class="datasheet reference-page"><header class="sheet-head"><div class="sheet-title">'+title+'</div><div class="sheet-subtitle">'+esc(armyName())+'</div></header><div class="sheet-body">'+html+'</div></article>'
}
function populateArmyDialog(){const a=[...new Set(state.units.map(x=>x.army).filter(Boolean))].sort();els.checklist.innerHTML=a.map(x=>'<label class="army-check"><input type="checkbox" value="'+esc(x)+'" '+(state.selectedArmies.includes(x)?'checked':'')+'><span>'+esc(x)+'</span></label>').join('')}
function rosterUnits(doc){
  const out=[];
  const profileKey=p=>JSON.stringify([p.kind,p.name,p.loadout,Object.entries(p.chars||{}).sort()]);
  function collectProfiles(node, profiles, seen){
    if(!node||typeof node!=='object')return;
    for(const p of node.profiles||[]){
      const chars={}; for(const c of p.characteristics||[]) chars[c.name]=c.$text||'';
      const low=(p.typeName||'').toLowerCase();
      const kind=low==='unit'?'stats':low.includes('weapon')?'weapons':'abilities';
      const rec={kind,name:p.name,chars,loadout:'standard'};
      const k=profileKey(rec); if(!seen.has(k)){seen.add(k);profiles.push(rec)}
    }
    for(const child of node.selections||[]) collectProfiles(child,profiles,seen);
  }
  function collectRules(node, rules, seen){
    if(!node||typeof node!=='object')return;
    for(const r of node.rules||[]){
      const rec={name:r.name||'Rule',description:r.description||''};
      const k=norm(rec.name)+'|'+norm(rec.description);
      if(!seen.has(k)){seen.add(k);rules.push(rec)}
    }
    for(const child of node.selections||[]) collectRules(child,rules,seen);
  }
  for(const force of doc?.roster?.forces||[]){
    const army=force.catalogueName||force.name||'Imported';
    for(const s of force.selections||[]){
      if(!['unit','model'].includes(s.type)||!s.name) continue;
      const profiles=[], pseen=new Set(), rules=[], rseen=new Set();
      collectProfiles(s,profiles,pseen);
      collectRules(s,rules,rseen);
      out.push({
        name:s.name,
        army,
        bs_id:'r-'+(s.id||Math.random()),
        points:(s.costs||[]).find(x=>x.name==='pts')?.value,
        profiles,
        keywords:(s.categories||[]).map(x=>x.name),
        rules,
        options:[]
      });
    }
  }
  return out
}
function rosterDetachments(doc){const out=[];function walk(n){if(!n||typeof n!=='object')return;if(String(n.group||'').toLowerCase()==='detachment'&&n.name&&!out.includes(n.name))out.push(n.name);for(const c of n.selections||[])walk(c)}for(const f of doc?.roster?.forces||[])for(const s of f.selections||[])walk(s);return out}
els.file.onchange=async()=>{const f=els.file.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text()),units=rosterUnits(d);if(!units.length)throw Error('No units found');const id='r'+Date.now(),label=d.roster?.name||f.name.replace(/\.json$/i,'');state.rosters.push({id,label,army:units[0].army,units,detachments:rosterDetachments(d)});state.activeTab='roster:'+id;save();renderAll();toast('Imported '+label)}catch(e){alert('Could not import list: '+e.message)}finally{els.file.value=''}};
$('#importBtn').onclick=()=>els.file.click();$('#updateBtn').onclick=()=>{if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.update()))).finally(()=>location.reload());else location.reload()};$('#armiesBtn').onclick=()=>{populateArmyDialog();els.dialog.showModal()};$('#applyArmies').onclick=e=>{e.preventDefault();state.selectedArmies=[...els.checklist.querySelectorAll('input:checked')].map(x=>x.value);buildTabs();state.activeTab=state.tabs[0]?.id||null;save();els.dialog.close();renderAll()};els.search.oninput=renderBrowser;$('#clearSearch').onclick=()=>{els.search.value='';renderBrowser()};els.wake.onchange=()=>{els.wake.value=norm(els.wake.value)||'check';save();restartVoice()};els.mic.onclick=()=>{state.micOn=!state.micOn;save();state.micOn?restartVoice():stopVoice();updateMic();updateVoice()};
function updateMic(){els.mic.textContent=state.micOn?'MIC ON':'MIC OFF';els.mic.className='btn '+(state.micOn?'mic-on':'mic-off')}
function updateVoice(){const w=norm(els.wake.value)||'check';els.status.innerHTML='<span class="voice-dot"></span>'+(state.micOn?(state.wakeArmed?'LISTENING…':'WAITING FOR “'+esc(w.toUpperCase())+'”'):'MIC OFF')}
function cycle(){if(!state.tabs.length)return;let i=state.tabs.findIndex(x=>x.id===state.activeTab);state.activeTab=state.tabs[(i+1)%state.tabs.length].id;els.search.value='';save();renderAll();toast('Switched list')}
const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
function stopVoice(){if(state.recognition){try{state.recognition.onend=null;state.recognition.abort()}catch{}state.recognition=null}}
function restartVoice(){stopVoice();if(!state.micOn||!Speech)return;const r=new Speech();state.recognition=r;r.continuous=true;r.interimResults=false;r.lang='en-GB';r.onresult=e=>{const text=norm(e.results[e.results.length-1][0].transcript),wake=norm(els.wake.value)||'check';let cmd='';if(state.wakeArmed)cmd=text;else if(text===wake){state.wakeArmed=true;updateVoice();return}else if(text.startsWith(wake+' '))cmd=text.slice(wake.length).trim();else return;if(cmd==='switch'){state.wakeArmed=false;cycle();updateVoice();return}if(['strats','stratagems','strategems','core strats'].includes(cmd)){renderRef('strats');state.wakeArmed=false;updateVoice();return}const m=matches(cmd,unitsFor())[0];if(m){els.search.value=cmd;renderBrowser();renderUnit(m.u);state.wakeArmed=false;updateVoice()}};r.onend=()=>{if(state.micOn)setTimeout(restartVoice,400)};r.onerror=()=>{};try{r.start()}catch{}}
function setupVoice(){updateMic();if(!Speech){state.micOn=false;updateMic();els.status.textContent='VOICE NOT SUPPORTED';return}restartVoice();updateVoice()}
loadSaved();load().catch(e=>{console.error(e);els.card.innerHTML='<div class="empty-card"><div class="empty-title">Could not load data</div><div>'+esc(e.message)+'</div></div>'});if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js?v=0.4').catch(()=>{});
})();