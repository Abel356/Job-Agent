'use client';
import {useMemo,useState} from 'react';
import {Input} from '@/components/ui/input';
type Source={id:string;name:string;kind:string;url:string;website?:string;status?:string;recovery?:{board_url:string;note:string;previous_issue:string;checked_at:string}};
export function CoverageDirectory({sources}:{sources:Source[]}){
 const [query,setQuery]=useState(''),[limit,setLimit]=useState(50);
 const matches=useMemo(()=>sources.filter(s=>s.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)),[sources,query]);
 const recovered=sources.filter(s=>s.recovery);
 return <>
  <p className="coverage-note">{sources.filter(s=>s.id.startsWith('speedrun:')).length} Speedrun company profiles · {sources.filter(s=>s.id.startsWith('fortune2026:')).length} Fortune 500 (2026) company profiles. Tracking a company does not mean it currently has an eligible opening or offers sponsorship.</p>
  {recovered.length>0&&<details><summary>{recovered.length} sources with verified Ashby replacements</summary><div className="source-list">{recovered.map(s=><div className="source-row" key={s.id}><strong>{s.name}</strong><span>{s.status} · {s.recovery!.note}</span><a href={s.recovery!.board_url} target="_blank" rel="noopener noreferrer">Verified Ashby board</a><small>Earlier check: {s.recovery!.previous_issue}</small></div>)}</div></details>}
  <details><summary>Tracked companies & sources ({sources.length})</summary>
   <Input aria-label="Search tracked companies" placeholder="Find a tracked company…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50);}}/>
   <div className="source-list">{matches.slice(0,limit).map(s=><div className="source-row" key={s.id}><strong>{s.name}</strong><span>{s.kind==='fortune-company'?'Fortune 500 · ':s.kind==='speedrun-company'?'Speedrun · ':''}{s.status||'Awaiting refresh'}</span><a href={s.website||s.url} target="_blank" rel="noopener noreferrer">{s.website?'Company website':'Source'}</a></div>)}</div>
   {!matches.length&&<p>No tracked companies match.</p>}
   {matches.length>limit&&<button className="text-button" onClick={()=>setLimit(n=>n+100)}>Show more sources</button>}
  </details>
 </>;
}
