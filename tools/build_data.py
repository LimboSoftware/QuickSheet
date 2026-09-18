#!/usr/bin/env python3
from __future__ import annotations
import html, json, re, tarfile, tempfile, time, unicodedata, urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data'
BSDATA_URL = 'https://codeload.github.com/BSData/wh40k-11e/tar.gz/refs/heads/main'
GDC_URL = 'https://codeload.github.com/game-datacards/datasources/tar.gz/refs/heads/main'
UTILITY = ('crusade','weapon modification','battle honour','battle trait','requisition','scar','agenda','show hide','order of battle','enhancement','detachment enhancement')
CORE_STRATAGEMS = [
 {'name':'Command Re-Roll — 1CP','description':'Any phase, just after an eligible roll for a friendly unit/model. Re-roll it; a Charge roll is re-rolled in full.'},
 {'name':'Epic Challenge — 1CP','description':'Fight phase, after a friendly CHARACTER unit is selected to fight. One CHARACTER model’s melee weapons gain PRECISION for the phase.'},
 {'name':'Insane Bravery — 1CP','description':'Battle-shock step of your Command phase, before a friendly unit rolls. That Battle-shock roll automatically succeeds. Once per battle.'},
 {'name':'Explosives — 1CP','description':'Your Shooting phase. An eligible EXPLOSIVES/GRENADES unit can inflict mortal wounds on a visible enemy within 8 inches by rolling six D6; each 4+ scores one.'},
 {'name':'Crushing Impact — 1CP','description':'Your Charge phase, after a MONSTER/VEHICLE charges. Roll D6 equal to one engaged model’s Toughness; 5+ damages the enemy, while 1 damages your unit.'},
 {'name':'Rapid Ingress — 1CP','description':'End of your opponent’s Movement phase. One non-AIRCRAFT unit in Strategic Reserves makes an ingress move. Not in battle round 1.'},
 {'name':'Fire Overwatch — 1CP','description':'End of your opponent’s Movement phase. One eligible unengaged non-TITANIC unit uses snap shooting at a visible enemy within 24 inches.'},
 {'name':'Smokescreen — 1CP','description':'Start of your opponent’s Shooting phase. One friendly SMOKE unit provides the benefit of cover as described by the stratagem until phase end.'},
 {'name':'Heroic Intervention — 1CP','description':'End of your opponent’s Charge phase. One eligible friendly unit within 12 inches can resolve a charge.'},
 {'name':'Counteroffensive — 2CP','description':'Opponent’s Fight phase, after an enemy unit resolves attacks. One eligible friendly unit gains Fights First and must be selected next.'},
]

def norm(s: str) -> str:
    s=unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower().replace('&',' and ')
    return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',s)).strip()

def clean(s: Any) -> str:
    s=str(s or '').replace('^^**','').replace('**','').replace('^^','').replace('__','')
    return s.strip()

def clean_army(name: str) -> str:
    name=name.strip()
    for p in ('Imperium - ','Chaos - '):
        if name.startswith(p): return name[len(p):]
    return name

def http_get(url: str, timeout=180) -> bytes:
    req=urllib.request.Request(url,headers={'User-Agent':'40K-QuickSheet-Web/1.0'})
    with urllib.request.urlopen(req,timeout=timeout) as r: return r.read()

def docs_from_tar(url: str, selector) -> list[tuple[str,dict]]:
    payload=http_get(url)
    with tempfile.NamedTemporaryFile(suffix='.tar.gz',delete=False) as f:
        f.write(payload); p=Path(f.name)
    docs=[]
    try:
        with tarfile.open(p,'r:gz') as t:
            for m in t.getmembers():
                if not m.isfile() or not selector(Path(m.name)): continue
                fh=t.extractfile(m)
                if fh is None: continue
                try: docs.append((Path(m.name).name,json.loads(fh.read().decode('utf-8-sig'))))
                except Exception as e: print('skip',m.name,e)
    finally:
        p.unlink(missing_ok=True)
    return docs

@dataclass
class Unit:
    name:str; army:str; source_catalogue:str; bs_id:str; points:float|None
    profiles:list[dict]; keywords:list[str]; rules:list[dict]; options:list[str]
    roster_source_id:str|None=None; roster_source_label:str|None=None; roster_entry_label:str|None=None
    reference_kind:str|None=None; reference_subtitle:str|None=None; reference_sections:list[dict]=field(default_factory=list)

