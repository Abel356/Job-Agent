import {employerKey} from './job-facets';
import type {Job} from './jobs';
export const workplaceName=(s:string)=>s==='OnSite'?'On-site':s||'Unspecified';
export const employmentName=(s:string)=>({FullTime:'Full-time',PartTime:'Part-time',Contract:'Contract',Intern:'Internship',Temporary:'Temporary'}[s]||s||'Unspecified');
export type Filters={engineering?:string[];companyGroup?:string;companies?:string[];query:string;categories:string[];province:string;workplace:string;seniority:string;employment:string;company:string|null;country?:string;sponsorship?:string;usSponsorship?:boolean;sponsorEvidence?:boolean;student?:string;remoteScope?:string;hideRestricted?:boolean};
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function relevance(j:Job,query:string){
 const q=fold(query.trim()),words=q.split(/\s+/).filter(Boolean),title=fold(j.position),company=fold(j.company),other=fold(`${j.department} ${j.location} ${j.other_locations} ${j.categories.join(' ')}`);
 if(!q)return 0;
 if(!words.every(w=>title.includes(w)||company.includes(w)||other.includes(w)))return 0;
 return (title===q?1000:title.startsWith(q)?500:title.includes(q)?300:0)+(company===q?250:company.includes(q)?100:0)+words.reduce((n,w)=>n+(title.includes(w)?40:company.includes(w)?15:5),0);
}
export function matches(j:Job,f:Filters,ignoreCategories=false){
 const i=j.international;
 return (!f.engineering?.length||f.engineering.some(e=>j.engineering.includes(e)))&&(!f.companyGroup||f.companyGroup==='All'||j.company_groups.includes(f.companyGroup))&&(!f.companies?.length||f.companies.some(c=>employerKey(c)===employerKey(j.company)))&&(!f.country||f.country==='All'||(f.country==='Not stated / unclear'?!i.countries.length:i.countries.includes(f.country)))&&(!f.sponsorship||f.sponsorship==='All'||i.sponsorship===f.sponsorship)&&(!f.usSponsorship||(i.countries.includes('United States')&&i.us_sponsorship==='Explicitly offered'))&&(!f.sponsorEvidence||(i.countries.includes('United States')&&(j.priority_rank===2||j.priority_rank===3||j.sponsorship_note==='Offers Sponsorship'||!!j.sponsorship_evidence_url)))&&(!f.student||f.student==='All'||i.student_tags.includes(f.student))&&(!f.remoteScope||f.remoteScope==='All'||i.remote_scope.includes(f.remoteScope))&&(!f.hideRestricted||!i.restrictions.some(r=>['Citizenship required','Permanent residency required','Security clearance required'].includes(r)))&&(!f.query.trim()||relevance(j,f.query)>0)&&(ignoreCategories||!f.categories.length||f.categories.some(c=>j.categories.includes(c)))&&(!f.company||j.company===f.company)&&(f.province==='All'||j.provinces.includes(f.province))&&(f.workplace==='All'||workplaceName(j.workplace)===f.workplace)&&(f.seniority==='All'||j.seniority===f.seniority)&&(f.employment==='All'||employmentName(j.employment_type)===f.employment);
}
export function sortJobs(jobs:Job[],sort:string,query=''){
 const date=(j:Job)=>Date.parse(j.posting_date)||0;
 return [...jobs].sort((a,b)=>{
  if(sort==='Relevance'){const diff=relevance(b,query)-relevance(a,query);if(diff)return diff;}
  if(sort==='Highest compensation'){const av=a.compensation?.annual_max_cad,bv=b.compensation?.annual_max_cad;if(av!==bv)return (bv??-1)-(av??-1);}
  if(sort==='Oldest'){const av=date(a),bv=date(b);if(!av||!bv)return av? -1:bv?1:0;return av-bv||a.position.localeCompare(b.position);}
  const priority=(a.priority_rank??4)-(b.priority_rank??4);if(priority)return priority;
  const historical=Number(Boolean(a.source_label?.startsWith('Restored')))-Number(Boolean(b.source_label?.startsWith('Restored')));if(historical)return historical;
  return date(b)-date(a)||a.company.localeCompare(b.company)||a.position.localeCompare(b.position);
 });
}
// Date-only deadlines stay open through that day in Toronto. Ambiguous dates never expire.
export function deadlinePassed(value:string,now=new Date()){
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const parsed=new Date(value+'T12:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return false;return value<new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value))return Number.isFinite(Date.parse(value))&&Date.parse(value)<now.getTime();
 return false;
}

