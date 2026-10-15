'use client';
import {useMemo,useState} from 'react';
import {companyGroups,COMPANY_GROUPS,employerKey} from '@/lib/job-facets';
import type {Job} from '@/lib/jobs';
export function CompanyFilter({jobs,sources,group,onGroup,selected,onSelected}:{jobs:Job[];sources:any[];group:string;onGroup:(s:string)=>void;selected:string[];onSelected:(s:string[])=>void}){
 const [search,setSearch]=useState('');
 const rows=useMemo(()=>{
  const map=new Map<string,{name:string;count:number;groups:Set<string>}>();
  for(const j of jobs){const key=employerKey(j.company),r=map.get(key)||{name:j.company,count:0,groups:new Set<string>()};r.count++;j.company_groups.forEach(g=>r.groups.add(g));map.set(key,r);}
  for(const s of sources){if(s.kind==='speedrun')continue;const key=employerKey(s.name),r=map.get(key)||{name:s.name,count:0,groups:new Set<string>()};companyGroups({company:s.name,source_id:s.id,source_url:s.url}).forEach(g=>r.groups.add(g));if(s.portfolio_url||s.kind==='speedrun-company')r.groups.add('a16z Speedrun');if(s.fortune_year||s.kind==='fortune-company')r.groups.add('Fortune 500');map.set(key,r);}
  return [...map.values()].filter(r=>(group==='All'||r.groups.has(group))&&r.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(!!b.count)-Number(!!a.count)||a.name.localeCompare(b.name));
 },[jobs,sources,group,search]);
 return <><label className="filter-field">Company collection<select aria-label="Company collection" value={group} onChange={e=>{onGroup(e.target.value);onSelected([]);}}><option value="All">All companies & sources</option>{COMPANY_GROUPS.map(g=><option key={g}>{g}</option>)}</select></label>
 <input className="company-search" aria-label="Search companies" placeholder="Search companies…" value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="company-options">{rows.slice(0,100).map(r=><label key={employerKey(r.name)}><input type="checkbox" checked={selected.some(n=>employerKey(n)===employerKey(r.name))} onChange={()=>onSelected(selected.some(n=>employerKey(n)===employerKey(r.name))?selected.filter(n=>employerKey(n)!==employerKey(r.name)):[...selected,r.name])}/><span>{r.name}<small>{r.count?`${r.count} available roles`:'Tracked · no imported roles'}</small></span></label>)}{!rows.length&&<p>No companies match.</p>}</div>
 {rows.length>100&&<p className="category-help">Showing 100 companies. Search to find more.</p>}
 {selected.length>0&&<button className="text-button" onClick={()=>onSelected([])}>Clear {selected.length} selected companies</button>}
 <p className="category-help">Counts are across all locations. Fortune 500 and Speedrun are company collections; Ashby and other platforms describe the job source. A company can belong to both.</p></>;
}
