(() => {
'use strict';

const $=s=>document.querySelector(s);
const els={
  players:$('#players'), roundGrid:$('#roundGrid'), roundLabel:$('#roundLabel'),
  wake:$('#wakeWord'), mic:$('#micToggle'), voice:$('#voiceStatus'),
  prev:$('#prevRound'), next:$('#nextRound'), undo:$('#undoBtn'),
  reset:$('#resetBtn'), resetDialog:$('#resetDialog'), confirmReset:$('#confirmReset'),
  toast:$('#toast')
};

const SCORE_KEY='qs.scoreboard.v1';
const QS_KEY='qs.web';
const SCORE_WAKE_KEY='qs.scoreboard.wake';
const MAX_CATEGORY=45;
const MAX_ROUND_CATEGORY=15;

const freshPlayer=(name)=>({
  name,
  battleReady:false,
  activeType:'primary',
  rounds:Array.from({length:5},()=>({primary:0,secondary:0}))
});
const state={
  round:0,
  players:[freshPlayer('PLAYER 1'),freshPlayer('PLAYER 2')],
  history:[],
  micOn:true,
  wakeArmed:false,
  recognition:null,
  pendingReset:false
};

const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sums=p=>({
  primary:p.rounds.reduce((n,r)=>n+r.primary,0),
  secondary:p.rounds.reduce((n,r)=>n+r.secondary,0)
});
const total=p=>{const s=sums(p);return Math.min(100,s.primary+s.secondary+(p.battleReady?10:0))};

function toast(msg){
  els.toast.textContent=msg;
  els.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>els.toast.classList.remove('show'),1800);
}

function snapshot(){
  state.history.push(JSON.stringify({
    round:state.round,
    players:state.players
  }));
  if(state.history.length>60)state.history.shift();
}

function save(){
  localStorage.setItem(SCORE_KEY,JSON.stringify({
    round:state.round,
    players:state.players
  }));
  localStorage.setItem(SCORE_WAKE_KEY,els.wake.value||'score');
  try{
    const q=JSON.parse(localStorage.getItem(QS_KEY)||'{}');
    q.micOn=state.micOn;
    localStorage.setItem(QS_KEY,JSON.stringify(q));
  }catch{}
}

function load(){
  try{
    const d=JSON.parse(localStorage.getItem(SCORE_KEY)||'{}');
    if(Number.isInteger(d.round))state.round=clamp(d.round,0,4);
    if(Array.isArray(d.players)&&d.players.length===2){
      state.players=d.players.map((p,i)=>{
        const base=freshPlayer('PLAYER '+(i+1));
        base.name=String(p.name||base.name);
        base.battleReady=!!p.battleReady;
        base.activeType=p.activeType==='secondary'?'secondary':'primary';
        if(Array.isArray(p.rounds)){
          base.rounds=base.rounds.map((r,ri)=>({
            primary:clamp(Number(p.rounds[ri]?.primary)||0,0,15),
            secondary:clamp(Number(p.rounds[ri]?.secondary)||0,0,15)
          }));
        }
        return base;
      });
    }
  }catch{}
  try{
    const q=JSON.parse(localStorage.getItem(QS_KEY)||'{}');
    state.micOn=q.micOn!==false;
  }catch{}
  els.wake.value=localStorage.getItem(SCORE_WAKE_KEY)||'score';
}

function playerHTML(p,i){
  const s=sums(p), r=p.rounds[state.round];
  const playerNo=i+1;
  return `
  <article class="player-card" data-player="${i}">
    <header class="player-head">
      <input class="player-name" data-name="${i}" value="${esc(p.name)}" aria-label="Player ${playerNo} name">
      <div class="total">
        <div class="total-num">${total(p)}</div>
        <div class="total-label">VICTORY POINTS</div>
      </div>
    </header>
    <div class="score-body">
      ${scoreTypeHTML(p,i,'primary','PRIMARY',s.primary,r.primary)}
      ${scoreTypeHTML(p,i,'secondary','SECONDARY',s.secondary,r.secondary)}
      <div class="battle-ready">
        <div>
          <label for="br-${i}">BATTLE READY</label>
          <div class="score-type-cap">+10 VP at the end of the battle</div>
        </div>
        <div class="switch">
          <input id="br-${i}" data-battle-ready="${i}" type="checkbox" ${p.battleReady?'checked':''}>
          <strong>${p.battleReady?'+10':'0'}</strong>
        </div>
      </div>
    </div>
  </article>`;
}

function scoreTypeHTML(p,i,type,label,totalScore,roundScore){
  const active=p.activeType===type?' active':'';
  const leftRound=MAX_ROUND_CATEGORY-roundScore;
  const leftTotal=MAX_CATEGORY-totalScore;
  const canAdd=Math.min(leftRound,leftTotal)>0;
  return `
  <section class="score-type${active}" data-select-type="${i}:${type}">
    <div class="score-type-head">
      <div class="score-type-title">${label}${active?' · ACTIVE':''}</div>
      <div class="score-type-cap">ROUND ${state.round+1}: ${roundScore}/15</div>
      <div class="score-type-total">${totalScore}/45</div>
    </div>
    <div class="current-round">Current round score: <strong>${roundScore} VP</strong></div>
    <div class="score-buttons">
      <button class="score-btn minus" data-score="${i}:${type}:-5" ${roundScore===0?'disabled':''}>−5</button>
      <button class="score-btn minus" data-score="${i}:${type}:-1" ${roundScore===0?'disabled':''}>−1</button>
      <button class="score-btn plus" data-score="${i}:${type}:1" ${canAdd?'':'disabled'}>+1</button>
      <button class="score-btn plus" data-score="${i}:${type}:2" ${canAdd?'':'disabled'}>+2</button>
      <button class="score-btn plus" data-score="${i}:${type}:3" ${canAdd?'':'disabled'}>+3</button>
      <button class="score-btn plus" data-score="${i}:${type}:5" ${canAdd?'':'disabled'}>+5</button>
    </div>
    <div class="cap-warning">${!canAdd?'Scoring cap reached for this round/category.':''}</div>
  </section>`;
}

function renderRounds(){
  els.roundGrid.innerHTML=state.players[0].rounds.map((_,ri)=>{
    const a=state.players[0].rounds[ri], b=state.players[1].rounds[ri];
    return `<button type="button" class="round-card${ri===state.round?' active':''}" data-round="${ri}">
      <div class="round-no">ROUND ${ri+1}</div>
      <div class="round-row"><span>P1</span><b>${a.primary+a.secondary}</b><span>P ${a.primary} / S ${a.secondary}</span></div>
      <div class="round-row"><span>P2</span><b>${b.primary+b.secondary}</b><span>P ${b.primary} / S ${b.secondary}</span></div>
    </button>`;
  }).join('');
  els.roundGrid.querySelectorAll('[data-round]').forEach(b=>b.onclick=()=>{
    state.round=Number(b.dataset.round);save();render();
  });
}

function bind(){
  document.querySelectorAll('[data-score]').forEach(b=>b.onclick=()=>{
    const [pi,type,delta]=b.dataset.score.split(':');
    adjust(Number(pi),type,Number(delta));
  });
  document.querySelectorAll('[data-select-type]').forEach(el=>el.onclick=e=>{
    if(e.target.closest('[data-score]'))return;
    const [pi,type]=el.dataset.selectType.split(':');
    state.players[Number(pi)].activeType=type;
    save();render();
  });
  document.querySelectorAll('[data-name]').forEach(inp=>{
    inp.onchange=()=>{
      state.players[Number(inp.dataset.name)].name=inp.value.trim()||('PLAYER '+(Number(inp.dataset.name)+1));
      save();render();
    };
  });
  document.querySelectorAll('[data-battle-ready]').forEach(ch=>{
    ch.onchange=()=>{
      snapshot();
      state.players[Number(ch.dataset.battleReady)].battleReady=ch.checked;
      save();render();
    };
  });
}

function render(){
  els.players.innerHTML=state.players.map(playerHTML).join('');
  els.roundLabel.textContent='BATTLE ROUND '+(state.round+1)+' / 5';
  els.prev.disabled=state.round===0;
  els.next.disabled=state.round===4;
  renderRounds();
  bind();
  updateMic();
  updateVoice();
}

function adjust(pi,type,delta){
  if(![0,1].includes(pi)||!['primary','secondary'].includes(type)||!Number.isFinite(delta))return;
  const p=state.players[pi];
  p.activeType=type;
  const r=p.rounds[state.round];
  const existingTotal=sums(p)[type];
  let allowed=delta;
  if(delta>0){
    allowed=Math.min(delta,MAX_ROUND_CATEGORY-r[type],MAX_CATEGORY-existingTotal);
    if(allowed<=0){toast('Scoring cap reached');render();return}
  }else{
    allowed=Math.max(delta,-r[type]);
    if(allowed===0)return;
  }
  snapshot();
  r[type]+=allowed;
  save();render();
  toast((allowed>0?'+':'')+allowed+' '+type.toUpperCase()+' · '+p.name);
}

function setRound(n){
  state.round=clamp(n,0,4);save();render();toast('Battle round '+(state.round+1));
}

els.prev.onclick=()=>setRound(state.round-1);
els.next.onclick=()=>setRound(state.round+1);
els.undo.onclick=()=>{
  const x=state.history.pop();
  if(!x){toast('Nothing to undo');return}
  const d=JSON.parse(x);state.round=d.round;state.players=d.players;save();render();toast('Undone');
};
els.reset.onclick=()=>els.resetDialog.showModal();
els.confirmReset.onclick=e=>{
  e.preventDefault();
  snapshot();
  state.round=0;
  state.players=[freshPlayer('PLAYER 1'),freshPlayer('PLAYER 2')];
  save();render();els.resetDialog.close();toast('Scoreboard reset');
};
els.wake.onchange=()=>{
  els.wake.value=norm(els.wake.value)||'score';save();restartVoice();
};
els.mic.onclick=()=>{
  state.micOn=!state.micOn;save();
  if(state.micOn)restartVoice();else stopVoice();
  updateMic();updateVoice();
};

function updateMic(){
  els.mic.textContent=state.micOn?'MIC ON':'MIC OFF';
  els.mic.className='btn '+(state.micOn?'mic-on':'mic-off');
}
function updateVoice(){
  const wake=norm(els.wake.value)||'score';
  els.voice.innerHTML='<span class="voice-dot"></span>'+
    (state.micOn?(state.wakeArmed?'LISTENING…':'WAITING FOR “'+esc(wake.toUpperCase())+'”'):'MIC OFF');
}

const numberWords={
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20
};
function parseNumber(s){
  const m=String(s).match(/\b\d+\b/);
  if(m)return Number(m[0]);
  for(const [w,n] of Object.entries(numberWords))if(new RegExp('\\b'+w+'\\b').test(s))return n;
  return null;
}
function playerIndex(cmd){
  if(/\b(player ?1|player one|one)\b/.test(cmd))return 0;
  if(/\b(player ?2|player two|two)\b/.test(cmd))return 1;
  return null;
}
function scoreType(cmd,pi){
  if(/\bprimary\b/.test(cmd))return'primary';
  if(/\b(secondar(y|ies)|secondary)\b/.test(cmd))return'secondary';
  return pi==null?null:state.players[pi].activeType;
}
function processCommand(raw){
  const cmd=norm(raw);
  if(!cmd)return;
  if(/\b(quicksheet|quick sheet|units)\b/.test(cmd)){location.href='../';return}
  if(cmd==='next round'||cmd==='round next'){setRound(state.round+1);return}
  if(cmd==='previous round'||cmd==='prev round'||cmd==='round back'){setRound(state.round-1);return}
  if(cmd==='undo'||cmd==='undo score'||cmd==='undo last'){els.undo.click();return}
  if(cmd==='reset scores'||cmd==='reset scoreboard'){
    state.pendingReset=true;toast('Say “check confirm reset” to reset');return;
  }
  if(cmd==='confirm reset'&&state.pendingReset){
    state.pendingReset=false;els.confirmReset.click();return;
  }
  const roundMatch=cmd.match(/(?:battle )?round\s+(one|two|three|four|five|[1-5])\b/);
  if(roundMatch){
    const n=parseNumber(roundMatch[1]);
    if(n)setRound(n-1);
    return;
  }
  const pi=playerIndex(cmd);
  if(pi==null){toast('Say player one or player two');return}
  if(/\bbattle ready\b/.test(cmd)){
    snapshot();state.players[pi].battleReady=!/\b(no|off|remove|not)\b/.test(cmd);save();render();toast(state.players[pi].name+' Battle Ready '+(state.players[pi].battleReady?'ON':'OFF'));return;
  }
  const type=scoreType(cmd,pi);
  const n=parseNumber(cmd);
  if(n==null){
    if(/\bprimary\b/.test(cmd)||/\bsecondary\b/.test(cmd)){
      state.players[pi].activeType=type;save();render();toast(state.players[pi].name+' '+type.toUpperCase()+' selected');
    }else toast('Say a VP amount');
    return;
  }
  const negative=/\b(remove|minus|subtract|take|lose)\b/.test(cmd);
  adjust(pi,type,negative?-n:n);
}

const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
function stopVoice(){
  if(state.recognition){try{state.recognition.onend=null;state.recognition.abort()}catch{}state.recognition=null}
}
function restartVoice(){
  stopVoice();
  if(!state.micOn||!Speech)return;
  const r=new Speech();
  state.recognition=r;
  r.continuous=true;
  r.interimResults=false;
  r.lang='en-GB';
  r.onresult=e=>{
    const text=norm(e.results[e.results.length-1][0].transcript);
    const wake=norm(els.wake.value)||'score';
    let cmd='';
    if(state.wakeArmed)cmd=text;
    else if(text===wake){state.wakeArmed=true;updateVoice();return}
    else if(text.startsWith(wake+' '))cmd=text.slice(wake.length).trim();
    else return;
    state.wakeArmed=false;
    processCommand(cmd);
    updateVoice();
  };
  r.onend=()=>{if(state.micOn)setTimeout(restartVoice,400)};
  r.onerror=()=>{};
  try{r.start()}catch{}
}
function setupVoice(){
  updateMic();
  if(!Speech){
    state.micOn=false;
    updateMic();
    els.voice.textContent='VOICE NOT SUPPORTED IN THIS BROWSER';
    return;
  }
  restartVoice();
  updateVoice();
}

load();
render();
setupVoice();
})();