def index_ids(obj: Any, by_id: dict[str,dict]):
    stack=[obj]
    while stack:
        x=stack.pop()
        if isinstance(x,dict):
            if isinstance(x.get('id'),str) and x['id']: by_id[x['id']]=x
            stack.extend(x.values())
        elif isinstance(x,list): stack.extend(x)

def selection_min(o:dict)->float:
    v=0.0
    for c in o.get('constraints',[]) or []:
        if isinstance(c,dict) and c.get('type')=='min' and c.get('field')=='selections' and c.get('scope') in {'parent','self'}:
            try:v=max(v,float(c.get('value',0) or 0))
            except:pass
    return v

def utility(name:str)->bool:
    n=norm(name); return any(w in n for w in UTILITY)

def profile(p:dict,loadout='standard')->dict:
    chars={}
    for c in p.get('characteristics',[]) or []:
        if isinstance(c,dict): chars[str(c.get('name','?'))]=clean(c.get('$text',''))
    typ=str(p.get('typeName','') or ''); low=typ.lower()
    kind='stats' if low in {'unit','model'} else ('weapons' if 'weapon' in low else 'abilities')
    return {'id':p.get('id',''),'type':typ,'name':str(p.get('name','') or '').strip(),'kind':kind,'chars':chars,'loadout':loadout}

def dedupe_profiles(items:list[dict])->list[dict]:
    order=[]; by={}
    for x in items:
        key=(norm(x.get('type','')),norm(x.get('name','')),tuple(sorted((str(k),str(v)) for k,v in (x.get('chars') or {}).items())))
        if key not in by: by[key]=x; order.append(key)
        elif x.get('loadout')=='standard' and by[key].get('loadout')!='standard': by[key]=x
    return [by[k] for k in order]

def dedupe_dicts(items:list[dict])->list[dict]:
    out=[]; seen=set()
    for x in items:
        k=(x.get('name'),x.get('description'))
        if k in seen: continue
        seen.add(k);out.append(x)
    return out

def group_has_weapon(root:dict,by_id:dict[str,dict],limit=800)->bool:
    stack=[root];seen=set();n=0
    while stack and n<limit:
        x=stack.pop()
        if not isinstance(x,dict) or id(x) in seen:continue
        seen.add(id(x));n+=1
        if utility(x.get('name','')):continue
        if any(isinstance(p,dict) and 'weapon' in str(p.get('typeName','')).lower() for p in x.get('profiles',[]) or []):return True
        for i in x.get('infoLinks',[]) or []:
            y=by_id.get(str(i.get('targetId',''))) if isinstance(i,dict) else None
            if isinstance(y,dict) and 'weapon' in str(y.get('typeName','')).lower():return True
        stack.extend(c for c in x.get('selectionEntries',[]) or [] if isinstance(c,dict))
        stack.extend(c for c in x.get('selectionEntryGroups',[]) or [] if isinstance(c,dict))
        for e in x.get('entryLinks',[]) or []:
            if isinstance(e,dict) and not utility(e.get('name','')):
                y=by_id.get(str(e.get('targetId','')))
                if isinstance(y,dict):stack.append(y)
    return False

def collect_hidden_weapons(root:dict,by_id:dict[str,dict])->list[dict]:
    out=[];stack=[root];seen_obj=set();seen_ref=set();n=0
    while stack and n<20000:
        x=stack.pop()
        if not isinstance(x,dict) or id(x) in seen_obj:continue
        seen_obj.add(id(x));n+=1
        if x is not root and utility(x.get('name','')):continue
        for p in x.get('profiles',[]) or []:
            if isinstance(p,dict) and 'weapon' in str(p.get('typeName','')).lower():out.append(profile(p,'option'))
        for i in x.get('infoLinks',[]) or []:
            if not isinstance(i,dict) or i.get('type')!='profile':continue
            y=by_id.get(str(i.get('targetId','')))
            if isinstance(y,dict) and 'weapon' in str(y.get('typeName','')).lower():out.append(profile(y,'option'))
        stack.extend(c for c in x.get('selectionEntries',[]) or [] if isinstance(c,dict))
        stack.extend(c for c in x.get('selectionEntryGroups',[]) or [] if isinstance(c,dict) and not utility(c.get('name','')))
        for e in x.get('entryLinks',[]) or []:
            if not isinstance(e,dict) or utility(e.get('name','')):continue
            tid=str(e.get('targetId',''))
            if not tid or tid in seen_ref:continue
            y=by_id.get(tid)
            if isinstance(y,dict) and not utility(y.get('name','')):seen_ref.add(tid);stack.append(y)
    return dedupe_profiles(out)

