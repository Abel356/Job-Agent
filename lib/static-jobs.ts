import {createHash} from 'node:crypto';
import simplify from '@/data/simplify-jobs.json';
import employers from '@/data/employer-jobs.json';
import snapshot from '@/data/tech-snapshot.json';
import {decorate,type Job} from './jobs';
import {deadlinePassed} from './job-query';

type Listed={company:string;position:string;location:string;apply_url:string;source_url:string;source_label:string;source_id?:string;posting_date?:string;date_basis?:string;priority_rank?:number;priority_label?:string;sponsorship_note?:string;sponsorship_evidence_url?:string;tech_stack?:string;id?:string;description?:string;department?:string;employment_type?:string;workplace?:string;link_checked_at?:string;link_status?:string};
const stackNames=['TypeScript','JavaScript','React','GraphQL','Node.js','PostgreSQL','Postgres','Redis','Python','Rust','Java','Kotlin','Swift','AWS','Azure','GCP','Docker','Kubernetes'];
function inCanada(location:string){return /\bCanada\b|\bToronto\b|\bVancouver\b|\bMontr[eé]al\b|\bOttawa\b|\bCalgary\b|\bEdmonton\b|\bWaterloo\b|\bKitchener\b|\bOntario\b|\bQuebec\b|\bQu[eé]bec\b|\bBritish Columbia\b/i.test(location.replace(/\b(?:Vancouver\s*,?\s*(?:WA|Washington)|Ontario\s*,?\s*(?:CA|California|OH|Ohio)|Waterloo\s*,?\s*(?:IA|Iowa)|Ottawa\s*,?\s*(?:IL|Illinois|KS|Kansas)|Toronto\s*,?\s*(?:OH|Ohio))\b/gi,''));}
const companyStacks=new Map<string,string>();
for(const row of snapshot.jobs as Partial<Job>[]){
 const match=row.description?.match(/\bour (?:tech|technology) stack\s*(?:is|includes|:)\s*([^\n]{12,180})/i);
 if(!match||!row.company)continue;
 const found=stackNames.filter(name=>new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![a-z])`,'i').test(match[1]));
 if(found.length>=2)companyStacks.set(row.company.toLowerCase(),[...new Set(found.map(x=>x==='Postgres'?'PostgreSQL':x))].join(', ')+' (employer posting, Oct 2026)');
}
function listedJob(row:Listed):Job{
 const id=row.id||createHash('sha256').update(`${row.company}|${row.position}|${row.apply_url}`).digest('hex').slice(0,32);
 return decorate({id,source_id:row.source_id||'simplify:github',company:row.company,position:row.position,location:row.location,other_locations:'',apply_url:row.apply_url,source_url:row.source_url,workplace:row.workplace||(/remote/i.test(row.location)?'Remote':''),employment_type:row.employment_type||(row.source_label==='Internship'?'Internship':'FullTime'),department:row.department||'',posting_date:row.posting_date||'',date_basis:row.date_basis||(row.posting_date?'Date listed by Simplify':''),deadline:'',deadline_evidence:'',canada_evidence:'',link_checked_at:row.link_checked_at||'',link_status:row.link_status||'',description:row.description||'',priority_rank:row.priority_rank??(inCanada(row.location)?0:4),priority_label:row.priority_label||(inCanada(row.location)?'Canada role · check your work authorization':'US role · sponsorship not known as of now'),sponsorship_note:row.sponsorship_note||'Not known as of now',sponsorship_evidence_url:row.sponsorship_evidence_url||'',tech_stack:row.tech_stack||'Not known as of now',source_label:row.source_label} as Partial<Job>);
}
function applicationKey(value:string){const url=new URL(value);return (url.hostname+url.pathname.replace(/\/(?:application|apply)$/i,'')).toLowerCase();}
function boardKey(value:string){try{const url=new URL(value),slug=url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();if(!slug)return '';const host=url.hostname.toLowerCase();if(host==='jobs.ashbyhq.com')return `ashby:${slug}`;if(host==='boards.greenhouse.io'||host==='job-boards.greenhouse.io')return `greenhouse:${slug}`;if(host==='jobs.lever.co')return `lever:${slug}`;if(host==='jobs.eu.lever.co')return `lever-eu:${slug}`;if(host==='jobs.smartrecruiters.com')return `smartrecruiters:${slug}`;return '';}catch{return '';}}
const checkedBoards=new Set((employers.sources as {id:string;status:string}[]).filter(s=>s.status==='Checked').map(s=>s.id));
const urls=new Set<string>();
const simplifyByUrl=new Map((simplify.jobs as Listed[]).map(j=>[applicationKey(j.apply_url),j]));
const direct=(employers.jobs as Listed[]).map(row=>{const match=simplifyByUrl.get(applicationKey(row.apply_url));if(match&&row.priority_rank!==0&&row.sponsorship_note==='Not known as of now'&&match.priority_rank===2)return listedJob({...row,priority_rank:2,priority_label:match.priority_label,sponsorship_note:match.sponsorship_note});return listedJob(row);}).filter(j=>{const key=applicationKey(j.apply_url);if(urls.has(key))return false;urls.add(key);return true;});
const current=(simplify.jobs as Listed[]).map(listedJob).filter(j=>{const key=applicationKey(j.apply_url);if(urls.has(key)||checkedBoards.has(boardKey(j.apply_url)))return false;urls.add(key);return true;});
const restored=(snapshot.jobs as Partial<Job>[]).filter(j=>{if(!j.apply_url||checkedBoards.has(j.source_id||'')||checkedBoards.has(boardKey(j.apply_url)))return false;const key=applicationKey(j.apply_url);if(urls.has(key))return false;urls.add(key);return true;}).map(j=>{const role=decorate({...j,source_label:'Restored October 2026 employer snapshot',priority_rank:0,priority_label:'Canada role · check your work authorization',sponsorship_note:'Not known as of now',tech_stack:companyStacks.get(j.company?.toLowerCase()||'')||'Not known as of now'});return {...role,categories:j.category_override?[j.category_override]:role.categories};});
export const staticJobs=[...direct,...current,...restored].filter(j=>!deadlinePassed(j.deadline_iso||j.deadline||'')).sort((a,b)=>a.id.localeCompare(b.id));
export const staticById=new Map(staticJobs.map(j=>[j.id,j]));
export const staticSettings={schedule_enabled:true,schedule_label:'Daily, 5 p.m. Toronto',seed_checked_at:snapshot.checked_at,simplify_checked_at:simplify.checked_at,employer_checked_at:employers.checked_at,static_mode:true};
export const staticSources=[{id:'simplify:new-grad',name:'Simplify new-grad tech roles',status:'Synced from GitHub',checked:simplify.checked_at},{id:'simplify:internships',name:'Simplify / Pitt CSC tech internships',status:'Synced from GitHub',checked:simplify.checked_at},...(employers.sources||[]),{id:'snapshot:tech',name:'Restored tech employer snapshot',status:'Historical snapshot',checked:snapshot.checked_at}];
