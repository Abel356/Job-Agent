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
const prior=JSON.parse(readFileSync(output,'utf8'));
const sponsorEvidence=JSON.parse(readFileSync(new URL('../data/us-sponsor-evidence.json',import.meta.url),'utf8'));
let upstreamShas;
if(!inputDir){
  upstreamShas=Object.fromEntries(await Promise.all(sources.map(async ([repo])=>{
    const response=await fetch(`https://api.github.com/repos/${repo}/contents/.github/scripts/listings.json?ref=dev`,{headers:{'User-Agent':'Earthwork-Jobs-Sync/1.0','Accept':'application/vnd.github+json',...(process.env.GITHUB_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}:{})},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`${repo}: metadata HTTP ${response.status}`);
    const metadata=await response.json();if(!metadata.sha)throw Error(`${repo}: missing listings SHA`);
    return [repo,metadata.sha];
  })));
  if(process.env.GITHUB_EVENT_NAME!=='push'&&sources.every(([repo])=>prior.upstream_shas?.[repo]===upstreamShas[repo])){console.log('Simplify listings unchanged.');process.exit(0);}
}
const tech=/software|engineer|developer|data|machine learning|\bai\b|product|quant|hardware|firmware|security|cloud|devops|infrastructure|design|\bux\b|\bui\b|research/i;
const newGradRole=/software eng|software dev|product engineer|fullstack engineer|frontend|front end|front-end|backend|back end|full-stack|full stack|founding engineer|mobile dev|mobile engineer|data scientist|data engineer|research eng|product manag|\bapm\b|product|devops|android|\bios\b|\bsre\b|site reliability eng|quantitative trad|quantitative research|quantitative dev|security eng|compiler eng|machine learning eng|hardware eng|firmware eng|infrastructure eng|embedded|\bfpga\b|circuit|chip|silicon|\basic\b|quant|trading|finance|investment|machine learning|analytics|analyst|research sci/i;
const newGradStage=/new grad|early career|college grad|entry level|founding|early in career|university grad|fresh grad|202[4-9] grad|engineer 0|engineer 1|engineer i\b|junior|sde 1|sde i\b/i;
const canadian=/\bCanada\b|\bToronto\b|\bVancouver\b|\bMontr[eé]al\b|\bOttawa\b|\bCalgary\b|\bEdmonton\b|\bWaterloo\b|\bKitchener\b|\bOntario\b|\bQuebec\b|\bQu[eé]bec\b|\bBritish Columbia\b|\bAlberta\b|\bNova Scotia\b|\bManitoba\b|\bSaskatchewan\b/i;
const us=/\b(?:USA|United States|US)\b|,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
function inCanada(location){return canadian.test(location.replace(/\b(?:Vancouver\s*,?\s*(?:WA|Washington)|Ontario\s*,?\s*(?:CA|California|OH|Ohio)|Waterloo\s*,?\s*(?:IA|Iowa)|Ottawa\s*,?\s*(?:IL|Illinois|KS|Kansas)|Halifax\s*,?\s*(?:VA|Virginia)|Toronto\s*,?\s*(?:OH|Ohio))\b/gi,''));}
function priority(location,sponsorship,companyHasOffer,companyEvidence){
  if(inCanada(location))return {rank:0,label:'Canada role · check your work authorization'};
  if(sponsorship==='U.S. Citizenship is Required')return {rank:4,label:'US citizenship required for this role'};
  if(sponsorship==='Does Not Offer Sponsorship')return {rank:4,label:'This role is marked as not offering sponsorship'};
  if(/remote/i.test(location)&&us.test(location))return {rank:1,label:'Remote US role · confirm Canada eligibility and US work authorization'};
  if(sponsorship==='Offers Sponsorship')return {rank:2,label:'Simplify lists sponsorship offered for this role · confirm with employer'};
  if(companyHasOffer)return {rank:3,label:'Company has another Simplify role marked sponsorship offered · this role is unconfirmed'};
  if(companyEvidence)return {rank:3,label:`${companyEvidence.company} has published visa sponsorship guidance · this role is unconfirmed`};
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
const active=all.filter(row=>{
  if(row.active!==true||row.is_visible!==true||!row.company_name||!row.title||!cleanUrl(row.url))return false;
  if(row.source_label==='Internship')return Number(row.date_posted)>1777618800&&Array.isArray(row.terms)&&row.terms.some(term=>String(term).includes('Summer 2027'));
  return Number(row.date_posted)>1748761200&&(row.source!=='Simplify'||(newGradRole.test(row.title)&&newGradStage.test(row.title)));
});
const offers=new Set(active.filter(row=>row.sponsorship==='Offers Sponsorship').map(row=>row.company_name.toLowerCase().trim()));
const jobs=active.flatMap(row=>{
  const category=String(row.category||'');if(!tech.test(category)&&!tech.test(row.title))return [];
  const location=(Array.isArray(row.locations)?row.locations:[row.locations]).filter(Boolean).join('; ');
  if(!inCanada(location)&&!us.test(location))return [];
  const apply_url=cleanUrl(row.url),source_url=apply_url;
  const companyEvidence=sponsorEvidence[row.company_name.toLowerCase().trim()];
  const p=priority(location,row.sponsorship,offers.has(row.company_name.toLowerCase().trim()),companyEvidence);
  const date=Number(row.date_posted)>0?new Date(Number(row.date_posted)*1000).toISOString().slice(0,10):'';
  return [{id:createHash('sha256').update(`${row.source_repo}|${row.id||apply_url}`).digest('hex').slice(0,32),company:row.company_name,position:row.title,location,apply_url,source_url,source_label:row.source_label,source_repo:row.source_repo,posting_date:date,category,sponsorship_note:companyEvidence&&p.rank===3?companyEvidence.note:row.sponsorship&&row.sponsorship!=='Other'?row.sponsorship:'Not known as of now',sponsorship_evidence_url:companyEvidence&&p.rank===3?companyEvidence.url:'',priority_rank:p.rank,priority_label:p.label,tech_stack:'Not known as of now'}];
});
jobs.sort((a,b)=>a.priority_rank-b.priority_rank||b.posting_date.localeCompare(a.posting_date)||a.company.localeCompare(b.company));
if(jobs.length>3000)throw Error(`Refusing unexpectedly broad Simplify import: ${jobs.length} roles`);
const comparable=x=>JSON.stringify(x.jobs.map(({posting_age,section,...job})=>job));
if(comparable(prior)===comparable({jobs})&&!upstreamShas){console.log(`No role changes; ${jobs.length} jobs retained.`);process.exit(0);}
writeFileSync(output,JSON.stringify({checked_at:new Date().toISOString(),source:'SimplifyJobs GitHub structured listings',...(upstreamShas?{upstream_shas:upstreamShas}:{}),jobs})+'\n');
console.log(`Updated ${jobs.length} tech roles (${jobs.filter(j=>j.priority_rank===0).length} Canada).`);