def unit_from(link:dict,target:dict,army:str,source:str,by_id:dict[str,dict])->Unit|None:
    if target.get('type') not in {'unit','model'}:return None
    profiles=[];keywords=[];rules=[];options=[];kwseen=set()
    for owner in (target,link):
        for c in owner.get('categoryLinks',[]) or []:
            if not isinstance(c,dict):continue
            name=c.get('name')
            if not name and c.get('targetId'):
                y=by_id.get(str(c.get('targetId','')));name=y.get('name') if isinstance(y,dict) else ''
            name=clean(name);k=norm(name)
            if name and k not in kwseen:kwseen.add(k);keywords.append(name)
    for r in target.get('rules',[]) or []:
        if isinstance(r,dict) and r.get('name'):
            d=r.get('description','');d=d.get('$text','') if isinstance(d,dict) else d
            rules.append({'name':str(r.get('name','')),'description':clean(d)})
    for i in target.get('infoLinks',[]) or []:
        if not isinstance(i,dict) or i.get('hidden') is True or i.get('type')!='rule' or i.get('modifiers') or i.get('modifierGroups'):continue
        y=by_id.get(str(i.get('targetId','')))
        if isinstance(y,dict):
            d=y.get('description','');d=d.get('$text','') if isinstance(d,dict) else d
            rules.append({'name':str(i.get('name') or y.get('name') or 'Rule'),'description':clean(d)})
    stack=[(target,True,False)];seen_refs=set();seen_obj=set();safety=0
    while stack:
        x,std,ref=stack.pop()
        if not isinstance(x,dict):continue
        safety+=1
        if safety>12000:break
        if not ref:
            if id(x) in seen_obj:continue
            seen_obj.add(id(x))
        load='standard' if std else 'option'
        for p in x.get('profiles',[]) or []:
            if isinstance(p,dict) and p.get('typeName'):profiles.append(profile(p,load))
        for i in x.get('infoLinks',[]) or []:
            if not isinstance(i,dict) or i.get('hidden') is True or i.get('type')!='profile':continue
            y=by_id.get(str(i.get('targetId','')))
            if isinstance(y,dict) and y.get('typeName'):profiles.append(profile(y,load))
        for c in reversed(x.get('selectionEntries',[]) or []):
            if isinstance(c,dict) and c.get('hidden') is not True:stack.append((c,std and selection_min(c)>=1,False))
        for g in reversed(x.get('selectionEntryGroups',[]) or []):
            if not isinstance(g,dict) or g.get('hidden') is True or utility(g.get('name','')):continue
            gmin=selection_min(g);default=str(g.get('defaultSelectionEntryId','') or '')
            choices=[str(c.get('name')) for c in g.get('selectionEntries',[]) or [] if isinstance(c,dict) and c.get('hidden') is not True and c.get('name')]
            choices += [str(c.get('name')) for c in g.get('entryLinks',[]) or [] if isinstance(c,dict) and c.get('hidden') is not True and c.get('name')]
            if len(choices)>1:options.append(f"{g.get('name','Options')}: "+'; '.join(dict.fromkeys(choices)))
            for c in reversed(g.get('selectionEntries',[]) or []):
                if not isinstance(c,dict) or c.get('hidden') is True:continue
                isdef=default and str(c.get('id',''))==default
                stack.append((c,std and gmin>=1 and (isdef if default else selection_min(c)>=1),False))
            for e in reversed(g.get('entryLinks',[]) or []):
                if not isinstance(e,dict) or e.get('hidden') is True or e.get('type')!='selectionEntry':continue
                y=by_id.get(str(e.get('targetId','')))
                if not isinstance(y,dict):continue
                child_std=std and gmin>=1 and bool(default and str(e.get('id',''))==default);k=(str(y.get('id','')),child_std)
                if k not in seen_refs:seen_refs.add(k);stack.append((y,child_std,True))
        for e in reversed(x.get('entryLinks',[]) or []):
            if not isinstance(e,dict) or e.get('hidden') is True:continue
            y=by_id.get(str(e.get('targetId','')))
            if not isinstance(y,dict):continue
            if e.get('type')=='selectionEntry':
                child_std=std and (selection_min(e)>=1 or selection_min(y)>=1);k=(str(y.get('id','')),child_std)
                if k not in seen_refs:seen_refs.add(k);stack.append((y,child_std,True))
            elif e.get('type')=='selectionEntryGroup':
                name=str(e.get('name') or y.get('name') or '')
                if utility(name) or utility(y.get('name','')) or not group_has_weapon(y,by_id):continue
                choices=[str(c.get('name')) for c in y.get('selectionEntries',[]) or [] if isinstance(c,dict) and c.get('hidden') is not True and c.get('name')]
                choices += [str(c.get('name')) for c in y.get('entryLinks',[]) or [] if isinstance(c,dict) and c.get('hidden') is not True and c.get('type')=='selectionEntry' and c.get('name')]
                if choices:options.append(f"{name or 'Wargear'}: "+'; '.join(dict.fromkeys(choices)))
                child_std=std and (selection_min(e)>=1 or selection_min(y)>=1);k=('group:'+str(y.get('id','')),child_std)
                if k not in seen_refs:seen_refs.add(k);stack.append((y,child_std,True))
    profiles.extend(collect_hidden_weapons(target,by_id));profiles=dedupe_profiles(profiles);rules=dedupe_dicts(rules)
    pts=None
    for c in target.get('costs',[]) or []:
        if isinstance(c,dict) and norm(c.get('name','')) in {'pts','points','point'}:
            try:pts=float(c.get('value'));break
            except:pass
    return Unit(str(link.get('name') or target.get('name') or 'Unnamed').strip(),army,source,str(target.get('id') or link.get('targetId') or ''),pts,profiles,keywords,rules,list(dict.fromkeys(options)))

