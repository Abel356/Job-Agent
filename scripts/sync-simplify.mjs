#!/usr/bin/env node
// Mirror the two public Simplify tech lists into a small, reviewable site data file.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

const sources=[
  ['SimplifyJobs/New-Grad-Positions','New graduate'],
  ['SimplifyJobs/Summer2027-Internships','Internship'],
];
const output=process.env.SIMPLIFY_OUTPUT||'data/simplify-jobs.json';
const inputDir=process.env.SIMPLIFY_INPUT_DIR;
const tech=/software|engineer|developer|data|machine learning|\bai\b|product|quant|hardware|firmware|security|cloud|devops|infrastructure|design|\bux\b|\bui\b|research/i;
const canadian=/\bCanada\b|\bToronto\b|\bVancouver\b|\bMontr[eé]al\b|\bOttawa\b|\bCalgary\b|\bEdmonton\b|\bWaterloo\b|\bKitchener\b|\bOntario\b|\bQuebec\b|\bQu[eé]bec\b|\bBritish Columbia\b|\bAlberta\b|\bNova Scotia\b|\bManitoba\b|\bSaskatchewan\b/i;
const us=/\b(?:USA|United States|US)\b|,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
function inCanada(location){return canadian.test(location.replace(/\b(?:Vancouver\s*,?\s*(?:WA|Washington)|Ontario\s*,?\s*(?:CA|California|OH|Ohio)|Waterloo\s*,?\s*(?:IA|Iowa)|Ottawa\s*,?\s*(?:IL|Illinois|KS|Kansas)|Halifax\s*,?\s*(?:VA|Virginia)|Toronto\s*,?\s*(?:OH|Ohio))\b/gi,''));}
function priority(location,sponsorship,companyHasOffer){
  if(inCanada(location))return {rank:0,label:'Canada role · you already have work authorization'};
  if(sponsorship==='U.S. Citizenship is Required')return {rank:4,label:'US citizenship required for this role'};
  if(sponsorship==='Does Not Offer Sponsorship')return {rank:4,label:'This role is marked as not offering sponsorship'};
  if(/remote/i.test(location)&&us.test(location))return {rank:1,label:'Remote US role · confirm Canada eligibility and US work authorization'};
  if(sponsorship==='Offers Sponsorship')return {rank:2,label:'Simplify lists sponsorship offered for this role · confirm with employer'};
  if(companyHasOffer)return {rank:3,label:'Company has another Simplify role marked sponsorship offered · this role is unconfirmed'};
  return {rank:4,label:'US role · sponsorship not known as of now'};
}
function cleanUrl(value){
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return '';
    for(const key of [...url.searchParams.keys()])if(/^(utm_|ref$|source$)/i.test(key))url.searchParams.delete(key);
    return url.toString();
  }catch{return '';}
}
async function readSource(repo,kind){
  const raw=inputDir?readFileSync(`${inputDir}/${kind==='Internship'?'internships':'new-grad'}.json`,'utf8'):
    await (async()=>{const response=await fetch(`https://raw.githubusercontent.com/${repo}/dev/.github/scripts/listings.json`,{headers:{'User-Agent':'Earthwork-Jobs-Sync/1.0'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${repo}: HTTP ${response.status}`);return response.text();})();
  const data=JSON.parse(raw);if(!Array.isArray(data)||data.length<50)throw Error(`${repo}: unexpected listings format`);
  return data.map(row=>({...row,source_label:kind,source_repo:repo}));
}
const all=(await Promise.all(sources.map(([repo,kind])=>readSource(repo,kind)))).flat();
const active=all.filter(row=>row.active===true&&row.is_visible!==false&&row.company_name&&row.title&&cleanUrl(row.url));
const offers=new Set(active.filter(row=>row.sponsorship==='Offers Sponsorship').map(row=>row.company_name.toLowerCase().trim()));
const jobs=active.flatMap(row=>{
  const category=String(row.category||'');if(!tech.test(category)&&!tech.test(row.title))return [];
  const location=(Array.isArray(row.locations)?row.locations:[row.locations]).filter(Boolean).join('; ');
  if(!inCanada(location)&&!us.test(location))return [];
  const apply_url=cleanUrl(row.url),source_url=apply_url;
  const p=priority(location,row.sponsorship,offers.has(row.company_name.toLowerCase().trim()));
  const date=Number(row.date_posted)>0?new Date(Number(row.date_posted)*1000).toISOString().slice(0,10):'';
  return [{id:createHash('sha256').update(`${row.source_repo}|${row.id||apply_url}`).digest('hex').slice(0,32),company:row.company_name,position:row.title,location,apply_url,source_url,source_label:row.source_label,source_repo:row.source_repo,posting_date:date,category,sponsorship_note:row.sponsorship||'Not known as of now',priority_rank:p.rank,priority_label:p.label,tech_stack:'Not known as of now'}];
});
jobs.sort((a,b)=>a.priority_rank-b.priority_rank||b.posting_date.localeCompare(a.posting_date)||a.company.localeCompare(b.company));
const prior=JSON.parse(readFileSync(output,'utf8'));
const comparable=x=>JSON.stringify(x.jobs.map(({posting_age,section,...job})=>job));
if(comparable(prior)===comparable({jobs})){console.log(`No role changes; ${jobs.length} jobs retained.`);process.exit(0);}
writeFileSync(output,JSON.stringify({checked_at:new Date().toISOString(),source:'SimplifyJobs GitHub structured listings',jobs})+'\n');
console.log(`Updated ${jobs.length} tech roles (${jobs.filter(j=>j.priority_rank===0).length} Canada).`);