def parse_bsdata(docs:list[tuple[str,dict]])->list[Unit]:
    by_id={}
    for _,doc in docs:index_ids(doc.get('catalogue') or doc.get('gameSystem') or {},by_id)
    out=[];seen=set();roots=[]
    for filename,doc in docs:
        root=doc.get('catalogue') or {}
        if not root or root.get('library') is True:continue
        raw=str(root.get('name',filename.rsplit('.',1)[0]))
        if raw.lower() in {'warhammer 40,000','warhammer 40000'}:continue
        roots.append((root,clean_army(raw),raw))
    for idx,(root,army,raw) in enumerate(roots,1):
        for link in root.get('entryLinks',[]) or []:
            if not isinstance(link,dict) or link.get('type')!='selectionEntry' or link.get('hidden') is True:continue
            target=by_id.get(str(link.get('targetId','')))
            if not isinstance(target,dict) or target.get('type') not in {'unit','model'}:continue
            try:u=unit_from(link,target,army,raw,by_id)
            except Exception as e:print('unit skip',raw,link.get('name'),e);continue
            k=(u.army,norm(u.name),u.bs_id)
            if k in seen:continue
            seen.add(k);out.append(u)
        print(f'catalogue {idx}/{len(roots)} {raw}: total {len(out)}')
    return sorted(out,key=lambda u:(u.army.lower(),u.name.lower()))

def gtext(v)->str:
    if isinstance(v,dict):v=v.get('en') or next((x for x in v.values() if isinstance(x,str) and x.strip()),'')
    s=html.unescape(str(v or ''));s=re.sub(r'<\s*br\s*/?\s*>','\n',s,flags=re.I);s=re.sub(r'<\s*li[^>]*>','■ ',s,flags=re.I);s=re.sub(r'<\s*/\s*li\s*>','\n',s,flags=re.I);s=re.sub(r'<[^>]+>','',s)
    return clean(s)

def rule_card(card:dict,det='',fac=''):
    name=gtext(card.get('name')) or det or 'Army Rule';blocks=[]
    for b in card.get('rules',[]) or []:
        if isinstance(b,dict) and gtext(b.get('text')):blocks.append(gtext(b.get('text')))
    if not blocks:
        d=gtext(card.get('description') or card.get('text'))
        if d:blocks.append(d)
    return {'name':name,'description':'\n\n'.join(blocks),'detachment':det,'faction':fac}

def parse_reference(docs:list[tuple[str,dict]])->dict:
    facs={}
    for filename,doc in docs:
        if not isinstance(doc,dict):continue
        name=gtext(doc.get('name'))
        if not name:continue
        strats=[]
        for r in doc.get('stratagems',[]) or []:
            if not isinstance(r,dict):continue
            n=gtext(r.get('name')) or 'Stratagem';cost=r.get('cost');costtxt=(f'{int(cost)}CP' if isinstance(cost,(int,float)) else (f'{cost}CP' if cost not in (None,'') else ''))
            lines=[];typ=gtext(r.get('type'))
            if typ:lines.append(typ.upper())
            for label,f in (('WHEN','when'),('TARGET','target'),('EFFECT','effect'),('RESTRICTIONS','restrictions')):
                x=gtext(r.get(f))
                if x:lines.append(f'{label}: {x}')
            strats.append({'name':f'{n} — {costtxt}' if costtxt else n,'description':'\n'.join(lines),'detachment':gtext(r.get('detachment')),'faction':gtext(r.get('detachment_faction') or r.get('faction'))})
        rules=doc.get('rules',{}) if isinstance(doc.get('rules'),dict) else {};army=[];detr=[]
        for c in rules.get('army',[]) or []:
            if isinstance(c,dict):army.append(rule_card(c,fac=name))
        for g in rules.get('detachment',[]) or []:
            if not isinstance(g,dict):continue
            det=gtext(g.get('detachment') or g.get('name'));fac=gtext(g.get('faction')) or name
            for c in g.get('rules',[]) or []:
                if isinstance(c,dict):detr.append(rule_card(c,det,fac))
        dets=[]
        for x in doc.get('detachments',[]) or []:
            if isinstance(x,dict):
                n=gtext(x.get('name') or x.get('detachment'))
                if n and n not in dets:dets.append(n)
        for x in detr+strats:
            n=gtext(x.get('detachment'))
            if n and n not in dets:dets.append(n)
        source=Path(filename).name;alias=re.sub(r'[_-]+',' ',Path(source).stem).strip()
        facs[norm(name)]={'name':name,'parent_name':gtext(doc.get('parent_name')),'source_file':source,'source_alias':alias,'stratagems':strats,'army_rules':army,'detachment_rules':detr,'detachments':dets}
    return {'cache_version':1,'fetched_at':time.strftime('%Y-%m-%d %H:%M:%S UTC',time.gmtime()),'factions':facs,'core_stratagems':CORE_STRATAGEMS}

def main():
    OUT.mkdir(exist_ok=True)
    print('Downloading BSData…')
    bsdocs=docs_from_tar(BSDATA_URL,lambda p:p.suffix.lower()=='.json')
    print('BSData docs',len(bsdocs));units=parse_bsdata(bsdocs)
    print('Downloading reference data…')
    gdocs=docs_from_tar(GDC_URL,lambda p:len(p.parts)==4 and p.parts[-3:-1]==('11th','gdc') and p.suffix.lower()=='.json')
    refs=parse_reference(gdocs)
    ud={'cache_version':1,'fetched_at':time.strftime('%Y-%m-%d %H:%M:%S UTC',time.gmtime()),'source':'BSData/wh40k-11e','units':[asdict(u) for u in units]}
    (OUT/'units.json').write_text(json.dumps(ud,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (OUT/'reference.json').write_text(json.dumps(refs,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    meta={'generated_at':time.strftime('%Y-%m-%d %H:%M UTC',time.gmtime()),'unit_count':len(units),'army_count':len(set(u.army for u in units)),'reference_factions':len(refs['factions']),'sources':['BSData/wh40k-11e','game-datacards/datasources 11th/gdc']}
    (OUT/'meta.json').write_text(json.dumps(meta,indent=2),encoding='utf-8');print(json.dumps(meta,indent=2))
if __name__=='__main__':main()
